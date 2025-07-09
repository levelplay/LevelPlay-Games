// Check for room parameter in URL
const urlParams = new URLSearchParams(window.location.search);
const urlRoomId = urlParams.get('room');

// Global game variables
let gameWidth = 400;
let gameHeight = 300;
let gameActive = false;
let playerId = null;
let gameState = { players: {} };
let socket = null;
let game = null;
let roomCode = null;
let gameInitialized = false;
let isHost = false;

// Debug flag
const DEBUG = true;

function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
        const debugLogDiv = document.getElementById('debugLog');
        if (debugLogDiv) {
            debugLogDiv.innerHTML += new Date().toLocaleTimeString() + ': ' + args.join(' ') + '<br>';
            debugLogDiv.scrollTop = debugLogDiv.scrollHeight;
        }
    }
}

// Initialize when document loads
document.addEventListener('DOMContentLoaded', function() {
    debugLog("Document loaded, initializing socket connection");
    
    // Add global error handlers
    window.addEventListener('unhandledrejection', function(event) {
        debugLog('Unhandled promise rejection:', event.reason);
        event.preventDefault();
    });
    
    window.addEventListener('error', function(event) {
        debugLog('Global error:', event.error);
    });
    
    initializeSocket();
    setupLobbyEvents();
    
    // Auto-join if room ID in URL
    if (urlRoomId) {
        debugLog('Auto-joining room from URL: ' + urlRoomId);
        const roomCodeInput = document.getElementById('roomCodeInput');
        if (roomCodeInput) {
            roomCodeInput.value = urlRoomId.toUpperCase();
            setTimeout(() => {
                const joinButton = document.getElementById('joinGameButton');
                if (joinButton) joinButton.click();
            }, 1000);
        }
    }
});

function initializeSocket() {
    try {
        debugLog("Initializing socket connection...");
        socket = io();
        
        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            debugLog('Socket connection error: ' + error.message);
        });
        
        socket.on('disconnect', (reason) => {
            console.warn('Socket disconnected:', reason);
            debugLog('Socket disconnected: ' + reason);
        });
        
        setupSocketEvents();
        debugLog("Socket initialization complete");
    } catch (error) {
        console.error("Error initializing socket:", error);
        debugLog("ERROR initializing socket: " + error.message);
    }
}

