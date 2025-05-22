// Get room ID from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

if (!roomId) {
    // Redirect to home page if no room ID
    window.location.href = '/';
}

// Responsive game setup
let gameWidth = 640;
let gameHeight = 480;
let gameActive = false;
let rematchRequestInProgress = false;
let playerId = null;
let gameState = { players: {} };
let currentDirection = null;
let socket = null;
let game = null;
let touchControlActive = false;
let controlState = {
    up: false,
    down: false,
    left: false,
    right: false
};

// Debug flag
const DEBUG = true;

function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

// Initialize the game after the document has loaded
document.addEventListener('DOMContentLoaded', function() {
    debugLog("Document loaded, initializing game");
    initializeGame();
    setupResponsiveListeners();
    enhanceControlButtons();
});

function initializeGame() {
    try {
        // Initialize socket connection - connect to the same domain
        debugLog("Initializing socket connection...");
        socket = io();
        
        // Add error handling for Socket.io
        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
        });
        
        socket.on('disconnect', (reason) => {
            console.warn('Socket disconnected:', reason);
        });
        
        // Set up Phaser game configuration
        const config = {
            type: Phaser.AUTO,
            width: gameWidth,
            height: gameHeight,
            parent: 'phaser-container',
            scene: [ SnakeScene ],
            physics: {
                default: 'arcade',
                arcade: {
                    debug: false
                }
            },
            scale: {
                mode: Phaser.Scale.RESIZE,
                autoCenter: Phaser.Scale.CENTER_BOTH
            },
            backgroundColor: 0x252525 // Brighter game background
        };
        
        debugLog("Creating Phaser game instance...");
        // Create the game
        game = new Phaser.Game(config);
        
        // Set up socket event handlers
        setupSocketEvents();
        
        // Add debug info
        debugLog("Game initialization complete");
    } catch (error) {
        console.error("Error initializing game:", error);
    }
}

