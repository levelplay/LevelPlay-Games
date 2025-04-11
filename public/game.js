// Initialize game variables
let game = null;
let peer = null;
let connection = null;
let isHost = false;
let myColor = '';
let chessGame = null;
let selectedPiece = null;
let highlightedSquares = [];
let gameStarted = false;
let roomCode = '';
let boardSquares = [];
let chessPieces = [];
let draggedPiece = null;
let connectionEstablished = false;
let lastMove = null;

// Add references to new UI elements
const gameControlsBottom = document.getElementById('game-controls-bottom');
const rematchBtn = document.getElementById('rematch-btn');
const quitBtn = document.getElementById('quit-btn');

// Console logging wrapper for debugging
function log(message) {
  console.log(`[Chess] ${message}`);
}

// Constants
const BOARD_SIZE = 400;
const SQUARE_SIZE = BOARD_SIZE / 8;
const WHITE = 'w';
const BLACK = 'b';

// Piece emoji representations for rendering
const PIECE_SYMBOLS = {
  'wk': '♔', // white king
  'wq': '♕', // white queen
  'wr': '♖', // white rook
  'wb': '♗', // white bishop
  'wn': '♘', // white knight
  'wp': '♙', // white pawn
  'bk': '♚', // black king
  'bq': '♛', // black queen
  'br': '♜', // black rook
  'bb': '♝', // black bishop
  'bn': '♞', // black knight
  'bp': '♟', // black pawn
};

// Server API base URL
const API_BASE_URL = window.location.origin + '/api';

// Get DOM elements
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const roomCodeInput = document.getElementById('room-code');
const menuContainer = document.getElementById('menu-container');
const gameInfo = document.getElementById('game-info');
const displayCode = document.getElementById('display-code');
const copyBtn = document.getElementById('copy-btn');
const statusEl = document.getElementById('status');

// Initialize UI and event listeners
function init() {
  log("Initializing game");
  
  if (statusEl) statusEl.textContent = "Ready to play! Create or join a game.";
  
  if (createBtn) {
    createBtn.onclick = handleCreateGame;
  }
  
  if (joinBtn) {
    joinBtn.onclick = handleJoinGame;
  }
  
  if (copyBtn) {
    copyBtn.onclick = handleCopyCode;
  }
  
  // Add event listeners for bottom buttons
  if (rematchBtn) {
    rematchBtn.onclick = handleNewGame; // Reuse the new game handler
  }
  
  if (quitBtn) {
    quitBtn.onclick = handleResign; // Reuse the resign handler
  }
  
  // Ensure Chess.js is available
  if (typeof Chess !== 'function') {
    // If Chess.js isn't loaded, create a script tag to load it
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js';
    script.onload = () => {
      log('Chess.js loaded successfully');
      checkServerHealth();
    };
    script.onerror = () => {
      log('Failed to load Chess.js');
      if (statusEl) statusEl.textContent = "Failed to load chess engine. Please refresh the page.";
    };
    document.head.appendChild(script);
  } else {
    checkServerHealth();
  }
}

