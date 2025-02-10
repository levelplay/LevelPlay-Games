// Configuration and setup
const config = {
    type: Phaser.AUTO,
    parent: 'game',
    width: 800,
    height: 600,
    backgroundColor: '#2a2a2a',
    physics: {
        default: 'arcade',
        arcade: {
            debug: false,
            gravity: { x: 0, y: 0 }
        }
    },
    scene: {
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

// Global variables
let balls;
let cueBall;
let currentPlayer = 1; // Track current player's turn
let player1Balls = []; // Store pocketed balls for player 1
let player2Balls = []; // Store pocketed balls for player 2
let turnText; // Display current player's turn
let extraTurns = 0; // Track bonus turns
let aimLine;
let powerSlider;
let powerIndicator;
let sliderGrab;
let isAiming = false;
let currentPower = 0;
let cueStick;
let aimAngle = 0;
let isDirectionLocked = false;
let lockedAimAngle = 0;
const MAX_POWER = 1000;

// Table boundary coordinates
const TABLE_BOUNDS = {
    left: 100,
    right: 700,
    top: 150,
    bottom: 450
};

function create() {
    // Add subtle gradient background
    const gradient = this.add.graphics();
    gradient.fillGradientStyle(0x2a2a2a, 0x2a2a2a, 0x1a1a1a, 0x1a1a1a, 1);
    gradient.fillRect(0, 0, 800, 600);
    
    // Add player profiles
    const player1Profile = this.add.rectangle(TABLE_BOUNDS.left, 50, 150, 70, 0x2a2a2a);
    player1Profile.setStrokeStyle(2, 0xFF0000);
    const player1Text = this.add.text(TABLE_BOUNDS.left - 35, 35, 'Player 1', {
        fontFamily: 'serif',
        fontSize: '20px',
        color: '#FF0000',
        stroke: '#000000',
        strokeThickness: 1
    });
    const player1Color = this.add.circle(TABLE_BOUNDS.left + 55, 60, 8, 0xFF0000);

    const player2Profile = this.add.rectangle(TABLE_BOUNDS.right, 50, 150, 70, 0x2a2a2a);
    player2Profile.setStrokeStyle(2, 0x0000FF);
    const player2Text = this.add.text(TABLE_BOUNDS.right - 35, 35, 'Player 2', {
        fontFamily: 'serif',
        fontSize: '20px',
        color: '#0000FF',
        stroke: '#000000',
        strokeThickness: 1
    });
    const player2Color = this.add.circle(TABLE_BOUNDS.right + 55, 60, 8, 0x0000FF);

    // Add turn indicator text
    turnText = this.add.text(400, 50, '', {
        fontFamily: 'serif',
        fontSize: '24px',
        color: '#FFFFFF',
        stroke: '#000000',
        strokeThickness: 2
    });
    turnText.setOrigin(0.5);
    turnText.setDepth(1);
    updateTurnText();

    // Set depth for all profile elements
    player1Profile.setDepth(1);
    player1Text.setDepth(1);
    player1Color.setDepth(1);
    player2Profile.setDepth(1);
    player2Text.setDepth(1);
    player2Color.setDepth(1);
    
    // Draw outer decorative frame
    const outerFrame = this.add.rectangle(400, 300, 720, 420, 0x3d2b1f);
    outerFrame.setStrokeStyle(2, 0x5c4033);
    
    // Draw wooden frame with rich brown color and grain effect
    const frame = this.add.rectangle(400, 300, 680, 380, 0x5c4033);
    frame.setStrokeStyle(40, 0x3d2b1f);

    // Create collision boundaries for the table
    const boundaries = this.physics.add.staticGroup();
    
    // Add table boundaries
    boundaries.add(this.add.rectangle(400, TABLE_BOUNDS.top, 600, 4, 0x3d2b1f).setVisible(false));
    boundaries.add(this.add.rectangle(400, TABLE_BOUNDS.bottom, 600, 4, 0x3d2b1f).setVisible(false));
    boundaries.add(this.add.rectangle(TABLE_BOUNDS.left, 300, 4, 300, 0x3d2b1f).setVisible(false));
    boundaries.add(this.add.rectangle(TABLE_BOUNDS.right, 300, 4, 300, 0x3d2b1f).setVisible(false));
    
    // Add decorative corners
    const cornerSize = 30;
    const cornerPositions = [
        {x: 115, y: 165}, {x: 685, y: 165},
        {x: 115, y: 435}, {x: 685, y: 435}
    ];
    
    cornerPositions.forEach(pos => {
        const corner = this.add.circle(pos.x, pos.y, cornerSize, 0x3d2b1f);
        corner.setStrokeStyle(2, 0x2E2516);
    });
    
    // Draw table with rich felt texture
    const table = this.add.rectangle(400, 300, 600, 300, 0x0c7c43);
    table.setStrokeStyle(4, 0x085c32);
    
    // Add subtle table patterns
    const pattern = this.add.graphics();
    pattern.lineStyle(1, 0x0a6b3a, 0.3);
    for (let i = 0; i < 10; i++) {
        pattern.strokeRect(
            100 + i * 60,
            150 + i * 30,
            600 - i * 120,
            300 - i * 60
        );
    }
    
    // Enhanced pockets with shadows
    const pocketPositions = [
        {x: 115, y: 165}, {x: 400, y: 165}, {x: 685, y: 165},
        {x: 115, y: 435}, {x: 400, y: 435}, {x: 685, y: 435}
    ];
    
    pocketPositions.forEach(pos => {
        this.add.circle(pos.x + 2, pos.y + 2, 18, 0x000000, 0.3);
        this.add.circle(pos.x, pos.y, 18, 0x000000);
        this.add.circle(pos.x - 1, pos.y - 1, 16, 0x1a1a1a);
    });

    // Create physics groups and balls
    createBalls(this, boundaries);

    // Create game UI elements
    cueStick = this.add.graphics();
    cueStick.setDepth(2);
    aimLine = this.add.graphics();
    aimLine.setVisible(false);
    createPowerSlider(this);
    setupInputHandlers(this);
}

function createBalls(scene, boundaries) {
    // Create physics groups
    balls = scene.physics.add.group({
        bounceX: 1,
        bounceY: 1
    });

    // Create cue ball
    cueBall = scene.add.circle(200, 300, 12, 0xFFFFFF);
    scene.physics.add.existing(cueBall);
    cueBall.body.setCircle(12);
    cueBall.body.setBounce(1, 1);
    cueBall.body.setDamping(true);
    cueBall.body.setDrag(0.99);
    cueBall.body.setCollideWorldBounds(false);
    
    // Create triangle of colored balls
    const centerX = 550;
    const centerY = 300;
    const ballRadius = 12;
    const spacing = ballRadius * 2.2;
    const trianglePositions = [];
    const rows = 5;

    // Create positions
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col <= row; col++) {
            const x = centerX + (spacing * row * 1.2);
            const y = centerY - (spacing * row / 2) + (spacing * col);
            trianglePositions.push({
                x, y,
                fixed: row === 2 && col === 1
            });
        }
    }
    
    // Setup black ball and colored balls
    const blackBallPosition = trianglePositions.find(pos => pos.fixed);
    const otherPositions = trianglePositions.filter(pos => !pos.fixed);
    
    // Shuffle non-black positions
    for (let i = otherPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherPositions[i], otherPositions[j]] = [otherPositions[j], otherPositions[i]];
    }

    // Create black ball
    const blackBall = scene.add.circle(blackBallPosition.x, blackBallPosition.y, ballRadius, 0x000000);
    scene.physics.add.existing(blackBall);
    blackBall.body.setCircle(ballRadius);
    blackBall.body.setBounce(1, 1);
    blackBall.body.setDamping(true);
    blackBall.body.setDrag(0.99);
    blackBall.body.setCollideWorldBounds(false);
    balls.add(blackBall);

    // Create colored balls
    let redCount = 0;
    otherPositions.forEach((pos) => {
        const isRed = redCount < 7;
        const color = isRed ? 0xFF0000 : 0x0000FF;
        if (isRed) redCount++;
        
        const gameBall = scene.add.circle(pos.x, pos.y, ballRadius, color);
        scene.physics.add.existing(gameBall);
        gameBall.body.setCircle(ballRadius);
        gameBall.body.setBounce(1, 1);
        gameBall.body.setDamping(true);
        gameBall.body.setDrag(0.99);
        gameBall.body.setCollideWorldBounds(false);
        balls.add(gameBall);
    });

    // Add collisions
    scene.physics.add.collider(cueBall, boundaries, handleBallBoundaryCollision, null, scene);
    scene.physics.add.collider(balls, boundaries, handleBallBoundaryCollision, null, scene);
    scene.physics.add.collider(cueBall, balls, handleBallCollision, null, scene);
    scene.physics.add.collider(balls, balls, handleBallCollision, null, scene);
}

