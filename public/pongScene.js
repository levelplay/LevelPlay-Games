// pongScene.js
class PongScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PongScene' });
        this.winningScore = 10;
        this.gameOver = false;
        this.rematchRequested = false;
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
        this.rematchRequested = false;
        
        // Game code related
        this.roomCode = null;
    }

    create() {
        // Create game objects
        this.ball = this.add.circle(400, 300, 8, 0x00ff00);
        this.leftPaddle = this.add.rectangle(50, 300, 15, 100, 0x00ffff);
        this.rightPaddle = this.add.rectangle(750, 300, 15, 100, 0xff00ff);
        
        // Center line - making this more transparent and thinner
        const graphics = this.add.graphics();
        graphics.lineStyle(1, 0xFFFFFF, 0.15);
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

        // Fix for the black background behind "FIRST TO" text - using clean text styling without backgrounds
        const firstToText = this.add.text(400, 20, 'FIRST TO', {
            fontFamily: 'Arial',
            fontSize: '24px',
            fill: '#888',
            backgroundColor: null
        }).setOrigin(0.5, 0);
        
        const winningScoreText = this.add.text(400, 50, this.winningScore.toString(), {
            fontFamily: 'Arial',
            fontSize: '32px',
            fill: '#fff',
            backgroundColor: null
        }).setOrigin(0.5, 0);

        this.add.text(750, 20, 'PLAYER 2', labelStyle).setOrigin(1, 0);
        this.rightScore = this.add.text(750, 50, '0', textStyle).setOrigin(1, 0);

        // Create end game popup (initially hidden)
        this.createEndGamePopup();
        
        // Create rematch request popup (initially hidden)
        this.createRematchRequestPopup();

        // Controls
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wKey = this.input.keyboard.addKey('W');
        this.sKey = this.input.keyboard.addKey('S');

        this.setupSocketListeners();
        this.setupMenuHandlers();
    }

    // Create end game popup
    createEndGamePopup() {
        // Check if the popup already exists
        const existingPopup = document.getElementById('end-game-popup');
        if (existingPopup) {
            document.body.removeChild(existingPopup);
        }

        // Create popup container
        const popup = document.createElement('div');
        popup.id = 'end-game-popup';
        popup.style.position = 'absolute';
        popup.style.top = '50%';
        popup.style.left = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.background = 'rgba(22, 33, 62, 0.95)';
        popup.style.padding = '30px';
        popup.style.borderRadius = '15px';
        popup.style.textAlign = 'center';
        popup.style.color = 'white';
        popup.style.boxShadow = '0 5px 30px rgba(0, 0, 255, 0.3)';
        popup.style.border = '2px solid rgba(255, 255, 255, 0.1)';
        popup.style.zIndex = '3000';
        popup.style.display = 'none';
        popup.style.minWidth = '300px';

        // Game over title
        const title = document.createElement('h2');
        title.textContent = 'Game Over';
        title.style.marginTop = '0';
        title.style.fontSize = '28px';
        title.style.color = '#fff';

        // Winner text
        const winnerText = document.createElement('p');
        winnerText.id = 'winner-text';
        winnerText.style.fontSize = '20px';
        winnerText.style.marginBottom = '25px';

        // Status message for rematch request
        const rematchStatus = document.createElement('p');
        rematchStatus.id = 'rematch-status';
        rematchStatus.style.fontSize = '16px';
        rematchStatus.style.marginBottom = '15px';
        rematchStatus.style.color = '#4cc9f0';
        rematchStatus.style.display = 'none';

        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.flexDirection = 'column';
        buttonContainer.style.gap = '15px';

        // Rematch button
        const rematchBtn = document.createElement('button');
        rematchBtn.id = 'rematch-btn';
        rematchBtn.textContent = 'Request Rematch';
        rematchBtn.style.padding = '12px 25px';
        rematchBtn.style.fontSize = '18px';
        rematchBtn.style.borderRadius = '30px';
        rematchBtn.style.border = 'none';
        rematchBtn.style.background = 'linear-gradient(45deg, #4361ee, #3a0ca3)';
        rematchBtn.style.color = 'white';
        rematchBtn.style.cursor = 'pointer';
        rematchBtn.style.transition = 'all 0.3s';
        rematchBtn.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
        rematchBtn.addEventListener('mouseenter', () => {
            rematchBtn.style.transform = 'translateY(-2px)';
            rematchBtn.style.boxShadow = '0 7px 20px rgba(0, 0, 0, 0.3)';
        });
        rematchBtn.addEventListener('mouseleave', () => {
            rematchBtn.style.transform = 'translateY(0)';
            rematchBtn.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
        });
        rematchBtn.addEventListener('click', () => {
            this.handleRematchRequest();
        });

        // Quit button
        const quitBtn = document.createElement('button');
        quitBtn.textContent = 'Quit';
        quitBtn.style.padding = '12px 25px';
        quitBtn.style.fontSize = '18px';
        quitBtn.style.borderRadius = '30px';
        quitBtn.style.border = 'none';
        quitBtn.style.background = 'linear-gradient(45deg, #ef476f, #d62246)';
        quitBtn.style.color = 'white';
        quitBtn.style.cursor = 'pointer';
        quitBtn.style.transition = 'all 0.3s';
        quitBtn.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
        quitBtn.addEventListener('mouseenter', () => {
            quitBtn.style.transform = 'translateY(-2px)';
            quitBtn.style.boxShadow = '0 7px 20px rgba(0, 0, 0, 0.3)';
        });
        quitBtn.addEventListener('mouseleave', () => {
            quitBtn.style.transform = 'translateY(0)';
            quitBtn.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
        });
        quitBtn.addEventListener('click', () => {
            this.handleQuit();
        });

        // Add elements to popup
        buttonContainer.appendChild(rematchBtn);
        buttonContainer.appendChild(quitBtn);
        popup.appendChild(title);
        popup.appendChild(winnerText);
        popup.appendChild(rematchStatus);
        popup.appendChild(buttonContainer);

        // Add popup to document
        document.body.appendChild(popup);
    }

    // Create rematch request popup
    createRematchRequestPopup() {
        // Check if the popup already exists
        const existingPopup = document.getElementById('rematch-request-popup');
        if (existingPopup) {
            document.body.removeChild(existingPopup);
        }

        // Create popup container
        const popup = document.createElement('div');
        popup.id = 'rematch-request-popup';
        popup.style.position = 'absolute';
        popup.style.top = '50%';
        popup.style.left = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.background = 'rgba(22, 33, 62, 0.95)';
        popup.style.padding = '30px';
        popup.style.borderRadius = '15px';
        popup.style.textAlign = 'center';
        popup.style.color = 'white';
        popup.style.boxShadow = '0 5px 30px rgba(0, 0, 255, 0.3)';
        popup.style.border = '2px solid rgba(255, 255, 255, 0.1)';
        popup.style.zIndex = '3000';
        popup.style.display = 'none';
        popup.style.minWidth = '300px';

        // Request title
        const title = document.createElement('h2');
        title.textContent = 'Rematch Request';
        title.style.marginTop = '0';
        title.style.fontSize = '28px';
        title.style.color = '#fff';

        // Request message
        const message = document.createElement('p');
        message.textContent = 'Your opponent has requested a rematch. Do you accept?';
        message.style.fontSize = '18px';
        message.style.marginBottom = '25px';

        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'space-between';
        buttonContainer.style.gap = '15px';

        // Accept button
        const acceptBtn = document.createElement('button');
        acceptBtn.textContent = 'Accept';
        acceptBtn.style.padding = '12px 25px';
        acceptBtn.style.fontSize = '18px';
        acceptBtn.style.borderRadius = '30px';
        acceptBtn.style.border = 'none';
        acceptBtn.style.background = 'linear-gradient(45deg, #4361ee, #3a0ca3)';
        acceptBtn.style.color = 'white';
        acceptBtn.style.cursor = 'pointer';
        acceptBtn.style.transition = 'all 0.3s';
        acceptBtn.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
        acceptBtn.style.flex = '1';
        acceptBtn.addEventListener('mouseenter', () => {
            acceptBtn.style.transform = 'translateY(-2px)';
            acceptBtn.style.boxShadow = '0 7px 20px rgba(0, 0, 0, 0.3)';
        });
        acceptBtn.addEventListener('mouseleave', () => {
            acceptBtn.style.transform = 'translateY(0)';
            acceptBtn.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
        });
        acceptBtn.addEventListener('click', () => {
            this.handleRematchAccept();
        });

        // Decline button
        const declineBtn = document.createElement('button');
        declineBtn.textContent = 'Decline';
        declineBtn.style.padding = '12px 25px';
        declineBtn.style.fontSize = '18px';
        declineBtn.style.borderRadius = '30px';
        declineBtn.style.border = 'none';
        declineBtn.style.background = 'linear-gradient(45deg, #ef476f, #d62246)';
        declineBtn.style.color = 'white';
        declineBtn.style.cursor = 'pointer';
        declineBtn.style.transition = 'all 0.3s';
        declineBtn.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
        declineBtn.style.flex = '1';
        declineBtn.addEventListener('mouseenter', () => {
            declineBtn.style.transform = 'translateY(-2px)';
            declineBtn.style.boxShadow = '0 7px 20px rgba(0, 0, 0, 0.3)';
        });
        declineBtn.addEventListener('mouseleave', () => {
            declineBtn.style.transform = 'translateY(0)';
            declineBtn.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.2)';
        });
        declineBtn.addEventListener('click', () => {
            this.handleRematchDecline();
        });

        // Add elements to popup
        buttonContainer.appendChild(acceptBtn);
        buttonContainer.appendChild(declineBtn);
        popup.appendChild(title);
        popup.appendChild(message);
        popup.appendChild(buttonContainer);

        // Add popup to document
        document.body.appendChild(popup);
    }

    // Show end game popup
    showEndGamePopup(winner) {
        const popup = document.getElementById('end-game-popup');
        const winnerText = document.getElementById('winner-text');
        const rematchStatus = document.getElementById('rematch-status');
        
        if (popup && winnerText && rematchStatus) {
            winnerText.textContent = `${winner} WINS!`;
            rematchStatus.style.display = 'none';
            popup.style.display = 'block';
        }
    }

    // Hide end game popup
    hideEndGamePopup() {
        const popup = document.getElementById('end-game-popup');
        if (popup) {
            popup.style.display = 'none';
        }
    }

    // Show rematch request popup
    showRematchRequestPopup() {
        const popup = document.getElementById('rematch-request-popup');
        if (popup) {
            popup.style.display = 'block';
        }
    }

    // Hide rematch request popup
    hideRematchRequestPopup() {
        const popup = document.getElementById('rematch-request-popup');
        if (popup) {
            popup.style.display = 'none';
        }
    }

    // Handle rematch request
    handleRematchRequest() {
        // Update the rematch button status
        const rematchBtn = document.getElementById('rematch-btn');
        const rematchStatus = document.getElementById('rematch-status');
        
        if (rematchBtn && rematchStatus) {
            rematchBtn.disabled = true;
            rematchBtn.style.opacity = '0.7';
            rematchBtn.textContent = 'Request Sent';
            rematchStatus.textContent = 'Waiting for opponent to respond...';
            rematchStatus.style.display = 'block';
        }
        
        // Set rematch requested flag
        this.rematchRequested = true;
        
        // Send rematch request to server
        this.socket.emit('rematchRequest');
    }
    
    // Handle rematch accept
    handleRematchAccept() {
        this.hideRematchRequestPopup();
        this.socket.emit('rematchResponse', { accepted: true });
    }
    
    // Handle rematch decline
    handleRematchDecline() {
        this.hideRematchRequestPopup();
        this.socket.emit('rematchResponse', { accepted: false });
    }

    // Reset rematch button
    resetRematchButton() {
        const rematchBtn = document.getElementById('rematch-btn');
        const rematchStatus = document.getElementById('rematch-status');
        
        if (rematchBtn && rematchStatus) {
            rematchBtn.disabled = false;
            rematchBtn.style.opacity = '1';
            rematchBtn.textContent = 'Request Rematch';
            rematchStatus.style.display = 'none';
        }
        
        this.rematchRequested = false;
    }

    // Handle quit button
    handleQuit() {
        this.hideEndGamePopup();
        this.hideRematchRequestPopup();
        
        // Reset game state
        this.ready = false;
        this.gameOver = false;
        this.rematchRequested = false;
        
        // Reset menu state
        const mainMenu = document.getElementById('main-menu');
        const createGameScreen = document.getElementById('create-game-screen');
        const joinGameScreen = document.getElementById('join-game-screen');
        const menuOverlay = document.getElementById('menu-overlay');
        
        if (mainMenu) mainMenu.classList.remove('hidden');
        if (createGameScreen) createGameScreen.classList.add('hidden');
        if (joinGameScreen) joinGameScreen.classList.add('hidden');
        if (menuOverlay) menuOverlay.style.display = 'flex';
        
        // Notify server that we're leaving
        this.socket.emit('leaveGame');
        
        // Update status
        const status = document.getElementById('status');
        if (status) {
            status.innerText = '';
        }
    }

    setupMenuHandlers() {
        try {
            // Get references to UI elements
            const menuOverlay = document.getElementById('menu-overlay');
            const mainMenu = document.getElementById('main-menu');
            const createGameScreen = document.getElementById('create-game-screen');
            const joinGameScreen = document.getElementById('join-game-screen');
            const createGameBtn = document.getElementById('create-game-btn');
            const joinGameBtn = document.getElementById('join-game-btn');
            const joinBtn = document.getElementById('join-btn');
            const backBtn = document.getElementById('back-btn');
            const gameCodeDisplay = document.getElementById('game-code-display');
            const gameCodeInput = document.getElementById('game-code-input');
            const copyCodeBtn = document.getElementById('copy-code');
            const errorMessage = document.getElementById('error-message');
            
            // Check if all elements exist
            if (!menuOverlay || !mainMenu || !createGameScreen || !joinGameScreen) {
                console.error('Required menu elements not found');
                return;
            }
            
            // Create Game button handler - Direct assignment of click handler
            if (createGameBtn) {
                createGameBtn.onclick = () => {
                    mainMenu.classList.add('hidden');
                    createGameScreen.classList.remove('hidden');
                    this.socket.emit('createGame');
                    
                    // Update status
                    const status = document.getElementById('status');
                    if (status) {
                        status.innerText = 'Creating game...';
                    }
                };
            }
            
            // Join Game button handler
            if (joinGameBtn) {
                joinGameBtn.onclick = () => {
                    mainMenu.classList.add('hidden');
                    joinGameScreen.classList.remove('hidden');
                    errorMessage.textContent = '';
                    gameCodeInput.value = '';
                    gameCodeInput.focus();
                };
            }
            
            // Back button handler
            if (backBtn) {
                backBtn.onclick = () => {
                    joinGameScreen.classList.add('hidden');
                    mainMenu.classList.remove('hidden');
                    errorMessage.textContent = '';
                };
            }
            
            // Join button handler
            if (joinBtn) {
                joinBtn.onclick = () => {
                    const code = gameCodeInput.value.trim().toUpperCase();
                    if (code.length === 6) {
                        this.socket.emit('joinGame', { roomCode: code });
                        
                        // Update status
                        const status = document.getElementById('status');
                        if (status) {
                            status.innerText = 'Joining game...';
                        }
                    } else {
                        errorMessage.textContent = 'Please enter a valid 6-character code';
                    }
                };
            }
            
            // Allow pressing Enter in input field
            if (gameCodeInput) {
                gameCodeInput.onkeyup = (event) => {
                    if (event.key === 'Enter') {
                        joinBtn.click();
                    }
                };
            }
            
            // Copy code to clipboard
            if (copyCodeBtn) {
                copyCodeBtn.onclick = () => {
                    const code = gameCodeDisplay.textContent;
                    try {
                        navigator.clipboard.writeText(code).then(() => {
                            copyCodeBtn.textContent = 'Copied!';
                            setTimeout(() => {
                                copyCodeBtn.textContent = 'Copy Code';
                            }, 2000);
                        }).catch(err => {
                            console.error('Failed to copy: ', err);
                            // Fallback method
                            this.copyToClipboardFallback(code);
                        });
                    } catch (error) {
                        console.error('Error copying code:', error);
                        // Fallback method
                        this.copyToClipboardFallback(code);
                    }
                };
            }
        } catch (error) {
            console.error('Error setting up menu handlers:', error);
        }
    }

    // Fallback method for clipboard copy
    copyToClipboardFallback(text) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            
            const copyCodeBtn = document.getElementById('copy-code');
            if (copyCodeBtn) {
                copyCodeBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyCodeBtn.textContent = 'Copy Code';
                }, 2000);
            }
        } catch (error) {
            console.error('Fallback copy failed:', error);
        }
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            // Connected
        });

        this.socket.on('connect_error', (error) => {
            const status = document.getElementById('status');
            if (status) {
                status.innerText = 'Connection error. Please refresh.';
            }
        });
        
        // Error handler
        this.socket.on('error', (data) => {
            const errorMessage = document.getElementById('error-message');
            if (errorMessage) {
                errorMessage.textContent = data.message || 'An error occurred';
            }
        });
        
        // Game creation handlers
        this.socket.on('gameCreated', (data) => {
            try {
                this.roomCode = data.roomCode;
                const gameCodeDisplay = document.getElementById('game-code-display');
                if (gameCodeDisplay) {
                    gameCodeDisplay.textContent = data.roomCode;
                }
                
                // Update status
                const status = document.getElementById('status');
                if (status) {
                    status.innerText = 'Waiting for opponent...';
                }
            } catch (error) {
                console.error('Error handling gameCreated event:', error);
            }
        });
        
        this.socket.on('joinError', (data) => {
            try {
                const errorMessage = document.getElementById('error-message');
                if (errorMessage) {
                    errorMessage.textContent = data.message || 'Error joining game';
                }
                
                // Update status
                const status = document.getElementById('status');
                if (status) {
                    status.innerText = '';
                }
            } catch (error) {
                console.error('Error handling joinError event:', error);
            }
        });
        
        this.socket.on('roomFull', () => {
            try {
                const menuOverlay = document.getElementById('menu-overlay');
                if (menuOverlay) {
                    menuOverlay.style.display = 'none';
                }
                
                // Update status
                const status = document.getElementById('status');
                if (status) {
                    status.innerText = 'Game starting...';
                    // Clear the status after 2 seconds
                    setTimeout(() => {
                        if (status) status.innerText = '';
                    }, 2000);
                }
            } catch (error) {
                console.error('Error handling roomFull event:', error);
            }
        });

        this.socket.on('gameStart', (data) => {
            try {
                this.side = data.side;
                this.ready = true;
                this.gameOver = false;
                this.rematchRequested = false;
                
                const status = document.getElementById('status');
                if (status) {
                    status.innerText = '';
                }
                
                const menuOverlay = document.getElementById('menu-overlay');
                if (menuOverlay) {
                    menuOverlay.style.display = 'none';
                }
                
                // Hide popups
                this.hideEndGamePopup();
                this.hideRematchRequestPopup();
                
                // Reset scores to 0-0
                if (this.leftScore) {
                    this.leftScore.setText('0');
                }
                
                if (this.rightScore) {
                    this.rightScore.setText('0');
                }
            } catch (error) {
                console.error('Error handling gameStart event:', error);
            }
        });

        this.socket.on('gameState', (state) => {
            try {
                // Update ball position
                if (this.ball) {
                    this.ball.x = state.ballX;
                    this.ball.y = state.ballY;
                }
                
                // Update paddle positions
                if (this.leftPaddle) {
                    this.leftPaddle.y = state.leftPaddleY;
                }
                
                if (this.rightPaddle) {
                    this.rightPaddle.y = state.rightPaddleY;
                }
                
                // Update scores
                if (this.leftScore) {
                    this.leftScore.setText(state.scores.left.toString());
                }
                
                if (this.rightScore) {
                    this.rightScore.setText(state.scores.right.toString());
                }

                if (state.winner && !this.gameOver) {
                    this.gameOver = true;
                    // Show the end game popup instead of the status text
                    this.showEndGamePopup(state.winner);
                }
            } catch (error) {
                console.error('Error handling gameState event:', error);
            }
        });
        
        // Rematch request handler - Show popup to opponent
        this.socket.on('rematchRequest', () => {
            try {
                // Show rematch request popup with accept/decline options
                this.showRematchRequestPopup();
            } catch (error) {
                console.error('Error handling rematchRequest event:', error);
            }
        });
        
        // Rematch response handler - Handle accept/decline response
        this.socket.on('rematchResponse', (data) => {
            try {
                const rematchStatus = document.getElementById('rematch-status');
                
                if (data.accepted) {
                    // Opponent accepted, reset game will happen via gameStart event
                    if (rematchStatus) {
                        rematchStatus.textContent = 'Opponent accepted. Restarting game...';
                    }
                } else {
                    // Opponent declined - Notify the requester
                    if (rematchStatus) {
                        rematchStatus.textContent = 'Opponent declined the rematch.';
                    }
                    
                    // Reset rematch button after a delay
                    setTimeout(() => {
                        this.resetRematchButton();
                    }, 3000);
                }
            } catch (error) {
                console.error('Error handling rematchResponse event:', error);
            }
        });

        this.socket.on('opponentLeft', () => {
            try {
                const status = document.getElementById('status');
                if (status) {
                    status.innerText = 'Opponent left. Returning to menu...';
                }
                
                this.ready = false;
                this.gameOver = false;
                this.rematchRequested = false;
                
                // Hide popups
                this.hideEndGamePopup();
                this.hideRematchRequestPopup();
                
                // Reset game state and show menu after a delay
                setTimeout(() => {
                    try {
                        // Reset menu state
                        const mainMenu = document.getElementById('main-menu');
                        const createGameScreen = document.getElementById('create-game-screen');
                        const joinGameScreen = document.getElementById('join-game-screen');
                        const menuOverlay = document.getElementById('menu-overlay');
                        
                        if (mainMenu) mainMenu.classList.remove('hidden');
                        if (createGameScreen) createGameScreen.classList.add('hidden');
                        if (joinGameScreen) joinGameScreen.classList.add('hidden');
                        if (menuOverlay) {
                            menuOverlay.style.display = 'flex';
                        }
                        if (status) status.innerText = '';
                    } catch (error) {
                        console.error('Error resetting menu state:', error);
                    }
                }, 3000);
            } catch (error) {
                console.error('Error handling opponentLeft event:', error);
            }
        });
    }

    update() {
        if (!this.ready || this.gameOver) return;

        try {
            // Handle paddle movement
            if (this.side === 'left') {
                if ((this.wKey && this.wKey.isDown) || (this.cursors && this.cursors.up.isDown)) {
                    this.socket.emit('paddleMove', { direction: 'up' });
                }
                if ((this.sKey && this.sKey.isDown) || (this.cursors && this.cursors.down.isDown)) {
                    this.socket.emit('paddleMove', { direction: 'down' });
                }
            } else if (this.side === 'right') {
                if ((this.wKey && this.wKey.isDown) || (this.cursors && this.cursors.up.isDown)) {
                    this.socket.emit('paddleMove', { direction: 'up' });
                }
                if ((this.sKey && this.sKey.isDown) || (this.cursors && this.cursors.down.isDown)) {
                    this.socket.emit('paddleMove', { direction: 'down' });
                }
            }
        } catch (error) {
            console.error('Error in update loop:', error);
        }
    }
}
