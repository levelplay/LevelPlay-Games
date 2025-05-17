// DOM Elements
const startScreen = document.getElementById('startScreen');
const gameBoard = document.getElementById('gameBoard');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtnToggle = document.getElementById('joinRoomBtnToggle');
const joinRoomForm = document.getElementById('joinRoom');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const shareText = document.getElementById('shareText');
const waitingMessage = document.getElementById('waitingMessage');
const playerInfo = document.getElementById('playerInfo');
const buttonContainer = document.querySelector('.button-container');
const connectBtn = document.getElementById('connectBtn');
const serverInput = document.getElementById('serverInput');
const connectionStatus = document.getElementById('connectionStatus');
const winnerMessage = document.getElementById('winnerMessage');

// Dialog elements
const gameEndDialog = document.getElementById('gameEndDialog');
const gameEndMessage = document.getElementById('gameEndMessage');
const rematchBtn = document.getElementById('rematchBtn');
const quitBtn = document.getElementById('quitBtn');
const rematchRequestDialog = document.getElementById('rematchRequestDialog');
const acceptRematchBtn = document.getElementById('acceptRematchBtn');
const declineRematchBtn = document.getElementById('declineRematchBtn');

// Game variables
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const boardSize = 3;
const cellSize = canvas.width / boardSize;

let board = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
let currentPlayer = 'X';
let gameOver = false;
let winnerCombination = [];
let timerValue = 25;
let timerInterval;
let playerRole = null; // 'X' or 'O'
let roomCode = null;
let gameActive = false;
let socket = null;
let gameResult = null; // Store the result of the game

const players = [
    { name: "Player X", score: 0, symbol: 'X', color: "#ff4d4d" },
    { name: "Player O", score: 0, symbol: 'O', color: "#4d94ff" }
];

// Set default server URL
const DEFAULT_SERVER_URL = "http://localhost:3000";

// Auto-connect to default server on page load
document.addEventListener('DOMContentLoaded', () => {
    connectionStatus.textContent = 'Connecting...';
    connectionStatus.style.color = '#ffcc00';
    connectToServer(DEFAULT_SERVER_URL);
});

// Function to connect to a server
function connectToServer(serverUrl) {
    try {
        // Disconnect existing socket if any
        if (socket) {
            socket.disconnect();
        }
        
        // Connect to the server
        socket = io(serverUrl);
        
        // Socket event handlers
        socket.on('connect', () => {
            console.log('Connected to server:', socket.id);
            connectionStatus.textContent = 'Connected: ' + socket.id;
            connectionStatus.style.color = '#00ff00';
            
            // Show game buttons after successful connection
            buttonContainer.style.display = 'flex';
            
            // Set up socket event handlers
            setupSocketEventHandlers();
        });
        
        socket.on('connect_error', (err) => {
            console.error('Connection error:', err);
            connectionStatus.textContent = 'Connection error: ' + err.message;
            connectionStatus.style.color = '#ff0000';
        });
        
        socket.on('disconnect', (reason) => {
            console.log('Disconnected:', reason);
            connectionStatus.textContent = 'Disconnected: ' + reason;
            connectionStatus.style.color = '#ff0000';
            
            buttonContainer.style.display = 'none';
        });
    } catch (error) {
        console.error('Error initializing Socket.io:', error);
        connectionStatus.textContent = 'Error: ' + error.message;
        connectionStatus.style.color = '#ff0000';
    }
}

// Legacy connect button event listener (can be removed if not needed)
connectBtn.addEventListener('click', () => {
    const serverUrl = serverInput.value.trim();
    
    if (!serverUrl) {
        alert('Please enter a valid server URL');
        return;
    }
    
    connectToServer(serverUrl);
});

// UI Event Listeners
joinRoomBtnToggle.addEventListener('click', () => {
    joinRoomForm.style.display = joinRoomForm.style.display === 'none' ? 'flex' : 'none';
});

