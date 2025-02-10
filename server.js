// server.js
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.static('public'));

const PADDLE_SPEED = 7;
const BALL_SPEED = 5;
const UPDATE_RATE = 16; // ~60fps

class GameState {
    constructor(player1, player2) {
        this.players = [player1, player2];
        this.ballX = 400;
        this.ballY = 300;
        this.ballVelocityX = BALL_SPEED;
        this.ballVelocityY = 0;
        this.leftPaddleY = 300;
        this.rightPaddleY = 300;
        this.scores = { left: 0, right: 0 };
        this.winner = null;
        this.lastUpdate = Date.now();
    }

    update() {
        if (this.winner) return;

        const now = Date.now();
        const deltaTime = (now - this.lastUpdate) / 16; // Normalize to 60fps
        this.lastUpdate = now;

        // Update ball position with delta time
        this.ballX += this.ballVelocityX * deltaTime;
        this.ballY += this.ballVelocityY * deltaTime;

        // Ball collision with top and bottom walls
        if (this.ballY <= 10 || this.ballY >= 590) {
            this.ballVelocityY *= -1;
            this.ballY = this.ballY <= 10 ? 10 : 590;
        }

        // Ball collision with paddles
        this.checkPaddleCollision();

        // Scoring
        if (this.ballX < 0) {
            this.scores.right++;
            this.resetBall('right');
        } else if (this.ballX > 800) {
            this.scores.left++;
            this.resetBall('left');
        }

        // Check for winner
        if (this.scores.left >= 10) {
            this.winner = 'PLAYER 1';
        } else if (this.scores.right >= 10) {
            this.winner = 'PLAYER 2';
        }
    }

    checkPaddleCollision() {
        // Left paddle collision
        if (this.ballX <= 65 && this.ballX >= 35 &&
            this.ballY >= this.leftPaddleY - 50 && this.ballY <= this.leftPaddleY + 50) {
            const relativeIntersectY = (this.leftPaddleY - this.ballY) / 50;
            const bounceAngle = relativeIntersectY * 0.75;
            this.ballVelocityX = BALL_SPEED * Math.cos(bounceAngle);
            this.ballVelocityY = BALL_SPEED * -Math.sin(bounceAngle);
            this.ballX = 66;
            return true;
        }

        // Right paddle collision
        if (this.ballX >= 735 && this.ballX <= 765 &&
            this.ballY >= this.rightPaddleY - 50 && this.ballY <= this.rightPaddleY + 50) {
            const relativeIntersectY = (this.rightPaddleY - this.ballY) / 50;
            const bounceAngle = relativeIntersectY * 0.75;
            this.ballVelocityX = -BALL_SPEED * Math.cos(bounceAngle);
            this.ballVelocityY = BALL_SPEED * -Math.sin(bounceAngle);
            this.ballX = 734;
            return true;
        }

        return false;
    }

    resetBall(scorer) {
        this.ballX = 400;
        this.ballY = 300;
        // Always start ball moving towards the player who just lost a point
        this.ballVelocityX = BALL_SPEED * (scorer === 'left' ? -1 : 1);
        this.ballVelocityY = 0;
        console.log('Ball reset, moving towards:', scorer === 'left' ? 'right' : 'left');
    }

    movePaddle(side, direction) {
        const paddleY = side === 'left' ? 'leftPaddleY' : 'rightPaddleY';
        const newY = this[paddleY] + (direction === 'up' ? -PADDLE_SPEED : PADDLE_SPEED);
        
        if (newY >= 50 && newY <= 550) {
            this[paddleY] = newY;
            console.log(`Moving ${side} paddle ${direction} to ${newY}`);
            return true;
        }
        return false;
    }

    getState() {
        return {
            ballX: Math.round(this.ballX),
            ballY: Math.round(this.ballY),
            leftPaddleY: this.leftPaddleY,
            rightPaddleY: this.rightPaddleY,
            scores: this.scores,
            winner: this.winner
        };
    }
}

const games = new Map();
const waitingPlayers = new Set();

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('playerReady', () => {
        console.log('Player ready:', socket.id);
        if (waitingPlayers.has(socket.id)) return;

        if (waitingPlayers.size === 0) {
            waitingPlayers.add(socket.id);
            socket.emit('status', 'Waiting for opponent...');
            console.log('Player waiting for opponent:', socket.id);
        } else {
            const opponent = waitingPlayers.values().next().value;
            waitingPlayers.delete(opponent);
            
            console.log('Starting game between', opponent, 'and', socket.id);
            
            // Create new game
            const gameState = new GameState(opponent, socket.id);
            const gameId = Date.now().toString();
            games.set(gameId, {
                state: gameState,
                interval: setInterval(() => {
                    gameState.update();
                    const state = gameState.getState();
                    io.to(opponent).to(socket.id).emit('gameState', state);
                }, UPDATE_RATE)
            });

            // Store game reference for both players
            socket.gameId = gameId;
            const opponentSocket = io.sockets.sockets.get(opponent);
            if (opponentSocket) {
                opponentSocket.gameId = gameId;
            }

            // Start game
            io.to(opponent).emit('gameStart', { side: 'left' });
            io.to(socket.id).emit('gameStart', { side: 'right' });
        }
    });

    socket.on('paddleMove', (data) => {
        console.log('Paddle move received:', socket.id, data);
        const game = games.get(socket.gameId);
        if (!game) {
            console.log('No game found for paddle move');
            return;
        }

        const playerIndex = game.state.players.indexOf(socket.id);
        if (playerIndex === -1) {
            console.log('Player not found in game');
            return;
        }

        const side = playerIndex === 0 ? 'left' : 'right';
        const moved = game.state.movePaddle(side, data.direction);
        if (moved) {
            // Immediately emit the new game state after paddle movement
            const state = game.state.getState();
            io.to(game.state.players[0]).to(game.state.players[1]).emit('gameState', state);
        }
    });

    socket.on('restartGame', () => {
        const game = games.get(socket.gameId);
        if (!game) return;

        console.log('Restarting game:', socket.gameId);
        game.state = new GameState(...game.state.players);
        io.to(game.state.players[0]).to(game.state.players[1]).emit('gameState', game.state.getState());
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        waitingPlayers.delete(socket.id);
        
        const game = games.get(socket.gameId);
        if (game) {
            clearInterval(game.interval);
            const opponent = game.state.players.find(id => id !== socket.id);
            if (opponent) {
                io.to(opponent).emit('opponentLeft');
            }
            games.delete(socket.gameId);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});