// Game mechanics and update functions

function createPowerSlider(scene) {
    const sliderHeight = 200;
    const sliderWidth = 20;
    const sliderX = 750;
    const sliderY = 200;
    
    // Add vintage power meter label
    const powerLabel = scene.add.text(sliderX - 25, sliderY - 30, 'Power', {
        fontFamily: 'serif',
        fontSize: '24px',
        color: '#DAA520',
        stroke: '#000000',
        strokeThickness: 2
    });

    // Slider background
    powerSlider = scene.add.graphics();
    powerSlider.fillStyle(0x333333, 1);
    powerSlider.fillRoundedRect(sliderX - sliderWidth/2, sliderY, sliderWidth, sliderHeight, 15);
    powerSlider.lineStyle(2, 0xFFFFFF, 0.5);
    powerSlider.strokeRoundedRect(sliderX - sliderWidth/2, sliderY, sliderWidth, sliderHeight, 15);

    // Slider markings
    for (let i = 0; i <= 10; i++) {
        const y = sliderY + (sliderHeight * i / 10);
        powerSlider.lineStyle(2, 0xFFFFFF, 0.3);
        powerSlider.lineBetween(sliderX - sliderWidth/2, y, sliderX + sliderWidth/2, y);
    }

    // Slider grab handle
    sliderGrab = scene.add.rectangle(sliderX, sliderY + sliderHeight, sliderWidth + 10, 20, 0xFF0000);
    sliderGrab.setInteractive({ draggable: true });
    sliderGrab.setDepth(1);

    // Power indicator
    powerIndicator = scene.add.text(sliderX - 25, sliderY - 30, 'POWER: 0%', 
        { fontSize: '16px', fill: '#ffffff', align: 'center' });

    scene.sliderProps = { sliderX, sliderY, sliderHeight };
}