createRoomBtn.addEventListener('click', () => {
    if (!socket || !socket.connected) {
        alert('Not connected to server. Please connect first.');
        return;
    }
    
    createRoomBtn.disabled = true;
    joinRoomBtnToggle.disabled = true;
    
    socket.emit('createRoom');
    console.log('Sent createRoom event to server');
});

joinRoomBtn.addEventListener('click', () => {
    if (!socket || !socket.connected) {
        alert('Not connected to server. Please connect first.');
        return;
    }
    
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code) {
        joinRoomBtn.disabled = true;
        roomCodeInput.disabled = true;
        
        socket.emit('joinRoom', { roomCode: code });
        console.log('Sent joinRoom event to server with code:', code);
    } else {
        alert('Please enter a room code');
    }
});

// Game end dialog buttons
rematchBtn.addEventListener('click', () => {
    if (roomCode && socket && socket.connected) {
        socket.emit('requestRematch', { roomCode });
        console.log('Requested rematch');
        closeGameEndDialog();
        // Show waiting message
        winnerMessage.textContent = "Waiting for opponent to accept rematch...";
        winnerMessage.style.display = 'block';
    }
});

quitBtn.addEventListener('click', () => {
    if (roomCode && socket && socket.connected) {
        socket.emit('quitGame', { roomCode });
        console.log('Quit game');
    }
    closeGameEndDialog();
    resetToLobby();
});

// Rematch request dialog buttons
acceptRematchBtn.addEventListener('click', () => {
    if (roomCode && socket && socket.connected) {
        socket.emit('acceptRematch', { roomCode });
        console.log('Accepted rematch');
    }
    closeRematchRequestDialog();
});

declineRematchBtn.addEventListener('click', () => {
    if (roomCode && socket && socket.connected) {
        socket.emit('declineRematch', { roomCode });
        console.log('Declined rematch');
    }
    closeRematchRequestDialog();
    resetToLobby();
});