function setupSocketEvents() {
    socket.on('connect', () => {
        debugLog('Connected to server with ID:', socket.id);

        // Initialize game with room ID
        socket.emit('initializeGame', { roomId: roomId });
    });
    
    // Initial game state from server
    socket.on('initialize', (data) => {
        debugLog('Game initialized:', data);
        playerId = data.playerId;
        gameState = data.gameState;
        
        // Ensure players have consistent colors
        if (gameState && gameState.players) {
            Object.entries(gameState.players).forEach(([id, player], index) => {
                // First player (index 0) is always red, second player is always blue
                player.color = index === 0 ? 'red' : 'blue';
            });
        }
        
        updateUI(gameState);
        
        // Force an initial game scene update
        const scene = game.scene.getScene('SnakeScene');
        if (scene) {
            scene.updateGame();
        }
    });
    
    // Regular game state updates
    socket.on('update', (state) => {
        // Only log less frequently to avoid console spam
        if (Math.random() < 0.05) debugLog('Game state updated');
        
        gameState = state;
        
        // Ensure players have consistent colors on every update
        if (gameState && gameState.players) {
            Object.entries(gameState.players).forEach(([id, player], index) => {
                // First player (index 0) is always red, second player is always blue
                player.color = index === 0 ? 'red' : 'blue';
            });
        }
        
        // Check if game is active
        gameActive = state.isActive;
        
        // Update UI
        updateUI(state);
        
        // Hide waiting message when game is active
        const waitingMessage = document.getElementById('waitingMessage');
        if (waitingMessage) {
            waitingMessage.style.display = gameActive ? 'none' : 'block';
        }
        
        // Update the game scene
        const scene = game.scene.getScene('SnakeScene');
        if (scene) {
            scene.gameActive = gameActive;
            scene.updateGame();
        }
    });
    
    socket.on('gameStarted', () => {
        debugLog('Game started!');
        const waitingMessage = document.getElementById('waitingMessage');
        if (waitingMessage) {
            waitingMessage.style.display = 'none';
        }
        gameActive = true;
        
        // Update the game scene
        const scene = game.scene.getScene('SnakeScene');
        if (scene) {
            scene.gameActive = true;
        }
    });
    
    socket.on('gameOver', (data) => {
        debugLog('Game over:', data);
        handleGameOver(data);
    });
    
    socket.on('rematchRequested', (data) => {
        handleRematchRequested(data);
    });
    
    socket.on('rematchRequestSent', () => {
        handleRematchRequestSent();
    });
    
    socket.on('rematchAccepted', () => {
        handleRematchAccepted();
    });
    
    socket.on('rematchDeclined', () => {
        handleRematchDeclined();
    });
    
    socket.on('rematchFailed', (data) => {
        handleRematchFailed(data);
    });
    
    socket.on('gameRestarted', (data) => {
        debugLog('Game restarted:', data);
        gameState = data.gameState;
        
        // Ensure players have consistent colors on game restart
        if (gameState && gameState.players) {
            Object.entries(gameState.players).forEach(([id, player], index) => {
                // First player (index 0) is always red, second player is always blue
                player.color = index === 0 ? 'red' : 'blue';
            });
        }
        
        updateUI(gameState);
        
        // Important: Keep drawing the game while showing/hiding popups
        // This ensures the game stays visible and bright during transitions
        const scene = game.scene.getScene('SnakeScene');
        if (scene) {
            scene.updateGame();
        }
        
        hideGameResult();
        hideRematchPopups();
    });
    
    socket.on('playerJoined', (data) => {
        debugLog('Player joined:', data);
        // Force UI update
        updateUI(gameState);
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
    
    socket.on('gameQuit', () => {
        debugLog('Game was quit');
        gameActive = false;
        const waitingMessage = document.getElementById('waitingMessage');
        if (waitingMessage) {
            waitingMessage.style.display = 'block';
        }
        hideGameResult();
        hideRematchPopups();
        
        // Continue rendering the game even when it's quit
        const scene = game.scene.getScene('SnakeScene');
        if (scene) {
            scene.updateGame();
        }
    });
}

function setupResponsiveListeners() {
    // Adjust game on window resize
    window.addEventListener('resize', function() {
        updateGameDimensions();
    });
    
    // Handle orientation change on mobile devices
    window.addEventListener('orientationchange', function() {
        // Wait for orientation change to complete
        setTimeout(function() {
            updateGameDimensions();
        }, 200);
    });
    
    // Initial update
    updateGameDimensions();
    
    // Set up keyboard controls
    window.addEventListener('keydown', function(e) {
        if (gameActive) {
            handleKeyInput(e);
        }
    });
}

function handleKeyInput(e) {
    if (!gameActive) return;
    
    let direction = null;
    
    // Arrow keys
    if (e.key === 'ArrowUp') {
        direction = 'UP';
    } else if (e.key === 'ArrowDown') {
        direction = 'DOWN';
    } else if (e.key === 'ArrowLeft') {
        direction = 'LEFT';
    } else if (e.key === 'ArrowRight') {
        direction = 'RIGHT';
    }
    
    // WASD keys (as alternatives)
    if (e.key === 'w' || e.key === 'W') {
        direction = 'UP';
    } else if (e.key === 's' || e.key === 'S') {
        direction = 'DOWN';
    } else if (e.key === 'a' || e.key === 'A') {
        direction = 'LEFT';
    } else if (e.key === 'd' || e.key === 'D') {
        direction = 'RIGHT';
    }
    
    if (direction) {
        // Send direction to server
        socket.emit('move', { direction: direction });
        currentDirection = direction;
    }
}

// Helper functions for rematch UI with consistent brightness
function showRematchPopup() {
    const gameOverlay = document.getElementById('gameOverlay');
    const rematchPopup = document.getElementById('rematchPopup');
    if (gameOverlay) gameOverlay.style.display = 'block';
    if (rematchPopup) rematchPopup.style.display = 'block';
    
    // Continue rendering the game even with popup visible
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

function hideRematchPopup() {
    const rematchPopup = document.getElementById('rematchPopup');
    if (rematchPopup) rematchPopup.style.display = 'none';
}

function showRematchStatus(message, title = "Waiting for response...") {
    const gameOverlay = document.getElementById('gameOverlay');
    const rematchStatus = document.getElementById('rematchStatus');
    const rematchStatusTitle = document.getElementById('rematchStatusTitle');
    const rematchStatusMessage = document.getElementById('rematchStatusMessage');
    
    if (gameOverlay) gameOverlay.style.display = 'block';
    if (rematchStatus) rematchStatus.style.display = 'block';
    if (rematchStatusTitle) rematchStatusTitle.textContent = title;
    if (rematchStatusMessage) rematchStatusMessage.textContent = message;
    
    // Continue rendering the game even with status visible
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

function hideRematchStatus() {
    const rematchStatus = document.getElementById('rematchStatus');
    if (rematchStatus) rematchStatus.style.display = 'none';
}

function hideRematchPopups() {
    hideRematchPopup();
    hideRematchStatus();
    
    // Only hide overlay if no other popups are visible
    const resultPopup = document.getElementById('resultPopup');
    const gameOverlay = document.getElementById('gameOverlay');
    if (resultPopup && resultPopup.style.display !== 'block' && gameOverlay) {
        gameOverlay.style.display = 'none';
    }
    
    // Continue rendering the game even after hiding popups
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

// Handle rematch request from opponent
function handleRematchRequested(data) {
    debugLog('Rematch requested by opponent');
    hideGameResult();
    showRematchPopup();
    
    // Continue rendering the game even with popup visible
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

// Handle confirmation that our rematch request was sent
function handleRematchRequestSent() {
    debugLog('Rematch request sent');
    hideGameResult();
    showRematchStatus('Waiting for your opponent to respond...');
    rematchRequestInProgress = true;
    
    // Continue rendering the game even with status visible
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

// Handle opponent accepting our rematch request
function handleRematchAccepted() {
    debugLog('Rematch accepted by opponent');
    hideRematchPopups();
    rematchRequestInProgress = false;
    
    // Continue rendering the game after acceptance
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

// Handle opponent declining our rematch request
function handleRematchDeclined() {
    debugLog('Rematch declined by opponent');
    rematchRequestInProgress = false;
    hideRematchStatus();
    showRematchStatus('Your opponent declined the rematch.', 'Rematch Declined');
    
    // Continue rendering the game even with status visible
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
    
    // Automatically hide after a few seconds
    setTimeout(() => {
        hideRematchPopups();
        const gameOverlay = document.getElementById('gameOverlay');
        const waitingMessage = document.getElementById('waitingMessage');
        if (gameOverlay) gameOverlay.style.display = 'none';
        if (waitingMessage) waitingMessage.style.display = 'block';
        
        // Continue rendering the game after hiding popups
        const scene = game.scene.getScene('SnakeScene');
        if (scene) {
            scene.updateGame();
        }
    }, 3000);
}

// Handle rematch request failure
function handleRematchFailed(data) {
    debugLog('Rematch failed:', data);
    rematchRequestInProgress = false;
    hideRematchStatus();
    showRematchStatus(`Rematch failed: ${data.reason}`, 'Rematch Failed');
    
    // Continue rendering the game even with status visible
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
    
    // Automatically hide after a few seconds
    setTimeout(() => {
        hideRematchPopups();
        const gameOverlay = document.getElementById('gameOverlay');
        if (gameOverlay) gameOverlay.style.display = 'none';
        
        // Continue rendering the game after hiding popups
        const scene = game.scene.getScene('SnakeScene');
        if (scene) {
            scene.updateGame();
        }
    }, 3000);
}

// Handle rematch button click
function handleRematch() {
    if (rematchRequestInProgress) {
        return; // Prevent multiple requests
    }
    
    debugLog('Requesting rematch');
    socket.emit('requestRematch');
    hideGameResult();
    
    // Continue rendering the game after requesting rematch
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

// Accept rematch
function acceptRematch() {
    debugLog('Accepting rematch');
    socket.emit('acceptRematch');
    hideRematchPopup();
    
    // Continue rendering the game after accepting rematch
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

// Decline rematch
function declineRematch() {
    debugLog('Declining rematch');
    socket.emit('declineRematch');
    hideRematchPopup();
    const gameOverlay = document.getElementById('gameOverlay');
    const waitingMessage = document.getElementById('waitingMessage');
    if (gameOverlay) gameOverlay.style.display = 'none';
    if (waitingMessage) waitingMessage.style.display = 'block';
    
    // Continue rendering the game after declining rematch
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

// Handle quit button click
function handleQuit() {
    debugLog('Quitting game');
    socket.emit('quit');
    hideGameResult();
    const waitingMessage = document.getElementById('waitingMessage');
    if (waitingMessage) waitingMessage.style.display = 'block';
    
    // Continue rendering the game after quitting
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

// Function to show game result popup with consistent brightness
function showGameResult(title, isCollision, finalScores) {
    gameActive = false;
    
    // Set the title
    const resultTitle = document.getElementById('resultTitle');
    if (resultTitle) resultTitle.textContent = title;
    
    // Update scores
    let yourScore = 0;
    let opponentScore = 0;
    
    if (finalScores) {
        // Use the provided final scores
        Object.entries(finalScores).forEach(([id, score]) => {
            if (id === playerId) {
                yourScore = score;
            } else {
                opponentScore = score;
            }
        });
    } else if (gameState.players) {
        // Get scores from current game state
        Object.entries(gameState.players).forEach(([id, player]) => {
            if (id === playerId) {
                yourScore = player.score;
            } else {
                opponentScore = player.score;
            }
        });
    }
    
    const yourScoreElement = document.getElementById('yourScore');
    const opponentScoreElement = document.getElementById('opponentScore');
    if (yourScoreElement) yourScoreElement.textContent = yourScore;
    if (opponentScoreElement) opponentScoreElement.textContent = opponentScore;
    
    // Show the popup and overlay
    const gameOverlay = document.getElementById('gameOverlay');
    const resultPopup = document.getElementById('resultPopup');
    if (gameOverlay) gameOverlay.style.display = 'block';
    if (resultPopup) resultPopup.style.display = 'block';
    
    // Continue rendering the game even with popup visible
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

// Function to handle game over from server
function handleGameOver(data) {
    gameActive = false;
    
    let title = "Game Over!";
    if (!data.isTie) {
        title = data.winnerId === playerId ? "Game Over! You Win!" : "Game Over! Opponent Wins!";
    }
    
    showGameResult(title, false, data.finalScores);
    
    // Continue rendering the game even after game over
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

function hideGameResult() {
    const resultPopup = document.getElementById('resultPopup');
    if (resultPopup) resultPopup.style.display = 'none';
    
    // Only hide overlay if no other popups are visible
    const rematchPopup = document.getElementById('rematchPopup');
    const rematchStatus = document.getElementById('rematchStatus');
    const gameOverlay = document.getElementById('gameOverlay');
    
    if (rematchPopup && rematchStatus && gameOverlay &&
        rematchPopup.style.display !== 'block' && 
        rematchStatus.style.display !== 'block') {
        gameOverlay.style.display = 'none';
    }
    
    // Continue rendering the game after hiding result
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

function updateUI(gameState) {
    const profileLeft = document.getElementById('profileLeft');
    const profileRight = document.getElementById('profileRight');
    
    if (!profileLeft || !profileRight) return;
    
    // Reset displays first
    profileLeft.innerHTML = 'Waiting for Player 1';
    profileRight.innerHTML = 'Waiting for Player 2';
    
    // Check if we have valid players data
    if (gameState && gameState.players) {
        const players = Object.entries(gameState.players);
        
        if (players.length > 0) {
            const [id1, player1] = players[0];
            profileLeft.innerHTML = `Player 1: ${player1.score}`;
            profileLeft.style.color = '#ff5555'; // Brighter red text
            // Ensure player1 has the red color property
            player1.color = 'red';
        }
        
        if (players.length > 1) {
            const [id2, player2] = players[1];
            profileRight.innerHTML = `Player 2: ${player2.score}`;
            profileRight.style.color = '#5555ff'; // Brighter blue text
            // Ensure player2 has the blue color property
            player2.color = 'blue';
        }
    }

    // Update waiting message
    const waitingMessage = document.getElementById('waitingMessage');
    if (waitingMessage && gameState && gameState.players) {
        waitingMessage.style.display = Object.keys(gameState.players).length < 2 ? 'block' : 'none';
    } else if (waitingMessage) {
        waitingMessage.style.display = 'block';
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
    
    // Continue rendering the game after UI update
    const scene = game.scene.getScene('SnakeScene');
    if (scene) {
        scene.updateGame();
    }
}

function updateMainTimer(time) {
    const mainTimer = document.getElementById('mainTimer');
    if (!mainTimer) return;
    
    mainTimer.textContent = `Time: ${time}`;
    
    if (time <= 10) {
        mainTimer.classList.add('timer-warning');
        if (!mainTimer.classList.contains('shake')) {
            mainTimer.classList.add('shake');
            setTimeout(() => mainTimer.classList.remove('shake'), 500);
        }
    } else {
        mainTimer.classList.remove('timer-warning');
        mainTimer.classList.remove('shake');
    }
}

function updateFoodTimer(time) {
    const foodTimer = document.getElementById('foodTimer');
    if (!foodTimer) return;
    
    foodTimer.textContent = `Food: ${time}`;
    
    if (time <= 5) {
        foodTimer.classList.add('timer-warning');
        if (!foodTimer.classList.contains('shake')) {
            foodTimer.classList.add('shake');
            setTimeout(() => foodTimer.classList.remove('shake'), 500);
        }
    } else {
        foodTimer.classList.remove('timer-warning');
        foodTimer.classList.remove('shake');
    }
}

// Function to update game dimensions based on container size
function updateGameDimensions() {
    const container = document.getElementById('phaser-container');
    if (!container) return;
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    if (game && game.scale) {
        // Update Phaser game size
        game.scale.resize(containerWidth, containerHeight);
        
        // Force canvas to use the container's dimensions
        const canvas = container.querySelector('canvas');
        if (canvas) {
            canvas.style.width = '100%';
            canvas.style.height = '100%';
        }
        
        // Update game variables to maintain grid alignment
        const scene = game.scene.getScene('SnakeScene');
        if (scene) {
            scene.updateGameDimensions(containerWidth, containerHeight);
        }
    }
}

// COMPLETELY REWRITTEN to ensure controls never change size or position 
function enhanceControlButtons() {
    // Get all control buttons
    const buttons = document.querySelectorAll('.control-btn');
    
    // Remove any existing event listeners
    buttons.forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
    });
    
    // Re-get fresh button references
    const upButton = document.getElementById('upButton');
    const downButton = document.getElementById('downButton');
    const leftButton = document.getElementById('leftButton');
    const rightButton = document.getElementById('rightButton');
    
    if (!upButton || !downButton || !leftButton || !rightButton) {
        debugLog("Warning: Some control buttons not found");
        return;
    }
    
    const controlButtons = [upButton, downButton, leftButton, rightButton];
    
    // Visual feedback functions
    function pressEffect(button) {
        button.classList.add('active');
    }
    
    function releaseEffect(button) {
        button.classList.remove('active');
    }
    
    // Direction change function
    function changeDirection(direction) {
        if (!gameActive) return;
        
        // Send direction change to server
        socket.emit('move', { direction: direction });
        currentDirection = direction;
    }
    
    // Add mouse events
    controlButtons.forEach(btn => {
        const direction = btn.dataset.direction;
        
        btn.addEventListener('mousedown', function(e) {
            e.preventDefault();
            pressEffect(btn);
            changeDirection(direction);
        });
        
        btn.addEventListener('mouseup', function() {
            releaseEffect(btn);
        });
        
        btn.addEventListener('mouseleave', function() {
            releaseEffect(btn);
        });
    });
    
    // Add touch events with fixed behavior
    controlButtons.forEach(btn => {
        const direction = btn.dataset.direction;
        
        // Touch start
        btn.addEventListener('touchstart', function(e) {
            e.preventDefault();
            pressEffect(btn);
            changeDirection(direction);
            touchControlActive = true;
        }, { passive: false });
        
        // Touch end
        btn.addEventListener('touchend', function(e) {
            e.preventDefault();
            releaseEffect(btn);
            touchControlActive = false;
        }, { passive: false });
        
        // Touch cancel
        btn.addEventListener('touchcancel', function(e) {
            e.preventDefault();
            releaseEffect(btn);
            touchControlActive = false;
        }, { passive: false });
    });
    
    // Handle touch moves in a way that doesn't move controls
    document.addEventListener('touchmove', function(e) {
        if (!gameActive) return;
        
        // Prevent scrolling behavior
        e.preventDefault();
        
        if (!touchControlActive) return;
        
        const touch = e.touches[0];
        
        // Check which button the touch is over without moving them
        for (let btn of controlButtons) {
            const rect = btn.getBoundingClientRect();
            
            // If touch is within this button
            if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
                touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                
                // Only change if not already active
                if (!btn.classList.contains('active')) {
                    // Reset all buttons
                    controlButtons.forEach(b => releaseEffect(b));
                    
                    // Activate this button
                    pressEffect(btn);
                    
                    // Send direction
                    changeDirection(btn.dataset.direction);
                }
                break;
            }
        }
    }, { passive: false });
    
    debugLog("Control buttons initialized with fixed 60px size");
}

// Snake Scene Class with consistent brightness
class SnakeScene extends Phaser.Scene {
    constructor() {
        super({ key: 'SnakeScene' });
        this.gridSize = 16;
        this.lastDirection = null;
        this.gameActive = false;
        this.scaleFactor = 1;
        this.grid = null;
        this.playerColor = null;
        this.isDrawingEnabled = true; // Always draw the game
    }

    create() {
        this.drawGrid();
        
        // Create graphics objects for snake and food
        this.snakeGraphics = this.add.graphics();
        this.foodGraphics = this.add.graphics();
        
        // Initial update of dimensions
        this.updateGameDimensions(this.game.scale.width, this.game.scale.height);
        
        // Set up a continuous render loop to maintain visibility
        this.events.on('update', this.continuousRender, this);
    }
    
    // Ensure the game is continuously rendered
    continuousRender() {
        if (this.isDrawingEnabled) {
            this.updateGame();
        }
    }
    
    updateGameDimensions(width, height) {
        // Calculate the scale factor to maintain grid alignment
        this.scaleFactor = Math.min(width / gameWidth, height / gameHeight);
        this.gridSize = 16 * this.scaleFactor;
        
        // Redraw grid with new dimensions
        this.drawGrid();
        
        // Redraw elements with new scale
        this.updateGame();
    }
    
    drawGrid() {
        // Clear any existing grid
        if (this.grid) {
            this.grid.clear();
        } else {
            this.grid = this.add.graphics();
        }
        
        // Draw grid lines with brighter color
        this.grid.lineStyle(1, 0x444444, 0.4); // Brighter grid lines
        
        // Calculate number of grid cells
        const cols = Math.ceil(this.game.scale.width / this.gridSize);
        const rows = Math.ceil(this.game.scale.height / this.gridSize);
        
        // Draw vertical lines
        for (let i = 0; i <= cols; i++) {
            this.grid.moveTo(i * this.gridSize, 0);
            this.grid.lineTo(i * this.gridSize, rows * this.gridSize);
        }
        
        // Draw horizontal lines
        for (let i = 0; i <= rows; i++) {
            this.grid.moveTo(0, i * this.gridSize);
            this.grid.lineTo(cols * this.gridSize, i * this.gridSize);
        }
        
        this.grid.strokePath();
    }
    
    updateGame() {
        // Clear previous graphics
        this.snakeGraphics.clear();
        this.foodGraphics.clear();
        
        if (!gameState || !gameState.players) {
            debugLog("No valid game state available to render");
            return;
        }
        
        // Draw each player's snake
        const players = Object.entries(gameState.players);
        players.forEach(([id, player], index) => {
            if (!player.snake || player.snake.length === 0) {
                return;
            }
            
            // Set color based on player index - brighter colors
            const color = index === 0 ? 0xff3333 : 0x3333ff; // Brighter red and blue
            
            // Ensure the player color is set properly in the player object
            player.color = index === 0 ? 'red' : 'blue';
            
            // Draw snake body segments
            this.snakeGraphics.fillStyle(color, 0.8); // Brighter snake body
            
            // Draw each segment of the snake
            player.snake.forEach((segment, i) => {
                // Head has a different style
                if (i === 0) {
                    this.snakeGraphics.fillStyle(color, 1);
                    // Draw slightly larger head
                    this.snakeGraphics.fillRect(
                        segment.x * this.gridSize - 1, 
                        segment.y * this.gridSize - 1, 
                        this.gridSize + 2, 
                        this.gridSize + 2
                    );
                    
                    // Add glow effect to head
                    this.snakeGraphics.fillStyle(color, 0.3);
                    this.snakeGraphics.fillRect(
                        segment.x * this.gridSize - 3,
                        segment.y * this.gridSize - 3,
                        this.gridSize + 6,
                        this.gridSize + 6
                    );
                    
                    // Draw eyes
                    this.snakeGraphics.fillStyle(0xffffff, 1);
                    
                    // Position eyes based on direction
                    const eyeSize = this.gridSize / 5;
                    let eyeOffset1X = 0, eyeOffset1Y = 0;
                    let eyeOffset2X = 0, eyeOffset2Y = 0;
                    
                    if (player.direction === 'UP') {
                        eyeOffset1X = -this.gridSize / 4;
                        eyeOffset1Y = -this.gridSize / 4;
                        eyeOffset2X = this.gridSize / 4;
                        eyeOffset2Y = -this.gridSize / 4;
                    } else if (player.direction === 'DOWN') {
                        eyeOffset1X = -this.gridSize / 4;
                        eyeOffset1Y = this.gridSize / 4;
                        eyeOffset2X = this.gridSize / 4;
                        eyeOffset2Y = this.gridSize / 4;
                    } else if (player.direction === 'LEFT') {
                        eyeOffset1X = -this.gridSize / 4;
                        eyeOffset1Y = -this.gridSize / 4;
                        eyeOffset2X = -this.gridSize / 4;
                        eyeOffset2Y = this.gridSize / 4;
                    } else if (player.direction === 'RIGHT') {
                        eyeOffset1X = this.gridSize / 4;
                        eyeOffset1Y = -this.gridSize / 4;
                        eyeOffset2X = this.gridSize / 4;
                        eyeOffset2Y = this.gridSize / 4;
                    }
                    
                    // Draw both eyes
                    this.snakeGraphics.fillCircle(
                        segment.x * this.gridSize + this.gridSize / 2 + eyeOffset1X,
                        segment.y * this.gridSize + this.gridSize / 2 + eyeOffset1Y,
                        eyeSize
                    );
                    
                    this.snakeGraphics.fillCircle(
                        segment.x * this.gridSize + this.gridSize / 2 + eyeOffset2X,
                        segment.y * this.gridSize + this.gridSize / 2 + eyeOffset2Y,
                        eyeSize
                    );
                    
                    // Reset fill style for body
                    this.snakeGraphics.fillStyle(color, 0.8);
                } else {
                    // Draw body segment with glow effect
                    this.snakeGraphics.fillRect(
                        segment.x * this.gridSize + 1, 
                        segment.y * this.gridSize + 1, 
                        this.gridSize - 2, 
                        this.gridSize - 2
                    );
                    
                    // Add a subtle glow to body segments
                    this.snakeGraphics.fillStyle(color, 0.3);
                    this.snakeGraphics.fillRect(
                        segment.x * this.gridSize, 
                        segment.y * this.gridSize, 
                        this.gridSize, 
                        this.gridSize
                    );
                    
                    // Reset fill style
                    this.snakeGraphics.fillStyle(color, 0.8);
                }
            });
        });
        
        // Draw food - IMPORTANT: food is a single object, not an array
        if (gameState.food) {
            this.foodGraphics.fillStyle(0xffff00, 0.9); // Brighter Yellow
            
            // Calculate pulsing effect based on time
            const pulseSize = 0.2 * Math.sin(this.time.now / 200); // Enhanced pulse
            const size = this.gridSize * (0.8 + pulseSize);
            
            // Draw food item
            this.foodGraphics.fillCircle(
                gameState.food.x * this.gridSize + this.gridSize / 2,
                gameState.food.y * this.gridSize + this.gridSize / 2,
                size / 2
            );
            
            // Add enhanced glow effect
            this.foodGraphics.fillStyle(0xffff00, 0.4); // Stronger glow
            this.foodGraphics.fillCircle(
                gameState.food.x * this.gridSize + this.gridSize / 2,
                gameState.food.y * this.gridSize + this.gridSize / 2,
                size * 0.9
            );
            
            // Add outer glow for more brightness
            this.foodGraphics.fillStyle(0xffff00, 0.2);
            this.foodGraphics.fillCircle(
                gameState.food.x * this.gridSize + this.gridSize / 2,
                gameState.food.y * this.gridSize + this.gridSize / 2,
                size * 1.2
            );
        }
    }
}