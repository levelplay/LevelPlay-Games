import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from public directory
app.use(express.static(join(__dirname, 'public')));

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Catch-all route for client-side routing
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Game constants
const GRID_WIDTH = 40;
const GRID_HEIGHT = 30;
const UPDATE_INTERVAL = 50;
const GAME_DURATION = 60;
const FOOD_DURATION = 10;

// Store game state
const gameRooms = {};
const gameIntervals = {};

// Helper functions
function wrapPosition(pos) {
    return {
        x: pos.x < 0 ? GRID_WIDTH - 1 : pos.x >= GRID_WIDTH ? 0 : pos.x,
        y: pos.y < 0 ? GRID_HEIGHT - 1 : pos.y >= GRID_HEIGHT ? 0 : pos.y
    };
}

function getCleanGameState(roomId) {
    if (!gameRooms[roomId]) return null;
    
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
    let gameEnded = false;

    Object.entries(gameState.players).forEach(([playerId, player]) => {
        if (!player.direction || gameEnded) return;

        let head = { ...player.snake[0] };
        
        switch (player.direction) {
            case 'LEFT': head.x--; break;
            case 'RIGHT': head.x++; break;
            case 'UP': head.y--; break;
            case 'DOWN': head.y++; break;
        }

        head = wrapPosition(head);
        
        // Check self collision (skip head)
        if (player.snake.slice(1).some(segment => segment.x === head.x && segment.y === head.y)) {
            console.log(`Player ${playerId} hit themselves`);
            endGame(roomId, getOpponentId(roomId, playerId));
            gameEnded = true;
            return;
        }

        // Check collision with other snake
        Object.entries(gameState.players).forEach(([otherId, otherPlayer]) => {
            if (otherId !== playerId && !gameEnded) {
                if (otherPlayer.snake.some(segment => 
                    segment.x === head.x && segment.y === head.y)) {
                    console.log(`Player ${playerId} hit player ${otherId}`);
                    endGame(roomId, otherId);
                    gameEnded = true;
                }
            }
        });

        if (gameEnded) return;

        player.snake.unshift(head);

        // Check food collision
        if (head.x === gameState.food.x && head.y === gameState.food.y) {
            player.score++;
            console.log(`Player ${playerId} ate food, score: ${player.score}`);
            moveFood(roomId);
        } else {
            player.snake.pop();
        }
    });

    if (!gameEnded) {
        io.to(roomId).emit('update', getCleanGameState(roomId));
    }
}

function getOpponentId(roomId, playerId) {
    const playerIds = Object.keys(gameRooms[roomId].players);
    return playerIds.find(id => id !== playerId);
}

function clearRoomIntervals(roomId) {
    if (gameIntervals[roomId]) {
        if (gameIntervals[roomId].gameLoop) clearInterval(gameIntervals[roomId].gameLoop);
        if (gameIntervals[roomId].timerInterval) clearInterval(gameIntervals[roomId].timerInterval);
        if (gameIntervals[roomId].foodInterval) clearInterval(gameIntervals[roomId].foodInterval);
        gameIntervals[roomId] = {};
    }
}

function startGame(roomId) {
    console.log(`Starting game for room ${roomId}`);
    
    if (!gameRooms[roomId]) {
        console.log(`ERROR: Room ${roomId} not found`);
        return;
    }
    
    gameRooms[roomId].isActive = true;
    gameRooms[roomId].gameTimer = GAME_DURATION;
    gameRooms[roomId].foodTimer = FOOD_DURATION;
    
    clearRoomIntervals(roomId);
    
    gameIntervals[roomId] = {
        gameLoop: setInterval(() => updateSnakePositions(roomId), UPDATE_INTERVAL),
        timerInterval: setInterval(() => {
            if (!gameRooms[roomId]) {
                clearRoomIntervals(roomId);
                return;
            }
            
            gameRooms[roomId].gameTimer--;
            if (gameRooms[roomId].gameTimer <= 0) {
                console.log(`Game timer expired for room ${roomId}`);
                endGame(roomId);
            }
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
        }, 1000)
    };
    
    console.log(`Game started successfully for room ${roomId}`);
}

function endGame(roomId, winnerId = null) {
    console.log(`Ending game for room ${roomId}, winner: ${winnerId}`);
    
    if (!gameRooms[roomId]) return;
    
    clearRoomIntervals(roomId);
    gameRooms[roomId].isActive = false;

    let finalResult = { isTie: false, winnerId: null };

    if (!winnerId) {
        // Determine winner by score
        let highestScore = -1;
        let winners = [];

        Object.entries(gameRooms[roomId].players).forEach(([id, player]) => {
            if (player.score > highestScore) {
                highestScore = player.score;
                winners = [id];
            } else if (player.score === highestScore) {
                winners.push(id);
            }
        });

        if (winners.length > 1) {
            finalResult.isTie = true;
        } else {
            finalResult.winnerId = winners[0];
        }
    } else {
        finalResult.winnerId = winnerId;
    }

    finalResult.finalScores = Object.fromEntries(
        Object.entries(gameRooms[roomId].players).map(([id, player]) => [id, player.score])
    );

    console.log(`Game over result:`, finalResult);
    io.to(roomId).emit('gameOver', finalResult);
}