function setupSocketEventHandlers() {
    socket.on('roomCreated', (data) => {
        console.log('Room created:', data);
        roomCode = data.roomCode;
        playerRole = 'X';
        
        roomCodeDisplay.textContent = `Room Code: ${roomCode}`;
        roomCodeDisplay.style.display = 'block';
        shareText.style.display = 'block';
        waitingMessage.style.display = 'block';
        
        joinRoomForm.style.display = 'none';
    });

    socket.on('playerJoined', () => {
        console.log('Player joined, starting game');
        // Someone joined the room, start the game
        startScreen.style.display = 'none';
        gameBoard.style.display = 'block';
        
        playerInfo.textContent = `You are Player ${playerRole}`;
        gameActive = true;
        
        resetGame();
    });

    socket.on('joinedRoom', (data) => {
        console.log('Joined room:', data);
        roomCode = data.roomCode;
        playerRole = 'O';
        
        startScreen.style.display = 'none';
        gameBoard.style.display = 'block';
        
        playerInfo.textContent = `You are Player ${playerRole}`;
        
        // Update board state
        board = data.boardState;
        currentPlayer = data.currentPlayer;
        players[0].score = data.scores.X;
        players[1].score = data.scores.O;
        gameActive = true;
        
        document.getElementById('playerXScore').textContent = `Player X: ${data.scores.X}`;
        document.getElementById('playerOScore').textContent = `Player O: ${data.scores.O}`;
        document.getElementById('turnInfo').textContent = `Player ${currentPlayer}'s Turn`;
        
        drawBoard();
        drawXO();
        resetTimer();
    });

    socket.on('updateBoard', (data) => {
        console.log('Board updated:', data);
        board = data.boardState;
        currentPlayer = data.currentPlayer;
        document.getElementById('turnInfo').textContent = `Player ${currentPlayer}'s Turn`;
        
        drawBoard();
        drawXO();
        resetTimer();
    });

    socket.on('gameOver', (data) => {
        console.log('Game over:', data);
        board = data.boardState;
        drawBoard();
        drawXO();
        
        gameOver = true;
        gameResult = data.result;
        clearInterval(timerInterval);
        
        // Store the game result message
        let resultMessage;
        if (data.result === 'Draw') {
            resultMessage = "It's a Draw!";
        } else if (data.result === 'Timeout') {
            resultMessage = "No Winner - Time Expired";
        } else {
            resultMessage = `Player ${data.result} wins!`;
            
            // Update scores
            players[0].score = data.scores.X;
            players[1].score = data.scores.O;
            document.getElementById('playerXScore').textContent = `Player X: ${data.scores.X}`;
            document.getElementById('playerOScore').textContent = `Player O: ${data.scores.O}`;
        }
        
        // Update the winner message (will be visible behind the dialog)
        winnerMessage.textContent = resultMessage;
        winnerMessage.style.display = 'block';
        
        // Draw winning line
        if (data.result !== 'Draw' && data.result !== 'Timeout') {
            winnerCombination = data.winnerCombination;
            drawStrike(data.result);
        }
        
        // Show the game end dialog after a short delay
        setTimeout(() => {
            showGameEndDialog(resultMessage);
        }, 1500);
    });

    socket.on('gameRestarted', (data) => {
        console.log('Game restarted:', data);
        board = data.boardState;
        currentPlayer = data.currentPlayer;
        gameOver = false;
        gameActive = true;
        
        winnerMessage.style.display = 'none';
        
        document.getElementById('turnInfo').textContent = `Player X's Turn`;
        
        resetTimer();
        drawBoard();
        drawXO();
    });
    
    socket.on('rematchRequested', () => {
        console.log('Rematch requested by opponent');
        showRematchRequestDialog();
    });
    
    socket.on('rematchAccepted', () => {
        console.log('Rematch accepted by opponent');
        winnerMessage.style.display = 'none';
    });
    
    socket.on('rematchDeclined', () => {
        console.log('Rematch declined by opponent');
        alert('Your opponent declined the rematch.');
        resetToLobby();
    });
    
    socket.on('opponentQuit', () => {
        console.log('Opponent quit');
        alert('Your opponent has left the game. Returning to lobby.');
        resetToLobby();
    });

    socket.on('roomError', (data) => {
        console.error('Room error:', data);
        alert(data.message);
        
        joinRoomBtn.disabled = false;
        roomCodeInput.disabled = false;
        createRoomBtn.disabled = false;
        joinRoomBtnToggle.disabled = false;
    });
}

// Game events
canvas.addEventListener('click', (event) => {
    if (gameOver || currentPlayer !== playerRole || !gameActive || !socket || !socket.connected) return;
    
    const mouseX = event.offsetX;
    const mouseY = event.offsetY;
    
    const col = Math.floor(mouseX / cellSize);
    const row = Math.floor(mouseY / cellSize);
    
    if (row >= 0 && row < boardSize && col >= 0 && col < boardSize && !board[row][col]) {
        console.log('Making move:', { row, col, player: playerRole });
        socket.emit('makeMove', { 
            roomCode, 
            player: playerRole, 
            row, 
            col 
        });
    }
});

// Dialog functions
function showGameEndDialog(message) {
    gameEndMessage.textContent = message;
    gameEndDialog.classList.add('active');
}

function closeGameEndDialog() {
    gameEndDialog.classList.remove('active');
}

function showRematchRequestDialog() {
    rematchRequestDialog.classList.add('active');
}

function closeRematchRequestDialog() {
    rematchRequestDialog.classList.remove('active');
}

// Game Functions
function resetToLobby() {
    gameBoard.style.display = 'none';
    startScreen.style.display = 'flex';
    
    createRoomBtn.style.display = 'block';
    createRoomBtn.disabled = false;
    joinRoomBtnToggle.style.display = 'block';
    joinRoomBtnToggle.disabled = false;
    joinRoomForm.style.display = 'none';
    waitingMessage.style.display = 'none';
    roomCodeDisplay.style.display = 'none';
    shareText.style.display = 'none';
    
    roomCodeInput.value = '';
    roomCodeInput.disabled = false;
    joinRoomBtn.disabled = false;
    
    // Reset game state
    clearInterval(timerInterval);
    gameOver = false;
    gameActive = false;
    roomCode = null;
    playerRole = null;
}