function updateTurnText() {
    const extraTurnsText = extraTurns > 0 ? ` (${extraTurns + 1} shots remaining)` : '';
    turnText.setText(`Player ${currentPlayer}'s Turn${extraTurnsText}`);
    turnText.setColor(currentPlayer === 1 ? '#FF0000' : '#0000FF');
}

function switchPlayer() {
    if (extraTurns > 0) {
        extraTurns--;
        updateTurnText();
        return;
    }
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    extraTurns = 0;
    updateTurnText();
}

function handleFoul(hitWrongColor) {
    if (hitWrongColor) {
        if ((currentPlayer === 1 && hitWrongColor === 'blue') ||
            (currentPlayer === 2 && hitWrongColor === 'red')) {
            extraTurns = 1; // Give opponent two turns
            switchPlayer();
        }
    }
}

function predictTrajectory(startX, startY, angle) {
    const step = 5;
    const maxSteps = 200;
    const points = [];
    let currentX = startX;
    let currentY = startY;
    let currentAngle = angle;
    
    for (let i = 0; i < maxSteps; i++) {
        const nextX = currentX + Math.cos(currentAngle) * step;
        const nextY = currentY + Math.sin(currentAngle) * step;
        
        // Check table boundaries
        if (nextX <= TABLE_BOUNDS.left || nextX >= TABLE_BOUNDS.right ||
            nextY <= TABLE_BOUNDS.top || nextY >= TABLE_BOUNDS.bottom) {
            // Calculate reflection angle
            if (nextX <= TABLE_BOUNDS.left || nextX >= TABLE_BOUNDS.right) {
                currentAngle = Math.PI - currentAngle;
            } else {
                currentAngle = -currentAngle;
            }
            points.push({x: nextX, y: nextY, reflection: true});
            currentX = nextX;
            currentY = nextY;
            continue;
        }
        
        // Check ball collisions
        let collision = false;
        balls.getChildren().forEach(ball => {
            const dist = Phaser.Math.Distance.Between(nextX, nextY, ball.x, ball.y);
            if (dist < ball.body.radius * 2) {
                collision = true;
                points.push({x: nextX, y: nextY, collision: true});
            }
        });
        
        if (collision) break;
        
        points.push({x: nextX, y: nextY});
        currentX = nextX;
        currentY = nextY;
    }
    
    return points;
}