function setupSocketEvents() {
    socket.on('connect', () => {
        debugLog('Connected to server with ID: ' + socket.id);
        const socketStatus = document.getElementById('socketStatus');
        if (socketStatus) socketStatus.textContent = 'Connected';
    });

    socket.on('roomCreated', (data) => {
        debugLog('Room created: ' + data.roomId);
        isHost = true;
        updatePlayerCount(1);
    });

    socket.on('roomJoined', (data) => {
        debugLog('Joined room: ' + data.roomId);
        isHost = false;
        const joinError = document.getElementById('joinError');
        const joinGameButton = document.getElementById('joinGameButton');
        if (joinError) joinError.style.display = 'none';
        if (joinGameButton) {
            joinGameButton.textContent = 'Joined! Waiting for host...';
            joinGameButton.disabled = true;
        }
    });

    socket.on('playerJoinedRoom', (data) => {
        debugLog('Player joined room');
        updatePlayerCount(2);
        if (isHost) {
            const startGameButton = document.getElementById('startGameButton');
            const waitingStatus = document.getElementById('waitingStatus');
            if (startGameButton) startGameButton.disabled = false;
            if (waitingStatus) waitingStatus.textContent = 'Ready to start!';
        }
    });

    socket.on('roomError', (data) => {
        debugLog('Room error: ' + data.message);
        const joinError = document.getElementById('joinError');
        if (joinError) {
            joinError.textContent = data.message;
            joinError.style.display = 'block';
        }
    });

    // Game start flow
    socket.on('gameStartInitiated', () => {
        debugLog('Game start initiated by server - transitioning both players');
        // Hide lobby and show game
        const lobbyPage = document.getElementById('lobbyPage');
        const gameContainer = document.getElementById('gameContainer');
        
        if (lobbyPage) lobbyPage.style.display = 'none';
        if (gameContainer) gameContainer.style.display = 'flex';
        
        debugLog('Sending initializeGame to server with roomCode: ' + roomCode);
        socket.emit('initializeGame', { roomId: roomCode });
    });

    socket.on('initialize', (data) => {
        debugLog('Game initialized by server:', data);
        playerId = data.playerId;
        gameState = data.gameState || { players: {} };
        
        debugLog('Player ID set to:', playerId);
        debugLog('Initial game state:', gameState);
        
        // Initialize Phaser game
        if (!gameInitialized) {
            debugLog('Initializing Phaser game...');
            initializeGame();
        }
        
        updateUI(gameState);
    });

    socket.on('gameStarted', () => {
        debugLog('Server confirmed game started');
        gameActive = true;
        const waitingMessage = document.getElementById('waitingMessage');
        if (waitingMessage) waitingMessage.style.display = 'none';
    });

    socket.on('update', (state) => {
        debugLog('Game state update received');
        gameState = state;
        gameActive = state.isActive;
        updateUI(state);
        
        // Hide waiting message when game is active
        const waitingMessage = document.getElementById('waitingMessage');
        if (waitingMessage) {
            waitingMessage.style.display = gameActive ? 'none' : 'block';
        }
        
        // Update the game scene
        const scene = game && game.scene ? game.scene.getScene('SnakeScene') : null;
        if (scene) {
            scene.gameActive = gameActive;
            scene.updateGame();
        }
    });

    socket.on('gameOver', (data) => {
        debugLog('Game over:', data);
        handleGameOver(data);
    });

    socket.on('playerLeft', (data) => {
        debugLog('Player left:', data);
        gameActive = false;
        const waitingMessage = document.getElementById('waitingMessage');
        if (waitingMessage) {
            waitingMessage.style.display = 'block';
            waitingMessage.textContent = 'Opponent left. Waiting for new player...';
        }
    });

    // Rematch events
    socket.on('rematchRequested', (data) => {
        debugLog('Rematch requested by:', data.requesterId);
        // Show rematch popup
        showRematchPopup();
    });

    socket.on('rematchRequestSent', () => {
        debugLog('Rematch request sent');
        // Show waiting for response if implemented
    });

    socket.on('rematchDeclined', () => {
        debugLog('Rematch declined');
        alert('Rematch declined by opponent');
    });

    socket.on('gameRestarted', (data) => {
        debugLog('Game restarted:', data);
        gameState = data.gameState;
        gameActive = false;
        
        // Hide all popups
        const overlay = document.getElementById('gameOverlay');
        const resultPopup = document.getElementById('resultPopup');
        
        if (overlay) overlay.style.display = 'none';
        if (resultPopup) resultPopup.style.display = 'none';
        
        updateUI(gameState);
        
        // Update the game scene
        const scene = game && game.scene ? game.scene.getScene('SnakeScene') : null;
        if (scene) {
            scene.gameActive = false;
            scene.updateGame();
        }
    });

    socket.on('gameQuit', () => {
        debugLog('Game quit by opponent');
        gameActive = false;
        
        // Show quit message
        const waitingMessage = document.getElementById('waitingMessage');
        if (waitingMessage) {
            waitingMessage.style.display = 'block';
            waitingMessage.textContent = 'Opponent quit the game.';
        }
        
        // Hide game over popup if it's showing
        const overlay = document.getElementById('gameOverlay');
        const resultPopup = document.getElementById('resultPopup');
        if (overlay) overlay.style.display = 'none';
        if (resultPopup) resultPopup.style.display = 'none';
    });
}

function initializeGame() {
    if (gameInitialized) return;
    gameInitialized = true;
    
    try {
        debugLog("Creating Phaser game instance...");
        
        // Check if Phaser is available
        if (typeof Phaser === 'undefined') {
            throw new Error('Phaser library not loaded');
        }
        
        const config = {
            type: Phaser.AUTO,
            width: gameWidth,
            height: gameHeight,
            parent: 'phaser-container',
            scene: [ SnakeScene ],
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH
            },
            backgroundColor: 0x1a1a1a
        };
        
        game = new Phaser.Game(config);
        setupControls();
        
        debugLog("Game initialization complete");
    } catch (error) {
        console.error("Error initializing game:", error);
        debugLog("ERROR initializing Phaser: " + error.message);
        gameInitialized = false; // Reset flag so we can try again
    }
}

