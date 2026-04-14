import Phaser from 'phaser';
import './style.css';
import './ui/ui.css';
import { GameScene } from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: 'app',
    width: '100%',
    height: '100%',
  },
  scene: [GameScene],
  backgroundColor: '#1a1a2e',
};

new Phaser.Game(config);

