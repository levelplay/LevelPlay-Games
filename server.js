// server.js - WebSocket server for Stack Game multiplayer
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store game rooms
const gameRooms = new Map();

// Handle WebSocket connections
wss.on('connection', (ws) => {
    let clientId = null;
    let roomId = null;

    // Handle messages from clients
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Send immediate acknowledgment to improve responsiveness
            if (data.type === 'create' || data.type === 'join') {
                try {
                    ws.send(JSON.stringify({
                        type: 'ack',
                        requestType: data.type
                    }));
                } catch (e) {
                    // Silently handle error
                }
            }

            switch (data.type) {
                case 'create':
                    handleCreateGame(ws, data);
                    break;
                case 'join':
                    handleJoinGame(ws, data);
                    break;
                case 'start':
                    handleStartGame(data);
                    break;
                case 'place':
                    handlePlaceBlock(data);
                    break;
                case 'reset':
                    handleResetGame(data);
                    break;
                case 'rematchRequest':
                    handleRematchRequest(data, ws);
                    break;
                case 'rematchAccepted':
                    handleRematchAccepted(data);
                    break;
                case 'rematchDeclined':
                    handleRematchDeclined(data);
                    break;
                case 'playerQuit':
                    handlePlayerQuit(data, ws);
                    break;
                case 'ping':
                    // Reply to ping with pong to keep connections alive
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (error) {
            // Try to send error to client
            try {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Server error processing message'
                }));
            } catch (e) {
                // Silently handle error
            }
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        if (roomId && gameRooms.has(roomId)) {
            const room = gameRooms.get(roomId);
            
            // Find player index
            const playerIndex = Object.values(room.players).findIndex(
                player => player.ws === ws
            );
            
            // Remove client from the room
            if (room.players[clientId]) {
                delete room.players[clientId];
            }
            
            // Notify other players that this player left
            broadcastToRoom(roomId, {
                type: 'playerLeft',
                playerId: clientId,
                playerIndex: playerIndex
            }, null);
            
            // If room is empty, remove it
            if (Object.keys(room.players).length === 0) {
                gameRooms.delete(roomId);
            } else {
                // Otherwise, set status to waiting if game was in progress
                if (room.status === 'started') {
                    room.status = 'waiting';
                }
            }
        }
    });

    // Handle create game request
    function handleCreateGame(ws, data) {
        // Generate unique IDs
        clientId = uuidv4();
        roomId = uuidv4().substring(0, 6).toUpperCase(); // Shorter, uppercase room codes
        
        // Create new game room
        gameRooms.set(roomId, {
            status: 'waiting',
            players: {
                [clientId]: {
                    ws,
                    index: 0 // Host is player 0
                }
            },
            gameState: null,
            created: new Date(),
            lastActivity: new Date()
        });
        
        // Associate client with this room
        ws.roomId = roomId;
        ws.clientId = clientId;
        
        // Send room creation confirmation
        ws.send(JSON.stringify({
            type: 'created',
            roomId,
            clientId,
            playerIndex: 0
        }));
    }

    // Handle join game request
    function handleJoinGame(ws, data) {
        const { roomId: joinRoomId } = data;
        
        // Try to find the room (case-insensitive)
        let foundRoomId = null;
        
        if (gameRooms.has(joinRoomId)) {
            foundRoomId = joinRoomId;
        } else {
            // Try case-insensitive search
            for (const [key, room] of gameRooms.entries()) {
                if (key.toLowerCase() === joinRoomId.toLowerCase()) {
                    foundRoomId = key;
                    break;
                }
            }
        }
        
        // Check if room exists
        if (!foundRoomId) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Game not found'
            }));
            return;
        }
        
        const room = gameRooms.get(foundRoomId);
        
        // Check if game already started
        if (room.status === 'started') {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Game already started'
            }));
            return;
        }
        
        // Check if room is full
        if (Object.keys(room.players).length >= 2) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Game full'
            }));
            return;
        }
        
        // Add player to room
        clientId = uuidv4();
        roomId = foundRoomId;
        
        room.players[clientId] = {
            ws,
            index: 1 // Joining player is player 1
        };
        
        // Update room activity
        room.lastActivity = new Date();
        
        // Associate client with this room
        ws.roomId = roomId;
        ws.clientId = clientId;
        
        // Notify host that a player joined
        const hostId = Object.keys(room.players).find(id => room.players[id].index === 0);
        if (hostId) {
            room.players[hostId].ws.send(JSON.stringify({
                type: 'playerJoined',
                playerId: clientId
            }));
        }
        
        // Send join confirmation to client
        ws.send(JSON.stringify({
            type: 'joined',
            roomId,
            clientId,
            playerIndex: 1,
            hostName: 'Player 1'
        }));
    }

    // Handle game start request
    function handleStartGame(data) {
        const { roomId } = data;
        
        if (!gameRooms.has(roomId)) {
            return;
        }
        
        const room = gameRooms.get(roomId);
        room.status = 'started';
        room.lastActivity = new Date();
        
        // Initialize game state
        room.gameState = {
            movingBlock: {
                x: 400,
                y: 500,
                width: 200,
                height: 40,
                direction: 1,
                speed: 8
            },
            stackedBlocks: [{
                x: 400,
                y: 540,
                width: 200,
                height: 40,
                color: '#00ff00'
            }],
            players: Object.entries(room.players).map(([id, player]) => ({
                id,
                name: player.index === 0 ? "Player 1" : "Player 2",
                score: 0,
                color: player.index === 0 ? '#3498db' : '#e74c3c',
                connected: true
            })),
            currentPlayer: 0,
            gameOver: false,
            roundWinner: null,
            camera: { targetY: 0 }
        };
        
        // Notify all players that game started
        broadcastToRoom(roomId, {
            type: 'gameStarted',
            gameState: room.gameState
        }, null);
    }

    // Handle block placement
    function handlePlaceBlock(data) {
        const { roomId, gameState } = data;
        
        if (!gameRooms.has(roomId)) {
            return;
        }
        
        const room = gameRooms.get(roomId);
        
        // Update game state
        room.gameState = gameState;
        room.lastActivity = new Date();
        
        // If game is over, update room status but keep room alive for rematch
        if (gameState.gameOver) {
            room.status = 'ended';
        }
        
        // Broadcast updated game state to all players
        broadcastToRoom(roomId, {
            type: 'gameStateUpdated',
            gameState
        }, null);
    }

    // Handle game reset
    function handleResetGame(data) {
        const { roomId } = data;
        
        if (!gameRooms.has(roomId)) {
            return;
        }
        
        const room = gameRooms.get(roomId);
        room.lastActivity = new Date();
        
        // Reset game state
        room.gameState = {
            movingBlock: {
                x: 400,
                y: 500,
                width: 200,
                height: 40,
                direction: 1,
                speed: 8
            },
            stackedBlocks: [{
                x: 400,
                y: 540,
                width: 200,
                height: 40,
                color: '#00ff00'
            }],
            players: room.gameState.players.map(player => ({
                ...player,
                score: 0
            })),
            currentPlayer: 0,
            gameOver: false,
            roundWinner: null,
            camera: { targetY: 0 }
        };
        
        // Set game as started
        room.status = 'started';
        
        // Notify all players about game reset
        broadcastToRoom(roomId, {
            type: 'gameReset',
            gameState: room.gameState
        }, null);
    }
    
    // Handle rematch request
    function handleRematchRequest(data, senderWs) {
        const { roomId, senderId } = data;
        
        // Find room (case-insensitive search)
        let foundRoomId = findRoom(roomId);
        
        if (!foundRoomId) {
            senderWs.send(JSON.stringify({
                type: 'error',
                message: 'Game room not found for rematch'
            }));
            return;
        }
        
        processRematchInRoom(foundRoomId, senderId, senderWs);
    }
    
    // Find room by ID (case-insensitive)
    function findRoom(roomId) {
        if (gameRooms.has(roomId)) {
            return roomId;
        }
        
        // Try case-insensitive match
        for (const [key, room] of gameRooms.entries()) {
            if (key.toLowerCase() === roomId.toLowerCase()) {
                return key;
            }
        }
        
        return null;
    }
    
    // Helper function to process rematch within a found room
    function processRematchInRoom(roomId, senderId, senderWs) {
        const room = gameRooms.get(roomId);
        room.lastActivity = new Date();
        
        // Find opponent
        const opponentId = Object.keys(room.players).find(id => id !== senderId);
        
        if (!opponentId) {
            senderWs.send(JSON.stringify({
                type: 'rematchDeclined',
                reason: 'Opponent not found'
            }));
            return;
        }
        
        const opponent = room.players[opponentId];
        
        if (!opponent || !opponent.ws || opponent.ws.readyState !== WebSocket.OPEN) {
            senderWs.send(JSON.stringify({
                type: 'rematchDeclined',
                reason: 'Opponent disconnected'
            }));
            return;
        }
        
        // Send rematch request to opponent
        opponent.ws.send(JSON.stringify({
            type: 'rematchRequest',
            senderId: senderId
        }));
    }
    
    // Handle rematch accepted
    function handleRematchAccepted(data) {
        const { roomId, senderId } = data;
        
        const foundRoomId = findRoom(roomId);
        if (!foundRoomId) {
            return;
        }
        
        const room = gameRooms.get(foundRoomId);
        room.lastActivity = new Date();
        
        // Find opponent
        const opponentId = Object.keys(room.players).find(id => id !== senderId);
        
        if (opponentId && room.players[opponentId] && room.players[opponentId].ws) {
            // Notify opponent that rematch was accepted
            room.players[opponentId].ws.send(JSON.stringify({
                type: 'rematchAccepted',
                senderId
            }));
            
            // Set game as started again
            room.status = 'started';
            
            // Reset game state (send the reset message from server)
            handleResetGame({ roomId: foundRoomId });
        }
    }
    
    // Handle rematch declined
    function handleRematchDeclined(data) {
        const { roomId, senderId } = data;
        
        const foundRoomId = findRoom(roomId);
        if (!foundRoomId) {
            return;
        }
        
        const room = gameRooms.get(foundRoomId);
        room.lastActivity = new Date();
        
        // Find opponent
        const opponentId = Object.keys(room.players).find(id => id !== senderId);
        
        if (opponentId && room.players[opponentId] && room.players[opponentId].ws) {
            // Notify opponent that rematch was declined
            room.players[opponentId].ws.send(JSON.stringify({
                type: 'rematchDeclined',
                senderId
            }));
            
            // Reset room to waiting state
            room.status = 'waiting';
        }
    }
    
    // Handle player quit
    function handlePlayerQuit(data, senderWs) {
        const { roomId, senderId } = data;
        
        const foundRoomId = findRoom(roomId);
        if (!foundRoomId) {
            return;
        }
        
        const room = gameRooms.get(foundRoomId);
        
        // Find opponent
        const opponentId = Object.keys(room.players).find(id => id !== senderId);
        
        if (opponentId && room.players[opponentId] && room.players[opponentId].ws) {
            // Notify opponent that player quit
            room.players[opponentId].ws.send(JSON.stringify({
                type: 'playerQuit',
                senderId
            }));
        }
        
        // Remove sender from the room
        if (room.players[senderId]) {
            delete room.players[senderId];
        }
        
        // Reset room to waiting state or delete if empty
        if (Object.keys(room.players).length > 0) {
            room.status = 'waiting';
            room.lastActivity = new Date();
        } else {
            gameRooms.delete(foundRoomId);
        }
    }

    // Broadcast message to all clients in a room except the sender
    function broadcastToRoom(roomId, message, excludeWs) {
        if (gameRooms.has(roomId)) {
            const room = gameRooms.get(roomId);
            
            Object.values(room.players).forEach(player => {
                if (player.ws !== excludeWs && player.ws.readyState === WebSocket.OPEN) {
                    try {
                        player.ws.send(JSON.stringify(message));
                    } catch (e) {
                        // Silently handle error
                    }
                }
            });
        }
    }
});

// Clean up abandoned rooms periodically
setInterval(() => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000)); // 2 hours
    
    for (const [roomId, room] of gameRooms.entries()) {
        if (room.lastActivity < twoHoursAgo) {
            // Room inactive for 2 hours, remove it
            gameRooms.delete(roomId);
        }
    }
}, 30 * 60 * 1000); // Run every 30 minutes

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        rooms: gameRooms.size
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Server started on port ${port}`);
});