function setupControls() {
    // Keyboard controls
    if (!window._keyboardSetup) {
        window._keyboardSetup = true;
        window.addEventListener('keydown', function(e) {
            if (gameActive) {
                handleKeyInput(e);
            }
        });
    }
    
    // Touch controls
    setupTouchControls();
}

function handleKeyInput(e) {
    if (!gameActive || !socket) return;
    
    let direction = null;
    
    // Arrow keys
    if (e.key === 'ArrowUp') direction = 'UP';
    else if (e.key === 'ArrowDown') direction = 'DOWN';
    else if (e.key === 'ArrowLeft') direction = 'LEFT';
    else if (e.key === 'ArrowRight') direction = 'RIGHT';
    
    // WASD keys
    else if (e.key === 'w' || e.key === 'W') direction = 'UP';
    else if (e.key === 's' || e.key === 'S') direction = 'DOWN';
    else if (e.key === 'a' || e.key === 'A') direction = 'LEFT';
    else if (e.key === 'd' || e.key === 'D') direction = 'RIGHT';
    
    if (direction) {
        e.preventDefault(); // Prevent default browser behavior
        socket.emit('move', { direction: direction });
        debugLog('Sent move direction: ' + direction);
    }
}

function setupTouchControls() {
    // Swipe controls
    const touchArea = document.getElementById('phaser-container');
    if (!touchArea) return;
    
    let touchStartX = 0;
    let touchStartY = 0;
    
    touchArea.addEventListener('touchstart', function(e) {
        e.preventDefault();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    });
    
    touchArea.addEventListener('touchend', function(e) {
        e.preventDefault();
        if (!gameActive) return;
        
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        
        const minSwipeDistance = 30;
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            if (Math.abs(deltaX) > minSwipeDistance) {
                const direction = deltaX > 0 ? 'RIGHT' : 'LEFT';
                socket.emit('move', { direction });
                debugLog('Swipe direction: ' + direction);
            }
        } else {
            if (Math.abs(deltaY) > minSwipeDistance) {
                const direction = deltaY > 0 ? 'DOWN' : 'UP';
                socket.emit('move', { direction });
                debugLog('Swipe direction: ' + direction);
            }
        }
    });

    // Button controls
    const controlButtons = document.querySelectorAll('.control-btn');
    
    controlButtons.forEach(btn => {
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            btn.classList.add('active');
            
            const direction = btn.dataset.direction;
            handleDirectionInput(direction);
        });
        
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            btn.classList.remove('active');
        });
        
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const direction = btn.dataset.direction;
            handleDirectionInput(direction);
        });
    });
}

function handleDirectionInput(direction) {
    if (gameActive && direction && socket) {
        socket.emit('move', { direction });
        debugLog('Button direction: ' + direction);
    }
}

function updateUI(gameState) {
    const profileLeft = document.getElementById('profileLeft');
    const profileRight = document.getElementById('profileRight');
    
    if (!profileLeft || !profileRight) return;
    
    // Reset displays
    profileLeft.innerHTML = 'Waiting for Player 1';
    profileRight.innerHTML = 'Waiting for Player 2';
    
    if (gameState && gameState.players) {
        const players = Object.entries(gameState.players);
        
        if (players.length > 0) {
            const [id1, player1] = players[0];
            profileLeft.innerHTML = `Player 1: ${player1.score || 0}`;
            profileLeft.style.color = '#ff5555';
        }
        
        if (players.length > 1) {
            const [id2, player2] = players[1];
            profileRight.innerHTML = `Player 2: ${player2.score || 0}`;
            profileRight.style.color = '#5555ff';
        }
    }

    // Update timers
    if (gameState) {
        if (gameState.gameTimer !== undefined) {
            updateMainTimer(gameState.gameTimer);
        }
        
        if (gameState.foodTimer !== undefined) {
            updateFoodTimer(gameState.foodTimer);
        }
    }
}

