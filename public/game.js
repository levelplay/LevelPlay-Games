// game.js
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#16213e',
    parent: 'game',
    scene: PongScene,
    render: {
        powerPreference: 'high-performance',
        antialias: true,
        pixelArt: false,
        roundPixels: true
    },
    fps: {
        target: 60,
        forceSetTimeOut: true
    }
};

// Create game instance
const game = new Phaser.Game(config);

// Set up direct event handlers for buttons to ensure they work correctly
document.addEventListener('DOMContentLoaded', function() {
    const createGameBtn = document.getElementById('create-game-btn');
    const joinGameBtn = document.getElementById('join-game-btn');
    const joinBtn = document.getElementById('join-btn');
    const backBtn = document.getElementById('back-btn');
    const copyCodeBtn = document.getElementById('copy-code');
    const gameCodeInput = document.getElementById('game-code-input');
    
    // This ensures the onclick attributes in HTML work properly
    if (createGameBtn) {
        createGameBtn.addEventListener('click', function() {
            const pongScene = game.scene.getScene('PongScene');
            if (pongScene) {
                const mainMenu = document.getElementById('main-menu');
                const createGameScreen = document.getElementById('create-game-screen');
                
                mainMenu.classList.add('hidden');
                createGameScreen.classList.remove('hidden');
                pongScene.socket.emit('createGame');
                
                const status = document.getElementById('status');
                if (status) {
                    status.innerText = 'Creating game...';
                }
            }
        });
    }
    
    if (joinGameBtn) {
        joinGameBtn.addEventListener('click', function() {
            const mainMenu = document.getElementById('main-menu');
            const joinGameScreen = document.getElementById('join-game-screen');
            const errorMessage = document.getElementById('error-message');
            
            mainMenu.classList.add('hidden');
            joinGameScreen.classList.remove('hidden');
            
            if (errorMessage) {
                errorMessage.textContent = '';
            }
            
            if (gameCodeInput) {
                gameCodeInput.value = '';
                gameCodeInput.focus();
            }
        });
    }
    
    if (joinBtn) {
        joinBtn.addEventListener('click', function() {
            const pongScene = game.scene.getScene('PongScene');
            if (pongScene && gameCodeInput) {
                const code = gameCodeInput.value.trim().toUpperCase();
                const errorMessage = document.getElementById('error-message');
                
                if (code.length === 6) {
                    pongScene.socket.emit('joinGame', { roomCode: code });
                    
                    const status = document.getElementById('status');
                    if (status) {
                        status.innerText = 'Joining game...';
                    }
                } else if (errorMessage) {
                    errorMessage.textContent = 'Please enter a valid 6-character code';
                }
            }
        });
    }
    
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            const mainMenu = document.getElementById('main-menu');
            const joinGameScreen = document.getElementById('join-game-screen');
            const errorMessage = document.getElementById('error-message');
            
            joinGameScreen.classList.add('hidden');
            mainMenu.classList.remove('hidden');
            
            if (errorMessage) {
                errorMessage.textContent = '';
            }
        });
    }
    
    if (gameCodeInput) {
        gameCodeInput.addEventListener('keyup', function(event) {
            if (event.key === 'Enter' && joinBtn) {
                joinBtn.click();
            }
        });
    }
    
    if (copyCodeBtn) {
        copyCodeBtn.addEventListener('click', function() {
            const gameCodeDisplay = document.getElementById('game-code-display');
            if (gameCodeDisplay) {
                const code = gameCodeDisplay.textContent;
                try {
                    navigator.clipboard.writeText(code).then(() => {
                        copyCodeBtn.textContent = 'Copied!';
                        setTimeout(() => {
                            copyCodeBtn.textContent = 'Copy Code';
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy: ', err);
                        // Fallback for browsers without clipboard API
                        const textarea = document.createElement('textarea');
                        textarea.value = code;
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                        
                        copyCodeBtn.textContent = 'Copied!';
                        setTimeout(() => {
                            copyCodeBtn.textContent = 'Copy Code';
                        }, 2000);
                    });
                } catch (error) {
                    console.error('Error copying code:', error);
                }
            }
        });
    }
});

// Add window error handling
window.addEventListener('error', function(event) {
    console.error('Global error caught:', event.error);
    
    // Update status with error message if possible
    try {
        const status = document.getElementById('status');
        if (status) {
            status.innerText = 'Error occurred. Please refresh the page.';
        }
    } catch (e) {
        // Unable to update status
    }
    
    return false;
});
