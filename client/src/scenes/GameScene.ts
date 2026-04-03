import Phaser from 'phaser';
import * as Colyseus from 'colyseus.js';

// Simple player data we track client-side
interface PlayerData {
    x: number;
    y: number;
    shape: Phaser.GameObjects.Container;
}

export class GameScene extends Phaser.Scene {
    client!: Colyseus.Client;
    room!: Colyseus.Room;
    players: { [sessionId: string]: PlayerData } = {};
    mySessionId: string = '';

    // Isometric tile sizes (must match how we draw the grid)
    tileW = 64;
    tileH = 32;

    constructor() {
        super('GameScene');
    }

    preload() {}

    async create() {
        // Draw grid immediately
        this.drawGrid();

        // Centre camera on middle of the 20x20 grid
        const centre = this.cartToIso(10, 10);
        this.cameras.main.centerOn(centre.x, centre.y);

        // Status label (fixed to camera)
        const statusText = this.add.text(10, 10, 'Connecting to server...', {
            fontSize: '14px',
            color: '#ffffff',
            backgroundColor: '#00000099',
            padding: { x: 8, y: 4 },
        }).setScrollFactor(0).setDepth(1000);

        // Connect — uses VITE_SERVER_URL in production, localhost in dev
        const serverUrl = import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:2567';
        this.client = new Colyseus.Client(serverUrl);
        try {
            this.room = await this.client.joinOrCreate('game_room');
            statusText.setText('✓ Connected');
            console.log('Joined!', this.room.sessionId);
        } catch (e) {
            statusText.setText('✗ Could not connect to server');
            console.error('Join error:', e);
            return;
        }

        // Server tells us our own sessionId immediately on join
        this.room.onMessage('init', (data: { sessionId: string }) => {
            this.mySessionId = data.sessionId;
            console.log('My session ID:', this.mySessionId);
        });

        // Server broadcasts a full snapshot of all player positions every tick
        this.room.onMessage('snapshot', (snapshot: Record<string, { x: number; y: number }>) => {
            // Add/update shapes for all players in snapshot
            for (const [sessionId, pos] of Object.entries(snapshot)) {
                if (!this.players[sessionId]) {
                    // New player — create their shape
                    this.players[sessionId] = {
                        x: pos.x,
                        y: pos.y,
                        shape: this.createPlayerShape(sessionId === this.mySessionId),
                    };
                }
                // Update position
                this.players[sessionId].x = pos.x;
                this.players[sessionId].y = pos.y;
            }

            // Remove players that are no longer in the snapshot
            for (const sessionId of Object.keys(this.players)) {
                if (!snapshot[sessionId]) {
                    this.players[sessionId].shape.destroy();
                    delete this.players[sessionId];
                }
            }
        });

        // Server tells us when a player explicitly leaves
        this.room.onMessage('playerLeft', (data: { sessionId: string }) => {
            if (this.players[data.sessionId]) {
                this.players[data.sessionId].shape.destroy();
                delete this.players[data.sessionId];
            }
        });

        // Click to move
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const cart = this.isoToCart(world.x, world.y);
            this.room.send('move', { x: cart.x, y: cart.y });

            // Click ripple effect
            const isoPos = this.cartToIso(cart.x, cart.y);
            const ripple = this.add.circle(isoPos.x, isoPos.y, 6, 0xffffff, 0.9);
            this.tweens.add({
                targets: ripple,
                alpha: 0,
                scaleX: 3,
                scaleY: 3,
                duration: 400,
                onComplete: () => ripple.destroy(),
            });
        });

        // Arrow keys pan camera
        const cursors = this.input.keyboard?.createCursorKeys();
        if (cursors) {
            this.events.on('update', () => {
                if (cursors.left.isDown)  this.cameras.main.scrollX -= 5;
                if (cursors.right.isDown) this.cameras.main.scrollX += 5;
                if (cursors.up.isDown)    this.cameras.main.scrollY -= 5;
                if (cursors.down.isDown)  this.cameras.main.scrollY += 5;
            });
        }
    }

    update() {
        // Smooth-interpolate all player shapes towards their server positions
        for (const [, pd] of Object.entries(this.players)) {
            const iso = this.cartToIso(pd.x, pd.y);
            const targetX = iso.x;
            const targetY = iso.y;

            // Lerp the container towards the iso position
            pd.shape.x += (targetX - pd.shape.x) * 0.2;
            pd.shape.y += (targetY - pd.shape.y) * 0.2;

            // Depth sort by sum of cartesian coords (higher = drawn on top)
            pd.shape.setDepth(pd.x + pd.y);
        }
    }

    /** Create a small humanoid-ish placeholder character */
    createPlayerShape(isLocal: boolean): Phaser.GameObjects.Container {
        const color = isLocal ? 0x00ff88 : 0xff5555;
        const shadowColor = isLocal ? 0x007744 : 0x882222;

        const container = this.add.container(0, 0);

        // Shadow ellipse on the ground
        const shadow = this.add.ellipse(0, 0, 20, 10, 0x000000, 0.35);
        container.add(shadow);

        // Body (rectangle)
        const body = this.add.rectangle(0, -20, 14, 20, color);
        container.add(body);

        // Head (circle)
        const head = this.add.circle(0, -36, 8, color);
        container.add(head);

        // Outline on head
        const headOutline = this.add.circle(0, -36, 9);
        headOutline.setStrokeStyle(1.5, shadowColor);
        headOutline.setFillStyle(0, 0);
        container.add(headOutline);

        return container;
    }

    // Cartesian → Isometric screen coords
    cartToIso(cartX: number, cartY: number) {
        return {
            x: (cartX - cartY) * (this.tileW / 2),
            y: (cartX + cartY) * (this.tileH / 2),
        };
    }

    // Isometric screen coords → Cartesian
    isoToCart(isoX: number, isoY: number) {
        return {
            x: (isoY / this.tileH) + (isoX / this.tileW),
            y: (isoY / this.tileH) - (isoX / this.tileW),
        };
    }

    drawGrid() {
        const graphics = this.add.graphics();
        const gridSize = 20;

        // Alternating tile fill
        for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
                const tl = this.cartToIso(col,     row);
                const tr = this.cartToIso(col + 1, row);
                const br = this.cartToIso(col + 1, row + 1);
                const bl = this.cartToIso(col,     row + 1);

                const even = (row + col) % 2 === 0;
                graphics.fillStyle(even ? 0x2a3a2a : 0x1e2e1e, 1);
                graphics.fillPoints([
                    { x: tl.x, y: tl.y },
                    { x: tr.x, y: tr.y },
                    { x: br.x, y: br.y },
                    { x: bl.x, y: bl.y },
                ], true);
            }
        }

        // Grid lines
        graphics.lineStyle(1, 0x3a5a3a, 0.8);
        for (let i = 0; i <= gridSize; i++) {
            const s1 = this.cartToIso(i, 0);
            const e1 = this.cartToIso(i, gridSize);
            graphics.moveTo(s1.x, s1.y);
            graphics.lineTo(e1.x, e1.y);

            const s2 = this.cartToIso(0, i);
            const e2 = this.cartToIso(gridSize, i);
            graphics.moveTo(s2.x, s2.y);
            graphics.lineTo(e2.x, e2.y);
        }
        graphics.strokePath();
    }
}
