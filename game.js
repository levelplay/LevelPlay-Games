// game.js - Enhanced client-side game logic for multiplayer Stack Game

// Game variables
let socket;
let clientId = "";
let roomId = "";
let isHost = false;
let playerIndex = -1;
let gameStarted = false;
let lastPerfectStack = false;

// DOM Elements - Wrap all in safe accessor functions to avoid null errors
const getElement = (id) => document.getElementById(id);

// Initialize DOM elements safely - will be populated during init()
let joinForm, createGame, joinGame, toggleJoin, waitingRoom, roomDisplay;
let playerStatus, startButton, gameContainer, canvas, messagesDiv, resetButton;
let copyButton, scoreDisplay, player1ScoreEl, player2ScoreEl;
let player1Indicator, player2Indicator, turnIndicator, placementHelper, perfectStackEffect;
let gameOverModal, winnerText, rematchButton, quitButton;
let rematchRequestModal, acceptRematchButton, declineRematchButton, waitingModal;
let connectionStatus, statusText;

// Game context - will be initialized when canvas is available
let ctx;

let camera = {
    y: 0,
    targetY: 0
};

let movingBlock = {
    x: 400, // Will be updated to canvas width when available
    y: 500,
    width: 200,
    height: 40,
    direction: 1,
    speed: 8
};

let stackedBlocks = [{
    x: 400, // Will be updated to canvas width when available
    y: 540,
    width: 200,
    height: 40,
    color: '#00ff00'
}];

const players = [
    { name: "Player 1", score: 0, color: "#3498db", connected: false },
    { name: "Player 2", score: 0, color: "#e74c3c", connected: false }
];

let currentPlayer = 0; // Index of the current player
let gameOver = false;
let roundWinner = null;
let rematchRequested = false;
let rematchTimeoutId = null;
let placementHelperTimeout = null;
let connectionCheckInterval = null;
let yourTurn = false;

// Sound effects (use with playSound function)
const sounds = {
    place: new Audio('https://cdn.freesound.org/sounds/preview/661/661163_5674468-lq.ogg'),
    win: new Audio('https://cdn.freesound.org/sounds/preview/221/221683_4056007-lq.ogg'), 
    perfect: new Audio('https://cdn.freesound.org/sounds/preview/488/488532_10353989-lq.ogg'),
    gameOver: new Audio('https://cdn.freesound.org/sounds/preview/403/403013_5121236-lq.ogg'),
    click: new Audio('https://cdn.freesound.org/sounds/preview/242/242501_4408314-lq.ogg'),
    notify: new Audio('https://cdn.freesound.org/sounds/preview/536/536104_11861866-lq.ogg')
};

// Initialize UI elements - call this after DOM is loaded
function initializeUIElements() {
    joinForm = getElement('joinForm');
    createGame = getElement('createGame');
    joinGame = getElement('joinGame');
    toggleJoin = getElement('toggleJoin');
    waitingRoom = getElement('waitingRoom');
    roomDisplay = getElement('roomDisplay');
    playerStatus = getElement('playerStatus');
    startButton = getElement('startButton');
    gameContainer = getElement('gameContainer');
    canvas = getElement('gameCanvas');
    messagesDiv = getElement('messages');
    resetButton = getElement('resetButton');
    copyButton = getElement('copyButton');
    scoreDisplay = getElement('scoreDisplay');
    player1ScoreEl = getElement('player1Score');
    player2ScoreEl = getElement('player2Score');
    player1Indicator = getElement('player1Indicator');
    player2Indicator = getElement('player2Indicator');
    turnIndicator = getElement('turnIndicator');
    placementHelper = getElement('placementHelper');
    perfectStackEffect = getElement('perfectStackEffect');
    gameOverModal = getElement('gameOverModal');
    winnerText = getElement('winnerText');
    rematchButton = getElement('rematchButton');
    quitButton = getElement('quitButton');
    rematchRequestModal = getElement('rematchRequestModal');
    acceptRematchButton = getElement('acceptRematchButton');
    declineRematchButton = getElement('declineRematchButton');
    waitingModal = getElement('waitingModal');
    connectionStatus = getElement('connectionStatus');
    statusText = getElement('statusText');
    
    // Initialize canvas context if canvas exists
    if (canvas) {
        ctx = canvas.getContext('2d', { alpha: false });
        
        // Update initial block positions based on canvas width
        const centerX = canvas.width / 2;
        movingBlock.x = centerX;
        stackedBlocks[0].x = centerX;
    }
}

