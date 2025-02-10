const socket = io();
let playerNumber = null;
let gameStarted = false;
let game;

window.onload = function() {
    const config = {
        type: Phaser.AUTO,
        parent: 'game-container',
        width: 800,
        height: 700,
        backgroundColor: '#f5f5f5',
        physics: {
            default: 'matter',
            matter: {
                debug: false,
                gravity: { y: 0 }
            }
        },
        scene: {
            create: create,
            update: update
        }
    };

    game = new Phaser.Game(config);
};

let gameState = {
    currentPlayer: 0,
    moveInProgress: false,
    boardBounds: null,
    scoreText: null,
    turnText: null,
    winnerText: null,
    mouseSpring: null,
    usedDiscs: new Set(),
    totalDiscs: 8,
    gameOver: false,
    currentTurnDisc: null,
    statusText: null
};

socket.on('gameStart', (assignedNumber) => {
    playerNumber = assignedNumber;
    gameStarted = true;
    if (gameState.statusText) {
        gameState.statusText.setVisible(false);
    }
});

socket.on('discUpdate', (data) => {
    const scene = game.scene.scenes[0];
    const disc = scene.matter.world.localWorld.bodies.find(
        body => body.label === data.discInfo
    );
    if (disc) {
        Matter.Body.setPosition(disc, { x: data.position.x, y: data.position.y });
        Matter.Body.setVelocity(disc, { x: data.velocity.x, y: data.velocity.y });
        if (disc.gameObject) {
            disc.gameObject.setPosition(data.position.x, data.position.y);
        }
    }
});

socket.on('turnSwitch', (currentPlayerNum) => {
    const scene = game.scene.scenes[0];
    gameState.currentPlayer = currentPlayerNum;
    gameState.moveInProgress = false;
    gameState.currentTurnDisc = null;
    switchTurns(scene);
});

socket.on('opponentLeft', () => {
    gameState.gameOver = true;
    if (gameState.statusText) {
        gameState.statusText.setText('Opponent disconnected').setVisible(true);
    }
    if (gameState.turnText) {
        gameState.turnText.setVisible(false);
    }
});

function create() {
    createBoard(this);
    createDiscs(this);
    createUI(this);
    this.gameState = gameState;

    this.matter.world.on('collisionStart', (event) => {
        event.pairs.forEach((pair) => {
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;
            
            if (bodyA.label?.startsWith('disc') && bodyB.label?.startsWith('disc')) {
                gameState.usedDiscs.delete(bodyA.label);
                gameState.usedDiscs.delete(bodyB.label);
            }
            
            updateScores(this);
        });
    });
}