function updateMainTimer(time) {
    const mainTimer = document.getElementById('mainTimer');
    if (!mainTimer) return;
    
    mainTimer.textContent = `Time: ${time}`;
    
    if (time <= 10) {
        mainTimer.classList.add('timer-warning');
    } else {
        mainTimer.classList.remove('timer-warning');
    }
}

function updateFoodTimer(time) {
    const foodTimer = document.getElementById('foodTimer');
    if (!foodTimer) return;
    
    foodTimer.textContent = `Food: ${time}`;
    
    if (time <= 5) {
        foodTimer.classList.add('timer-warning');
    } else {
        foodTimer.classList.remove('timer-warning');
    }
}

function handleGameOver(data) {
    gameActive = false;
    
    let title = "Game Over!";
    if (data && !data.isTie) {
        title = data.winnerId === playerId ? "You Win!" : "You Lose!";
    } else if (data && data.isTie) {
        title = "It's a Tie!";
    }
    
    debugLog('Showing game result:', title, data);
    showGameResult(title, data ? data.finalScores : {});
}

function showGameResult(title, finalScores) {
    const overlay = document.getElementById('gameOverlay');
    const popup = document.getElementById('resultPopup');
    const resultTitle = document.getElementById('resultTitle');
    const yourScore = document.getElementById('yourScore');
    const opponentScore = document.getElementById('opponentScore');
    
    if (overlay && popup && resultTitle && yourScore && opponentScore) {
        resultTitle.textContent = title;
        
        // Display scores
        const players = Object.entries(finalScores);
        if (players.length >= 2) {
            yourScore.textContent = finalScores[playerId] || 0;
            const opponentEntry = players.find(([id]) => id !== playerId);
            opponentScore.textContent = opponentEntry ? opponentEntry[1] : 0;
        } else {
            yourScore.textContent = finalScores[playerId] || 0;
            opponentScore.textContent = 0;
        }
        
        overlay.style.display = 'block';
        popup.style.display = 'block';
    }
}

// Snake Scene Class
class SnakeScene extends Phaser.Scene {
    constructor() {
        super({ key: 'SnakeScene' });
        this.gridSize = 16;
        this.gameActive = false;
    }

    create() {
        this.drawGrid();
        
        // Create graphics objects
        this.snakeGraphics = this.add.graphics();
        this.foodGraphics = this.add.graphics();
        
        debugLog('Snake scene created');
    }
    
    drawGrid() {
        // Draw grid background
        const gridGraphics = this.add.graphics();
        gridGraphics.lineStyle(1, 0x333333, 0.3);
            
        // Vertical lines
        for (let x = 0; x <= gameWidth; x += this.gridSize) {
            gridGraphics.moveTo(x, 0);
            gridGraphics.lineTo(x, gameHeight);
        }
        
        // Horizontal lines
        for (let y = 0; y <= gameHeight; y += this.gridSize) {
            gridGraphics.moveTo(0, y);
            gridGraphics.lineTo(gameWidth, y);
        }
        
        gridGraphics.strokePath();
    }
    