// Check server health
async function checkServerHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/heartbeat`);
    const data = await response.json();
    log(`Server is online, timestamp: ${new Date(data.timestamp).toLocaleString()}`);
  } catch (error) {
    log(`Server connection error: ${error.message}`);
    if (statusEl) statusEl.textContent = "Cannot connect to server. Please try again later.";
  }
}

// Create Game button handler
function handleCreateGame() {
  log("Create button clicked");
  
  if (statusEl) statusEl.textContent = "Creating game...";
  if (createBtn) createBtn.disabled = true;
  if (joinBtn) joinBtn.disabled = true;
  
  initPeer(true);
}

// Join Game button handler
function handleJoinGame() {
  log("Join button clicked");
  
  if (!roomCodeInput || !roomCodeInput.value.trim()) {
    alert("Please enter a room code");
    return;
  }
  
  const code = roomCodeInput.value.trim().toUpperCase();
  
  if (statusEl) statusEl.textContent = `Joining game ${code}...`;
  if (createBtn) createBtn.disabled = true;
  if (joinBtn) joinBtn.disabled = true;
  
  roomCode = code;
  
  initPeer(false);
}

// Initialize PeerJS
function initPeer(isCreator) {
  log(`Initializing peer as ${isCreator ? 'creator' : 'joiner'}`);
  
  try {
    // Use the most minimal PeerJS configuration
    peer = new Peer(null, {
      debug: 2, // More verbose logging
      config: {
        'iceServers': [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });
    
    peer.on('open', (id) => {
      log(`Peer connection opened with ID: ${id}`);
      
      if (isCreator) {
        createGame(id);
      } else {
        joinGame(roomCode, id);
      }
    });
    
    peer.on('connection', (conn) => {
      log('Received connection from peer');
      connection = conn;
      setupConnection();
    });
    
    peer.on('error', (err) => {
      log(`Peer error: ${err.type} - ${err.message}`);
      handlePeerError(err);
    });
    
    // Add a disconnect handler
    peer.on('disconnected', () => {
      log('Peer disconnected from server');
      if (statusEl) statusEl.textContent = "Disconnected from server. Attempting to reconnect...";
      
      // Try to reconnect
      setTimeout(() => {
        if (peer && peer.destroyed) {
          initPeer(isCreator);
        } else if (peer) {
          peer.reconnect();
        }
      }, 3000);
    });
  } catch (e) {
    log(`Error creating peer: ${e.message}`);
    resetUI();
  }
}

// Handle peer connection errors
function handlePeerError(err) {
  if (err.type === 'peer-unavailable') {
    if (statusEl) statusEl.textContent = "Could not find opponent. Room may be inactive.";
  } else if (err.type === 'network') {
    if (statusEl) statusEl.textContent = "Network error. Please check your connection and try again.";
  } else if (err.type === 'server-error') {
    if (statusEl) statusEl.textContent = "PeerJS server error. Please try again later.";
  } else {
    if (statusEl) statusEl.textContent = `Connection error: ${err.type}. Please try again.`;
  }
  
  resetUI();
}

// Reset UI elements
function resetUI() {
  if (createBtn) createBtn.disabled = false;
  if (joinBtn) joinBtn.disabled = false;
}

// Create a new game
async function createGame(peerId) {
  try {
    const response = await fetch(`${API_BASE_URL}/create-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ peerId: peerId })
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    
    const data = await response.json();
    roomCode = data.roomCode;
    log(`Created room ${roomCode} with peer ID ${peerId}`);
    
    if (displayCode) displayCode.textContent = roomCode;
    if (menuContainer) menuContainer.classList.add('hidden');
    if (gameInfo) gameInfo.classList.remove('hidden');
    if (statusEl) statusEl.textContent = "Waiting for opponent to join...";
    
    isHost = true;
    myColor = WHITE;
    setupGame();
    
    startRoomPing();
  } catch (error) {
    log(`Error creating room: ${error.message}`);
    if (statusEl) statusEl.textContent = 'Error creating game. Please try again.';
    resetUI();
  }
}

