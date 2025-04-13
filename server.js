// server.js
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const { v4: uuidv4 } = require('uuid'); // Add UUID dependency

app.use(express.static('public'));

const PADDLE_SPEED = 7;
const BALL_SPEED = 5;
const UPDATE_RATE = 16; // ~60fps

class GameState {
    constructor(player1, player2) {
        this.players = [player1, player2];
        this.ballX = 400;
        this.ballY = 300;
        this.ballVelocityX = BALL_SPEED;
        this.ballVelocityY = 0;
        this.leftPaddleY = 300;
        this.rightPaddleY = 300;
        this.scores = { left: 0, right: 0 };
        this.winner = null;
        this.lastUpdate = Date.now();
    }

    update() {
        if (this.winner) return;

        const now = Date.now();
        const deltaTime = (now - this.lastUpdate) / 16; // Normalize to 60fps
        this.lastUpdate = now;

        // Update ball position with delta time
        this.ballX += this.ballVelocityX * deltaTime;
        this.ballY += this.ballVelocityY * deltaTime;

        // Ball collision with top and bottom walls
        if (this.ballY <= 10 || this.ballY >= 590) {
            this.ballVelocityY *= -1;
            this.ballY = this.ballY <= 10 ? 10 : 590;
        }

        // Ball collision with paddles
        this.checkPaddleCollision();

        // Scoring
        if (this.ballX < 0) {
            this.scores.right++;
            this.resetBall('right');
        } else if (this.ballX > 800) {
            this.scores.left++;
            this.resetBall('left');
        }

        // Check for winner
        if (this.scores.left >= 10) {
            this.winner = 'PLAYER 1';
        } else if (this.scores.right >= 10) {
            this.winner = 'PLAYER 2';
        }
    }

    checkPaddleCollision() {
        // Left paddle collision
        if (this.ballX <= 65 && this.ballX >= 35 &&
            this.ballY >= this.leftPaddleY - 50 && this.ballY <= this.leftPaddleY + 50) {
            const relativeIntersectY = (this.leftPaddleY - this.ballY) / 50;
            const bounceAngle = relativeIntersectY * 0.75;
            this.ballVelocityX = BALL_SPEED * Math.cos(bounceAngle);
            this.ballVelocityY = BALL_SPEED * -Math.sin(bounceAngle);
            this.ballX = 66;
            return true;
        }

        // Right paddle collision
        if (this.ballX >= 735 && this.ballX <= 765 &&
            this.ballY >= this.rightPaddleY - 50 && this.ballY <= this.rightPaddleY + 50) {
            const relativeIntersectY = (this.rightPaddleY - this.ballY) / 50;
            const bounceAngle = relativeIntersectY * 0.75;
            this.ballVelocityX = -BALL_SPEED * Math.cos(bounceAngle);
            this.ballVelocityY = BALL_SPEED * -Math.sin(bounceAngle);
            this.ballX = 734;
            return true;
        }

        return false;
    }

    resetBall(scorer) {
        this.ballX = 400;
        this.ballY = 300;
        // Always start ball moving towards the player who just lost a point
        this.ballVelocityX = BALL_SPEED * (scorer === 'left' ? -1 : 1);
        this.ballVelocityY = 0;
        console.log('Ball reset, moving towards:', scorer === 'left' ? 'right' : 'left');
    }

    movePaddle(side, direction) {
        const paddleY = side === 'left' ? 'leftPaddleY' : 'rightPaddleY';
        const newY = this[paddleY] + (direction === 'up' ? -PADDLE_SPEED : PADDLE_SPEED);
        
        if (newY >= 50 && newY <= 550) {
            this[paddleY] = newY;
            console.log(`Moving ${side} paddle ${direction} to ${newY}`);
            return true;
        }
        return false;
    }

    getState() {
        return {
            ballX: Math.round(this.ballX),
            ballY: Math.round(this.ballY),
            leftPaddleY: this.leftPaddleY,
            rightPaddleY: this.rightPaddleY,
            scores: this.scores,
            winner: this.winner
        };
    }
}