function resetGame(roomId) {
    if (!gameRooms[roomId]) return null;
    
    const playerIds = Object.keys(gameRooms[roomId].players);
    const created = gameRooms[roomId].created;
    
    gameRooms[roomId] = {
        players: {},
        food: { x: Math.floor(Math.random() * GRID_WIDTH), y: Math.floor(Math.random() * GRID_HEIGHT) },
        isActive: false,
        gameTimer: GAME_DURATION,
        foodTimer: FOOD_DURATION,
        rematchRequests: {},
        created: created
    };
    
    // Re-add players with fresh state - BOTH START MOVING RIGHT
    if (playerIds.length > 0) {
        gameRooms[roomId].players[playerIds[0]] = {
            score: 0,
            color: 'red',
            snake: [{ x: 10, y: 15 }, { x: 9, y: 15 }],
            direction: 'RIGHT'
        };
        
        if (playerIds.length > 1) {
            gameRooms[roomId].players[playerIds[1]] = {
                score: 0,
                color: 'blue',
                snake: [{ x: 30, y: 15 }, { x: 29, y: 15 }],
                direction: 'RIGHT'
            };
        }
    }
    
    return getCleanGameState(roomId);
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    
    socket.roomId = null;

    socket.on('createRoom', (data) => {
        const roomId = data.roomCode;
        console.log(`Creating room: ${roomId}`);
        
        if (!roomId || roomId.length < 3) {
            socket.emit('roomError', { message: 'Invalid room code' });
            return;
        }
        
        if (gameRooms[roomId]) {
            socket.emit('roomError', { message: 'Room already exists' });
            return;
        }
        
        gameRooms[roomId] = {
            players: {},
            food: { x: Math.floor(Math.random() * GRID_WIDTH), y: Math.floor(Math.random() * GRID_HEIGHT) },
            isActive: false,
            gameTimer: GAME_DURATION,
            foodTimer: FOOD_DURATION,
            rematchRequests: {},
            created: Date.now()
        };
        
        gameIntervals[roomId] = {};
        
        socket.join(roomId);
        socket.roomId = roomId;
        
        // Add host player - STARTS MOVING RIGHT
        gameRooms[roomId].players[socket.id] = {
            score: 0,
            color: 'red',
            snake: [{ x: 10, y: 15 }, { x: 9, y: 15 }],
            direction: 'RIGHT'
        };
        
        socket.emit('roomCreated', { 
            roomId: roomId,
            playerId: socket.id
        });
        
        console.log(`Room ${roomId} created by ${socket.id}`);
    });
    
    socket.on('joinRoom', (data) => {
        const roomId = data.roomCode;
        console.log(`Player ${socket.id} trying to join room: ${roomId}`);
        
        if (!roomId || roomId.length < 3) {
            socket.emit('roomError', { message: 'Invalid room code' });
            return;
        }
        
        if (!gameRooms[roomId]) {
            socket.emit('roomError', { message: 'Room does not exist' });
            return;
        }
        
        if (Object.keys(gameRooms[roomId].players).length >= 2) {
            socket.emit('roomError', { message: 'Room is full' });
            return;
        }
        
        socket.join(roomId);
        socket.roomId = roomId;
        
        // Add joining player - ALSO STARTS MOVING RIGHT
        gameRooms[roomId].players[socket.id] = {
            score: 0,
            color: 'blue',
            snake: [{ x: 30, y: 15 }, { x: 29, y: 15 }],
            direction: 'RIGHT'
        };
        
        socket.emit('roomJoined', { 
            roomId: roomId,
            playerId: socket.id
        });
        
        socket.to(roomId).emit('playerJoinedRoom', {
            playerId: socket.id
        });
        
        console.log(`Player ${socket.id} joined room ${roomId}`);
    });

    socket.on('startGame', (data) => {
        const roomId = data.roomCode;
        console.log(`Start game request for room: ${roomId}`);
        
        if (!roomId || !gameRooms[roomId]) {
            socket.emit('roomError', { message: 'Room does not exist' });
            return;
        }
        
        // Check if the requesting player is in the room
        if (!gameRooms[roomId].players[socket.id]) {
            socket.emit('roomError', { message: 'You are not in this room' });
            return;
        }
        
        const playerCount = Object.keys(gameRooms[roomId].players).length;
        if (playerCount < 2) {
            socket.emit('roomError', { message: 'Need 2 players to start' });
            return;
        }
        
        console.log(`Sending gameStartInitiated to room ${roomId}`);
        io.to(roomId).emit('gameStartInitiated');
    });
    
    socket.on('initializeGame', (data) => {
        const roomId = data.roomId;
        console.log(`Initialize game for room: ${roomId}, player: ${socket.id}`);
        
        if (!roomId || !gameRooms[roomId]) {
            socket.emit('roomError', { message: 'Room does not exist' });
            return;
        }
        
        if (!gameRooms[roomId].players[socket.id]) {
            socket.emit('roomError', { message: 'Player not in room' });
            return;
        }
        
        socket.roomId = roomId;
        socket.join(roomId);
        
        console.log(`Sending initialize to player ${socket.id}`);
        socket.emit('initialize', { 
            playerId: socket.id, 
            gameState: getCleanGameState(roomId)
        });
        
        const playerCount = Object.keys(gameRooms[roomId].players).length;
        if (playerCount === 2 && !gameRooms[roomId].isActive) {
            console.log(`Both players ready, starting game in 1 second`);
            setTimeout(() => {
                startGame(roomId);
                io.to(roomId).emit('gameStarted');
            }, 1000);
        }
    });

    socket.on('move', (data) => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId] || !gameRooms[roomId].isActive) return;
        
        const player = gameRooms[roomId].players[socket.id];
        if (!player) return;

        // Validate direction
        const validDirections = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
        if (!data.direction || !validDirections.includes(data.direction)) {
            console.log(`Invalid direction from player ${socket.id}: ${data.direction}`);
            return;
        }

        const opposites = {
            'LEFT': 'RIGHT', 'RIGHT': 'LEFT',
            'UP': 'DOWN', 'DOWN': 'UP'
        };

        // Prevent reversing into self
        if (!player.direction || opposites[player.direction] !== data.direction) {
            player.direction = data.direction;
            console.log(`Player ${socket.id} changed direction to ${data.direction}`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        
        const roomId = socket.roomId;
        if (roomId && gameRooms[roomId]) {
            delete gameRooms[roomId].players[socket.id];
            
            if (gameRooms[roomId].rematchRequests) {
                delete gameRooms[roomId].rematchRequests[socket.id];
            }
            
            gameRooms[roomId].isActive = false;
            clearRoomIntervals(roomId);
            
            io.to(roomId).emit('playerLeft', { playerId: socket.id });
            
            if (Object.keys(gameRooms[roomId].players).length === 0) {
                delete gameRooms[roomId];
                delete gameIntervals[roomId];
                console.log(`Room ${roomId} deleted (empty)`);
            }
        }
    });

    socket.on('requestRematch', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const opponentId = getOpponentId(roomId, socket.id);
        if (!opponentId) return;
        
        gameRooms[roomId].rematchRequests = gameRooms[roomId].rematchRequests || {};
        gameRooms[roomId].rematchRequests[socket.id] = true;
        
        socket.to(opponentId).emit('rematchRequested', { 
            requesterId: socket.id 
        });
        
        socket.emit('rematchRequestSent');
        console.log(`Rematch requested by ${socket.id} in room ${roomId}`);
        
        // Check if both players have requested rematch
        const playerIds = Object.keys(gameRooms[roomId].players);
        const bothRequested = playerIds.every(id => gameRooms[roomId].rematchRequests[id]);
        
        if (bothRequested) {
            console.log(`Both players requested rematch in room ${roomId}, auto-accepting`);
            
            const resetGameState = resetGame(roomId);
            clearRoomIntervals(roomId);
            
            io.to(roomId).emit('gameRestarted', { gameState: resetGameState });
            
            setTimeout(() => {
                startGame(roomId);
                io.to(roomId).emit('gameStarted');
            }, 1000);
        }
    });
    
    socket.on('acceptRematch', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const opponentId = getOpponentId(roomId, socket.id);
        if (!opponentId || !gameRooms[roomId].rematchRequests[opponentId]) return;
        
        console.log(`Rematch accepted by ${socket.id} in room ${roomId}`);
        
        const resetGameState = resetGame(roomId);
        clearRoomIntervals(roomId);
        
        io.to(roomId).emit('gameRestarted', { gameState: resetGameState });
        
        setTimeout(() => {
            startGame(roomId);
            io.to(roomId).emit('gameStarted');
        }, 1000);
    });
    
    socket.on('declineRematch', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        const opponentId = getOpponentId(roomId, socket.id);
        if (opponentId) {
            io.to(opponentId).emit('rematchDeclined');
        }
        
        gameRooms[roomId].rematchRequests = {};
        console.log(`Rematch declined by ${socket.id} in room ${roomId}`);
    });

    socket.on('quit', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        clearRoomIntervals(roomId);
        gameRooms[roomId].isActive = false;
        
        io.to(roomId).emit('gameQuit');
        console.log(`Game quit by ${socket.id} in room ${roomId}`);
    });

    // Handle player leaving room (explicit leave, different from disconnect)
    socket.on('leaveRoom', () => {
        const roomId = socket.roomId;
        if (!roomId || !gameRooms[roomId]) return;
        
        console.log('Player leaving room:', socket.id);
        
        // Remove player from the room
        delete gameRooms[roomId].players[socket.id];
        
        // Remove rematch request if any
        if (gameRooms[roomId].rematchRequests) {
            delete gameRooms[roomId].rematchRequests[socket.id];
        }
        
        // Stop the game if it was active
        if (gameRooms[roomId].isActive) {
            gameRooms[roomId].isActive = false;
            clearRoomIntervals(roomId);
        }
        
        // Leave the socket room
        socket.leave(roomId);
        socket.roomId = null;
        
        // Notify remaining players
        socket.to(roomId).emit('playerLeft', { playerId: socket.id });
        
        // Remove the room if empty
        if (Object.keys(gameRooms[roomId].players).length === 0) {
            delete gameRooms[roomId];
            delete gameIntervals[roomId];
            console.log(`Room ${roomId} deleted (empty after leave)`);
        }
        
        // Confirm to the leaving player
        socket.emit('leftRoom', { roomId });
    });

    // Handle ping/pong for connection health monitoring
    socket.on('ping', () => {
        socket.emit('pong');
    });

    // Handle client requesting room status
    socket.on('getRoomStatus', (data) => {
        const roomId = data.roomCode;
        
        if (!gameRooms[roomId]) {
            socket.emit('roomStatus', { 
                exists: false,
                message: 'Room does not exist'
            });
            return;
        }
        
        const playerCount = Object.keys(gameRooms[roomId].players).length;
        const isActive = gameRooms[roomId].isActive;
        
        socket.emit('roomStatus', {
            exists: true,
            playerCount: playerCount,
            maxPlayers: 2,
            isActive: isActive,
            isFull: playerCount >= 2
        });
    });

    // Error handling for socket errors
    socket.on('error', (error) => {
        console.error('Socket error for client', socket.id, ':', error);
    });

    // Handle custom events for game statistics (optional)
    socket.on('getGameStats', () => {
        const stats = {
            totalRooms: Object.keys(gameRooms).length,
            activeRooms: Object.values(gameRooms).filter(room => room.isActive).length,
            totalPlayers: Object.values(gameRooms).reduce((sum, room) => sum + Object.keys(room.players).length, 0),
            serverUptime: process.uptime()
        };
        socket.emit('gameStats', stats);
    });
});