// UI sound feedback
function playSound(soundName, volume = 0.5) {
    try {
        const sound = sounds[soundName];
        if (sound) {
            sound.volume = volume;
            sound.currentTime = 0;
            sound.play().catch(e => {});
        }
    } catch (e) {
        // Silent error handling
    }
}

// Toggle between create and join game forms
function setupToggleJoin() {
    if (!toggleJoin) return;
    
    // Remove any existing event listeners to prevent duplicates
    const clonedButton = toggleJoin.cloneNode(true);
    if (toggleJoin.parentNode) {
        toggleJoin.parentNode.replaceChild(clonedButton, toggleJoin);
        toggleJoin = clonedButton;
    }
    
    toggleJoin.addEventListener('click', function(event) {
        event.preventDefault(); // Prevent default behavior
        playSound('click');
        
        if (createGame && joinGame) {
            if (createGame.classList.contains('hidden')) {
                createGame.classList.remove('hidden');
                joinGame.classList.add('hidden');
                toggleJoin.innerHTML = '<i class="fas fa-users"></i> Join Existing Game';
                toggleJoin.classList.remove('danger');
                toggleJoin.classList.add('secondary');
            } else {
                createGame.classList.add('hidden');
                joinGame.classList.remove('hidden');
                toggleJoin.innerHTML = '<i class="fas fa-plus-circle"></i> Create New Game';
                toggleJoin.classList.remove('secondary');
                toggleJoin.classList.add('danger');
            }
        }
    });
}

// Copy room ID to clipboard
function setupCopyButton() {
    if (!copyButton || !roomDisplay) return;
    
    copyButton.addEventListener('click', () => {
        const roomIdText = roomDisplay.textContent;
        navigator.clipboard.writeText(roomIdText)
            .then(() => {
                playSound('click');
                copyButton.innerHTML = '<i class="fas fa-check"></i> Copied!';
                copyButton.classList.add('copied');
                setTimeout(() => {
                    copyButton.innerHTML = '<i class="fas fa-copy"></i> Copy';
                    copyButton.classList.remove('copied');
                }, 2000);
            })
            .catch(() => {
                // Silent error handling
            });
    });
}

// Set up WebSocket connection
function setupSocket() {
    // Connect to WebSocket server
    // Use secure WebSocket if the page is served over HTTPS
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    addMessage("Connecting to server...", "info");
    socket = new WebSocket(wsUrl);
    
    socket.onopen = function() {
        updateConnectionStatus(true);
        addMessage("Connected to server", "success");
        playSound('notify');
    };
    
    socket.onmessage = function(event) {
        try {
            const message = JSON.parse(event.data);
            handleMessage(message);
        } catch (error) {
            addMessage("Error processing message", "error");
        }
    };
    
    socket.onerror = function() {
        updateConnectionStatus(false);
        addMessage("WebSocket error", "error");
    };
    
    socket.onclose = function() {
        updateConnectionStatus(false);
        addMessage("Disconnected from server", "warning");
    };
    
    // Set up periodic connection check
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    
    connectionCheckInterval = setInterval(() => {
        if (socket) {
            const isConnected = socket.readyState === WebSocket.OPEN;
            updateConnectionStatus(isConnected);
            
            // If closed, try to reconnect
            if (socket.readyState === WebSocket.CLOSED && gameStarted) {
                addMessage("Connection lost. Attempting to reconnect...", "warning");
                setupSocket();
            }
        }
    }, 5000); // Check every 5 seconds
}

// Update connection status indicator
function updateConnectionStatus(connected) {
    if (!connectionStatus) return;
    
    if (connected) {
        connectionStatus.className = "connection-status status-connected";
        if (statusText) statusText.textContent = "Connected";
    } else {
        connectionStatus.className = "connection-status status-disconnected";
        if (statusText) statusText.textContent = "Disconnected";
    }
}

