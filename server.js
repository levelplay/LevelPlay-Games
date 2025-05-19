import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server);

// Serve static files from the "public" folder
app.use(express.static('public'));

// Game constants
const GRID_WIDTH = 40;
const GRID_HEIGHT = 30;
const UPDATE_INTERVAL = 100;
const GAME_DURATION = 60;
const FOOD_DURATION = 10;

// Store game state separately from interval handles
const gameRooms = {};
const gameIntervals = {};

// Function to wrap position around screen edges
function wrapPosition(pos) {
    return {
        x: pos.x < 0 ? GRID_WIDTH - 1 : pos.x >= GRID_WIDTH ? 0 : pos.x,
        y: pos.y < 0 ? GRID_HEIGHT - 1 : pos.y >= GRID_HEIGHT ? 0 : pos.y
    };
}

// Function to get a clean copy of game state for sending to clients
function getCleanGameState(roomId) {
    if (!gameRooms[roomId]) return null;
    
    // Create a new object with only the data clients need
    return {
        players: gameRooms[roomId].players,
        food: gameRooms[roomId].food,
        isActive: gameRooms[roomId].isActive,
        gameTimer: gameRooms[roomId].gameTimer,
        foodTimer: gameRooms[roomId].foodTimer
    };
}

function moveFood(roomId) {
    if (!gameRooms[roomId]) return;
    
    gameRooms[roomId].food = {
        x: Math.floor(Math.random() * GRID_WIDTH),
        y: Math.floor(Math.random() * GRID_HEIGHT)
    };
    gameRooms[roomId].foodTimer = FOOD_DURATION;
}

function updateSnakePositions(roomId) {
    if (!gameRooms[roomId] || !gameRooms[roomId].isActive) return;

    const gameState = gameRooms[roomId];

    Object.entries(gameState.players).forEach(([playerId, player]) => {
        if (!player.direction) return;

        let head = { ...player.snake[0] };
        
        switch (player.direction) {
            case 'LEFT': head.x--; break;
            case 'RIGHT': head.x++; break;
            case 'UP': head.y--; break;
            case 'DOWN': head.y++; break;
        }

        head = wrapPosition(head);
        player.snake.unshift(head);

        // Check food collision
        if (head.x === gameState.food.x && head.y === gameState.food.y) {
            player.score++;
            gameState.food = {
                x: Math.floor(Math.random() * GRID_WIDTH),
                y: Math.floor(Math.random() * GRID_HEIGHT)
            };
            gameState.foodTimer = FOOD_DURATION;
        } else {
            player.snake.pop();
        }

        // Check collision with other snake
        Object.entries(gameState.players).forEach(([otherId, otherPlayer]) => {
            if (otherId !== playerId) {
                if (otherPlayer.snake.some(segment => 
                    segment.x === head.x && segment.y === head.y)) {
                    endGame(roomId, otherId);
                }
            }
        });
    });

    // Send a clean copy of the game state to clients
    io.to(roomId).emit('update', getCleanGameState(roomId));
}

function clearRoomIntervals(roomId) {
    if (gameIntervals[roomId]) {
        if (gameIntervals[roomId].gameLoop) clearInterval(gameIntervals[roomId].gameLoop);
        if (gameIntervals[roomId].timerInterval) clearInterval(gameIntervals[roomId].timerInterval);
        if (gameIntervals[roomId].foodInterval) clearInterval(gameIntervals[roomId].foodInterval);
        
        // Reset the intervals object
        gameIntervals[roomId] = {};
    }
}