// Store active games and players waiting in rooms
const games = new Map();
const gameRooms = new Map(); // Map room codes to game IDs
const playerToRoom = new Map(); // Track which room a player is in
const rematchRequests = new Map(); // Track rematch requests

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Create a new game room with a generated code
    socket.on('createGame', () => {
        try {
            // Generate a UUID and use first 6 characters for room code
            const roomCode = uuidv4().substring(0, 6).toUpperCase();
            console.log('Creating new game room with code:', roomCode);
            
            // Store the host in the room
            gameRooms.set(roomCode, {
                host: socket.id,
                guest: null,
                gameId: null
            });
            
            // Join the socket to the room
            socket.join(roomCode);
            
            // Store room code mapping for this player
            playerToRoom.set(socket.id, roomCode);
            
            // Notify the client
            socket.emit('gameCreated', { roomCode });
            console.log('Room created:', roomCode, 'by', socket.id);
        } catch (error) {
            console.error('Error creating game:', error);
            socket.emit('error', { message: 'Failed to create game room' });
        }
    });

    // Join an existing game using a room code
    socket.on('joinGame', (data) => {
        try {
            if (!data || !data.roomCode) {
                socket.emit('joinError', { message: 'Invalid room code' });
                return;
            }
            
            const roomCode = data.roomCode.toString().toUpperCase();
            console.log('Player', socket.id, 'attempting to join room:', roomCode);
            
            // Check if room exists
            if (!gameRooms.has(roomCode)) {
                socket.emit('joinError', { message: 'Room not found' });
                return;
            }
            
            const room = gameRooms.get(roomCode);
            
            // Check if room is full
            if (room.guest !== null) {
                socket.emit('joinError', { message: 'Room is full' });
                return;
            }
            
            // Join the room
            socket.join(roomCode);
            playerToRoom.set(socket.id, roomCode);
            room.guest = socket.id;
            
            console.log('Player joined room:', roomCode, 'Host:', room.host, 'Guest:', room.guest);
            
            // Start the game
            const gameId = Date.now().toString();
            const gameState = new GameState(room.host, room.guest);
            
            games.set(gameId, {
                state: gameState,
                roomCode: roomCode,
                interval: setInterval(() => {
                    gameState.update();
                    const state = gameState.getState();
                    io.to(roomCode).emit('gameState', state);
                }, UPDATE_RATE)
            });
            
            room.gameId = gameId;
            
            // Store game reference for host (we'll do guest separately)
            try {
                const hostSocket = io.sockets.sockets.get(room.host);
                if (hostSocket) {
                    hostSocket.emit('gameStart', { side: 'left' });
                } else {
                    // If we can't get the host socket directly, broadcast to the room
                    io.to(room.host).emit('gameStart', { side: 'left' });
                }
            } catch (e) {
                console.error('Error sending to host:', e);
                // Fallback method
                io.to(room.host).emit('gameStart', { side: 'left' });
            }
            
            // Tell the guest (current socket) to start
            socket.emit('gameStart', { side: 'right' });
            
            // Notify the room that the game has started
            io.to(roomCode).emit('roomFull');
        } catch (error) {
            console.error('Error joining game:', error);
            socket.emit('joinError', { message: 'Failed to join game: ' + error.message });
        }
    });

    // Handle paddle movement
    socket.on('paddleMove', (data) => {
        try {
            const roomCode = playerToRoom.get(socket.id);
            if (!roomCode) {
                console.log('No room found for player on paddle move');
                return;
            }
            
            const room = gameRooms.get(roomCode);
            if (!room || !room.gameId) {
                console.log('No room or game ID found for paddle move');
                return;
            }
            
            const game = games.get(room.gameId);
            if (!game) {
                console.log('No game found for paddle move');
                return;
            }

            const playerIndex = game.state.players.indexOf(socket.id);
            if (playerIndex === -1) {
                console.log('Player not found in game');
                return;
            }

            const side = playerIndex === 0 ? 'left' : 'right';
            const moved = game.state.movePaddle(side, data.direction);
            if (moved) {
                // Immediately emit the new game state after paddle movement
                const state = game.state.getState();
                io.to(roomCode).emit('gameState', state);
            }
        } catch (error) {
            console.error('Error processing paddle move:', error);
        }
    });

    // Handle rematch request
    socket.on('rematchRequest', () => {
        try {
            const roomCode = playerToRoom.get(socket.id);
            if (!roomCode) return;
            
            const room = gameRooms.get(roomCode);
            if (!room) return;
            
            // Find the opponent's socket ID
            const opponentId = socket.id === room.host ? room.guest : room.host;
            if (!opponentId) return;
            
            console.log('Rematch requested by', socket.id, 'to', opponentId, 'in room', roomCode);
            
            // Store the rematch request
            rematchRequests.set(roomCode, socket.id);
            
            // Send request to opponent
            io.to(opponentId).emit('rematchRequest');
        } catch (error) {
            console.error('Error processing rematch request:', error);
        }
    });
    
    // Handle rematch response
    socket.on('rematchResponse', (data) => {
        try {
            const roomCode = playerToRoom.get(socket.id);
            if (!roomCode) return;
            
            const room = gameRooms.get(roomCode);
            if (!room) return;
            
            // Get the requester's socket ID
            const requesterId = rematchRequests.get(roomCode);
            if (!requesterId) return;
            
            console.log('Rematch response from', socket.id, 'accepted:', data.accepted, 'in room', roomCode);
            
            // Send response to requester
            io.to(requesterId).emit('rematchResponse', { accepted: data.accepted });
            
            // If accepted, restart the game
            if (data.accepted) {
                if (!room.gameId || !games.has(room.gameId)) {
                    console.log('No active game found to restart');
                    return;
                }
                
                // Clear the existing game interval
                clearInterval(games.get(room.gameId).interval);
                
                // Create a new game state
                const gameState = new GameState(room.host, room.guest);
                
                // Set up a new game interval
                games.set(room.gameId, {
                    state: gameState,
                    roomCode: roomCode,
                    interval: setInterval(() => {
                        gameState.update();
                        const state = gameState.getState();
                        io.to(roomCode).emit('gameState', state);
                    }, UPDATE_RATE)
                });
                
                // Notify both players that the game has restarted
                io.to(room.host).emit('gameStart', { side: 'left' });
                io.to(room.guest).emit('gameStart', { side: 'right' });
                
                console.log('Game restarted in room:', roomCode);
            }
            
            // Clear the rematch request
            rematchRequests.delete(roomCode);
        } catch (error) {
            console.error('Error processing rematch response:', error);
        }
    });

    // Handle player leaving game manually (via Quit button)
    socket.on('leaveGame', () => {
        try {
            console.log('Player leaving game manually:', socket.id);
            handlePlayerLeaving(socket.id, true);
        } catch (error) {
            console.error('Error handling leave game:', error);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        try {
            console.log('Player disconnected:', socket.id);
            handlePlayerLeaving(socket.id, false);
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
    
    // Helper function for handling player leaving (either by disconnect or manual quit)
    function handlePlayerLeaving(playerId, isManualQuit) {
        // Check if player was in a room
        const roomCode = playerToRoom.get(playerId);
        if (roomCode) {
            const room = gameRooms.get(roomCode);
            
            if (room) {
                // Determine if this player was host or guest
                const isHost = room.host === playerId;
                const otherPlayerId = isHost ? room.guest : room.host;
                
                // If a game was in progress, end it
                if (room.gameId && games.has(room.gameId)) {
                    clearInterval(games.get(room.gameId).interval);
                    games.delete(room.gameId);
                    console.log('Game deleted:', room.gameId);
                }
                
                // Notify the other player if they exist
                if (otherPlayerId) {
                    io.to(otherPlayerId).emit('opponentLeft');
                    console.log('Notified opponent about player leaving');
                }
                
                // Clean up rematch requests if any
                if (rematchRequests.has(roomCode)) {
                    rematchRequests.delete(roomCode);
                }
                
                // If manual quit or disconnect, completely remove the room
                gameRooms.delete(roomCode);
                console.log('Room deleted:', roomCode);
            }
            
            // Remove player from room mapping
            playerToRoom.delete(playerId);
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