// Join an existing game
async function joinGame(code, peerId) {
  log(`Joining room ${code} with peer ID ${peerId}`);
  
  try {
    const response = await fetch(`${API_BASE_URL}/join-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ roomCode: code, peerId: peerId })
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Room not found');
      } else if (response.status === 410) {
        throw new Error('Room is no longer active');
      } else if (response.status === 403) {
        throw new Error('Room is full');
      }
      throw new Error(`Server returned ${response.status}`);
    }
    
    const data = await response.json();
    const hostPeerId = data.hostPeerId;
    
    if (!hostPeerId) {
      throw new Error('Host peer ID not found');
    }
    
    // Connect to host with reliable messaging
    connection = peer.connect(hostPeerId, {
      reliable: true
    });
    
    setupConnection();
    
    isHost = false;
    myColor = BLACK;
    
    if (displayCode) displayCode.textContent = code;
    if (menuContainer) menuContainer.classList.add('hidden');
    if (gameInfo) gameInfo.classList.remove('hidden');
    if (statusEl) statusEl.textContent = "Connecting to opponent...";
    
    setupGame();
    
    startRoomPing();
  } catch (error) {
    log(`Error joining game: ${error.message}`);
    if (statusEl) statusEl.textContent = `Error joining game: ${error.message}`;
    resetUI();
  }
}

// Ping the room periodically to keep it active
function startRoomPing() {
  if (!roomCode) return;
  
  const pingInterval = setInterval(() => {
    if (!roomCode) {
      clearInterval(pingInterval);
      return;
    }
    
    // Use fetch with async handling
    fetch(`${API_BASE_URL}/room/${roomCode}/ping`, {
      method: 'POST'
    })
    .then(response => response.json())
    .catch(error => {
      log(`Room ping error: ${error.message}`);
    });
  }, 30000); // Ping every 30 seconds instead of 60
}

// Set up the data connection
function setupConnection() {
  if (!connection) {
    log('No connection object available');
    return;
  }
  
  connection.on('open', () => {
    log('Connection opened');
    connectionEstablished = true;
    
    // Hide entire room info div when connection is established
    if (gameInfo) {
      const roomInfo = gameInfo.querySelector('.room-info');
      if (roomInfo) {
        roomInfo.style.display = 'none';
      }
    }
    
    if (statusEl) statusEl.textContent = 'Connected! Game starting...';
    if (gameControlsBottom) gameControlsBottom.classList.remove('hidden');
    gameStarted = true;
    
    // Give Chess.js a moment to initialize
    setTimeout(() => {
      if (isHost && chessGame) {
        sendGameState();
      } else if (!isHost) {
        // As a joiner, request the game state
        connection.send({
          type: 'request-state'
        });
      }
    }, 1000);
  });
  
  connection.on('data', (data) => {
    log(`Received data from peer: ${JSON.stringify(data)}`);
    handleMessage(data);
  });
  
  connection.on('close', () => {
    log('Connection closed');
    connectionEstablished = false;
    if (statusEl) statusEl.textContent = 'Opponent disconnected';
    gameStarted = false;
  });
  
  connection.on('error', (err) => {
    log(`Connection error: ${err}`);
    connectionEstablished = false;
    if (statusEl) statusEl.textContent = 'Connection error';
  });
}

// Send the current game state to the opponent
function sendGameState() {
  if (!connection || !connectionEstablished || !chessGame) {
    log("Cannot send game state: connection not ready or game not initialized");
    return;
  }
  
  try {
    const gameState = {
      type: 'game-state',
      fen: chessGame.fen(),
      turn: chessGame.turn(),
      lastMove: lastMove
    };
    
    log(`Sending game state: ${JSON.stringify(gameState)}`);
    connection.send(gameState);
    
    updateBoard();
    
    if (statusEl) {
      const currentColor = chessGame.turn() === WHITE ? 'White' : 'Black';
      const isMyTurn = chessGame.turn() === myColor;
      
      if (isMyTurn) {
        statusEl.textContent = `${currentColor}'s turn - Your move`;
        statusEl.classList.add('your-turn');
      } else {
        statusEl.textContent = `${currentColor}'s turn - Waiting for opponent`;
        statusEl.classList.remove('your-turn');
      }
    }
  } catch (e) {
    log(`Error sending game state: ${e.message}`);
  }
}

// Convert board coordinates to algebraic notation (e.g. 0,0 -> a8)
function algebraicNotation(x, y) {
  const file = String.fromCharCode(97 + x); // 'a' is 97 in ASCII
  const rank = 8 - y;
  return file + rank;
}

// Convert algebraic notation to board coordinates (e.g. a8 -> 0,0)
function boardCoordinates(square) {
  const x = square.charCodeAt(0) - 97;
  const y = 8 - parseInt(square.charAt(1));
  return { x, y };
}

// Handle incoming messages
function handleMessage(data) {
  if (!data || !data.type) {
    log('Received invalid message format');
    return;
  }
  
  log(`Handling message type: ${data.type}`);
  
  switch (data.type) {
    case 'game-state':
      if (chessGame && data.fen) {
        chessGame.load(data.fen);
        log('Loaded game state: ' + data.fen);
        
        // Update last move if available
        if (data.lastMove) {
          lastMove = data.lastMove;
        }
        
        updateBoard();
      }
      break;
      
    case 'request-state':
      if (isHost && chessGame) {
        log('Received state request, sending current state');
        sendGameState();
      }
      break;
      
    case 'move':
      if (data.from && data.to) {
        log(`Received move from ${data.from} to ${data.to}`);
        lastMove = { from: data.from, to: data.to };
        makeMove(data.from, data.to, data.promotion, false);
      }
      break;
      
    case 'resign':
      if (statusEl) statusEl.textContent = `Opponent resigned. You win!`;
      gameStarted = false;
      break;
      
    case 'new-game-offer':
      if (confirm(`Opponent offered to start a new game. Accept?`)) {
        connection.send({ type: 'new-game-accept' });
        resetGame();
      } else {
        connection.send({ type: 'new-game-decline' });
      }
      break;
      
    case 'new-game-accept':
      resetGame();
      if (statusEl) statusEl.textContent = `New game started!`;
      break;
      
    case 'new-game-decline':
      if (statusEl) statusEl.textContent = `Opponent declined your offer for a new game.`;
      break;
      
    case 'quit':
      if (statusEl) statusEl.textContent = `Opponent quit the game.`;
      gameStarted = false;
      break;
      
    case 'ping':
      connection.send({ type: 'pong' });
      break;
  }
}

