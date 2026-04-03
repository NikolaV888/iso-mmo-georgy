import Phaser from 'phaser';
import * as Colyseus from 'colyseus.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface PlayerSnapshot {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    isDead: boolean;
}

interface CombatEvent {
    attacker: string;
    target: string;
    damage: number;
    targetHp: number;
}

interface TrackedPlayer {
    // Authoritative state (from server)
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    isDead: boolean;
    // Phaser objects
    container: Phaser.GameObjects.Container;
    healthBar: Phaser.GameObjects.Graphics;
    body: Phaser.GameObjects.Rectangle;
    head: Phaser.GameObjects.Arc;
    // Chat
    chatBubble: Phaser.GameObjects.Container | null;
    chatBubbleTimer: ReturnType<typeof setTimeout> | null;
}

// ── Scene ────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
    // Network
    private client!: Colyseus.Client;
    private room!: Colyseus.Room;
    private mySessionId: string = '';

    // State
    private players: Map<string, TrackedPlayer> = new Map();

    // Chat
    private chatInput: HTMLInputElement | null = null;
    private chatOpen: boolean = false;

    // Isometric tile dimensions
    private readonly TILE_W = 64;
    private readonly TILE_H = 32;

    constructor() {
        super('GameScene');
    }

    preload() {}

    async create() {
        this.cameras.main.setBackgroundColor('#1a1a2e');

        // Draw grid first (it sits at depth 0)
        this.drawGrid();

        // Centre camera on middle of 20×20 grid
        const centre = this.cartToIso(10, 10);
        this.cameras.main.centerOn(centre.x, centre.y);

        // HUD status label (fixed to camera)
        const statusText = this.add
            .text(10, 10, 'Connecting…', {
                fontSize: '13px',
                color: '#ffffff',
                backgroundColor: '#00000099',
                padding: { x: 8, y: 4 },
            })
            .setScrollFactor(0)
            .setDepth(2000);

        // Chat hint
        this.add
            .text(10, 36, 'Press Enter to chat', {
                fontSize: '11px',
                color: '#88ffaa99',
                fontFamily: 'monospace',
            })
            .setScrollFactor(0)
            .setDepth(2000);


        // ── Connect to Colyseus ───────────────────────────────────────────
        const serverUrl =
            (import.meta as any).env?.VITE_SERVER_URL ?? 'ws://localhost:2567';
        this.client = new Colyseus.Client(serverUrl);

        try {
            this.room = await this.client.joinOrCreate('game_room');
            statusText.setText(`✓ ${this.room.sessionId}`);
        } catch (e) {
            statusText.setText('✗ Could not connect to server');
            console.error(e);
            return;
        }

        // ── Message handlers ──────────────────────────────────────────────

        /** Server tells us our own session ID */
        this.room.onMessage('init', (data: { sessionId: string }) => {
            this.mySessionId = data.sessionId;
        });

        /** Full world snapshot at 20Hz */
        this.room.onMessage(
            'snapshot',
            (snap: Record<string, PlayerSnapshot>) => {
                // Add / update
                for (const [sid, data] of Object.entries(snap)) {
                    if (!this.players.has(sid)) {
                        this.addPlayer(sid, data);
                    }
                    const p = this.players.get(sid)!;
                    p.x     = data.x;
                    p.y     = data.y;
                    p.hp    = data.hp;
                    p.maxHp = data.maxHp;
                    p.isDead = data.isDead;
                    this.updateHealthBar(p);
                    this.updateDeadState(p);
                }
                // Remove players no longer in snapshot
                for (const sid of this.players.keys()) {
                    if (!snap[sid]) this.removePlayer(sid);
                }
            }
        );

        /** Hit feedback — show floating damage number */
        this.room.onMessage('combatEvent', (evt: CombatEvent) => {
            const target = this.players.get(evt.target);
            if (target) {
                this.spawnDamageNumber(
                    target.container.x,
                    target.container.y - 50,
                    evt.damage
                );
            }
        });

        /** A player just died */
        this.room.onMessage('playerDied', (data: { sessionId: string }) => {
            const p = this.players.get(data.sessionId);
            if (p) {
                p.isDead = true;
                p.hp = 0;
                this.updateDeadState(p);
                this.updateHealthBar(p);
            }
        });

        /** A player respawned */
        this.room.onMessage(
            'playerRespawned',
            (data: { sessionId: string; x: number; y: number }) => {
                const p = this.players.get(data.sessionId);
                if (p) {
                    p.isDead = false;
                    p.x = data.x;
                    p.y = data.y;
                }
            }
        );

        /** A player disconnected */
        this.room.onMessage('playerLeft', (data: { sessionId: string }) => {
            this.removePlayer(data.sessionId);
        });

        /** Proximity chat message received */
        this.room.onMessage(
            'chatMessage',
            (data: { sessionId: string; text: string }) => {
                const p = this.players.get(data.sessionId);
                if (p) this.spawnChatBubble(p, data.text);
            }
        );

        // ── Input ─────────────────────────────────────────────────────────

        // Build the HTML chat input overlay
        this.createChatInput();

        // Press Enter to open chat
        this.input.keyboard?.on('keydown-ENTER', () => {
            if (!this.chatOpen) this.openChat();
        });

        // Ground click → send move
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const cart  = this.isoToCart(world.x, world.y);
            this.room.send('move', { x: cart.x, y: cart.y });
            this.spawnClickRipple(world.x, world.y);
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

    // ── Phaser update loop ───────────────────────────────────────────────────

    update() {
        for (const [, p] of this.players) {
            if (p.isDead) continue;
            const iso = this.cartToIso(p.x, p.y);
            // Lerp container toward authoritative iso position
            p.container.x += (iso.x - p.container.x) * 0.25;
            p.container.y += (iso.y - p.container.y) * 0.25;
            p.container.setDepth(p.x + p.y);
        }
    }

    // ── Player management ────────────────────────────────────────────────────

    private addPlayer(sessionId: string, data: PlayerSnapshot) {
        const isLocal = sessionId === this.mySessionId;
        const iso = this.cartToIso(data.x, data.y);

        // Shadow
        const shadow = this.add.ellipse(0, 2, 22, 10, 0x000000, 0.4);

        // Body
        const body = this.add.rectangle(0, -18, 14, 22, isLocal ? 0x00ff88 : 0xff5555);

        // Head
        const head = this.add.circle(0, -38, 9, isLocal ? 0x00ff88 : 0xff5555);
        const headRing = this.add.circle(0, -38, 10);
        headRing.setStrokeStyle(1.5, isLocal ? 0x009944 : 0xaa2222);
        headRing.setFillStyle(0, 0);

        // Health bar background + foreground (drawn fresh each update)
        const healthBar = this.add.graphics();

        // Container groups everything
        const container = this.add.container(iso.x, iso.y, [
            shadow, body, head, headRing, healthBar,
        ]);
        container.setDepth(data.x + data.y);

        // Make it interactive for click-to-attack
        // The hitbox is a rectangle around the body+head area
        container.setSize(28, 52);
        container.setInteractive();
        container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            pointer.event.stopPropagation();
            if (!isLocal && this.mySessionId) {
                this.room.send('attack', { targetId: sessionId });
            }
        });
        // Highlight on hover for enemy players
        if (!isLocal) {
            container.on('pointerover', () => {
                body.setFillStyle(0xff8888);
                head.setFillStyle(0xff8888);
            });
            container.on('pointerout', () => {
                body.setFillStyle(0xff5555);
                head.setFillStyle(0xff5555);
            });
        }

        const tracked: TrackedPlayer = {
            x: data.x, y: data.y,
            hp: data.hp, maxHp: data.maxHp,
            isDead: data.isDead,
            container, healthBar, body, head,
            chatBubble: null,
            chatBubbleTimer: null,
        };

        this.players.set(sessionId, tracked);
        this.updateHealthBar(tracked);
    }

    private removePlayer(sessionId: string) {
        const p = this.players.get(sessionId);
        if (p) {
            if (p.chatBubbleTimer) clearTimeout(p.chatBubbleTimer);
            p.container.destroy();
            this.players.delete(sessionId);
        }
    }

    private updateHealthBar(p: TrackedPlayer) {
        const g = p.healthBar;
        g.clear();

        const barW = 30;
        const barH = 5;
        const x    = -barW / 2;
        const y    = -54;   // above head

        // Background
        g.fillStyle(0x330000, 0.85);
        g.fillRect(x, y, barW, barH);

        // Foreground
        const ratio = Math.max(0, p.hp / p.maxHp);
        const color = ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffaa00 : 0xff2222;
        g.fillStyle(color, 1);
        g.fillRect(x, y, Math.round(barW * ratio), barH);

        // Border
        g.lineStyle(1, 0x000000, 0.6);
        g.strokeRect(x, y, barW, barH);
    }

    private updateDeadState(p: TrackedPlayer) {
        const alive = !p.isDead;
        p.body.setAlpha(alive ? 1 : 0.25);
        p.head.setAlpha(alive ? 1 : 0.25);
    }

    // ── Visual helpers ───────────────────────────────────────────────────────

    /** Floating damage number that floats up and fades */
    private spawnDamageNumber(x: number, y: number, damage: number) {
        const txt = this.add
            .text(x, y, `-${damage}`, {
                fontSize: '16px',
                fontStyle: 'bold',
                color: '#ff4444',
                stroke: '#000000',
                strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(3000);

        this.tweens.add({
            targets: txt,
            y: y - 40,
            alpha: 0,
            duration: 900,
            ease: 'Cubic.Out',
            onComplete: () => txt.destroy(),
        });
    }

    private spawnClickRipple(x: number, y: number) {
        const circle = this.add.circle(x, y, 5, 0xffffff, 0.7).setDepth(100);
        this.tweens.add({
            targets: circle,
            scaleX: 3, scaleY: 3,
            alpha: 0,
            duration: 400,
            onComplete: () => circle.destroy(),
        });
    }

    /** Speech bubble above a player's head */
    private spawnChatBubble(p: TrackedPlayer, text: string) {
        // Clear any existing bubble
        if (p.chatBubble) {
            if (p.chatBubbleTimer) clearTimeout(p.chatBubbleTimer);
            p.chatBubble.destroy();
            p.chatBubble = null;
            p.chatBubbleTimer = null;
        }

        // Measure text to size the background
        const tempText = this.add.text(0, 0, text, {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#ffffff',
            wordWrap: { width: 120 },
        });
        const tw = tempText.width;
        const th = tempText.height;
        tempText.destroy();

        const pad   = 6;
        const boxW  = tw + pad * 2;
        const boxH  = th + pad * 2;
        const tipH  = 6;   // little downward triangle
        // Position: above health bar (health bar is at y=-54, so bubble base at ~-62)
        const baseY = -66;

        // Background bubble
        const bg = this.add.graphics();
        bg.fillStyle(0x111111, 0.88);
        bg.lineStyle(1, 0x44ff88, 0.9);
        // Rounded rect
        bg.fillRoundedRect(-boxW / 2, baseY - boxH, boxW, boxH, 5);
        bg.strokeRoundedRect(-boxW / 2, baseY - boxH, boxW, boxH, 5);
        // Tail triangle
        bg.fillTriangle(
            -5, baseY,
            5,  baseY,
            0,  baseY + tipH
        );

        // Text
        const label = this.add.text(-boxW / 2 + pad, baseY - boxH + pad, text, {
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#eeffee',
            wordWrap: { width: 120 },
        });

        const bubble = this.add.container(0, 0, [bg, label]);
        p.container.add(bubble);
        p.chatBubble = bubble;

        // Fade out after duration
        const DURATION = 5000;
        const FADE     = 800;
        p.chatBubbleTimer = setTimeout(() => {
            this.tweens.add({
                targets: bubble,
                alpha: 0,
                duration: FADE,
                onComplete: () => {
                    bubble.destroy();
                    p.chatBubble = null;
                    p.chatBubbleTimer = null;
                },
            });
        }, DURATION);
    }

    /** Create the HTML chat input overlay (hidden by default) */
    private createChatInput() {
        const wrapper = document.createElement('div');
        Object.assign(wrapper.style, {
            position:     'fixed',
            bottom:       '20px',
            left:         '50%',
            transform:    'translateX(-50%)',
            display:      'none',
            alignItems:   'center',
            gap:          '8px',
            zIndex:       '9999',
        });

        const hint = document.createElement('span');
        hint.textContent = 'say:';
        Object.assign(hint.style, {
            color:      '#88ffaa',
            fontFamily: 'monospace',
            fontSize:   '13px',
        });

        const input = document.createElement('input');
        Object.assign(input.style, {
            background:   '#0d1f0d',
            border:       '1px solid #44ff88',
            borderRadius: '4px',
            color:        '#eeffee',
            fontFamily:   'monospace',
            fontSize:     '13px',
            padding:      '4px 10px',
            outline:      'none',
            width:        '280px',
        });
        input.maxLength = 100;
        input.placeholder = 'Type and press Enter…';

        input.addEventListener('keydown', (e) => {
            e.stopPropagation(); // prevent Phaser from swallowing keys
            if (e.key === 'Enter') {
                const text = input.value.trim();
                if (text && this.room) {
                    this.room.send('chat', { text });
                }
                this.closeChat();
            } else if (e.key === 'Escape') {
                this.closeChat();
            }
        });

        wrapper.appendChild(hint);
        wrapper.appendChild(input);
        document.body.appendChild(wrapper);

        this.chatInput = input;
        (input as any)._wrapper = wrapper;
    }

    private openChat() {
        if (!this.chatInput) return;
        this.chatOpen = true;
        const wrapper = (this.chatInput as any)._wrapper as HTMLElement;
        wrapper.style.display = 'flex';
        this.chatInput.value  = '';
        // Briefly pause Phaser keyboard so game doesn't react to typing
        if (this.input.keyboard) this.input.keyboard.enabled = false;
        this.chatInput.focus();
    }

    private closeChat() {
        if (!this.chatInput) return;
        this.chatOpen = false;
        const wrapper = (this.chatInput as any)._wrapper as HTMLElement;
        wrapper.style.display = 'none';
        this.chatInput.blur();
        if (this.input.keyboard) this.input.keyboard.enabled = true;
    }

    // ── Iso math ─────────────────────────────────────────────────────────────

    private cartToIso(cx: number, cy: number) {
        return {
            x: (cx - cy) * (this.TILE_W / 2),
            y: (cx + cy) * (this.TILE_H / 2),
        };
    }

    private isoToCart(ix: number, iy: number) {
        return {
            x: iy / this.TILE_H + ix / this.TILE_W,
            y: iy / this.TILE_H - ix / this.TILE_W,
        };
    }

    // ── Grid ─────────────────────────────────────────────────────────────────

    private drawGrid() {
        const g = this.add.graphics().setDepth(0);
        const SIZE = 20;

        for (let row = 0; row < SIZE; row++) {
            for (let col = 0; col < SIZE; col++) {
                const tl = this.cartToIso(col,     row);
                const tr = this.cartToIso(col + 1, row);
                const br = this.cartToIso(col + 1, row + 1);
                const bl = this.cartToIso(col,     row + 1);
                const even = (row + col) % 2 === 0;
                g.fillStyle(even ? 0x1e3a1e : 0x172d17, 1);
                g.fillPoints(
                    [{ x: tl.x, y: tl.y }, { x: tr.x, y: tr.y },
                     { x: br.x, y: br.y }, { x: bl.x, y: bl.y }],
                    true
                );
            }
        }

        g.lineStyle(1, 0x2d6a2d, 0.7);
        for (let i = 0; i <= SIZE; i++) {
            const a = this.cartToIso(i, 0),  b = this.cartToIso(i, SIZE);
            const c = this.cartToIso(0, i),  d = this.cartToIso(SIZE, i);
            g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
            g.moveTo(c.x, c.y); g.lineTo(d.x, d.y);
        }
        g.strokePath();
    }
}
