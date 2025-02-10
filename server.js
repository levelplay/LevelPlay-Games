const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Serve static files from public directory
app.use(express.static('public'));

const waitingPlayers = new Set();
const games = new Map();

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Handle player matchmaking
    if (waitingPlayers.size === 0) {
        waitingPlayers.add(socket.id);
        socket.emit('waiting');
        socket.playerNumber = 0;
    } else {
        const opponent = Array.from(waitingPlayers)[0];
        waitingPlayers.delete(opponent);
        
        const gameId = `${opponent}-${socket.id}`;
        games.set(gameId, {
            players: [opponent, socket.id],
            currentPlayer: 0
        });
        
        socket.join(gameId);
        io.sockets.sockets.get(opponent)?.join(gameId);
        
        io.to(opponent).emit('gameStart', 0);
        socket.emit('gameStart', 1);
        socket.playerNumber = 1;
    }

    // Handle disc movement sync
    socket.on('discMove', (data) => {
        const game = findGameByPlayer(socket.id);
        if (game) {
            socket.to(game).emit('discUpdate', data);
        }
    });

    // Handle turn switching
    socket.on('turnEnd', () => {
        const game = findGameByPlayer(socket.id);
        if (game) {
            socket.to(game).emit('turnSwitch');
        }
    });

    // Handle disconnections
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        waitingPlayers.delete(socket.id);
        const game = findGameByPlayer(socket.id);
        if (game) {
            socket.to(game).emit('opponentLeft');
            games.delete(game);
        }
    });

    function findGameByPlayer(playerId) {
        for (const [gameId, game] of games.entries()) {
            if (game.players.includes(playerId)) {
                return gameId;
            }
        }
        return null;
    }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));