    updateGame() {
        // Clear previous graphics
        if (this.snakeGraphics) this.snakeGraphics.clear();
        if (this.foodGraphics) this.foodGraphics.clear();
        
        if (!gameState || !gameState.players) {
            return;
        }
        
        // Draw each player's snake
        const players = Object.entries(gameState.players);
        players.forEach(([id, player], index) => {
            if (!player.snake || player.snake.length === 0) {
                return;
            }
            
            // Set colors - red for first player, blue for second
            const color = index === 0 ? 0xff3333 : 0x3333ff;
            
            this.snakeGraphics.fillStyle(color, 0.9);
            
            // Draw snake segments
            player.snake.forEach((segment, i) => {
                if (!segment || typeof segment.x !== 'number' || typeof segment.y !== 'number') {
                    return; // Skip invalid segments
                }
                
                const x = segment.x * this.gridSize;
                const y = segment.y * this.gridSize;
                
                if (i === 0) {
                    // Head - slightly larger with glow
                    this.snakeGraphics.fillRect(x - 1, y - 1, this.gridSize + 2, this.gridSize + 2);
                    // Add glow effect for head
                    this.snakeGraphics.fillStyle(color, 0.4);
                    this.snakeGraphics.fillRect(x - 3, y - 3, this.gridSize + 6, this.gridSize + 6);
                    this.snakeGraphics.fillStyle(color, 0.9);
                } else {
                    // Body
                    this.snakeGraphics.fillRect(x + 1, y + 1, this.gridSize - 2, this.gridSize - 2);
                }
            });
        });
        
        // Draw food
        if (gameState.food && typeof gameState.food.x === 'number' && typeof gameState.food.y === 'number') {
            this.foodGraphics.fillStyle(0xffff00, 0.9);
            
            const foodX = gameState.food.x * this.gridSize + this.gridSize / 2;
            const foodY = gameState.food.y * this.gridSize + this.gridSize / 2;
            
            // Draw food as a circle with pulsing effect
            const pulseSize = 0.2 * Math.sin(this.time.now / 200);
            const radius = (this.gridSize / 2) * (0.8 + pulseSize);
            
            this.foodGraphics.fillCircle(foodX, foodY, radius);
            
            // Add glow effect
            this.foodGraphics.fillStyle(0xffff00, 0.4);
            this.foodGraphics.fillCircle(foodX, foodY, radius * 1.5);
        }
    }
}

// Lobby event handlers
function setupLobbyEvents() {
    const createButton = document.getElementById('createButton');
    const joinButton = document.getElementById('joinButton');
    const createForm = document.getElementById('createForm');
    const joinForm = document.getElementById('joinForm');
    const gameCodeElement = document.getElementById('gameCode');
    const copyButton = document.getElementById('copyButton');
    const roomCodeInput = document.getElementById('roomCodeInput');
    const joinGameButton = document.getElementById('joinGameButton');
    const startGameButton = document.getElementById('startGameButton');

    // Show create game form
    if (createButton) {
        createButton.addEventListener('click', () => {
            debugLog('Create button clicked');
            if (createForm) createForm.style.display = 'flex';
            if (joinForm) joinForm.style.display = 'none';
            
            // Generate room code
            try {
                // Use the global uuid object from the CDN script
                if (typeof uuid !== 'undefined' && uuid.v4) {
                    roomCode = uuid.v4().substring(0, 8).toUpperCase();
                } else {
                    // Fallback: generate a simple random code
                    roomCode = Math.random().toString(36).substring(2, 10).toUpperCase();
                }
                if (gameCodeElement) gameCodeElement.textContent = roomCode;
                debugLog('Generated room code: ' + roomCode);
                
                // Create room on server
                socket.emit('createRoom', { roomCode });
                debugLog('Sent createRoom event to server');
            } catch (error) {
                debugLog('ERROR generating room code: ' + error.message);
                // Fallback room code generation
                roomCode = Math.random().toString(36).substring(2, 10).toUpperCase();
                if (gameCodeElement) gameCodeElement.textContent = roomCode;
                socket.emit('createRoom', { roomCode });
            }
        });
    }
    
    // Show join game form
    if (joinButton) {
        joinButton.addEventListener('click', () => {
            debugLog('Join button clicked');
            if (joinForm) joinForm.style.display = 'flex';
            if (createForm) createForm.style.display = 'none';
        });
    }
    
    // Copy room code
    if (copyButton) {
        copyButton.addEventListener('click', () => {
            debugLog('Copy button clicked');
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(roomCode).then(() => {
                    copyButton.textContent = 'Copied!';
                    debugLog('Room code copied to clipboard');
                    setTimeout(() => {
                        copyButton.textContent = 'Copy Code';
                    }, 2000);
                }).catch(err => {
                    debugLog('Error copying to clipboard: ' + err.message);
                    fallbackCopy();
                });
            } else {
                fallbackCopy();
            }
            
            function fallbackCopy() {
                const textArea = document.createElement('textarea');
                textArea.value = roomCode;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    copyButton.textContent = 'Copied!';
                    setTimeout(() => {
                        copyButton.textContent = 'Copy Code';
                    }, 2000);
                } catch (err) {
                    debugLog('Fallback copy failed: ' + err.message);
                }
                document.body.removeChild(textArea);
            }
        });
    }
    
    // Join a game
    if (joinGameButton) {
        joinGameButton.addEventListener('click', () => {
            const code = roomCodeInput.value.trim().toUpperCase();
            debugLog('Join game button clicked with code: ' + code);
            
            if (code.length < 1) {
                const joinError = document.getElementById('joinError');
                if (joinError) {
                    joinError.textContent = 'Please enter a room code.';
                    joinError.style.display = 'block';
                }
                return;
            }
            
            roomCode = code;
            socket.emit('joinRoom', { roomCode });
            debugLog('Sent joinRoom event to server with code: ' + roomCode);
        });
    }
    
    // Start game button (host only)
    if (startGameButton) {
        startGameButton.addEventListener('click', () => {
            debugLog('Start game button clicked with room code: ' + roomCode);
            if (roomCode && !startGameButton.disabled) {
                startGameButton.disabled = true;
                startGameButton.textContent = 'Starting...';
                
                socket.emit('startGame', { roomCode });
                debugLog('Sent startGame event to server');
            }
        });
    }
}

