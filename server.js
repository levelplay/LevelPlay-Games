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
const UPDATE_INTERVAL = 100; // Faster speed for more competitive gameplay
const GAME_DURATION = 60; // 60 seconds game duration
const FOOD_DURATION = 10; // 10 seconds food duration

// Store game state
let gameState = {
    players: {},
    food: { x: 5, y: 5 },
    isActive: false,
    gameTimer: GAME_DURATION,
    foodTimer: FOOD_DURATION,
    rematchRequests: {} // Track rematch requests
};

let gameLoop = null;
let gameTimer = null;
let foodTimer = null;

// Function to wrap position around screen edges
function wrapPosition(pos) {
    return {
        x: pos.x < 0 ? GRID_WIDTH - 1 : pos.x >= GRID_WIDTH ? 0 : pos.x,
        y: pos.y < 0 ? GRID_HEIGHT - 1 : pos.y >= GRID_HEIGHT ? 0 : pos.y
    };
}

function moveFood() {
    gameState.food = {
        x: Math.floor(Math.random() * GRID_WIDTH),
        y: Math.floor(Math.random() * GRID_HEIGHT)
    };
    gameState.foodTimer = FOOD_DURATION;
}

function updateSnakePositions() {
    if (!gameState.isActive) return;

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
                    endGame(otherId);
                }
            }
        });
    });

    io.emit('update', gameState);
}

function startGame() {
    gameState.isActive = true;
    gameState.gameTimer = GAME_DURATION;
    gameState.foodTimer = FOOD_DURATION;
    gameState.rematchRequests = {}; // Clear any rematch requests
    
    clearInterval(gameLoop);
    clearInterval(gameTimer);
    clearInterval(foodTimer);
    
    gameLoop = setInterval(updateSnakePositions, UPDATE_INTERVAL);
    
    // Game timer
    gameTimer = setInterval(() => {
        gameState.gameTimer--;
        if (gameState.gameTimer <= 0) {
            endGame();
        }
        io.emit('update', gameState);
    }, 1000);

    // Food timer
    foodTimer = setInterval(() => {
        gameState.foodTimer--;
        if (gameState.foodTimer <= 0) {
            moveFood();
        }
        io.emit('update', gameState);
    }, 1000);
}

function endGame(winnerId = null) {
    clearInterval(gameLoop);
    clearInterval(gameTimer);
    clearInterval(foodTimer);
    gameState.isActive = false;

    // If no winner specified, determine by score
    if (!winnerId) {
        let highestScore = -1;
        let isTie = false;

        Object.entries(gameState.players).forEach(([id, player]) => {
            if (player.score > highestScore) {
                highestScore = player.score;
                winnerId = id;
                isTie = false;
            } else if (player.score === highestScore) {
                isTie = true;
            }
        });

        io.emit('gameOver', { 
            winnerId: winnerId,
            isTie: isTie,
            finalScores: Object.fromEntries(
                Object.entries(gameState.players).map(([id, player]) => [id, player.score])
            )
        });
    } else {
        io.emit('gameOver', { 
            winnerId: winnerId,
            isTie: false,
            finalScores: Object.fromEntries(
                Object.entries(gameState.players).map(([id, player]) => [id, player.score])
            )
        });
    }
}

function resetGame() {
    // Reset game state
    const playerIds = Object.keys(gameState.players);
    
    gameState = {
        players: {},
        food: { x: 5, y: 5 },
        isActive: false,
        gameTimer: GAME_DURATION,
        foodTimer: FOOD_DURATION,
        rematchRequests: {}
    };
    
    // Add players back with initial positions
    if (playerIds.length > 0) {
        const isFirstPlayer = true;
        const startX = 10;
        
        gameState.players[playerIds[0]] = {
            score: 0,
            color: 'red',
            snake: [{ x: startX, y: 15 }, { x: startX - 1, y: 15 }],
            direction: 'RIGHT'
        };
        
        if (playerIds.length > 1) {
            const startX2 = 30;
            gameState.players[playerIds[1]] = {
                score: 0,
                color: 'blue',
                snake: [{ x: startX2, y: 15 }, { x: startX2 + 1, y: 15 }],
                direction: 'LEFT'
            };
        }
    }
    
    return gameState;
}

// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    const playerId = socket.id;
    const isFirstPlayer = Object.keys(gameState.players).length === 0;
    const startX = isFirstPlayer ? 10 : 30;

    gameState.players[playerId] = {
        score: 0,
        color: isFirstPlayer ? 'red' : 'blue',
        snake: [{ x: startX, y: 15 }, { x: startX - 1, y: 15 }],
        direction: isFirstPlayer ? 'RIGHT' : 'LEFT'
    };

    socket.emit('initialize', { playerId, gameState });
    socket.broadcast.emit('playerJoined', {
        playerId: playerId,
        player: gameState.players[playerId]
    });

    // Start game if two players
    if (Object.keys(gameState.players).length === 2) {
        startGame();
        io.emit('gameStarted');
    }

    socket.on('move', (data) => {
        const player = gameState.players[playerId];
        if (!player || !gameState.isActive) return;

        const opposites = {
            'LEFT': 'RIGHT',
            'RIGHT': 'LEFT',
            'UP': 'DOWN',
            'DOWN': 'UP'
        };

        if (!player.direction || opposites[player.direction] !== data.direction) {
            player.direction = data.direction;
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete gameState.players[socket.id];
        delete gameState.rematchRequests[socket.id];
        
        gameState.isActive = false;
        clearInterval(gameLoop);
        clearInterval(gameTimer);
        clearInterval(foodTimer);
        
        io.emit('playerLeft', { playerId: socket.id });
    });

    // Handle rematch request
    socket.on('requestRematch', () => {
        console.log('Rematch requested by:', socket.id);
        
        // Find the opponent
        const opponentId = Object.keys(gameState.players).find(id => id !== playerId);
        if (!opponentId) {
            // No opponent found
            socket.emit('rematchFailed', { reason: 'No opponent found' });
            return;
        }
        
        // Set this player's rematch request
        gameState.rematchRequests[playerId] = true;
        
        // Send request to opponent
        socket.to(opponentId).emit('rematchRequested', { 
            requesterId: playerId 
        });
        
        // Notify requester that request was sent
        socket.emit('rematchRequestSent');
    });
    
    // Handle rematch acceptance
    socket.on('acceptRematch', () => {
        console.log('Rematch accepted by:', socket.id);
        
        // Find the requester (opponent)
        const opponentId = Object.keys(gameState.players).find(id => id !== playerId);
        
        if (!opponentId || !gameState.rematchRequests[opponentId]) {
            // Invalid rematch state
            socket.emit('rematchFailed', { reason: 'Invalid rematch state' });
            return;
        }
        
        // Both players have agreed to rematch
        const resetGameState = resetGame();
        
        // Clear intervals
        clearInterval(gameLoop);
        clearInterval(gameTimer);
        clearInterval(foodTimer);
        
        // Send reset event to both players
        io.emit('gameRestarted', { gameState: resetGameState });
        
        // Start the game again
        startGame();
        io.emit('gameStarted');
    });
    
    // Handle rematch decline
    socket.on('declineRematch', () => {
        console.log('Rematch declined by:', socket.id);
        
        // Find the requester (opponent)
        const opponentId = Object.keys(gameState.players).find(id => id !== playerId);
        
        if (opponentId) {
            // Notify requester that rematch was declined
            io.to(opponentId).emit('rematchDeclined');
        }
        
        // Clear rematch requests
        gameState.rematchRequests = {};
    });

    // Handle quit game
    socket.on('quit', () => {
        clearInterval(gameLoop);
        clearInterval(gameTimer);
        clearInterval(foodTimer);
        
        gameState.isActive = false;
        gameState.rematchRequests = {};
        
        // Notify all players
        io.emit('gameQuit');
    });
    
    // Handle restart (legacy - keeping for backward compatibility)
    socket.on('restart', () => {
        const isFirstPlayer = Object.keys(gameState.players).length === 0;
        const startX = isFirstPlayer ? 10 : 30;
        
        resetGame();
        
        socket.emit('initialize', { playerId, gameState });
    });
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