// Handle messages from the server
function handleMessage(message) {
    switch(message.type) {
        case 'created':
            handleRoomCreated(message);
            break;
        case 'joined':
            handleRoomJoined(message);
            break;
        case 'playerJoined':
            handlePlayerJoined(message);
            break;
        case 'playerLeft':
            handlePlayerLeft(message);
            break;
        case 'gameStarted':
            handleGameStarted(message);
            break;
        case 'gameStateUpdated':
            handleGameStateUpdated(message);
            break;
        case 'gameReset':
            handleGameReset(message);
            break;
        case 'rematchRequest':
            handleRematchRequest(message);
            break;
        case 'rematchAccepted':
            handleRematchAccepted(message);
            break;
        case 'rematchDeclined':
            handleRematchDeclined(message);
            break;
        case 'playerQuit':
            handlePlayerQuit(message);
            break;
        case 'error':
            handleError(message);
            break;
    }
}

function handleRoomCreated(message) {
    roomId = message.roomId;
    clientId = message.clientId;
    playerIndex = message.playerIndex;
    isHost = true;
    
    // Update UI
    if (roomDisplay) roomDisplay.textContent = roomId;
    if (waitingRoom) waitingRoom.classList.remove('hidden');
    if (joinForm) joinForm.classList.add('hidden');
    
    // Set up player info
    players[playerIndex].name = "Player 1";
    players[playerIndex].connected = true;
    
    addMessage(`Room created with code: ${roomId}`, "success");
    addMessage("Waiting for another player to join...", "info");
    playSound('notify');
}

function handleRoomJoined(message) {
    roomId = message.roomId;
    clientId = message.clientId;
    playerIndex = message.playerIndex;
    
    // Update UI
    if (waitingRoom) waitingRoom.classList.remove('hidden');
    if (joinForm) joinForm.classList.add('hidden');
    if (roomDisplay) roomDisplay.textContent = roomId;
    
    // Set up player info
    players[playerIndex].name = "Player 2";
    players[playerIndex].connected = true;
    players[0].name = "Player 1";
    players[0].connected = true;
    
    addMessage(`Joined room with code: ${roomId}`, "success");
    if (playerStatus) playerStatus.textContent = "Connected to host! Waiting for game to start...";
    playSound('notify');
}

function handlePlayerJoined(message) {
    if (isHost) {
        players[1].name = "Player 2";
        players[1].connected = true;
        
        if (playerStatus) playerStatus.textContent = "Player 2 has joined! Click Start when ready.";
        if (startButton) startButton.classList.remove('hidden');
        
        addMessage("Player 2 joined the game", "info");
        playSound('notify');
    }
}

function handlePlayerLeft(message) {
    const leftPlayerIndex = message.playerIndex;
    
    if (leftPlayerIndex !== undefined) {
        players[leftPlayerIndex].connected = false;
        addMessage(`${players[leftPlayerIndex].name} left the game`, "warning");
        playSound('gameOver');
        
        if (gameStarted) {
            gameOver = true;
            roundWinner = players[playerIndex].name;
            showGameOverModal();
        } else if (isHost) {
            if (playerStatus) playerStatus.textContent = "Waiting for another player to join...";
            if (startButton) startButton.classList.add('hidden');
        }
    }
}

function handleGameStarted(message) {
    // Update game state from server
    updateGameState(message.gameState);
    
    // Start the game
    startGame();
}

function handleGameStateUpdated(message) {
    // Update game state from server
    updateGameState(message.gameState);
    
    // If game is over, show the game over modal
    if (message.gameState.gameOver && gameOverModal && !gameOverModal.classList.contains('hidden')) {
        setTimeout(() => {
            showGameOverModal();
        }, 500);
    }
}

function handleGameReset(message) {
    // Update game state from server
    updateGameState(message.gameState);
    
    // Hide reset button
    if (resetButton) resetButton.classList.add('hidden');
    
    // Hide any open modals
    hideAllModals();
    
    // Ensure game container and score display are visible
    if (gameContainer) gameContainer.classList.remove('hidden');
    if (scoreDisplay) scoreDisplay.classList.remove('hidden');
    if (waitingRoom) waitingRoom.classList.add('hidden');
    
    // Reset gameOver flag
    gameOver = false;
    rematchRequested = false;
    
    // Announce new game
    addMessage(`Game reset! ${players[currentPlayer].name}'s turn`, "success");
    
    // Restart game loop if needed
    if (!gameStarted) {
        gameStarted = true;
        gameLoop();
    }
    
    // Show helper
    showPlacementHelper();
    
    // Play start sound
    playSound('notify');
}