function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw glowing grid lines (thicker)
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 6; // Thicker lines
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 15;

    for (let i = 1; i < boardSize; i++) {
        // Vertical lines
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, canvas.height);
        ctx.stroke();

        // Horizontal lines
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(canvas.width, i * cellSize);
        ctx.stroke();
    }

    // Reset shadow
    ctx.shadowBlur = 0;
}

function drawXO() {
    for (let row = 0; row < boardSize; row++) {
        for (let col = 0; col < boardSize; col++) {
            const value = board[row][col];
            if (value) {
                const centerX = col * cellSize + cellSize / 2;
                const centerY = row * cellSize + cellSize / 2;

                if (value === 'X') {
                    drawX(centerX, centerY);
                } else if (value === 'O') {
                    drawO(centerX, centerY);
                }
            }
        }
    }
}

function drawX(centerX, centerY) {
    const size = cellSize * 0.4;

    ctx.strokeStyle = players[0].color;
    ctx.lineWidth = 8;
    ctx.shadowColor = players[0].color;
    ctx.shadowBlur = 20;

    ctx.beginPath();
    ctx.moveTo(centerX - size, centerY - size);
    ctx.lineTo(centerX + size, centerY + size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX + size, centerY - size);
    ctx.lineTo(centerX - size, centerY + size);
    ctx.stroke();

    ctx.shadowBlur = 0; // Reset shadow
}

function drawO(centerX, centerY) {
    const radius = cellSize * 0.4;

    ctx.strokeStyle = players[1].color;
    ctx.lineWidth = 8;
    ctx.shadowColor = players[1].color;
    ctx.shadowBlur = 20;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0; // Reset shadow
}

function resetTimer() {
    clearInterval(timerInterval);
    timerValue = 25;
    document.getElementById('timer').textContent = timerValue;
    document.getElementById('timer').style.color = '#ffffff';
    document.getElementById('timer').classList.remove('shake');
    
    startTimer();
}

function startTimer() {
    timerInterval = setInterval(() => {
        timerValue--;
        document.getElementById('timer').textContent = timerValue;

        if (timerValue <= 5) {
            document.getElementById('timer').style.color = 'red';
            if (timerValue === 5) {
                document.getElementById('timer').classList.add('shake');
            }
        }

        if (timerValue <= 0) {
            clearInterval(timerInterval);
            if (playerRole === currentPlayer && gameActive && socket && socket.connected) {
                socket.emit('timeOut', { roomCode });
            }
        }
    }, 1000);
}

function drawStrike(winner) {
    if (!winnerCombination || winnerCombination.length < 3) return;
    
    const strike = winnerCombination.map(([row, col]) => {
        return {
            x: col * cellSize + cellSize / 2,
            y: row * cellSize + cellSize / 2
        };
    });

    ctx.beginPath();
    ctx.strokeStyle = winner === 'X' ? players[0].color : players[1].color;
    ctx.lineWidth = 10;
    ctx.shadowColor = winner === 'X' ? players[0].color : players[1].color;
    ctx.shadowBlur = 25;
    
    ctx.moveTo(strike[0].x, strike[0].y);
    ctx.lineTo(strike[2].x, strike[2].y);
    ctx.stroke();
    
    ctx.shadowBlur = 0;
}

function resetGame() {
    board = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
    currentPlayer = 'X';
    gameOver = false;
    winnerCombination = [];
    
    document.getElementById('turnInfo').textContent = `Player X's Turn`;
    winnerMessage.style.display = 'none';
    
    resetTimer();
    drawBoard();
}

// Initialize
drawBoard();