function createBoard(scene) {
    const boardWidth = 300;
    const boardHeight = 600;
    const startX = scene.cameras.main.centerX;
    const startY = 50;

    scene.add.rectangle(startX + 5, startY + 5, boardWidth + 40, boardHeight + 40, 0x000000, 0.3);
    scene.add.rectangle(startX, startY, boardWidth + 40, boardHeight + 40, 0xc4a484);

    const graphics = scene.add.graphics();
    
    graphics.fillStyle(0xdeb887);
    graphics.fillRect(startX - boardWidth/2, startY, boardWidth, boardHeight);

    for (let i = 0; i < boardHeight; i += 15) {
        graphics.lineStyle(1, 0x000000, 0.05);
        graphics.beginPath();
        graphics.moveTo(startX - boardWidth/2, startY + i);
        graphics.lineTo(startX + boardWidth/2, startY + i);
        graphics.strokePath();
    }

    const zones = [
        { y: startY, colors: { main: 0xff8c00, border: 0xff6b00, shadow: 0xff4500 } },
        { y: startY + 75, colors: { main: 0x00bfff, border: 0x0099ff, shadow: 0x0077cc } },
        { y: startY + 150, colors: { main: 0x9932cc, border: 0x8b00ff, shadow: 0x800080 } }
    ];

    zones.forEach(zone => {
        graphics.fillStyle(zone.colors.main, 0.6);
        graphics.fillRect(startX - boardWidth/2, zone.y, boardWidth, 75);
        
        graphics.lineStyle(1, zone.colors.border, 0.1);
        for (let i = 0; i < boardWidth; i += 15) {
            graphics.beginPath();
            graphics.moveTo(startX - boardWidth/2 + i, zone.y);
            graphics.lineTo(startX - boardWidth/2 + i, zone.y + 75);
            graphics.strokePath();
        }
    });

    const scores = [
        { y: startY + 37.5, score: "3", color: "#FFFFFF" },
        { y: startY + 112.5, score: "2", color: "#FFFFFF" },
        { y: startY + 187.5, score: "1", color: "#FFFFFF" }
    ];

    scores.forEach(scoreData => {
        scene.add.text(startX, scoreData.y, scoreData.score, {
            fontSize: '48px',
            fontWeight: 'bold',
            fill: scoreData.color,
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
    });

    graphics.lineStyle(24, 0x2f4f4f);
    graphics.strokeRect(startX - boardWidth/2, startY, boardWidth, boardHeight);
    graphics.lineStyle(2, 0x000000, 0.3);
    graphics.strokeRect(startX - boardWidth/2 + 12, startY + 12, boardWidth - 24, boardHeight - 24);

    gameState.boardBounds = {
        x: startX - boardWidth/2,
        y: startY,
        width: boardWidth,
        height: boardHeight
    };
}

function createDiscs(scene) {
    const discRadius = 15;
    const colors = [0xFF0000, 0x0000FF];
    
    colors.forEach((color, index) => {
        const xOffset = index === 0 ? -80 : 80;
        
        for (let i = 0; i < 4; i++) {
            const disc = scene.matter.add.circle(
                scene.cameras.main.centerX + xOffset,
                650,
                discRadius,
                {
                    friction: 0.003,
                    restitution: 0.4,
                    density: 0.002,
                    label: `disc_${index}_${i}`
                }
            );

            const container = scene.add.container(
                scene.cameras.main.centerX + xOffset,
                650
            );

            const shadow = scene.add.circle(2, 2, discRadius, 0x000000, 0.3);
            const mainDisc = scene.add.circle(0, 0, discRadius, color);
            const highlight = scene.add.circle(-3, -3, discRadius/2, 0xFFFFFF, 0.4);

            container.add([shadow, mainDisc, highlight]);
            disc.gameObject = container;
            disc.playerIndex = index;
        }
    });

    gameState.mouseSpring = scene.matter.add.mouseSpring({
        stiffness: 0.01,
        damping: 0.1,
        length: 0
    });

    scene.input.on('pointerdown', (pointer) => {
        if (!gameStarted || gameState.moveInProgress || gameState.gameOver || 
            gameState.currentPlayer !== playerNumber || gameState.currentTurnDisc) return;

        const body = scene.matter.query.point(scene.matter.world.localWorld.bodies, pointer)[0];
        if (body && body.label?.startsWith('disc')) {
            const isCorrectPlayerDisc = body.playerIndex === playerNumber;
            const isUnused = !gameState.usedDiscs.has(body.label);

            if (isCorrectPlayerDisc && isUnused) {
                gameState.mouseSpring.constraint.bodyB = body;
                gameState.currentTurnDisc = body;
            }
        }
    });

    scene.input.on('pointerup', () => {
        if (gameState.mouseSpring.constraint.bodyB) {
            const usedDisc = gameState.mouseSpring.constraint.bodyB;
            gameState.usedDiscs.add(usedDisc.label);
            gameState.moveInProgress = true;
            
            const discData = {
                discInfo: usedDisc.label,
                position: { x: usedDisc.position.x, y: usedDisc.position.y },
                velocity: { x: usedDisc.velocity.x, y: usedDisc.velocity.y }
            };
            
            socket.emit('discMove', discData);
            gameState.mouseSpring.constraint.bodyB = null;
            checkDiscMovement(scene);
        }
    });
}

function createUI(scene) {
    gameState.statusText = scene.add.text(
        scene.cameras.main.centerX,
        scene.cameras.main.centerY - 100,
        'Waiting for opponent...',
        {
            fontSize: '32px',
            fontWeight: 'bold',
            fill: '#000',
            backgroundColor: '#fff',
            padding: { x: 20, y: 10 },
            align: 'center'
        }
    ).setOrigin(0.5).setDepth(1000);

    const player1Text = scene.add.text(20, 10, 'Player 1: 0', {
        fontSize: '24px',
        fontWeight: 'bold',
        fill: '#FFFFFF',
        backgroundColor: '#FF0000',
        padding: { x: 12, y: 6 }
    });

    const player2Text = scene.add.text(scene.cameras.main.width - 200, 10, 'Player 2: 0', {
        fontSize: '24px',
        fontWeight: 'bold',
        fill: '#FFFFFF',
        backgroundColor: '#0000FF',
        padding: { x: 12, y: 6 }
    });

    gameState.scoreText = { player1: player1Text, player2: player2Text };

    gameState.turnText = scene.add.text(
        scene.cameras.main.centerX,
        10,
        'Red\'s Turn (Player 1)',
        {
            fontSize: '28px',
            fontWeight: 'bold',
            fill: '#000',
            backgroundColor: '#ffcccc',
            padding: { x: 16, y: 8 }
        }
    ).setOrigin(0.5);

    gameState.winnerText = scene.add.text(
        scene.cameras.main.centerX,
        scene.cameras.main.centerY,
        '',
        {
            fontSize: '48px',
            fontWeight: 'bold',
            fill: '#FFFFFF',
            backgroundColor: '#4CAF50',
            padding: { x: 20, y: 10 },
            align: 'center'
        }
    ).setOrigin(0.5);
    gameState.winnerText.setVisible(false);
}

function checkDiscMovement(scene) {
    const checkMovementInterval = setInterval(() => {
        let isAnyDiscMoving = false;
        scene.matter.world.getAllBodies().forEach(body => {
            if (body.label?.startsWith('disc')) {
                if (Math.abs(body.velocity.x) > 0.1 || Math.abs(body.velocity.y) > 0.1) {
                    isAnyDiscMoving = true;
                }
            }
        });

        if (!isAnyDiscMoving) {
            clearInterval(checkMovementInterval);
            gameState.moveInProgress = false;
            socket.emit('turnEnd');
            checkGameEnd(scene);
        }
    }, 100);
}

function switchTurns(scene) {
    const currentPlayerText = gameState.currentPlayer === 0 ? 'Red\'s Turn (Player 1)' : 'Blue\'s Turn (Player 2)';
    const backgroundColor = gameState.currentPlayer === 0 ? '#ffcccc' : '#cce6ff';
    
    gameState.turnText.setText(currentPlayerText);
    gameState.turnText.setBackgroundColor(backgroundColor);
}

function checkGameEnd(scene) {
    const redUnused = countUnusedDiscs(scene, 0);
    const blueUnused = countUnusedDiscs(scene, 1);

    if (redUnused === 0 && blueUnused === 0) {
        gameState.gameOver = true;
        const scores = calculateFinalScores(scene);
        
        let winnerText;
        if (scores.red > scores.blue) {
            winnerText = `PLAYER 1 WINS!\n${scores.red} - ${scores.blue}`;
        } else if (scores.blue > scores.red) {
            winnerText = `PLAYER 2 WINS!\n${scores.blue} - ${scores.red}`;
        } else {
            winnerText = `IT'S A TIE!\n${scores.red} - ${scores.blue}`;
        }
        
        gameState.turnText.setVisible(false);
        gameState.winnerText.setText(winnerText);
        gameState.winnerText.setVisible(true);
    }
}

function countUnusedDiscs(scene, playerIndex) {
    let count = 0;
    scene.matter.world.getAllBodies().forEach(body => {
        if (body.label?.startsWith('disc') && 
            body.playerIndex === playerIndex && 
            !gameState.usedDiscs.has(body.label)) {
            count++;
        }
    });
    return count;
}

function update() {
    this.matter.world.getAllBodies().forEach(body => {
        if (body.gameObject && body.label.startsWith('disc')) {
            body.gameObject.setPosition(body.position.x, body.position.y);
        }
    });
    updateScores(this);
}

function calculatePoints(y, x) {
    const bounds = gameState.boardBounds;
    
    if (y < bounds.y || x < bounds.x || x > bounds.x + bounds.width) {
        return 0;
    }
    
    const zone3Bottom = bounds.y + 75;
    const zone2Bottom = bounds.y + 150;
    const zone1Bottom = bounds.y + 225;
 
    if (y <= zone3Bottom) {
        return 3;
    } else if (y <= zone2Bottom) {
        return 2;
    } else if (y <= zone1Bottom) {
        return 1;
    }
    
    return 0;
}

function calculateFinalScores(scene) {
    const scores = { red: 0, blue: 0 };
    
    scene.matter.world.getAllBodies().forEach(body => {
        if (body.label?.startsWith('disc')) {
            const points = calculatePoints(body.position.y, body.position.x);
            if (body.playerIndex === 0) {
                scores.red += points;
            } else {
                scores.blue += points;
            }
        }
    });
 
    return scores;
}

function updateScores(scene) {
    const scores = calculateFinalScores(scene);
    gameState.scoreText.player1.setText(`Player 1: ${scores.red}`);
    gameState.scoreText.player2.setText(`Player 2: ${scores.blue}`);
}