// Handle quit button (using resign functionality)
function handleResign() {
  if (!gameStarted) return;
  
  if (confirm('Are you sure you want to resign?')) {
    if (connection && connectionEstablished) {
      connection.send({ type: 'resign' });
    }
    if (statusEl) statusEl.textContent = 'You resigned. Game over.';
    gameStarted = false;
  }
}

// Handle new game button (used by rematch)
function handleNewGame() {
  if (!connection || !connectionEstablished) {
    if (statusEl) statusEl.textContent = 'No connection to opponent.';
    return;
  }
  
  if (confirm('Offer a new game to your opponent?')) {
    connection.send({ type: 'new-game-offer' });
    if (statusEl) statusEl.textContent = 'Waiting for opponent to accept new game...';
  }
}

// Handle copy room code button
function handleCopyCode() {
  if (!displayCode) return;
  
  try {
    // Attempt to use clipboard API
    navigator.clipboard.writeText(displayCode.textContent)
      .then(() => {
        if (copyBtn) {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            if (copyBtn) copyBtn.textContent = 'Copy Code';
          }, 2000);
        }
      })
      .catch(() => {
        // Fallback to alert if clipboard API fails
        alert(`Your room code is: ${displayCode.textContent}\nShare this with your opponent.`);
      });
  } catch (e) {
    // Simple fallback for older browsers
    alert(`Your room code is: ${displayCode.textContent}\nShare this with your opponent.`);
  }
}

// Setup the game
function setupGame() {
  log('Setting up game');
  
  // Check for Chess.js again to be sure
  if (typeof Chess !== 'function') {
    log('ERROR: Chess.js not loaded properly!');
    if (statusEl) statusEl.textContent = "Error: Chess engine not loaded. Please refresh the page.";
    return;
  }
  
  // Initialize Chess.js engine
  try {
    chessGame = new Chess();
    log(`Chess engine initialized. FEN: ${chessGame.fen()}`);
    
    // Update status based on initial game state
    if (statusEl) {
      if (myColor === WHITE) {
        statusEl.textContent = "Game starting - You play as White - Your turn";
        statusEl.classList.add('your-turn');
      } else {
        statusEl.textContent = "Game starting - You play as Black - Waiting for White to move";
        statusEl.classList.remove('your-turn');
      }
    }
    
    // Clear existing game container
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      gameContainer.innerHTML = '';
      boardSquares = []; // Reset board squares array
      chessPieces = []; // Reset chess pieces array
      
      // Create chess board HTML
      const boardEl = document.createElement('div');
      boardEl.style.width = BOARD_SIZE + 'px';
      boardEl.style.height = BOARD_SIZE + 'px';
      boardEl.style.position = 'relative';
      boardEl.style.margin = '0 auto';
      boardEl.style.border = '2px solid #000';
      boardEl.id = 'chess-board';
      
      gameContainer.appendChild(boardEl);
      
      // Create board squares
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const square = document.createElement('div');
          const isWhiteSquare = (x + y) % 2 === 0;
          
          square.style.position = 'absolute';
          square.style.width = SQUARE_SIZE + 'px';
          square.style.height = SQUARE_SIZE + 'px';
          square.style.backgroundColor = isWhiteSquare ? '#EEEED2' : '#769656';
          
          // Flip board for black players
          let renderX = myColor === BLACK ? 7 - x : x;
          let renderY = myColor === BLACK ? 7 - y : y;
          
          square.style.left = (renderX * SQUARE_SIZE) + 'px';
          square.style.top = (renderY * SQUARE_SIZE) + 'px';
          
          // Setup the game (continued)
          // Store logical coordinates
          square.dataset.x = x;
          square.dataset.y = y;
          
          // Add coordinate labels
          if (myColor === WHITE && y === 7 || myColor === BLACK && y === 0) {
            const fileLabel = document.createElement('div');
            fileLabel.textContent = String.fromCharCode(97 + x);
            fileLabel.style.position = 'absolute';
            fileLabel.style.bottom = '2px';
            fileLabel.style.right = '2px';
            fileLabel.style.fontSize = '10px';
            fileLabel.style.color = isWhiteSquare ? '#769656' : '#EEEED2';
            square.appendChild(fileLabel);
          }
          
          if (myColor === WHITE && x === 0 || myColor === BLACK && x === 7) {
            const rankLabel = document.createElement('div');
            rankLabel.textContent = 8 - y;
            rankLabel.style.position = 'absolute';
            rankLabel.style.top = '2px';
            rankLabel.style.left = '2px';
            rankLabel.style.fontSize = '10px';
            rankLabel.style.color = isWhiteSquare ? '#769656' : '#EEEED2';
            square.appendChild(rankLabel);
          }
          
          // Add drag and drop event listeners
          square.addEventListener('dragover', handleDragOver);
          square.addEventListener('drop', handleDrop);
          
          // Add click handler
          square.addEventListener('click', () => {
            const x = parseInt(square.dataset.x);
            const y = parseInt(square.dataset.y);
            handleSquareClick(x, y);
          });
          
          boardEl.appendChild(square);
          boardSquares.push(square);
        }
      }
      
      updateBoard();
    }
    
    // Set up connection keep-alive with more robust error handling
    const pingInterval = setInterval(() => {
      if (connection && connectionEstablished && gameStarted) {
        try {
          connection.send({ type: 'ping' });
        } catch (e) {
          log('Error sending ping: ' + e.message);
          clearInterval(pingInterval);
        }
      } else if (!connectionEstablished || !gameStarted) {
        clearInterval(pingInterval);
      }
    }, 15000);
    
  } catch (e) {
    log(`Error setting up game: ${e.message}`);
    if (statusEl) statusEl.textContent = "Error setting up game. Please refresh and try again.";
  }
}