function drawAimLine(scene, pointer) {
    const angleToUse = isDirectionLocked ? lockedAimAngle : aimAngle;
    
    // Clear previous line
    aimLine.clear();
    aimLine.setVisible(true);
    
    // Get predicted trajectory
    const trajectory = predictTrajectory(cueBall.x, cueBall.y, angleToUse);
    
    // Draw trajectory line
    trajectory.forEach((point, index) => {
        if (index === 0) return;
        
        const prevPoint = trajectory[index - 1];
        if (point.collision) {
            aimLine.lineStyle(1, 0xFF0000, 0.5); // Red for collision points
        } else if (point.reflection) {
            aimLine.lineStyle(1, 0x00FF00, 0.5); // Green for reflection points
        } else {
            aimLine.lineStyle(1, 0xFFFFFF, 0.5);
        }
        
        // Draw dotted line segment
        const dx = point.x - prevPoint.x;
        const dy = point.y - prevPoint.y;
        const segments = 3;
        for (let i = 0; i < segments; i++) {
            const startT = i / segments;
            const endT = (i + 0.5) / segments;
            const startX = prevPoint.x + dx * startT;
            const startY = prevPoint.y + dy * startT;
            const endX = prevPoint.x + dx * endT;
            const endY = prevPoint.y + dy * endT;
            
            aimLine.beginPath();
            aimLine.moveTo(startX, startY);
            aimLine.lineTo(endX, endY);
            aimLine.strokePath();
        }
    });
}

function updateCueStick(scene, pointer) {
    const angleToUse = isDirectionLocked ? lockedAimAngle : aimAngle;
    const distance = 300; // Length of cue stick
    
    // Only show cue stick if it's current player's turn
    if (scene.isCurrentPlayersTurn !== false) {
        // Position the cue stick behind the cue ball
        const startX = cueBall.x - Math.cos(angleToUse) * 30;
        const startY = cueBall.y - Math.sin(angleToUse) * 30;
        const endX = cueBall.x - Math.cos(angleToUse) * distance;
        const endY = cueBall.y - Math.sin(angleToUse) * distance;
        
        cueStick.clear();
        
        // Main stick - thinner and elegant
        cueStick.lineStyle(4, 0xD2B48C);
        cueStick.beginPath();
        cueStick.moveTo(startX, startY);
        cueStick.lineTo(endX, endY);
        cueStick.strokePath();
        
        // Tip - subtle
        cueStick.lineStyle(4, 0x8B4513);
        cueStick.beginPath();
        cueStick.moveTo(startX, startY);
        cueStick.lineTo(
            startX - Math.cos(angleToUse) * 5,
            startY - Math.sin(angleToUse) * 5
        );
        cueStick.strokePath();
    }
}

