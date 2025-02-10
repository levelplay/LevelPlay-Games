// server.js
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static('public'));

// Game state management
const games = new Map();
const clients = new Map();

// Game class to manage individual game states
class Game {
    constructor(id) {
        this.id = id;
        this.players = [];
        this.state = {
            balls: [],
            cueBall: null,
            player1Balls: [],
            player2Balls: [],
            currentPlayer: 1,
            extraTurns: 0
        };
        this.isActive = true;
    }

    addPlayer(playerId, ws) {
        if (this.players.length < 2) {
            this.players.push({
                id: playerId,
                ws: ws,
                number: this.players.length + 1
            });
            return true;
        }
        return false;
    }

    removePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        if (this.players.length === 0) {
            this.isActive = false;
        }
    }

    broadcast(message, excludePlayerId = null) {
        this.players.forEach(player => {
            if (player.id !== excludePlayerId && player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }

    updateState(newState) {
        this.state = { ...this.state, ...newState };
        this.broadcast({
            type: 'gameState',
            state: this.state
        });
    }
}

// Client message handlers
const messageHandlers = {
    createGame: (ws, data) => {
        const gameId = uuidv4();
        const playerId = uuidv4();
        const game = new Game(gameId);
        
        games.set(gameId, game);
        game.addPlayer(playerId, ws);
        clients.set(ws, { gameId, playerId });
        
        ws.send(JSON.stringify({
            type: 'gameCreated',
            gameId: gameId,
            playerId: playerId
        }));
    },

    joinGame: (ws, data) => {
        const game = games.get(data.gameId);
        if (!game) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Game not found'
            }));
            return;
        }

        const playerId = uuidv4();
        if (game.addPlayer(playerId, ws)) {
            clients.set(ws, { gameId: data.gameId, playerId });
            
            // Notify all players
            game.broadcast({
                type: 'gameJoined',
                players: game.players.map(p => p.id)
            });
            
            // Start the game if we have two players
            if (game.players.length === 2) {
                game.broadcast({
                    type: 'gameStart',
                    firstPlayer: game.players[0].id
                });
            }
        } else {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Game is full'
            }));
        }
    },

    playerMove: (ws, data) => {
        const clientData = clients.get(ws);
        const game = games.get(data.gameId);
        
        if (game && clientData) {
            game.broadcast({
                type: 'playerMove',
                playerId: clientData.playerId,
                move: data.move
            }, clientData.playerId);
        }
    },

    gameState: (ws, data) => {
        const clientData = clients.get(ws);
        const game = games.get(data.gameId);
        
        if (game && clientData) {
            game.updateState(data.state);
        }
    }
};

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const handler = messageHandlers[data.type];
            
            if (handler) {
                handler(ws, data);
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });

    ws.on('close', () => {
        const clientData = clients.get(ws);
        if (clientData) {
            const game = games.get(clientData.gameId);
            if (game) {
                game.removePlayer(clientData.playerId);
                game.broadcast({
                    type: 'playerDisconnected',
                    playerId: clientData.playerId
                });
                
                // Clean up inactive games
                if (!game.isActive) {
                    games.delete(clientData.gameId);
                }
            }
            clients.delete(ws);
        }
    });
});

// Periodic cleanup of inactive games
setInterval(() => {
    for (const [gameId, game] of games.entries()) {
        if (!game.isActive) {
            games.delete(gameId);
        }
    }
}, 60000); // Clean up every minute

// Error handling
wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server...');
    wss.close(() => {
        console.log('WebSocket server closed');
        server.close(() => {
            console.log('HTTP server closed');
            process.exit(0);
        });
    });
});