// Reset the chess game
function resetGame() {
  if (chessGame) {
    chessGame.reset();
    gameStarted = true;
    lastMove = null;
    updateBoard();
    
    if (statusEl) {
      if (myColor === WHITE) {
        statusEl.textContent = 'New game started - Your turn';
        statusEl.classList.add('your-turn');
      } else {
        statusEl.textContent = "New game started - Opponent's turn";
        statusEl.classList.remove('your-turn');
      }
    }
    
    // If host, send new game state
    if (isHost && connection && connectionEstablished) {
      sendGameState();
    }
  }
}

// Handle square click
function handleSquareClick(x, y) {
  log(`Square clicked at ${x}, ${y}`);
  
  if (!gameStarted || !chessGame) {
    log("Game not started or chess engine not initialized");
    return;
  }
  
  // Enforce turn order
  if (chessGame.turn() !== myColor) {
    log(`Not your turn: game turn=${chessGame.turn()}, your color=${myColor}`);
    if (statusEl) statusEl.textContent = `It's not your turn! Waiting for opponent.`;
    return;
  }
  
  const clickedSquare = algebraicNotation(x, y);
  const pieceAtTarget = chessGame.get(clickedSquare);
  
  // If we have a selected piece, try to move to this square
  if (selectedPiece) {
    const fromSquare = algebraicNotation(selectedPiece.x, selectedPiece.y);
    const toSquare = clickedSquare;
    
    // If clicking on own piece again, reselect it
    if (pieceAtTarget && pieceAtTarget.color === myColor) {
      // Deselect current and select new piece
      clearHighlights();
      selectPiece(x, y);
    } else {
      // Try to move to the target square
      log(`Attempting to move from ${fromSquare} to ${toSquare}`);
      const moveMade = makeMove(fromSquare, toSquare);
      
      // If move failed and clicking on empty square, deselect
      if (!moveMade && !pieceAtTarget) {
        clearHighlights();
        selectedPiece = null;
      }
    }
  } else {
    // No piece selected - check if there's a piece at this square
    if (pieceAtTarget && pieceAtTarget.color === myColor) {
      selectPiece(x, y);
    }
  }
}

// Handle piece click
function handlePieceClick(x, y) {
  log(`Piece clicked at ${x}, ${y}`);
  
  if (!gameStarted || !chessGame) {
    log("Game not started or chess engine not initialized");
    return;
  }
  
  // Enforce turn order
  if (chessGame.turn() !== myColor) {
    log(`Not your turn: game turn=${chessGame.turn()}, your color=${myColor}`);
    if (statusEl) statusEl.textContent = `It's not your turn! Waiting for opponent.`;
    return;
  }
  
  const square = algebraicNotation(x, y);
  const piece = chessGame.get(square);
  log(`Piece at ${square}: ${piece ? piece.color + piece.type : 'none'}`);
  
  // If clicking own piece
  if (piece && piece.color === myColor) {
    // If we already had a piece selected
    if (selectedPiece) {
      // If clicking the same piece, deselect it
      if (selectedPiece.x === x && selectedPiece.y === y) {
        clearHighlights();
        selectedPiece = null;
      } else {
        // If clicking a different piece, select the new one
        clearHighlights();
        selectPiece(x, y);
      }
    } else {
      // No piece was selected, select this one
      selectPiece(x, y);
    }
  } 
  // If clicking opponent's piece with a piece selected, try to capture
  else if (selectedPiece && piece && piece.color !== myColor) {
    const fromSquare = algebraicNotation(selectedPiece.x, selectedPiece.y);
    const toSquare = square;
    
    log(`Attempting capture from ${fromSquare} to ${toSquare}`);
    makeMove(fromSquare, toSquare);
  }
}