function setupInputHandlers(scene) {
    const { sliderY, sliderHeight } = scene.sliderProps;

    scene.input.on('pointerdown', pointer => {
        // Only allow interaction during player's turn
        if (cueBall.body.velocity.length() < 1 && !isDirectionLocked && scene.isCurrentPlayersTurn !== false) {
            isAiming = true;
            aimAngle = Phaser.Math.Angle.Between(cueBall.x, cueBall.y, pointer.x, pointer.y);
            updateCueStick(scene, pointer);
        }
    });

    scene.input.on('pointermove', pointer => {
        if (isAiming && !isDirectionLocked && scene.isCurrentPlayersTurn !== false) {
            aimAngle = Phaser.Math.Angle.Between(cueBall.x, cueBall.y, pointer.x, pointer.y);
            updateCueStick(scene, pointer);
            drawAimLine(scene, pointer);
        }
    });

    sliderGrab.on('drag', (pointer, dragX, dragY) => {
        // Only allow power adjustment during player's turn
        if (scene.isCurrentPlayersTurn !== false) {
            // Lock direction when user starts adjusting power
            if (!isDirectionLocked && isAiming) {
                isDirectionLocked = true;
                lockedAimAngle = aimAngle;
            }
            
            dragY = Phaser.Math.Clamp(dragY, sliderY, sliderY + sliderHeight);
            sliderGrab.y = dragY;
            
            const powerPercentage = 100 - ((dragY - sliderY) / sliderHeight * 100);
            currentPower = (powerPercentage / 100) * MAX_POWER;
            powerIndicator.setText(`POWER: ${Math.round(powerPercentage)}%`);
        }
    });

    scene.input.on('pointerup', pointer => {
        if (scene.isCurrentPlayersTurn !== false) {
            if (isAiming && isDirectionLocked && currentPower > 0) {
                shoot(scene);
                aimLine.clear();
                aimLine.setVisible(false);
                cueStick.clear(); // Hide cue stick during shot
            } else if (isAiming && !isDirectionLocked) {
                // Lock in direction when player releases click
                isDirectionLocked = true;
                lockedAimAngle = aimAngle;
            }
        }
    });

    // Add key handler for unlocking direction
    scene.input.keyboard.on('keydown-SPACE', () => {
        if (isDirectionLocked && !currentPower && scene.isCurrentPlayersTurn !== false) {
            isDirectionLocked = false;
            // Reset aim line and cue stick
            drawAimLine(scene, scene.input.activePointer);
            updateCueStick(scene, scene.input.activePointer);
        }
    });
}

function shoot(scene) {
    if (cueBall.body.velocity.length() < 1) {
        // Calculate velocity based on power and locked angle
        const velocityX = Math.cos(lockedAimAngle) * currentPower;
        const velocityY = Math.sin(lockedAimAngle) * currentPower;
        
        // Apply velocity to cue ball
        cueBall.body.setVelocity(velocityX, velocityY);
        
        // Reset states
        isAiming = false;
        isDirectionLocked = false;
        cueStick.clear();
        
        // Reset power slider
        currentPower = 0;
        sliderGrab.y = scene.sliderProps.sliderY + scene.sliderProps.sliderHeight;
        powerIndicator.setText('POWER: 0%');
    }
}

function handlePocketedBall(ball) {
    // Handle black ball pocketing
    if (ball.fillColor === 0x000000) {
        // Check if player has all their colored balls
        const playerBalls = currentPlayer === 1 ? player1Balls : player2Balls;
        const validWin = playerBalls.length === 7;
        
        if (validWin) {
            turnText.setText(`Player ${currentPlayer} Wins!`);
        } else {
            const otherPlayer = currentPlayer === 1 ? 2 : 1;
            turnText.setText(`Player ${otherPlayer} Wins! (Black ball pocketed too early)`);
        }
        
        ball.scene.tweens.add({
            targets: ball,
            scale: 0,
            duration: 200,
            onComplete: () => {
                ball.destroy();
            }
        });
        return;
    }

    // Handle colored balls
    const ballColor = ball.fillColor === 0xFF0000 ? 'red' : 'blue';
    const validPocket = (currentPlayer === 1 && ballColor === 'red') || 
                       (currentPlayer === 2 && ballColor === 'blue');
    
    // Update score counts and grant extra turn for valid pockets
    if (validPocket) {
        if (currentPlayer === 1) {
            player1Balls.push(ballColor);
            if (player1Balls.length === 7) {
                turnText.setText('Player 1: Pot the black ball to win!');
            }
        } else {
            player2Balls.push(ballColor);
            if (player2Balls.length === 7) {
                turnText.setText('Player 2: Pot the black ball to win!');
            }
        }
        // Grant extra turn for successful pocket
        extraTurns++;
        updateTurnText();
    } else {
        // If wrong ball is pocketed, switch to other player
        switchPlayer();
    }

    // Add visual effect for pocketed ball
    ball.scene.tweens.add({
        targets: ball,
        scale: 0,
        duration: 200,
        onComplete: () => {
            ball.destroy();
        }
    });
}

