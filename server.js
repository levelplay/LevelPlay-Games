import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

// Custom middleware to serve different content based on room parameter
app.get('/', (req, res) => {
    const roomId = req.query.room;
    
    if (roomId) {
        // Serve game page when room parameter is present
        const gameHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Glow Snake Multiplayer</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/phaser/3.70.0/phaser.min.js"></script>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body {
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
            font-family: 'Arial', sans-serif;
            background-color: #1a1a1a;
            box-sizing: border-box;
            overflow-x: hidden;
        }
        
        .game-wrapper {
            position: relative;
            width: 95%;
            max-width: 800px;
            text-align: center;
            padding: 5px;
            box-sizing: border-box;
            margin: 0;
        }

        #phaser-container {
            position: relative;
            width: 100%;
            max-width: 640px;
            aspect-ratio: 4/3;
            margin: 0 auto;
            background-color: #2d2d2d;
            border: 4px solid #555;
            border-radius: 8px;
            box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
            overflow: hidden;
        }

        canvas {
            width: 100% !important;
            height: 100% !important;
            display: block !important;
        }

        .scoreboard {
            display: flex;
            justify-content: space-between;
            padding: 10px;
            margin-bottom: 10px;
            background-color: #333;
            border-radius: 8px;
            color: white;
            flex-wrap: wrap;
            width: 100%;
        }

        .profile {
            padding: 8px 15px;
            border-radius: 6px;
            font-size: clamp(14px, 3vw, 20px);
            font-weight: bold;
            text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
            margin: 5px;
        }

        .profile.left {
            background-color: rgba(255, 0, 0, 0.25);
            border: 2px solid #ff3333;
        }

        .profile.right {
            background-color: rgba(0, 0, 255, 0.25);
            border: 2px solid #3333ff;
        }

        .waiting-message {
            color: white;
            font-size: clamp(16px, 4vw, 24px);
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: block;
            background-color: rgba(0, 0, 0, 0.7);
            padding: 15px;
            border-radius: 10px;
            z-index: 50;
            width: 80%;
            max-width: 320px;
            text-align: center;
        }

        .timers {
            position: absolute;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            text-align: center;
            color: white;
            font-size: clamp(16px, 3vw, 24px);
            font-weight: bold;
            z-index: 100;
            text-shadow: 0 0 5px rgba(0, 0, 0, 0.7);
        }

        .main-timer {
            margin-bottom: 5px;
            transition: color 0.3s ease;
        }

        .food-timer {
            font-size: clamp(14px, 2.5vw, 18px);
            color: #ffff00;
            transition: color 0.3s ease;
        }

        .shake {
            animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }

        .timer-warning {
            color: #ff5555;
        }

        @keyframes shake {
            10%, 90% { transform: translateX(-1px); }
            20%, 80% { transform: translateX(2px); }
            30%, 50%, 70% { transform: translateX(-4px); }
            40%, 60% { transform: translateX(4px); }
        }

        .controls-container {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            justify-content: center;
            z-index: 100;
            width: 200px;
            height: 200px;
        }

        .player-controls {
            position: relative;
            width: 100%;
            height: 100%;
        }

        .control-btn {
            position: absolute !important;
            width: 60px !important;
            height: 60px !important;
            border-radius: 50% !important;
            border: 2px solid rgba(255, 255, 255, 0.7) !important;
            background-color: rgba(50, 50, 50, 0.6) !important;
            color: white !important;
            cursor: pointer !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            font-size: 24px !important;
            transition: all 0.2s !important;
            touch-action: manipulation !important;
            box-shadow: 0 0 15px rgba(0, 255, 0, 0.4) !important;
            -webkit-tap-highlight-color: transparent !important;
            user-select: none !important;
            -webkit-user-select: none !important;
        }

        .control-btn:active, .control-btn.active {
            background-color: rgba(0, 255, 0, 0.6) !important;
        }

        .up { 
            top: 0 !important; 
            left: 50% !important; 
            transform: translateX(-50%) !important; 
        }
        
        .down { 
            bottom: 0 !important; 
            left: 50% !important; 
            transform: translateX(-50%) !important; 
        }
        
        .left { 
            top: 50% !important; 
            left: 0 !important; 
            transform: translateY(-50%) !important; 
        }
        
        .right { 
            top: 50% !important; 
            right: 0 !important; 
            transform: translateY(-50%) !important; 
        }

        .game-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.3);
            display: none;
            z-index: 90;
            pointer-events: auto;
        }
        
        .result-popup {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(20, 20, 20, 0.85);
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            display: none;
            color: white;
            width: 85%;
            max-width: 320px;
            z-index: 1000;
            box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
            border: 2px solid rgba(0, 255, 0, 0.3);
        }

        .result-popup h2 {
            margin-top: 0;
            margin-bottom: 20px;
            font-size: clamp(18px, 4vw, 28px);
            color: white;
            text-shadow: 0 0 8px rgba(0, 255, 0, 0.5);
        }

        .score-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: clamp(14px, 3vw, 18px);
        }
        
        .score-line.you {
            font-weight: bold;
            color: #55ff55;
        }

        .popup-buttons {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
        }
        
        .play-again-btn {
            padding: 10px 0;
            width: 48%;
            font-size: clamp(14px, 3vw, 18px);
            background: linear-gradient(45deg, #33cc33, #27ae60);
            border: none;
            border-radius: 5px;
            color: white;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .quit-btn {
            padding: 10px 0;
            width: 48%;
            font-size: clamp(14px, 3vw, 18px);
            background: linear-gradient(45deg, #ff3333, #c0392b);
            border: none;
            border-radius: 5px;
            color: white;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .play-again-btn:hover, .quit-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
        }
        
        .rematch-popup {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(20, 20, 20, 0.85);
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            display: none;
            color: white;
            width: 85%;
            max-width: 350px;
            z-index: 1000;
            box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
            border: 2px solid rgba(0, 255, 0, 0.3);
        }
        
        .rematch-popup h2 {
            margin-top: 0;
            margin-bottom: 20px;
            font-size: clamp(18px, 4vw, 24px);
            color: white;
            text-shadow: 0 0 8px rgba(0, 255, 0, 0.5);
        }
        
        .rematch-popup p {
            margin-bottom: 20px;
            font-size: clamp(14px, 3vw, 18px);
        }
        
        .rematch-buttons {
            display: flex;
            justify-content: space-between;
        }
        
        .accept-btn {
            padding: 10px 0;
            width: 48%;
            font-size: clamp(14px, 3vw, 18px);
            background: linear-gradient(45deg, #33cc33, #27ae60);
            border: none;
            border-radius: 5px;
            color: white;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .decline-btn {
            padding: 10px 0;
            width: 48%;
            font-size: clamp(14px, 3vw, 18px);
            background: linear-gradient(45deg, #ff3333, #c0392b);
            border: none;
            border-radius: 5px;
            color: white;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .accept-btn:hover, .decline-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
        }
        
        .rematch-status {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(20, 20, 20, 0.85);
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            display: none;
            color: white;
            width: 85%;
            max-width: 300px;
            z-index: 1000;
            box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
            border: 2px solid rgba(0, 255, 0, 0.3);
        }

        @media (max-width: 768px) {
            .game-wrapper {
                padding: 5px;
                margin: 0;
                width: 98%;
            }
            
            .scoreboard {
                padding: 8px;
                margin-bottom: 8px;
            }
            
            #phaser-container {
                aspect-ratio: 4/3;
                max-width: 100%;
            }
            
            body {
                padding: 0;
                margin: 0;
            }
            
            .controls-container {
                bottom: 20px;
            }
        }

        @media (max-width: 480px) {
            .timers {
                top: 5px;
                font-size: clamp(14px, 3vw, 20px);
            }
        }

        * { 
            touch-action: manipulation;
        }
    </style>
</head>
<body>
    <div class="game-wrapper">
        <div class="scoreboard">
            <div class="profile left" id="profileLeft">Waiting for Player 1</div>
            <div class="profile right" id="profileRight">Waiting for Player 2</div>
        </div>
        
        <div id="phaser-container">
            <div class="timers">
                <div id="mainTimer" class="main-timer">Time: 60</div>
                <div id="foodTimer" class="food-timer">Food: 10</div>
            </div>
            <div class="waiting-message" id="waitingMessage">
                Waiting for another player to join...
            </div>
            
            <div class="controls-container">
                <div class="player-controls">
                    <button class="control-btn up" id="upButton" data-direction="UP">↑</button>
                    <button class="control-btn left" id="leftButton" data-direction="LEFT">←</button>
                    <button class="control-btn right" id="rightButton" data-direction="RIGHT">→</button>
                    <button class="control-btn down" id="downButton" data-direction="DOWN">↓</button>
                </div>
            </div>
        </div>
        
        <div class="game-overlay" id="gameOverlay"></div>
        
        <div class="result-popup" id="resultPopup">
            <h2 id="resultTitle">Game Over!</h2>
            <div id="scoreDisplay">
                <div class="score-line you">
                    <span>You:</span>
                    <span id="yourScore">0</span>
                </div>
                <div class="score-line">
                    <span>Opponent:</span>
                    <span id="opponentScore">0</span>
                </div>
            </div>
            <div class="popup-buttons">
                <button class="play-again-btn" onclick="handleRematch()">Play Again</button>
                <button class="quit-btn" onclick="handleQuit()">Quit</button>
            </div>
        </div>
        
        <div class="rematch-popup" id="rematchPopup">
            <h2>Rematch Request</h2>
            <p>Your opponent wants to play again. Do you accept?</p>
            <div class="rematch-buttons">
                <button class="accept-btn" onclick="acceptRematch()">Accept</button>
                <button class="decline-btn" onclick="declineRematch()">Decline</button>
            </div>
        </div>
        
        <div class="rematch-status" id="rematchStatus">
            <h2 id="rematchStatusTitle">Waiting for response...</h2>
            <p id="rematchStatusMessage">Your rematch request has been sent.</p>
        </div>
    </div>

    <script src="/game.js"></script>
</body>
</html>`;
        
        res.send(gameHtml);
    } else {
        // Serve lobby page when no room parameter
        const indexPath = join(__dirname, 'public', 'index.html');
        res.sendFile(indexPath);
    }
});

// Serve static files from the "public" folder for other requests
app.use(express.static('public'));

// Game constants and rest of your server code remains the same...
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

// Handle Socket.IO connections - rest of your socket code remains exactly the same
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