// Enable drag and drop for pieces
function enableDragAndDrop() {
  // Add event listeners to each piece
  chessPieces.forEach(piece => {
    piece.draggable = true;
    
    piece.addEventListener('dragstart', handleDragStart);
    piece.addEventListener('dragend', handleDragEnd);
  });
}

// Handle drag start event
function handleDragStart(e) {
  if (!gameStarted || !chessGame || chessGame.turn() !== myColor) {
    e.preventDefault();
    return false;
  }
  
  const x = parseInt(this.dataset.x);
  const y = parseInt(this.dataset.y);
  const square = algebraicNotation(x, y);
  const piece = chessGame.get(square);
  
  if (!piece || piece.color !== myColor) {
    e.preventDefault();
    return false;
  }
  
  // Set data for drag operation
  e.dataTransfer.setData('text/plain', square);
  e.dataTransfer.effectAllowed = 'move';
  
  // Store the dragged piece reference
  draggedPiece = {
    element: this,
    square: square,
    x: x,
    y: y
  };
  
  // Show possible moves as highlights
  selectPiece(x, y);
  
  // For visual feedback
  setTimeout(() => {
    this.style.opacity = '0.4';
  }, 0);
  
  return true;
}

// Handle drag end event
function handleDragEnd(e) {
  // Reset opacity
  this.style.opacity = '1';
  
  // Clear any highlights
  clearHighlights();
  
  draggedPiece = null;
}

// Handle drag over event
function handleDragOver(e) {
  // Allow drop
  e.preventDefault();
  return false;
}

// Handle drop event
function handleDrop(e) {
  e.preventDefault();
  
  // Get drop target square
  const x = parseInt(this.dataset.x);
  const y = parseInt(this.dataset.y);
  const toSquare = algebraicNotation(x, y);
  
  // Get dragged piece's square
  const fromSquare = e.dataTransfer.getData('text/plain');
  
  if (fromSquare && toSquare) {
    log(`Dropped from ${fromSquare} to ${toSquare}`);
    makeMove(fromSquare, toSquare);
  }
  
  return false;
}

// Select a piece
function selectPiece(x, y) {
  log(`Selecting piece at ${x}, ${y}`);
  
  clearHighlights();
  
  selectedPiece = { x, y };
  
  // Highlight selected square
  highlightSquare(x, y, '#4285F4');
  
  // Get valid moves for this piece
  const square = algebraicNotation(x, y);
  const moves = chessGame.moves({
    square: square,
    verbose: true
  });
  
  log(`Found ${moves.length} valid moves for piece at ${square}`);
  
  // Highlight valid destination squares
  moves.forEach(move => {
    const destX = move.to.charCodeAt(0) - 97; // 'a' is 97 in ASCII
    const destY = 8 - parseInt(move.to.charAt(1));
    highlightSquare(destX, destY, move.captured ? '#FF5252' : '#66BB6A');
  });
}