function handleRematchRequest(message) {
    // Clear any previous timeouts
    if (rematchTimeoutId) {
        clearTimeout(rematchTimeoutId);
    }
    
    // Show rematch request modal to the receiving player
    hideAllModals();
    if (rematchRequestModal) rematchRequestModal.classList.remove('hidden');
    addMessage("Opponent has requested a rematch!", "info");
    
    // Play notification sound
    playSound('notify');
    
    // Start the countdown timer
    startCountdownTimer('rematchTimer', 30, () => {
        if (rematchRequestModal && !rematchRequestModal.classList.contains('hidden')) {
            // Auto-decline if no response after 30 seconds
            declineRematch();
        }
    });
}

function handleRematchAccepted(message) {
    // Hide waiting modal when opponent accepts rematch
    hideAllModals();
    rematchRequested = false;
    addMessage("Rematch accepted! Game is restarting...", "success");
    
    // Play sound
    playSound('notify');
}

function handleRematchDeclined(message) {
    // Handle when opponent declines rematch
    hideAllModals();
    rematchRequested = false;
    if (waitingRoom) waitingRoom.classList.remove('hidden');
    if (gameContainer) gameContainer.classList.add('hidden');
    if (scoreDisplay) scoreDisplay.classList.add('hidden');
    
    if (message.reason) {
        addMessage(`Rematch declined: ${message.reason}`, "warning");
    } else {
        addMessage("Rematch declined by opponent.", "warning");
    }
    
    // Play sound
    playSound('gameOver');
}

function handlePlayerQuit(message) {
    // Handle when opponent quits
    hideAllModals();
    rematchRequested = false;
    if (waitingRoom) waitingRoom.classList.remove('hidden');
    if (gameContainer) gameContainer.classList.add('hidden');
    if (scoreDisplay && scoreDisplay.classList.contains('hidden')) {
        scoreDisplay.classList.remove('hidden');
    }
    addMessage("Opponent has left the game.", "warning");
    
    if (isHost) {
        if (playerStatus) playerStatus.textContent = "Waiting for another player to join...";
        if (startButton) startButton.classList.add('hidden');
    }
    
    // Play sound
    playSound('gameOver');
}

function handleError(message) {
    addMessage(`Error: ${message.message}`, "error");
    alert(message.message);
    
    // Play sound
    playSound('gameOver');
}

function updateGameState(gameState) {
    if (gameState.movingBlock) {
        movingBlock = gameState.movingBlock;
    }
    
    if (gameState.stackedBlocks) {
        stackedBlocks = gameState.stackedBlocks;
    }
    
    if (gameState.players) {
        // Update player info while preserving names set during connection
        gameState.players.forEach((player, i) => {
            const prevScore = players[i].score;
            players[i].score = player.score;
            players[i].color = player.color;
            players[i].id = player.id;
            
            if (players[i].name === undefined || players[i].name === "") {
                players[i].name = i === 0 ? "Player 1" : "Player 2";
            }
            
            // If score increased and it's not initial state, play sound
            if (prevScore < player.score && prevScore > 0) {
                playSound('place');
            }
        });
        
        // Update score display
        updateScoreDisplay();
    }
    
    const prevPlayer = currentPlayer;
    currentPlayer = gameState.currentPlayer;
    
    // Check if turn changed and update UI
    if (prevPlayer !== currentPlayer) {
        updateTurnIndicator();
    }
    
    gameOver = gameState.gameOver;
    roundWinner = gameState.roundWinner;
    
    if (gameState.camera) {
        camera.targetY = gameState.camera.targetY;
    }
    
    if (gameOver && gameOverModal && !gameOverModal.classList.contains('hidden')) {
        showGameOverModal();
    }
    
    // Update player indicators
    updatePlayerIndicators();
    
    // Show placement helper if it's your turn
    showPlacementHelper();
}