// Cleanup inactive rooms periodically (every 30 minutes)
setInterval(() => {
    const now = Date.now();
    const threshold = 30 * 60 * 1000; // 30 minutes
    
    Object.keys(gameRooms).forEach(roomId => {
        if (now - gameRooms[roomId].created > threshold && !gameRooms[roomId].isActive) {
            clearRoomIntervals(roomId);
            delete gameRooms[roomId];
            delete gameIntervals[roomId];
            console.log(`Room ${roomId} deleted (inactive)`);
        }
    });
}, 30 * 60 * 1000);

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('Received SIGINT. Graceful shutdown...');
    
    // Clear all game intervals
    Object.keys(gameIntervals).forEach(roomId => {
        clearRoomIntervals(roomId);
    });
    
    // Notify all connected clients
    io.emit('serverShutdown', { message: 'Server is shutting down' });
    
    // Close the server
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Graceful shutdown...');
    
    // Clear all game intervals
    Object.keys(gameIntervals).forEach(roomId => {
        clearRoomIntervals(roomId);
    });
    
    // Notify all connected clients
    io.emit('serverShutdown', { message: 'Server is shutting down' });
    
    // Close the server
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    
    // Clear all game intervals
    Object.keys(gameIntervals).forEach(roomId => {
        clearRoomIntervals(roomId);
    });
    
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    
    // Clear all game intervals
    Object.keys(gameIntervals).forEach(roomId => {
        clearRoomIntervals(roomId);
    });
    
    process.exit(1);
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Glow Snake Multiplayer Server running on http://localhost:${PORT}`);
    console.log(`🐍 Fixed: Synchronized start, same initial direction, responsive buttons`);
    console.log(`📱 Mobile-responsive and ready for connections!`);
    console.log(`🔧 Features: Room management, collision detection, rematch system`);
});