// Make a move - return success value
function makeMove(fromSquare, toSquare, promotion, sendToOpponent = true) {
  if (!chessGame) {
    log("Chess engine not initialized");
    return false;
  }
  
  log(`Attempting move from ${fromSquare} to ${toSquare}`);
  
  // Default to queen for promotion
  if (!promotion) {
    const movingPiece = chessGame.get(fromSquare);
    const isLastRank = (movingPiece && movingPiece.type === 'p' && 
                       ((movingPiece.color === WHITE && toSquare.charAt(1) === '8') || 
                        (movingPiece.color === BLACK && toSquare.charAt(1) === '1')));
    
    if (isLastRank) {
      // Instead of defaulting, ask user for promotion piece
      const promotionOptions = ['q', 'r', 'n', 'b'];
      const promotionLabels = {'q': 'Queen', 'r': 'Rook', 'n': 'Knight', 'b': 'Bishop'};
      
      // If we're in browser environment
      if (typeof window !== 'undefined') {
        let promotionChoice = prompt('Promote pawn to: (q)ueen, (r)ook, k(n)ight, (b)ishop', 'q');
        if (promotionChoice && promotionOptions.includes(promotionChoice.toLowerCase()[0])) {
          promotion = promotionChoice.toLowerCase()[0];
        } else {
          promotion = 'q'; // Default to queen if invalid choice
        }
      } else {
        promotion = 'q'; // Default to queen in non-browser environment
      }
    }
  }
  
  try {
    // Create move object
    const moveObj = {
      from: fromSquare,
      to: toSquare,
      promotion: promotion
    };
    
    log(`Attempting move: ${JSON.stringify(moveObj)}`);
    
    // Try to make the move in the chess engine
    const move = chessGame.move(moveObj);
    
    // If move is invalid, return early
    if (!move) {
      log('Invalid move rejected by chess.js');
      return false;
    }
    
    log(`Move made: ${move.san}`);
    
    // Store last move for highlighting
    lastMove = { from: fromSquare, to: toSquare };
    
    // Reset selection and highlights
    selectedPiece = null;
    clearHighlights();
    
    // Update the board to show the new position
    updateBoard();
    
    // Send move to opponent
    if (sendToOpponent && connection && connectionEstablished) {
      const moveMsg = {
        type: 'move',
        from: fromSquare,
        to: toSquare,
        promotion: promotion
      };
      
      log(`Sending move to opponent: ${JSON.stringify(moveMsg)}`);
      connection.send(moveMsg);
    }
    
    // Play move sound (optional)
    if (move.captured) {
      playSound('capture');
    } else {
      playSound('move');
    }
    
    // Play check sound
    if (chessGame.in_check()) {
      playSound('check');
    }
    
    return true;
  } catch (e) {
    log(`Error making move: ${e.message}`);
    return false;
  }
}

// Play sound effect
function playSound(type) {
  try {
    const sound = new Audio(`sounds/${type}.mp3`);
    sound.volume = 0.5;
    sound.play().catch(e => {
      // Ignore sound errors
    });
  } catch (e) {
    // Ignore sound errors
  }
}

// Highlight a square with a given color
function highlightSquare(x, y, color) {
  const chessBoard = document.getElementById('chess-board');
  if (!chessBoard) return;
  
  // Convert to render coordinates if playing as black
  let renderX = myColor === BLACK ? 7 - x : x;
  let renderY = myColor === BLACK ? 7 - y : y;
  
  const highlight = document.createElement('div');
  highlight.style.position = 'absolute';
  highlight.style.left = (renderX * SQUARE_SIZE + SQUARE_SIZE * 0.1) + 'px';
  highlight.style.top = (renderY * SQUARE_SIZE + SQUARE_SIZE * 0.1) + 'px';
  highlight.style.width = (SQUARE_SIZE * 0.8) + 'px';
  highlight.style.height = (SQUARE_SIZE * 0.8) + 'px';
  highlight.style.backgroundColor = color;
  highlight.style.opacity = '0.5';
  highlight.style.zIndex = '5';
  highlight.style.borderRadius = '5px';
  highlight.classList.add('highlight');
  
  chessBoard.appendChild(highlight);
  highlightedSquares.push(highlight);
}

// Clear all highlighted squares
function clearHighlights() {
  highlightedSquares.forEach(highlight => {
    if (highlight.parentNode) {
      highlight.parentNode.removeChild(highlight);
    }
  });
  highlightedSquares = [];
}