// Update score display in UI
function updateScoreDisplay() {
    if (player1ScoreEl) {
        player1ScoreEl.textContent = `${players[0].name}: ${players[0].score}`;
    }
    if (player2ScoreEl) {
        player2ScoreEl.textContent = `${players[1].name}: ${players[1].score}`;
    }
}

// Update player indicators to show whose turn it is
function updatePlayerIndicators() {
    if (player1Indicator) {
        player1Indicator.className = "player-indicator" + (currentPlayer === 0 ? " active" : "");
    }
    if (player2Indicator) {
        player2Indicator.className = "player-indicator" + (currentPlayer === 1 ? " active" : "");
    }
}

// Update turn indicator
function updateTurnIndicator() {
    if (!turnIndicator) return;
    
    turnIndicator.classList.remove('hidden');
    
    // Check if it's your turn
    yourTurn = (currentPlayer === playerIndex);
    
    if (yourTurn) {
        turnIndicator.textContent = "Your turn!";
        turnIndicator.classList.add('your-turn');
    } else {
        turnIndicator.textContent = `${players[currentPlayer].name}'s turn`;
        turnIndicator.classList.remove('your-turn');
    }
}

// Show placement helper
function showPlacementHelper() {
    if (!placementHelper) return;
    
    if (placementHelperTimeout) {
        clearTimeout(placementHelperTimeout);
    }
    
    // Only show helper if it's your turn and game is active
    if (yourTurn && !gameOver) {
        placementHelper.classList.add('visible');
        
        // Hide after 3 seconds
        placementHelperTimeout = setTimeout(() => {
            placementHelper.classList.remove('visible');
        }, 3000);
    } else {
        placementHelper.classList.remove('visible');
    }
}

// Show perfect stack effect
function showPerfectStackEffect() {
    if (!perfectStackEffect) return;
    
    perfectStackEffect.classList.remove('animate');
    void perfectStackEffect.offsetWidth; // Force reflow
    perfectStackEffect.classList.add('animate');
    
    // Play perfect sound
    playSound('perfect');
}

// Send a message to the server
function sendMessage(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    } else {
        addMessage("Connection issue. Cannot send message.", "error");
        
        // Try reconnecting
        if (socket && socket.readyState === WebSocket.CLOSED) {
            setupSocket();
            
            // Try to resend the message after a brief delay
            setTimeout(() => {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify(message));
                }
            }, 1000);
        }
    }
}

// Add a message to the status panel - emptied to prevent console messages
function addMessage(text, type = "") {
    // Intentionally empty to prevent messages from showing
    return;
}

// Game functions
function startGame() {
    gameStarted = true;
    
    if (waitingRoom) waitingRoom.classList.add('hidden');
    if (gameContainer) gameContainer.classList.remove('hidden');
    if (scoreDisplay) scoreDisplay.classList.remove('hidden');
    if (turnIndicator) turnIndicator.classList.remove('hidden');
    if (messagesDiv) messagesDiv.classList.add('hidden');
    const controls = getElement('controls');
    if (controls) controls.classList.remove('hidden');
    
    addMessage(`Game started! ${players[currentPlayer].name}'s turn`, "success");
    
    // Update score display
    updateScoreDisplay();
    
    // Update turn indicator
    updateTurnIndicator();
    
    // Show placement helper
    showPlacementHelper();
    
    // Start the game loop
    gameLoop();
    
    // Play start sound
    playSound('notify');
}

function draw() {
    if (!ctx || !canvas) return;
    
    ctx.fillStyle = '#1d1d1d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid background
    drawGrid();
    
    // Apply camera transform
    ctx.save();
    ctx.translate(0, -camera.y);
    
    // Draw all blocks
    stackedBlocks.forEach((block) => {
        // Draw block shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(block.x - block.width / 2 + 5, block.y + 5, block.width, block.height);
        
        // Draw block
        ctx.fillStyle = block.color;
        ctx.fillRect(block.x - block.width / 2, block.y, block.width, block.height);
        
        // Draw highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(block.x - block.width / 2, block.y, block.width, 5);
    });
    
    // Draw moving block shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(movingBlock.x - movingBlock.width / 2 + 5, movingBlock.y + 5, movingBlock.width, movingBlock.height);
    
    // Draw moving block
    ctx.fillStyle = players[currentPlayer].color;
    ctx.fillRect(movingBlock.x - movingBlock.width / 2, movingBlock.y, movingBlock.width, movingBlock.height);
    
    // Draw highlight on moving block
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(movingBlock.x - movingBlock.width / 2, movingBlock.y, movingBlock.width, 5);
    
    ctx.restore();
}