function handleCueBallPocketed() {
    // Reset cue ball position
    cueBall.setPosition(200, 300);
    cueBall.body.setVelocity(0, 0);
    
    // Give opponent two turns
    extraTurns = 1;
    switchPlayer();
}

function update() {
    // Check for pocketed balls
    const pocketPositions = [
        {x: 115, y: 165}, {x: 400, y: 165}, {x: 685, y: 165},
        {x: 115, y: 435}, {x: 400, y: 435}, {x: 685, y: 435}
    ];
    
    // Check each ball against each pocket
    balls.getChildren().forEach(ball => {
        pocketPositions.forEach(pocket => {
            const distance = Phaser.Math.Distance.Between(
                ball.x, ball.y,
                pocket.x, pocket.y
            );
            
            if (distance < 20) { // If ball is in pocket
                handlePocketedBall(ball);
            }
        });
    });
    
    // Check cue ball pocketing
    pocketPositions.forEach(pocket => {
        const distance = Phaser.Math.Distance.Between(
            cueBall.x, cueBall.y,
            pocket.x, pocket.y
        );
        
        if (distance < 20) {
            handleCueBallPocketed();
        }
    });
    
    // Apply friction to all balls
    balls.getChildren().forEach(ball => {
        const velocity = ball.body.velocity;
        const speed = velocity.length();
        
        if (speed > 0) {
            const friction = 0.99;
            ball.body.setVelocity(
                velocity.x * friction,
                velocity.y * friction
            );
            
            // Stop balls if they're moving very slowly
            if (speed < 5) {
                ball.body.setVelocity(0, 0);
            }
        }
    });
    
    // Apply friction to cue ball
    if (cueBall.body.velocity.length() > 0) {
        const friction = 0.99;
        cueBall.body.setVelocity(
            cueBall.body.velocity.x * friction,
            cueBall.body.velocity.y * friction
        );
        
        if (cueBall.body.velocity.length() < 5) {
            cueBall.body.setVelocity(0, 0);
            switchPlayer();
        }
    }
    
    // Keep balls within table bounds
    const checkBounds = (gameObject) => {
        const radius = gameObject.body.radius;
        
        if (gameObject.x < TABLE_BOUNDS.left + radius) {
            gameObject.x = TABLE_BOUNDS.left + radius;
            gameObject.body.velocity.x *= -1;
        }
        if (gameObject.x > TABLE_BOUNDS.right - radius) {
            gameObject.x = TABLE_BOUNDS.right - radius;
            gameObject.body.velocity.x *= -1;
        }
        if (gameObject.y < TABLE_BOUNDS.top + radius) {
            gameObject.y = TABLE_BOUNDS.top + radius;
            gameObject.body.velocity.y *= -1;
        }
        if (gameObject.y > TABLE_BOUNDS.bottom - radius) {
            gameObject.y = TABLE_BOUNDS.bottom - radius;
            gameObject.body.velocity.y *= -1;
        }
    };
    
    balls.getChildren().forEach(checkBounds);
    checkBounds(cueBall);

    // Check if cue ball has stopped - show stick again
    if (cueBall.body.velocity.length() < 5) {
        cueBall.body.setVelocity(0, 0);
        
        // Only show stick if it's not already visible
        if (!isAiming && !isDirectionLocked) {
            isAiming = true;
            updateCueStick(this, { x: cueBall.x + 100, y: cueBall.y }); // Default angle
                        drawAimLine(this, { x: cueBall.x + 100, y: cueBall.y });
                    }
                }
            }
            
            function shoot(scene) {
                if (cueBall.body.velocity.length() < 1) {
                    // Calculate velocity based on power and locked angle
                    const velocityX = Math.cos(lockedAimAngle) * currentPower;
                    const velocityY = Math.sin(lockedAimAngle) * currentPower;
                    
                    // Apply velocity to cue ball
                    cueBall.body.setVelocity(velocityX, velocityY);
                    
                    // Reset states
                    isAiming = false;
                    isDirectionLocked = false;
                    cueStick.clear();
                    
                    // Reset power slider
                    currentPower = 0;
                    sliderGrab.y = scene.sliderProps.sliderY + scene.sliderProps.sliderHeight;
                    powerIndicator.setText('POWER: 0%');
                }
            }
            
            function handlePocketedBall(ball) {
                // Handle black ball pocketing
                if (ball.fillColor === 0x000000) {
                    // Check if player has all their colored balls
                    const playerBalls = currentPlayer === 1 ? player1Balls : player2Balls;
                    const validWin = playerBalls.length === 7;
                    
                    if (validWin) {
                        turnText.setText(`Player ${currentPlayer} Wins!`);
                    } else {
                        const otherPlayer = currentPlayer === 1 ? 2 : 1;
                        turnText.setText(`Player ${otherPlayer} Wins! (Black ball pocketed too early)`);
                    }
                    
                    ball.scene.tweens.add({
                        targets: ball,
                        scale: 0,
                        duration: 200,
                        onComplete: () => {
                            ball.destroy();
                        }
                    });
                    return;
                }
            
                // Handle colored balls
                const ballColor = ball.fillColor === 0xFF0000 ? 'red' : 'blue';
                const validPocket = (currentPlayer === 1 && ballColor === 'red') || 
                                   (currentPlayer === 2 && ballColor === 'blue');
                
                // Update score counts
                if (validPocket) {
                    if (currentPlayer === 1) {
                        player1Balls.push(ballColor);
                        if (player1Balls.length === 7) {
                            turnText.setText('Player 1: Pot the black ball to win!');
                        }
                    } else {
                        player2Balls.push(ballColor);
                        if (player2Balls.length === 7) {
                            turnText.setText('Player 2: Pot the black ball to win!');
                        }
                    }
                }
            
                // Add visual effect for pocketed ball
                ball.scene.tweens.add({
                    targets: ball,
                    scale: 0,
                    duration: 200,
                    onComplete: () => {
                        ball.destroy();
                    }
                });
            }
            
            function handleCueBallPocketed() {
                // Reset cue ball position
                cueBall.setPosition(200, 300);
                cueBall.body.setVelocity(0, 0);
                
                // Give opponent two turns
                extraTurns = 1;
                switchPlayer();
            }
            
            // ... [Previous code remains the same until the update function] ...

