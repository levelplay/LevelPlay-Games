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

const game = new Phaser.Game(config);