// Draw background grid
function drawGrid() {
    if (!ctx || !canvas) return;
    
    const gridSize = 40;
    const gridOpacity = 0.1;
    
    ctx.strokeStyle = `rgba(255, 255, 255, ${gridOpacity})`;
    ctx.lineWidth = 1;
    
    // Adjust grid offset based on camera
    const offsetY = camera.y % gridSize;
    
    // Draw horizontal lines
    for (let y = -offsetY; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Draw vertical lines
    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
}

function update() {
    if (!gameOver) {
        movingBlock.x += movingBlock.speed * movingBlock.direction;
        
        if (!canvas) return;
        
        if (movingBlock.x >= canvas.width - movingBlock.width / 2 || movingBlock.x <= movingBlock.width / 2) {
            movingBlock.direction *= -1;
        }
    }
    
    // Smooth camera movement
    camera.y += (camera.targetY - camera.y) * 0.1;
}

function isCompletelyOutOfBounds(moving, previous) {
    const movingLeft = moving.x - moving.width / 2;
    const movingRight = moving.x + moving.width / 2;
    const prevLeft = previous.x - previous.width / 2;
    const prevRight = previous.x + previous.width / 2;
    
    return movingRight < prevLeft || movingLeft > prevRight;
}

function calculateOverlap() {
    const prevBlock = stackedBlocks[stackedBlocks.length - 1];
    
    const movingLeft = movingBlock.x - movingBlock.width / 2;
    const movingRight = movingBlock.x + movingBlock.width / 2;
    const prevLeft = prevBlock.x - prevBlock.width / 2;
    const prevRight = prevBlock.x + prevBlock.width / 2;
    
    const overlapLeft = Math.max(movingLeft, prevLeft);
    const overlapRight = Math.min(movingRight, prevRight);
    
    return {
        width: overlapRight - overlapLeft,
        x: (overlapLeft + overlapRight) / 2,
        percentage: (overlapRight - overlapLeft) / prevBlock.width * 100
    };
}

function placeBlock() {
    if (gameOver || currentPlayer !== playerIndex) return;
    
    const prevBlock = stackedBlocks[stackedBlocks.length - 1];
    
    // Play click sound
    playSound('click');
    
    if (isCompletelyOutOfBounds(movingBlock, prevBlock)) {
        gameOver = true;
        roundWinner = players[(currentPlayer + 1) % 2].name; // Other player wins
        
        // Update game state
        const gameState = {
            stackedBlocks,
            movingBlock,
            players,
            currentPlayer,
            gameOver,
            roundWinner,
            camera: { targetY: camera.targetY }
        };
        
        // Send updated game state to server
        sendMessage({
            type: 'place',
            roomId,
            gameState
        });
        
        // Show game over modal after a short delay
        setTimeout(() => {
            showGameOverModal();
        }, 500);
        
        // Play game over sound
        playSound('gameOver');
        
        return;
    }
    
    const overlap = calculateOverlap();
    const newWidth = Math.max(overlap.width, 10); // Ensure minimum width
    
    // Check if this was a perfect placement (within 2px)
    const isPerfect = Math.abs(prevBlock.width - newWidth) < 2;
    
    if (isPerfect) {
        lastPerfectStack = true;
        showPerfectStackEffect();
    } else {
        lastPerfectStack = false;
    }
    
    // Add new block
    stackedBlocks.push({
        x: overlap.x,
        y: movingBlock.y,
        width: newWidth,
        height: movingBlock.height,
        color: players[currentPlayer].color
    });
    
    // Update moving block
    movingBlock.width = newWidth;
    movingBlock.y -= movingBlock.height;
    movingBlock.x = canvas ? canvas.width / 2 : 400; // Reset position to center
    movingBlock.speed += 0.2; // Increment speed slightly
    
    // Camera follows
    camera.targetY = movingBlock.y - (canvas ? canvas.height : 600) + 200;
    
    // Increment score
    players[currentPlayer].score++;
    
    // Update score display
    updateScoreDisplay();
    
    // Switch players after every turn
    currentPlayer = (currentPlayer + 1) % 2;
    
    // Update player indicators and turn display
    updatePlayerIndicators();
    updateTurnIndicator();
    
    // Update game state
    const gameState = {
        stackedBlocks,
        movingBlock,
        players,
        currentPlayer,
        gameOver,
        roundWinner,
        camera: { targetY: camera.targetY }
    };
    
    // Send updated game state to server
    sendMessage({
        type: 'place',
        roomId,
        gameState
    });
}

function resetGame() {
    if (isHost && gameOver) {
        sendMessage({
            type: 'reset',
            roomId
        });
    }
}

function gameLoop() {
    if (gameStarted) {
        update();
        draw();
        requestAnimationFrame(gameLoop);
    }
}

function showGameOverModal() {
    if (!gameOver || !gameOverModal) return;
    
    if (winnerText) winnerText.textContent = `${roundWinner} Wins!`;
    gameOverModal.classList.remove('hidden');
    if (resetButton) resetButton.classList.add('hidden'); // Hide the reset button when modal is shown
    
    // Play win/lose sound
    if (roundWinner === players[playerIndex].name) {
        playSound('win');
    } else {
        playSound('gameOver');
    }
}

function hideAllModals() {
    if (gameOverModal) gameOverModal.classList.add('hidden');
    if (rematchRequestModal) rematchRequestModal.classList.add('hidden');
    if (waitingModal) waitingModal.classList.add('hidden');
}

function sendRematchRequest() {
    rematchRequested = true;
    hideAllModals();
    if (waitingModal) waitingModal.classList.remove('hidden');
    
    // Clear any existing timeout
    if (rematchTimeoutId) {
        clearTimeout(rematchTimeoutId);
    }
    
    // Play click sound
    playSound('click');
    
    sendMessage({
        type: 'rematchRequest',
        roomId: roomId,
        senderId: clientId
    });
    
    // Start the countdown timer
    startCountdownTimer('waitingTimer', 30, () => {
        if (rematchRequested && waitingModal && !waitingModal.classList.contains('hidden')) {
            hideAllModals();
            addMessage("No response from opponent. Returning to waiting room.", "warning");
            if (waitingRoom) waitingRoom.classList.remove('hidden');
            if (gameContainer) gameContainer.classList.add('hidden');
            if (scoreDisplay) scoreDisplay.classList.add('hidden');
            rematchRequested = false;
        }
    });
}

function acceptRematch() {
    hideAllModals();
    addMessage("Rematch accepted! Starting new game...", "success");
    
    // Play click sound
    playSound('click');
    
    sendMessage({
        type: 'rematchAccepted',
        roomId: roomId,
        senderId: clientId
    });
}

function declineRematch() {
    hideAllModals();
    
    // Play click sound
    playSound('click');
    
    sendMessage({
        type: 'rematchDeclined',
        roomId: roomId,
        senderId: clientId
    });
    
    // Return to waiting room
    if (waitingRoom) waitingRoom.classList.remove('hidden');
    if (gameContainer) gameContainer.classList.add('hidden');
    if (scoreDisplay) scoreDisplay.classList.add('hidden');
    addMessage("You declined the rematch.", "info");
}

function quitGame() {
    hideAllModals();
    
    // Play click sound
    playSound('click');
    
    sendMessage({
        type: 'playerQuit',
        roomId: roomId,
        senderId: clientId
    });
    
    // Return to lobby
    window.location.reload();
}

// Countdown timer functionality
function startCountdownTimer(elementId, seconds, onComplete) {
    const timerElement = getElement(elementId);
    if (!timerElement) return;
    
    let timeLeft = seconds;
    timerElement.textContent = timeLeft;
    
    const timerInterval = setInterval(() => {
        timeLeft--;
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            if (onComplete) onComplete();
        }
        
        timerElement.textContent = timeLeft;
        
        // Add visual feedback when less than 10 seconds left
        if (timeLeft <= 10) {
            timerElement.style.color = "#e74c3c";
        } else {
            timerElement.style.color = "white";
        }
    }, 1000);
    
    // Return a function to clear the timer if needed
    return function clearTimer() {
        clearInterval(timerInterval);
    };
}

