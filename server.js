const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store active game rooms
const gameRooms = {};

// Generate a unique room code (using UUID and taking first part)
function generateRoomCode() {
  return uuidv4().substring(0, 6).toUpperCase();
}

// Initialize a new game board
function initializeBoard() {
  return Array(3).fill(null).map(() => Array(3).fill(null));
}

// Check for a winner
function checkWinner(board) {
  const boardSize = 3;
  
  // Check rows, columns, and diagonals
  for (let i = 0; i < boardSize; i++) {
    // Check rows
    if (board[i][0] && board[i].every(cell => cell === board[i][0])) {
      return {
        winner: board[i][0],
        combination: [[i, 0], [i, 1], [i, 2]]
      };
    }

    // Check columns
    if (board[0][i] && board.every(row => row[i] === board[0][i])) {
      return {
        winner: board[0][i],
        combination: [[0, i], [1, i], [2, i]]
      };
    }
  }

  // Check diagonals
  if (board[0][0] && board.every((_, i) => board[i][i] === board[0][0])) {
    return {
      winner: board[0][0],
      combination: [[0, 0], [1, 1], [2, 2]]
    };
  }

  if (board[0][2] && board.every((_, i) => board[i][2 - i] === board[0][2])) {
    return {
      winner: board[0][2],
      combination: [[0, 2], [1, 1], [2, 0]]
    };
  }

  // Check for draw
  if (board.flat().every(cell => cell !== null)) {
    return { winner: 'Draw', combination: [] };
  }

  return { winner: null, combination: [] };
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Create a new game room
  socket.on('createRoom', () => {
    // Generate a unique room code
    let roomCode;
    do {
      roomCode = generateRoomCode();
    } while (gameRooms[roomCode]);
    
    // Create the room
    gameRooms[roomCode] = {
      board: initializeBoard(),
      currentPlayer: 'X',
      players: {
        X: {
          id: socket.id
        },
        O: null
      },
      scores: { X: 0, O: 0 },
      gameActive: false,
      rematchRequested: false
    };
    
    // Join the room
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    // Notify the client
    socket.emit('roomCreated', {
      roomCode,
      boardState: gameRooms[roomCode].board,
      currentPlayer: gameRooms[roomCode].currentPlayer
    });
    
    console.log(`Room created: ${roomCode}`);
  });

  // Join an existing game
  socket.on('joinRoom', (data) => {
    const { roomCode } = data;
    
    // Verify the room exists
    if (!gameRooms[roomCode]) {
      socket.emit('roomError', { message: 'Room does not exist' });
      return;
    }
    
    // Verify the room is not full
    if (gameRooms[roomCode].players.O) {
      socket.emit('roomError', { message: 'Room is full' });
      return;
    }
    
    // Join the room
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    // Assign as O player
    gameRooms[roomCode].players.O = {
      id: socket.id
    };
    
    // Mark game as active
    gameRooms[roomCode].gameActive = true;
    
    // Notify this player they've joined
    socket.emit('joinedRoom', {
      roomCode,
      boardState: gameRooms[roomCode].board,
      currentPlayer: gameRooms[roomCode].currentPlayer,
      scores: gameRooms[roomCode].scores
    });
    
    // Notify the X player that O has joined
    if (gameRooms[roomCode].players.X) {
      io.to(gameRooms[roomCode].players.X.id).emit('playerJoined');
    }
    
    console.log(`Player joined room ${roomCode}`);
  });

  // Handle player moves
  socket.on('makeMove', (data) => {
    const { roomCode, player, row, col } = data;
    
    if (!gameRooms[roomCode]) return;
    
    const room = gameRooms[roomCode];
    
    // Verify it's the player's turn and the game is active
    if (room.currentPlayer !== player || !room.gameActive) return;
    
    // Verify the cell is empty
    if (room.board[row][col]) return;
    
    // Make the move
    room.board[row][col] = player;
    
    // Check for a winner
    const result = checkWinner(room.board);
    
    if (result.winner) {
      // Update scores if there's a winner
      if (result.winner !== 'Draw') {
        room.scores[result.winner]++;
      }
      
      // Notify all clients in the room about the game result
      io.to(roomCode).emit('gameOver', {
        result: result.winner,
        boardState: room.board,
        winnerCombination: result.combination,
        scores: room.scores
      });
      
      // Mark the game as inactive until a rematch is accepted
      room.gameActive = false;
    } else {
      // Switch players
      room.currentPlayer = room.currentPlayer === 'X' ? 'O' : 'X';
      
      // Update all clients with the new board state
      io.to(roomCode).emit('updateBoard', {
        boardState: room.board,
        currentPlayer: room.currentPlayer
      });
    }
  });

  // Handle timer timeout
  socket.on('timeOut', (data) => {
    const { roomCode } = data;
    
    if (!gameRooms[roomCode] || !gameRooms[roomCode].gameActive) return;
    
    const room = gameRooms[roomCode];
    
    // Notify all clients about the timeout
    io.to(roomCode).emit('gameOver', {
      result: 'Timeout',
      message: 'Time expired - No winner',
      boardState: room.board,
      winnerCombination: [],
      scores: room.scores
    });
    
    // Mark the game as inactive until a rematch is accepted
    room.gameActive = false;
  });

  // Request a rematch
  socket.on('requestRematch', (data) => {
    const { roomCode } = data;
    
    if (!gameRooms[roomCode]) return;
    
    const room = gameRooms[roomCode];
    room.rematchRequested = true;
    
    // Determine the opponent's socket ID
    let opponentId;
    if (room.players.X && room.players.X.id === socket.id && room.players.O) {
      opponentId = room.players.O.id;
    } else if (room.players.O && room.players.O.id === socket.id && room.players.X) {
      opponentId = room.players.X.id;
    }
    
    // Send rematch request to opponent
    if (opponentId) {
      io.to(opponentId).emit('rematchRequested');
    }
  });
  
  // Accept a rematch
  socket.on('acceptRematch', (data) => {
    const { roomCode } = data;
    
    if (!gameRooms[roomCode] || !gameRooms[roomCode].rematchRequested) return;
    
    const room = gameRooms[roomCode];
    
    // Reset the game state
    room.board = initializeBoard();
    room.currentPlayer = 'X';
    room.gameActive = true;
    room.rematchRequested = false;
    
    // Notify all clients about the rematch
    io.to(roomCode).emit('rematchAccepted');
    io.to(roomCode).emit('gameRestarted', {
      boardState: room.board,
      currentPlayer: room.currentPlayer
    });
  });
  
  // Decline a rematch
  socket.on('declineRematch', (data) => {
    const { roomCode } = data;
    
    if (!gameRooms[roomCode] || !gameRooms[roomCode].rematchRequested) return;
    
    const room = gameRooms[roomCode];
    
    // Determine who requested the rematch
    let requesterId;
    if (room.players.X && room.players.X.id !== socket.id) {
      requesterId = room.players.X.id;
    } else if (room.players.O && room.players.O.id !== socket.id) {
      requesterId = room.players.O.id;
    }
    
    // Notify the requester that the rematch was declined
    if (requesterId) {
      io.to(requesterId).emit('rematchDeclined');
    }
    
    // Clean up the room
    delete gameRooms[roomCode];
  });
  
  // Quit the game
  socket.on('quitGame', (data) => {
    const { roomCode } = data;
    
    if (!gameRooms[roomCode]) return;
    
    const room = gameRooms[roomCode];
    
    // Determine the opponent's ID
    let opponentId;
    if (room.players.X && room.players.X.id === socket.id && room.players.O) {
      opponentId = room.players.O.id;
    } else if (room.players.O && room.players.O.id === socket.id && room.players.X) {
      opponentId = room.players.X.id;
    }
    
    // Notify the opponent
    if (opponentId) {
      io.to(opponentId).emit('opponentQuit');
    }
    
    // Clean up the room
    delete gameRooms[roomCode];
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Check if the player was in a room
    const roomCode = socket.roomCode;
    if (roomCode && gameRooms[roomCode]) {
      const room = gameRooms[roomCode];
      
      // Check if player was X or O
      if (room.players.X && room.players.X.id === socket.id) {
        // X disconnected - notify O
        if (room.players.O) {
          io.to(room.players.O.id).emit('opponentQuit');
        }
        
        // Clean up the room
        delete gameRooms[roomCode];
      } else if (room.players.O && room.players.O.id === socket.id) {
        // O disconnected - notify X
        if (room.players.X) {
          io.to(room.players.X.id).emit('opponentQuit');
        }
        
        // Clean up the room
        delete gameRooms[roomCode];
      }
    }
  });
});

// Serve static files from the current directory
app.use(express.static('./'));

// Default route to serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser to play the game`);
});