function startGame(roomId) {
    if (!gameRooms[roomId]) return;
    
    gameRooms[roomId].isActive = true;
    gameRooms[roomId].gameTimer = GAME_DURATION;
    gameRooms[roomId].foodTimer = FOOD_DURATION;
    gameRooms[roomId].rematchRequests = {};
    
    // Clear any existing intervals
    clearRoomIntervals(roomId);
    
    // Create new intervals
    gameIntervals[roomId] = {
        gameLoop: setInterval(() => updateSnakePositions(roomId), UPDATE_INTERVAL),
        timerInterval: setInterval(() => {
            if (!gameRooms[roomId]) {
                clearRoomIntervals(roomId);
                return;
            }
            
            gameRooms[roomId].gameTimer--;
            if (gameRooms[roomId].gameTimer <= 0) {
                endGame(roomId);
            }
            
            // Send a clean copy of the game state
            io.to(roomId).emit('update', getCleanGameState(roomId));
        }, 1000),
        foodInterval: setInterval(() => {
            if (!gameRooms[roomId]) {
                clearRoomIntervals(roomId);
                return;
            }
            
            gameRooms[roomId].foodTimer--;
            if (gameRooms[roomId].foodTimer <= 0) {
                moveFood(roomId);
            }
            
            // Send a clean copy of the game state
            io.to(roomId).emit('update', getCleanGameState(roomId));
        }, 1000)
    };
}

function endGame(roomId, winnerId = null) {
    if (!gameRooms[roomId]) return;
    
    // Clear intervals
    clearRoomIntervals(roomId);
    
    gameRooms[roomId].isActive = false;

    // If no winner specified, determine by score
    if (!winnerId) {
        let highestScore = -1;
        let isTie = false;

        Object.entries(gameRooms[roomId].players).forEach(([id, player]) => {
            if (player.score > highestScore) {
                highestScore = player.score;
                winnerId = id;
                isTie = false;
            } else if (player.score === highestScore) {
                isTie = true;
            }
        });

        io.to(roomId).emit('gameOver', { 
            winnerId: winnerId,
            isTie: isTie,
            finalScores: Object.fromEntries(
                Object.entries(gameRooms[roomId].players).map(([id, player]) => [id, player.score])
            )
        });
    } else {
        io.to(roomId).emit('gameOver', { 
            winnerId: winnerId,
            isTie: false,
            finalScores: Object.fromEntries(
                Object.entries(gameRooms[roomId].players).map(([id, player]) => [id, player.score])
            )
        });
    }
}

function resetGame(roomId) {
    if (!gameRooms[roomId]) return null;
    
    // Reset game state
    const playerIds = Object.keys(gameRooms[roomId].players);
    const created = gameRooms[roomId].created;
    
    // Completely recreate the game state
    gameRooms[roomId] = {
        players: {},
        food: { x: 5, y: 5 },
        isActive: false,
        gameTimer: GAME_DURATION,
        foodTimer: FOOD_DURATION,
        rematchRequests: {},
        created: created
    };
    
    // Add players back with initial positions
    if (playerIds.length > 0) {
        const startX = 10;
        
        gameRooms[roomId].players[playerIds[0]] = {
            score: 0,
            color: 'red',
            snake: [{ x: startX, y: 15 }, { x: startX - 1, y: 15 }],
            direction: 'RIGHT'
        };
        
        if (playerIds.length > 1) {
            const startX2 = 30;
            gameRooms[roomId].players[playerIds[1]] = {
                score: 0,
                color: 'blue',
                snake: [{ x: startX2, y: 15 }, { x: startX2 + 1, y: 15 }],
                direction: 'LEFT'
            };
        }
    }
    
    return getCleanGameState(roomId);
}

// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Track the current room for this socket
    socket.roomId = null;

    // Create a new game room
    socket.on('createRoom', (data) => {
        const roomId = data.roomCode;
        
        // Check if room already exists
        if (gameRooms[roomId]) {
            socket.emit('roomError', { message: 'Room already exists' });
            return;
        }
        
        // Create new room
        gameRooms[roomId] = {
            players: {},
            food: { x: 5, y: 5 },
            isActive: false,
            gameTimer: GAME_DURATION,
            foodTimer: FOOD_DURATION,
            rematchRequests: {},
            created: Date.now()
        };
        
        // Initialize intervals storage
        gameIntervals[roomId] = {};
        
        // Join the room
        socket.join(roomId);
        socket.roomId = roomId;
        
        // Add player to the room
        const playerId = socket.id;
        gameRooms[roomId].players[playerId] = {
            score: 0,
            color: 'red',
            snake: [{ x: 10, y: 15 }, { x: 9, y: 15 }],
            direction: 'RIGHT'
        };
        
        socket.emit('roomCreated', { 
            roomId: roomId,
            playerId: playerId
        });
        
        console.log(`Room created: ${roomId} by player ${playerId}`);
    });
    
    // Join an existing game room
    socket.on('joinRoom', (data) => {
        const roomId = data.roomCode;
        
        // Check if room exists
        if (!gameRooms[roomId]) {
            socket.emit('roomError', { message: 'Room does not exist' });
            return;
        }
        
        // Check if room is full
        if (Object.keys(gameRooms[roomId].players).length >= 2) {
            socket.emit('roomError', { message: 'Room is full' });
            return;
        }
        
        // Join the room
        socket.join(roomId);
        socket.roomId = roomId;
        
        // Add player to the room
        const playerId = socket.id;
        gameRooms[roomId].players[playerId] = {
            score: 0,
            color: 'blue',
            snake: [{ x: 30, y: 15 }, { x: 31, y: 15 }],
            direction: 'LEFT'
        };
        
        socket.emit('roomJoined', { 
            roomId: roomId,
            playerId: playerId
        });
        
        // Notify the room creator
        socket.to(roomId).emit('playerJoinedRoom', {
            playerId: playerId
        });
        
        console.log(`Player ${playerId} joined room ${roomId}`);
    });
    
    // Handle game initialization for a specific room
    socket.on('initializeGame', (data) => {
        try {
            const roomId = data.roomId;
            
            if (!gameRooms[roomId]) {
                socket.emit('roomError', { message: 'Room does not exist' });
                return;
            }
            
            socket.roomId = roomId;
            const playerId = socket.id;
            
            // Add player to the room if not already there (handles page refreshes)
            if (!gameRooms[roomId].players[playerId]) {
                const isFirstPlayer = Object.keys(gameRooms[roomId].players).length === 0;
                const startX = isFirstPlayer ? 10 : 30;
                
                gameRooms[roomId].players[playerId] = {
                    score: 0,
                    color: isFirstPlayer ? 'red' : 'blue',
                    snake: [{ x: startX, y: 15 }, { x: startX - 1, y: 15 }],
                    direction: isFirstPlayer ? 'RIGHT' : 'LEFT'
                };
            }
            
            // Join the room (if not already in it)
            socket.join(roomId);
            
            // Send the initial game state - clean copy without circular references
            socket.emit('initialize', { 
                playerId, 
                gameState: getCleanGameState(roomId)
            });
            
            // Notify other players
            socket.to(roomId).emit('playerJoined', {
                playerId: playerId,
                player: gameRooms[roomId].players[playerId]
            });
            
            // Start game if two players (and not already active)
            if (Object.keys(gameRooms[roomId].players).length === 2 && !gameRooms[roomId].isActive) {
                startGame(roomId);
                io.to(roomId).emit('gameStarted');
            }
        } catch (error) {
            console.error('Error initializing game:', error);
            socket.emit('roomError', { message: 'Error initializing game' });
        }
    });

    // Handle player movement
    socket.on('move', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const playerId = socket.id;
        const player = gameRooms[roomId].players[playerId];
        
        if (!player || !gameRooms[roomId].isActive) return;

        const opposites = {
            'LEFT': 'RIGHT',
            'RIGHT': 'LEFT',
            'UP': 'DOWN',
            'DOWN': 'UP'
        };

        // Only allow valid direction changes
        if (!player.direction || opposites[player.direction] !== data.direction) {
            player.direction = data.direction;
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        // Handle player disconnection
        const roomId = socket.roomId;
        if (roomId && gameRooms[roomId]) {
            // Remove player from the room
            delete gameRooms[roomId].players[socket.id];
            
            // Remove rematch request if any
            if (gameRooms[roomId].rematchRequests) {
                delete gameRooms[roomId].rematchRequests[socket.id];
            }
            
            // Stop the game
            gameRooms[roomId].isActive = false;
            clearRoomIntervals(roomId);
            
            // Notify remaining players
            io.to(roomId).emit('playerLeft', { playerId: socket.id });
            
            // Remove the room if empty
            if (Object.keys(gameRooms[roomId].players).length === 0) {
                delete gameRooms[roomId];
                delete gameIntervals[roomId];
                console.log(`Room ${roomId} deleted (empty)`);
            }
        }
    });

    // Handle rematch request
    socket.on('requestRematch', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        console.log('Rematch requested by:', socket.id);
        
        const playerId = socket.id;
        
        // Find the opponent
        const opponentId = Object.keys(gameRooms[roomId].players).find(id => id !== playerId);
        if (!opponentId) {
            // No opponent found
            socket.emit('rematchFailed', { reason: 'No opponent found' });
            return;
        }
        
        // Set this player's rematch request
        gameRooms[roomId].rematchRequests[playerId] = true;
        
        // Send request to opponent
        socket.to(opponentId).emit('rematchRequested', { 
            requesterId: playerId 
        });
        
        // Notify requester that request was sent
        socket.emit('rematchRequestSent');
    });
    
    // Handle rematch acceptance
    socket.on('acceptRematch', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        console.log('Rematch accepted by:', socket.id);
        
        const playerId = socket.id;
        
        // Find the requester (opponent)
        const opponentId = Object.keys(gameRooms[roomId].players).find(id => id !== playerId);
        
        if (!opponentId || !gameRooms[roomId].rematchRequests[opponentId]) {
            // Invalid rematch state
            socket.emit('rematchFailed', { reason: 'Invalid rematch state' });
            return;
        }
        
        // Both players have agreed to rematch
        const resetGameState = resetGame(roomId);
        
        // Clear intervals
        clearRoomIntervals(roomId);
        
        // Send reset event to both players
        io.to(roomId).emit('gameRestarted', { gameState: resetGameState });
        
        // Start the game again
        startGame(roomId);
        io.to(roomId).emit('gameStarted');
    });
    
    // Handle rematch decline
    socket.on('declineRematch', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        console.log('Rematch declined by:', socket.id);
        
        const playerId = socket.id;
        
        // Find the requester (opponent)
        const opponentId = Object.keys(gameRooms[roomId].players).find(id => id !== playerId);
        
        if (opponentId) {
            // Notify requester that rematch was declined
            io.to(opponentId).emit('rematchDeclined');
        }
        
        // Clear rematch requests
        gameRooms[roomId].rematchRequests = {};
    });

    // Handle quit game
    socket.on('quit', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        clearRoomIntervals(roomId);
        
        gameRooms[roomId].isActive = false;
        gameRooms[roomId].rematchRequests = {};
        
        // Notify all players
        io.to(roomId).emit('gameQuit');
    });
    
    // Handle restart (legacy - keeping for backward compatibility)
    socket.on('restart', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const playerId = socket.id;
        
        resetGame(roomId);
        
        socket.emit('initialize', { 
            playerId, 
            gameState: getCleanGameState(roomId)
        });
    });
});

// Clean up inactive rooms periodically (every 30 minutes)
setInterval(() => {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
    
    Object.keys(gameRooms).forEach(roomId => {
        if (now - gameRooms[roomId].created > inactiveThreshold && !gameRooms[roomId].isActive) {
            clearRoomIntervals(roomId);
            delete gameRooms[roomId];
            delete gameIntervals[roomId];
            console.log(`Room ${roomId} deleted (inactive)`);
        }
    });
}, 30 * 60 * 1000);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