function update() {
    // Check for pocketed balls
    const pocketPositions = [
        {x: 115, y: 165}, {x: 400, y: 165}, {x: 685, y: 165},
        {x: 115, y: 435}, {x: 400, y: 435}, {x: 685, y: 435}
    ];
    
    // Check each ball against each pocket
    balls.getChildren().forEach(ball => {
        pocketPositions.forEach(pocket => {
            const distance = Phaser.Math.Distance.Between(
                ball.x, ball.y,
                pocket.x, pocket.y
            );
            
            if (distance < 20) { // If ball is in pocket
                handlePocketedBall(ball);
            }
        });
    });
    
    // Check cue ball pocketing
    pocketPositions.forEach(pocket => {
        const distance = Phaser.Math.Distance.Between(
            cueBall.x, cueBall.y,
            pocket.x, pocket.y
        );
        
        if (distance < 20) {
            handleCueBallPocketed();
        }
    });
    
    // Apply friction to all balls
    balls.getChildren().forEach(ball => {
        const velocity = ball.body.velocity;
        const speed = velocity.length();
        
        if (speed > 0) {
            const friction = 0.99;
            ball.body.setVelocity(
                velocity.x * friction,
                velocity.y * friction
            );
            
            // Stop balls if they're moving very slowly
            if (speed < 5) {
                ball.body.setVelocity(0, 0);
            }
        }
    });
    
    // Apply friction to cue ball
    if (cueBall.body.velocity.length() > 0) {
        const friction = 0.99;
        cueBall.body.setVelocity(
            cueBall.body.velocity.x * friction,
            cueBall.body.velocity.y * friction
        );
        
        if (cueBall.body.velocity.length() < 5) {
            cueBall.body.setVelocity(0, 0);
            switchPlayer();
        }
    }
    
    // Keep balls within table bounds
    const checkBounds = (gameObject) => {
        const radius = gameObject.body.radius;
        
        if (gameObject.x < TABLE_BOUNDS.left + radius) {
            gameObject.x = TABLE_BOUNDS.left + radius;
            gameObject.body.velocity.x *= -1;
        }
        if (gameObject.x > TABLE_BOUNDS.right - radius) {
            gameObject.x = TABLE_BOUNDS.right - radius;
            gameObject.body.velocity.x *= -1;
        }
        if (gameObject.y < TABLE_BOUNDS.top + radius) {
            gameObject.y = TABLE_BOUNDS.top + radius;
            gameObject.body.velocity.y *= -1;
        }
        if (gameObject.y > TABLE_BOUNDS.bottom - radius) {
            gameObject.y = TABLE_BOUNDS.bottom - radius;
            gameObject.body.velocity.y *= -1;
        }
    };
    
    balls.getChildren().forEach(checkBounds);
    checkBounds(cueBall);

    // Check if cue ball has stopped - show stick again
    if (cueBall.body.velocity.length() < 5) {
        cueBall.body.setVelocity(0, 0);
        
        // Only show stick if it's not already visible
        if (!isAiming && !isDirectionLocked) {
            isAiming = true;
            updateCueStick(this, { x: cueBall.x + 100, y: cueBall.y }); // Default angle
            drawAimLine(this, { x: cueBall.x + 100, y: cueBall.y });
        }
    }
}

