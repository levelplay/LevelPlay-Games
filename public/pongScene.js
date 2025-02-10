// pongScene.js
class PongScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PongScene' });
        this.winningScore = 10;
        this.gameOver = false;
    }

    init() {
        this.socket = io();
        this.side = null;
        this.ball = null;
        this.leftPaddle = null;
        this.rightPaddle = null;
        this.cursors = null;
        this.ready = false;
        this.gameOver = false;
        
        // Add debug status
        this.debugText = null;
    }

    create() {
        // Create game objects
        this.ball = this.add.circle(400, 300, 8, 0x00ff00);
        this.leftPaddle = this.add.rectangle(50, 300, 15, 100, 0x00ffff);
        this.rightPaddle = this.add.rectangle(750, 300, 15, 100, 0xff00ff);
        
        // Add debug text
        this.debugText = this.add.text(400, 550, '', { 
            fontFamily: 'Arial', 
            fontSize: '14px',
            fill: '#fff'
        }).setOrigin(0.5);
        
        // Center line
        const graphics = this.add.graphics();
        graphics.lineStyle(2, 0xFFFFFF, 0.2);
        for (let y = 0; y < 600; y += 20) {
            graphics.moveTo(400, y);
            graphics.lineTo(400, y + 10);
        }
        graphics.strokePath();

        // Score display
        const textStyle = { 
            fontFamily: 'Arial',
            fontSize: '32px',
            fill: '#fff'
        };

        const labelStyle = {
            fontFamily: 'Arial',
            fontSize: '24px',
            fill: '#888'
        };

        this.add.text(50, 20, 'PLAYER 1', labelStyle);
        this.leftScore = this.add.text(50, 50, '0', textStyle);

        this.add.text(400, 20, 'FIRST TO', labelStyle).setOrigin(0.5, 0);
        this.add.text(400, 50, this.winningScore.toString(), textStyle).setOrigin(0.5, 0);

        this.add.text(750, 20, 'PLAYER 2', labelStyle).setOrigin(1, 0);
        this.rightScore = this.add.text(750, 50, '0', textStyle).setOrigin(1, 0);

        // Click handler for restart
        this.input.on('pointerdown', () => {
            if (this.gameOver) {
                this.socket.emit('restartGame');
            }
        });

        // Controls
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wKey = this.input.keyboard.addKey('W');
        this.sKey = this.input.keyboard.addKey('S');

        this.setupSocketListeners();
        
        // Log connection attempt
        this.updateDebug('Connecting to server...');
    }

    updateDebug(message) {
        if (this.debugText) {
            this.debugText.setText(message);
            console.log('Debug:', message);
        }
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.updateDebug('Connected to server');
        });

        this.socket.on('connect_error', (error) => {
            this.updateDebug('Connection error: ' + error.message);
        });

        this.socket.on('gameStart', (data) => {
            this.side = data.side;
            this.ready = true;
            this.gameOver = false;
            document.getElementById('status').innerText = '';
            this.updateDebug('Game started - You are ' + data.side + ' side');
        });

        this.socket.on('gameState', (state) => {
            // Update ball position
            this.ball.x = state.ballX;
            this.ball.y = state.ballY;
            
            // Update paddle positions
            this.leftPaddle.y = state.leftPaddleY;
            this.rightPaddle.y = state.rightPaddleY;
            
            // Update scores
            this.leftScore.setText(state.scores.left.toString());
            this.rightScore.setText(state.scores.right.toString());

            if (state.winner && !this.gameOver) {
                this.gameOver = true;
                document.getElementById('status').innerText = `${state.winner} WINS! Click anywhere to restart`;
            }
        });

        this.socket.on('opponentLeft', () => {
            document.getElementById('status').innerText = 'Opponent left. Waiting for new player...';
            this.ready = false;
            this.gameOver = false;
            this.updateDebug('Opponent disconnected');
        });

        this.socket.emit('playerReady');
        this.updateDebug('Sent playerReady event');
    }

    update() {
        if (!this.ready || this.gameOver) return;

        // Handle paddle movement
        if (this.side === 'left') {
            if ((this.wKey.isDown || this.cursors.up.isDown)) {
                this.socket.emit('paddleMove', { direction: 'up' });
                this.updateDebug('Moving left paddle up');
            }
            if ((this.sKey.isDown || this.cursors.down.isDown)) {
                this.socket.emit('paddleMove', { direction: 'down' });
                this.updateDebug('Moving left paddle down');
            }
        } else if (this.side === 'right') {
            if ((this.wKey.isDown || this.cursors.up.isDown)) {
                this.socket.emit('paddleMove', { direction: 'up' });
                this.updateDebug('Moving right paddle up');
            }
            if ((this.sKey.isDown || this.cursors.down.isDown)) {
                this.socket.emit('paddleMove', { direction: 'down' });
                this.updateDebug('Moving right paddle down');
            }
        }
    }
}