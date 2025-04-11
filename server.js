const express = require('express');
const path = require('path');
const { ExpressPeerServer } = require('peer');
const http = require('http');
const fs = require('fs');
const cors = require('cors');

// Create Express app
const app = express();
const server = http.createServer(app);

// Create public directory if it doesn't exist
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Create sounds directory if it doesn't exist
const soundsDir = path.join(publicDir, 'sounds');
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

// Create simple sound files if they don't exist
createSimpleSoundFiles();

// Enable CORS for all routes - more permissive configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept'],
  credentials: true
}));

// Add options handling for preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.sendStatus(200);
});

// Serve static files from the public directory
app.use(express.static(publicDir));

// Set up PeerJS server with better configuration
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs',
  proxied: true,
  allow_discovery: true,
  alive_timeout: 60000, // 1 minute timeout
  key: 'chessgame', // Optional custom key
  ssl: {} // Empty SSL config for HTTP (update for HTTPS)
});

// Use PeerJS server
app.use('/peerjs', peerServer);

// Store active rooms
const activeRooms = new Map();

// Track connected clients
const connectedClients = new Map();

// Enable JSON body parsing
app.use(express.json());

// Handle room tracking
peerServer.on('connection', (client) => {
  const clientId = client.getId();
  console.log(`Client connected: ${clientId}`);
  connectedClients.set(clientId, { connected: true, timestamp: Date.now() });
});

peerServer.on('disconnect', (client) => {
  const clientId = client.getId();
  console.log(`Client disconnected: ${clientId}`);
  
  // Mark client as disconnected
  if (connectedClients.has(clientId)) {
    const clientData = connectedClients.get(clientId);
    clientData.connected = false;
    clientData.disconnectTime = Date.now();
  }
  
  // Clean up any rooms this client was hosting
  for (const [roomCode, roomData] of activeRooms.entries()) {
    if (roomData.hostPeerId === clientId) {
      console.log(`Host disconnected from room ${roomCode}, marking as inactive`);
      roomData.active = false;
      roomData.closedAt = Date.now();
    }
  }
});

// Add a simple heartbeat endpoint to check if server is alive
app.get('/api/heartbeat', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.json({ status: 'ok', timestamp: Date.now() });
});

// API endpoint to create a new room code
app.post('/api/create-room', (req, res) => {
  const { peerId } = req.body;
  
  if (!peerId) {
    return res.status(400).json({ error: 'Missing peerId' });
  }
  
  if (typeof peerId !== 'string' || peerId.length < 4) {
    return res.status(400).json({ error: 'Invalid peerId format' });
  }
  
  // Generate a unique room code
  let roomCode;
  do {
    roomCode = generateRoomCode();
  } while (activeRooms.has(roomCode));
  
  // Store room information
  activeRooms.set(roomCode, {
    hostPeerId: peerId,
    active: true,
    createdAt: Date.now(),
    players: [peerId],
    lastActivity: Date.now() // Add tracking of last activity
  });
  
  console.log(`New room created: ${roomCode} by peer ${peerId}`);
  res.json({ roomCode });
});

// API endpoint to join a room
app.post('/api/join-room', (req, res) => {
  const { roomCode, peerId } = req.body;
  
  if (!roomCode || !peerId) {
    return res.status(400).json({ error: 'Missing roomCode or peerId' });
  }
  
  if (typeof peerId !== 'string' || peerId.length < 4) {
    return res.status(400).json({ error: 'Invalid peerId format' });
  }
  
  const room = activeRooms.get(roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  if (!room.active) {
    return res.status(410).json({ error: 'Room is no longer active' });
  }
  
  if (room.players.length >= 2) {
    return res.status(403).json({ error: 'Room is full' });
  }
  
  // Update last activity time
  room.lastActivity = Date.now();
  
  // Add the second player to the room
  room.players.push(peerId);
  console.log(`Peer ${peerId} joined room ${roomCode}`);
  
  // Return the host's peer ID so the joiner can connect
  res.json({ hostPeerId: room.hostPeerId });
});

// API endpoint to get room information
app.get('/api/room/:roomCode', (req, res) => {
  const { roomCode } = req.params;
  
  const room = activeRooms.get(roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  // Check if host is still connected
  const hostConnected = connectedClients.has(room.hostPeerId) && 
                        connectedClients.get(room.hostPeerId).connected;
  
  // Return room info without exposing sensitive details
  res.json({
    active: room.active,
    playerCount: room.players.length,
    hostConnected: hostConnected,
    lastActivity: room.lastActivity
  });
});

// API endpoint to update room activity
app.post('/api/room/:roomCode/ping', (req, res) => {
  const { roomCode } = req.params;
  const room = activeRooms.get(roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  // Update last activity timestamp
  room.lastActivity = Date.now();
  res.json({ status: 'ok' });
});

// API endpoint to get all active rooms (for debugging)
app.get('/api/rooms', (req, res) => {
  // Only enable in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Forbidden in production' });
  }
  
  const roomsInfo = {};
  for (const [code, data] of activeRooms.entries()) {
    if (data.active) {
      roomsInfo[code] = {
        playerCount: data.players.length,
        createdAt: data.createdAt,
        lastActivity: data.lastActivity
      };
    }
  }
  
  res.json(roomsInfo);
});

// API endpoint for server status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    activeRooms: Array.from(activeRooms.values()).filter(r => r.active).length,
    connectedClients: Array.from(connectedClients.values()).filter(c => c.connected).length,
    uptime: process.uptime()
  });
});

// Generate a random room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous characters
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Clean up inactive rooms periodically
setInterval(() => {
  const now = Date.now();
  const expireTime = 24 * 60 * 60 * 1000; // 24 hours
  const inactivityTime = 2 * 60 * 60 * 1000; // 2 hours
  
  for (const [roomCode, roomData] of activeRooms.entries()) {
    // Remove closed rooms after expireTime
    if (!roomData.active && (now - roomData.closedAt > expireTime)) {
      activeRooms.delete(roomCode);
      console.log(`Removed inactive room ${roomCode}`);
    }
    
    // Mark rooms as inactive if no activity for inactivityTime
    if (roomData.active && (now - roomData.lastActivity > inactivityTime)) {
      roomData.active = false;
      roomData.closedAt = now;
      console.log(`Marked room ${roomCode} as inactive due to inactivity`);
    }
  }
  
  // Also clean up disconnected clients data
  for (const [clientId, clientData] of connectedClients.entries()) {
    if (!clientData.connected && (now - clientData.disconnectTime > expireTime)) {
      connectedClients.delete(clientId);
    }
  }
}, 3600000); // Run every hour

// Create simple sound files
function createSimpleSoundFiles() {
  // Create simple empty MP3 files if they don't exist
  const soundFiles = ['move.mp3', 'capture.mp3', 'check.mp3'];
  
  // Minimal MP3 header data - not a real MP3 but browser will accept it
  const minimalMp3 = Buffer.from([
    0xFF, 0xFB, 0x90, 0x44, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ]);
  
  soundFiles.forEach(file => {
    const filePath = path.join(soundsDir, file);
    if (!fs.existsSync(filePath)) {
      try {
        fs.writeFileSync(filePath, minimalMp3);
        console.log(`Created placeholder sound file: ${file}`);
      } catch (err) {
        console.error(`Error creating sound file ${file}:`, err);
      }
    }
  });
}

// Route all other requests to index.html (for SPA-like behavior)
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`PeerJS server running on http://localhost:${PORT}/peerjs`);
});