// Helper functions
function updatePlayerCount(count) {
    const playerCount = document.getElementById('playerCount');
    if (playerCount) playerCount.textContent = `Players: ${count}/2`;
}

// Global functions for UI buttons
function handleRematch() {
    debugLog('Rematch requested');
    const overlay = document.getElementById('gameOverlay');
    const popup = document.getElementById('resultPopup');
    
    if (overlay) overlay.style.display = 'none';
    if (popup) popup.style.display = 'none';
    
    socket.emit('requestRematch');
}

function showRematchPopup() {
    const overlay = document.getElementById('gameOverlay');
    const popup = document.getElementById('resultPopup');
    const resultTitle = document.getElementById('resultTitle');
    
    if (overlay && popup && resultTitle) {
        resultTitle.textContent = 'Rematch Requested!';
        
        // Update popup buttons for rematch
        const popupButtons = popup.querySelector('.popup-buttons');
        if (popupButtons) {
            popupButtons.innerHTML = `
                <button class="play-again-btn" onclick="handleAcceptRematch()">Accept</button>
                <button class="quit-btn" onclick="handleDeclineRematch()">Decline</button>
            `;
        }
        
        overlay.style.display = 'block';
        popup.style.display = 'block';
    }
}

function handleAcceptRematch() {
    debugLog('Rematch accepted');
    const overlay = document.getElementById('gameOverlay');
    const popup = document.getElementById('resultPopup');
    
    if (overlay) overlay.style.display = 'none';
    if (popup) popup.style.display = 'none';
    
    socket.emit('acceptRematch');
}

function handleDeclineRematch() {
    debugLog('Rematch declined');
    const overlay = document.getElementById('gameOverlay');
    const popup = document.getElementById('resultPopup');
    
    if (overlay) overlay.style.display = 'none';
    if (popup) popup.style.display = 'none';
    
    socket.emit('declineRematch');
    alert('Rematch declined');
}

function handleQuit() {
    debugLog('Quit game');
    const gameContainer = document.getElementById('gameContainer');
    const lobbyPage = document.getElementById('lobbyPage');
    
    if (gameContainer) gameContainer.style.display = 'none';
    if (lobbyPage) lobbyPage.style.display = 'flex';
    
    // Destroy game
    if (game) {
        game.destroy(true);
        game = null;
        gameInitialized = false;
    }
    
    socket.emit('quit');
    
    // Reset form states
    const createForm = document.getElementById('createForm');
    const joinForm = document.getElementById('joinForm');
    const startGameButton = document.getElementById('startGameButton');
    const joinGameButton = document.getElementById('joinGameButton');
    
    if (createForm) createForm.style.display = 'none';
    if (joinForm) joinForm.style.display = 'none';
    if (startGameButton) {
        startGameButton.disabled = false;
        startGameButton.textContent = 'Start Game';
    }
    if (joinGameButton) {
        joinGameButton.disabled = false;
        joinGameButton.textContent = 'Join Game';
    }
}

debugLog('Game script loaded successfully');