// Setup event handlers
function setupEventHandlers() {
    // Create game button
    const createButton = getElement('createButton');
    if (createButton) {
        createButton.addEventListener('click', () => {
            playSound('click');
            if (messagesDiv) messagesDiv.classList.add('hidden');
            setupSocket();
            
            // Wait for socket connection
            const waitForConnection = setInterval(() => {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    clearInterval(waitForConnection);
                    
                    // Send create game request
                    sendMessage({
                        type: 'create'
                    });
                } else if (socket && socket.readyState === WebSocket.CLOSED) {
                    setupSocket();
                }
            }, 100);
        });
    }

    // Join game button
    const joinButton = getElement('joinButton');
    if (joinButton) {
        joinButton.addEventListener('click', () => {
            const gameIdInput = getElement('gameId');
            const gameRoomId = gameIdInput ? gameIdInput.value.trim().toUpperCase() : "";
            
            if (!gameRoomId) {
                alert("Please enter the Game Code");
                return;
            }
            
            playSound('click');
            if (messagesDiv) messagesDiv.classList.add('hidden');
            setupSocket();
            
            // Wait for socket connection
            const waitForConnection = setInterval(() => {
                if (socket && socket.readyState === WebSocket.OPEN) {
                    clearInterval(waitForConnection);
                    
                    // Send join game request
                    sendMessage({
                        type: 'join',
                        roomId: gameRoomId
                    });
                } else if (socket && socket.readyState === WebSocket.CLOSED) {
                    setupSocket();
                }
            }, 100);
        });
    }

    // Start game button
    if (startButton) {
        startButton.addEventListener('click', () => {
            if (isHost) {
                playSound('click');
                sendMessage({
                    type: 'start',
                    roomId
                });
            }
        });
    }

    // Canvas click for placing blocks
    if (canvas) {
        canvas.addEventListener('click', () => {
            if (gameStarted && !gameOver && currentPlayer === playerIndex) {
                placeBlock();
            }
        });

        // Add touch support for mobile devices
        canvas.addEventListener('touchend', (e) => {
            e.preventDefault(); // Prevent default touch behavior
            if (gameStarted && !gameOver && currentPlayer === playerIndex) {
                placeBlock();
            }
        });
    }

    // Reset button
    if (resetButton) {
        resetButton.addEventListener('click', resetGame);
    }

    // Rematch and quit buttons
    if (rematchButton) {
        rematchButton.addEventListener('click', sendRematchRequest);
    }
    if (quitButton) {
        quitButton.addEventListener('click', quitGame);
    }

    // Accept or decline rematch
    if (acceptRematchButton) {
        acceptRematchButton.addEventListener('click', acceptRematch);
    }
    if (declineRematchButton) {
        declineRematchButton.addEventListener('click', declineRematch);
    }

    // Add keyboard controls
    document.addEventListener('keydown', (e) => {
        if (gameStarted && !gameOver && currentPlayer === playerIndex) {
            if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
                placeBlock();
            }
        }
    });

    // Make game id field auto-uppercase
    const gameIdInput = getElement('gameId');
    if (gameIdInput) {
        gameIdInput.addEventListener('input', () => {
            gameIdInput.value = gameIdInput.value.toUpperCase();
        });
    }
}

// Initialize the game
function init() {
    // Initialize UI elements
    initializeUIElements();
    
    // Setup event handlers
    setupToggleJoin();
    setupCopyButton();
    setupEventHandlers();
    
    // Show connection status
    if (messagesDiv) messagesDiv.classList.add('hidden');
    
    // Set up initial connection status
    updateConnectionStatus(false);
    
    // Show touch icon on mobile devices
    if ('ontouchstart' in window) {
        document.body.classList.add('touch-device');
    }
}

// Initialize when page loads - IMPORTANT: This needs to run after DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);

// Override console methods to silence all messages - moved to the bottom to allow for debug if needed
(function() {
    // Save original console methods
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
    };
    
    // Replace with empty functions
    console.log = function() {};
    console.warn = function() {};
    console.error = function() {};
    console.info = function() {};
    console.debug = function() {};
})();