// Update the board based on the current chess.js state
function updateBoard() {
  if (!chessGame) {
    log("Cannot update board - chess engine not initialized");
    return;
  }
  
  log(`Updating board with FEN: ${chessGame.fen()}`);
  
  // Remove existing pieces
  chessPieces.forEach(piece => {
    if (piece.parentNode) {
      piece.parentNode.removeChild(piece);
    }
  });
  chessPieces = [];
  
  // Remove highlights
  clearHighlights();
  
  // Add pieces based on current state
  const board = chessGame.board();
  const chessBoard = document.getElementById('chess-board');
  
  if (!chessBoard) {
    log("Chess board element not found");
    return;
  }
  
  // First, remove any last-move highlights from squares
  boardSquares.forEach(square => {
    square.classList.remove('last-move');
  });
  
  // Highlight last move squares if available
  if (lastMove) {
    const fromCoords = boardCoordinates(lastMove.from);
    const toCoords = boardCoordinates(lastMove.to);
    
    // Find the corresponding squares in the boardSquares array
    boardSquares.forEach(square => {
      const x = parseInt(square.dataset.x);
      const y = parseInt(square.dataset.y);
      
      if ((x === fromCoords.x && y === fromCoords.y) || 
          (x === toCoords.x && y === toCoords.y)) {
        square.classList.add('last-move');
      }
    });
  }
  
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const piece = board[y][x];
      if (piece) {
        // Create piece
        const pieceEl = document.createElement('div');
        
        // Get piece symbol
        const pieceSymbol = PIECE_SYMBOLS[piece.color + piece.type];
        if (!pieceSymbol) {
          log(`Unknown piece symbol for ${piece.color}${piece.type}`);
          continue;
        }
        
        // Flip board for black players
        let renderX = myColor === BLACK ? 7 - x : x;
        let renderY = myColor === BLACK ? 7 - y : y;
        
        pieceEl.textContent = pieceSymbol;
        pieceEl.style.position = 'absolute';
        pieceEl.style.width = SQUARE_SIZE + 'px';
        pieceEl.style.height = SQUARE_SIZE + 'px';
        pieceEl.style.left = (renderX * SQUARE_SIZE) + 'px';
        pieceEl.style.top = (renderY * SQUARE_SIZE) + 'px';
        pieceEl.style.display = 'flex';
        pieceEl.style.justifyContent = 'center';
        pieceEl.style.alignItems = 'center';
        pieceEl.style.fontSize = '40px';
        pieceEl.style.color = piece.color === WHITE ? 'white' : 'black';
        pieceEl.style.textShadow = piece.color === WHITE ? '0 0 2px black' : '0 0 2px white';
        pieceEl.style.zIndex = '10';
        pieceEl.style.cursor = piece.color === myColor && chessGame.turn() === myColor ? 'grab' : 'default';
        pieceEl.style.userSelect = 'none';
        pieceEl.style.transition = 'transform 0.1s ease-in-out'; // Add smooth transition
        
        // Add hover effect for own pieces during turn
        if (piece.color === myColor && chessGame.turn() === myColor) {
          pieceEl.style.transform = 'scale(1)';
          pieceEl.onmouseover = () => { pieceEl.style.transform = 'scale(1.1)'; };
          pieceEl.onmouseout = () => { pieceEl.style.transform = 'scale(1)'; };
        }
        
        // Make pieces easier to see
        pieceEl.style.fontWeight = 'bold';
        
        // Store logical coordinates
        pieceEl.dataset.x = x;
        pieceEl.dataset.y = y;
        
        // Add click handler
        pieceEl.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent square click from triggering
          const x = parseInt(pieceEl.dataset.x);
          const y = parseInt(pieceEl.dataset.y);
          handlePieceClick(x, y);
        });
        
        // Add touch handlers for mobile
        pieceEl.addEventListener('touchstart', (e) => {
          // Only process if it's our turn and our piece
          if (piece.color === myColor && chessGame.turn() === myColor) {
            e.preventDefault(); // Prevent scrolling
            const x = parseInt(pieceEl.dataset.x);
            const y = parseInt(pieceEl.dataset.y);
            selectPiece(x, y);
          }
        });
        
        chessBoard.appendChild(pieceEl);
        chessPieces.push(pieceEl);
      }
    }
  }
  
  // Enable drag and drop after creating all pieces
  enableDragAndDrop();
  
  // Update status message
  if (!statusEl) return;
  
  if (chessGame.in_checkmate()) {
    const winner = chessGame.turn() === WHITE ? 'Black' : 'White';
    statusEl.textContent = `Checkmate! ${winner} wins!`;
    statusEl.classList.remove('your-turn');
    gameStarted = false;
  } else if (chessGame.in_draw()) {
    statusEl.textContent = 'Game ended in draw!';
    statusEl.classList.remove('your-turn');
    gameStarted = false;
  } else if (chessGame.in_stalemate()) {
    statusEl.textContent = 'Game ended in stalemate!';
    statusEl.classList.remove('your-turn');
    gameStarted = false;
  } else if (chessGame.in_check()) {
    const isMyTurn = chessGame.turn() === myColor;
    const currentColor = chessGame.turn() === WHITE ? 'White' : 'Black';
    statusEl.textContent = `${currentColor} is in check! ${isMyTurn ? 'Your turn' : "Opponent's turn"}`;
    if (isMyTurn) {
      statusEl.classList.add('your-turn');
    } else {
      statusEl.classList.remove('your-turn');
    }
  } else if (gameStarted) {
    const isMyTurn = chessGame.turn() === myColor;
    const currentColor = chessGame.turn() === WHITE ? 'White' : 'Black';
    statusEl.textContent = `${currentColor}'s turn - ${isMyTurn ? 'Your move' : "Waiting for opponent"}`;
    if (isMyTurn) {
      statusEl.classList.add('your-turn');
    } else {
      statusEl.classList.remove('your-turn');
    }
  }
}

// Call init function when page is loaded
window.addEventListener('load', init);