// Add this closing brace to fix the error

function handleBallBoundaryCollision(ball, boundary) {
    const velocityFactor = 0.95;
    ball.body.velocity.scale(velocityFactor);
    
    // Add slight randomness to prevent balls from getting stuck
    ball.body.velocity.x += (Math.random() - 0.5) * 2;
    ball.body.velocity.y += (Math.random() - 0.5) * 2;
}

function handleBallCollision(ball1, ball2) {
    const velocityFactor = 0.98;
    ball1.body.velocity.scale(velocityFactor);
    ball2.body.velocity.scale(velocityFactor);
    
    // Check if cue ball hit any ball
    if (ball1 === cueBall || ball2 === cueBall) {
        const otherBall = ball1 === cueBall ? ball2 : ball1;
        
        // Check if black ball was hit
        if (otherBall.fillColor === 0x000000) {
            extraTurns = 1; // Give opponent two turns
            switchPlayer();
            return;
        }
        
        // Check wrong color hits
        const ballColor = otherBall.fillColor === 0xFF0000 ? 'red' : 'blue';
        handleFoul(ballColor);
    }
}

// Add reset game functionality
function resetGame() {
    // Reset scores
    player1Balls = [];
    player2Balls = [];
    
    // Reset current player
    currentPlayer = 1;
    extraTurns = 0;
    updateTurnText();
    
    // Reset cue ball
    cueBall.setPosition(200, 300);
    cueBall.body.setVelocity(0, 0);
    
    // Clear existing balls
    balls.clear(true, true);
    
    // Recreate ball layout
    createBalls(cueBall.scene, cueBall.scene.physics.add.staticGroup());
    
    // Reset game states
    isAiming = false;
    isDirectionLocked = false;
    currentPower = 0;
    aimAngle = 0;
    lockedAimAngle = 0;
    
    // Clear graphics
    cueStick.clear();
    aimLine.clear();
    aimLine.setVisible(false);
    
    // Reset power slider
    sliderGrab.y = sliderGrab.scene.sliderProps.sliderY + sliderGrab.scene.sliderProps.sliderHeight;
    powerIndicator.setText('POWER: 0%');
}

// Export necessary functions
window.resetGame = resetGame;;