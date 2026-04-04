import Phaser from "phaser";
import * as Colyseus from "colyseus.js";
import { HudManager } from "../ui/HudOverlay";
import type {
    AllocatableStat,
    HudPlayerData,
    OnlinePlayerData,
    PartyStateData,
} from "../ui/HudOverlay";

interface EntitySnapshot extends HudPlayerData {
    name: string;
    isMob: boolean;
    mobKind: string;
    x: number;
    y: number;
    z: number;
    groundZ: number;
    isDead: boolean;
    isGrounded: boolean;
    isFlying: boolean;
    isKnockedDown: boolean;
    combatTargetId: string;
}

type CombatEffect = "hit" | "knockup" | "knockdown" | "air-hit";

interface CombatEvent {
    attacker: string;
    target: string;
    damage: number;
    targetHp: number;
    effect: CombatEffect;
}

interface PartyNotice {
    kind: "info" | "error";
    message: string;
}

interface TrackedEntity {
    sessionId: string;
    snapshot: EntitySnapshot;
    container: Phaser.GameObjects.Container;
    art: Phaser.GameObjects.Container;
    shadow: Phaser.GameObjects.Ellipse;
    body: Phaser.GameObjects.Rectangle;
    head: Phaser.GameObjects.Arc;
    headRing: Phaser.GameObjects.Arc;
    healthBar: Phaser.GameObjects.Graphics;
    targetRing: Phaser.GameObjects.Ellipse | null;
    chatBubble: Phaser.GameObjects.Container | null;
    chatBubbleTimer: ReturnType<typeof setTimeout> | null;
}

interface RoomConnectionTransport {
    isOpen?: boolean;
    ws?: {
        readyState?: number;
    };
}

interface RoomConnectionLike {
    transport?: RoomConnectionTransport;
}

interface EntityPalette {
    fill: number;
    stroke: number;
    hoverFill: number;
}

export class GameScene extends Phaser.Scene {
    private client: Colyseus.Client | null = null;
    private room: Colyseus.Room | null = null;
    private hudManager: HudManager | null = null;
    private statusText: Phaser.GameObjects.Text | null = null;
    private noticeText: Phaser.GameObjects.Text | null = null;
    private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
    private moveKeys: {
        up: Phaser.Input.Keyboard.Key;
        left: Phaser.Input.Keyboard.Key;
        down: Phaser.Input.Keyboard.Key;
        right: Phaser.Input.Keyboard.Key;
    } | null = null;

    private readonly entities = new Map<string, TrackedEntity>();
    private mySessionId = "";
    private myTargetId = "";
    private isRoomActive = false;
    private lastMoveInput = { x: 0, y: 0 };

    private chatWrapper: HTMLDivElement | null = null;
    private chatInput: HTMLInputElement | null = null;
    private chatOpen = false;

    private readonly tileWidth = 64;
    private readonly tileHeight = 32;
    private readonly heightStep = 24;
    private readonly worldSize = 20;

    constructor() {
        super("GameScene");
    }

    preload() {}

    async create() {
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
        this.events.once(Phaser.Scenes.Events.DESTROY, this.handleSceneShutdown, this);

        this.cameras.main.setBackgroundColor("#1a1a2e");
        this.drawGrid();

        const center = this.pointToWorld(10, 10, 0);
        this.cameras.main.centerOn(center.x, center.y);
        this.cameras.main.setZoom(1.5);

        this.statusText = this.add.text(10, 10, "Connecting...", {
            fontSize: "13px",
            color: "#ffffff",
            backgroundColor: "#00000099",
            padding: { x: 8, y: 4 },
        })
            .setScrollFactor(0)
            .setDepth(2000);

        this.noticeText = this.add.text(10, 62, "", {
            fontSize: "11px",
            color: "#ffe17a",
            backgroundColor: "#00000066",
            padding: { x: 8, y: 4 },
        })
            .setScrollFactor(0)
            .setDepth(2000)
            .setVisible(false);

        this.add.text(10, 36, "Enter chat | WASD move | Space jump", {
            fontSize: "11px",
            color: "#88ffaa99",
            fontFamily: "monospace",
        })
            .setScrollFactor(0)
            .setDepth(2000);

        this.hudManager = new HudManager({
            onAllocateStat: (stat: AllocatableStat) => {
                this.safeSend("allocateStat", { stat });
            },
            onCreateParty: () => {
                this.safeSend("partyCreate");
            },
            onInviteParty: (targetId: string) => {
                this.safeSend("partyInvite", { targetId });
            },
            onKickParty: (targetId: string) => {
                this.safeSend("partyKick", { targetId });
            },
            onLeaveParty: () => {
                this.safeSend("partyLeave");
            },
            onAcceptPartyInvite: (partyId: string) => {
                this.safeSend("partyAcceptInvite", { partyId });
            },
            onDeclinePartyInvite: (partyId: string) => {
                this.safeSend("partyDeclineInvite", { partyId });
            },
        });

        try {
            const serverUrl = this.resolveServerUrl();
            this.client = new Colyseus.Client(serverUrl);
            this.room = await this.client.joinOrCreate("game_room");
            this.mySessionId = this.room.sessionId;
            this.isRoomActive = true;
            this.statusText.setText(`Connected ${this.room.sessionId.slice(0, 8)}`);
            this.hudManager.setLocalSessionId(this.mySessionId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not connect to server";
            this.statusText?.setText(`Error: ${message}`);
            console.error(error);
            return;
        }

        this.registerRoomHandlers();
        this.createChatInput();
        this.registerInputHandlers();
    }

    update() {
        this.panCamera();
        this.syncMoveInput();

        this.entities.forEach((entity) => {
            const { snapshot } = entity;
            const ground = this.pointToWorld(snapshot.x, snapshot.y, 0);
            entity.container.x += (ground.x - entity.container.x) * 0.25;
            entity.container.y += (ground.y - entity.container.y) * 0.25;

            const airHeight = Math.max(0, snapshot.z - snapshot.groundZ);
            const targetArtY = -this.heightToScreen(airHeight);
            entity.art.y += (targetArtY - entity.art.y) * 0.25;

            entity.container.setDepth(snapshot.x + snapshot.y);
            entity.shadow.setScale(airHeight > 0.05 ? 0.82 : 1);
            entity.shadow.setAlpha(snapshot.isDead ? 0.14 : airHeight > 0.05 ? 0.2 : 0.4);
        });
    }

    private registerRoomHandlers() {
        if (!this.room || !this.statusText) return;

        this.room.onError((code, message) => {
            this.isRoomActive = false;
            this.statusText?.setText(`Room error ${code}`);
            console.error("[Room error]", code, message);
        });

        this.room.onLeave((code) => {
            this.isRoomActive = false;
            this.statusText?.setText(`Disconnected (${code})`);
            console.error("[Room leave]", code);
        });

        this.room.onMessage("init", (data: { sessionId: string }) => {
            this.mySessionId = data.sessionId;
            this.hudManager?.setLocalSessionId(this.mySessionId);
        });

        this.room.onMessage("snapshot", (snapshot: Record<string, Partial<EntitySnapshot>>) => {
            this.handleSnapshot(snapshot);
        });

        this.room.onMessage("combatEvent", (event: CombatEvent) => {
            const target = this.entities.get(event.target);
            if (!target) return;

            const x = target.container.x;
            const y = target.container.y + target.art.y - 58;
            this.spawnDamageNumber(x, y, event.damage, event.effect);

            target.snapshot.hp = event.targetHp;
            this.updateEntityVisuals(target);
        });

        this.room.onMessage("playerDied", (data: { sessionId: string }) => {
            const entity = this.entities.get(data.sessionId);
            if (!entity) return;
            entity.snapshot.isDead = true;
            entity.snapshot.hp = 0;
            entity.snapshot.isKnockedDown = false;
            this.updateEntityVisuals(entity);
        });

        this.room.onMessage("playerRespawned", (data: { sessionId: string; x: number; y: number; z: number }) => {
            const entity = this.entities.get(data.sessionId);
            if (!entity) return;
            entity.snapshot.isDead = false;
            entity.snapshot.isKnockedDown = false;
            entity.snapshot.hp = entity.snapshot.maxHp;
            entity.snapshot.x = data.x;
            entity.snapshot.y = data.y;
            entity.snapshot.groundZ = this.getGroundHeight(data.x, data.y);
            entity.snapshot.z = data.z;
            this.updateEntityVisuals(entity);
        });

        this.room.onMessage("playerLeft", (data: { sessionId: string }) => {
            this.removeEntity(data.sessionId);
        });

        this.room.onMessage("chatMessage", (data: { sessionId: string; text: string }) => {
            const entity = this.entities.get(data.sessionId);
            if (entity) this.spawnChatBubble(entity, data.text);
        });

        this.room.onMessage("partyState", (state: PartyStateData) => {
            this.hudManager?.updatePartyState(state);
        });

        this.room.onMessage("partyNotice", (notice: PartyNotice) => {
            this.showNotice(notice.message, notice.kind === "error" ? "#ff8a80" : "#ffe17a");
        });
    }

    private registerInputHandlers() {
        this.input.keyboard?.on("keydown-ENTER", () => {
            if (!this.chatOpen) this.openChat();
        });

        this.input.keyboard?.on("keydown-SPACE", (event: KeyboardEvent) => {
            if (this.chatOpen) return;
            event.preventDefault();
            this.safeSend("jump");
        });

        this.input.on(
            "pointerdown",
            (
                pointer: Phaser.Input.Pointer,
                currentlyOver: Phaser.GameObjects.GameObject[]
            ) => {
                if (currentlyOver.length > 0) return;

                const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
                const cart = this.screenToGroundCart(world.x, world.y);
                const ripple = this.pointToWorld(cart.x, cart.y, 0);

                this.safeSend("move", { x: cart.x, y: cart.y });
                this.spawnClickRipple(ripple.x, ripple.y);
            }
        );

        this.cursors = this.input.keyboard?.createCursorKeys() ?? null;
        this.moveKeys = this.input.keyboard?.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            right: Phaser.Input.Keyboard.KeyCodes.D,
        }) as {
            up: Phaser.Input.Keyboard.Key;
            left: Phaser.Input.Keyboard.Key;
            down: Phaser.Input.Keyboard.Key;
            right: Phaser.Input.Keyboard.Key;
        } | null;
    }

    private panCamera() {
        if (!this.cursors) return;
        if (this.cursors.left.isDown) this.cameras.main.scrollX -= 5;
        if (this.cursors.right.isDown) this.cameras.main.scrollX += 5;
        if (this.cursors.up.isDown) this.cameras.main.scrollY -= 5;
        if (this.cursors.down.isDown) this.cameras.main.scrollY += 5;
    }

    private syncMoveInput() {
        if (!this.moveKeys) return;

        const x = (this.moveKeys.right.isDown ? 1 : 0) - (this.moveKeys.left.isDown ? 1 : 0);
        const y = (this.moveKeys.down.isDown ? 1 : 0) - (this.moveKeys.up.isDown ? 1 : 0);

        if (this.chatOpen) {
            if (this.lastMoveInput.x !== 0 || this.lastMoveInput.y !== 0) {
                this.lastMoveInput = { x: 0, y: 0 };
                this.safeSend("moveInput", this.lastMoveInput);
            }
            return;
        }

        if (x === this.lastMoveInput.x && y === this.lastMoveInput.y) return;

        this.lastMoveInput = { x, y };
        this.safeSend("moveInput", this.lastMoveInput);
    }

    private handleSnapshot(snapshot: Record<string, Partial<EntitySnapshot>>) {
        Object.entries(snapshot).forEach(([sessionId, rawData]) => {
            const existing = this.entities.get(sessionId);
            const data = this.normalizeSnapshot(rawData, existing?.snapshot);
            if (!existing) {
                this.addEntity(sessionId, data);
                return;
            }

            existing.snapshot = data;
            this.updateEntityVisuals(existing);
        });

        Array.from(this.entities.keys()).forEach((sessionId) => {
            if (!snapshot[sessionId]) this.removeEntity(sessionId);
        });

        this.syncLocalTargetRing();

        const local = this.entities.get(this.mySessionId);
        if (local) this.hudManager?.updateLocalPlayer(local.snapshot);
        this.hudManager?.updateOnlinePlayers(this.buildOnlinePlayerList());
    }

    private addEntity(sessionId: string, snapshot: EntitySnapshot) {
        const palette = this.getEntityPalette(snapshot, sessionId, false);
        const ground = this.pointToWorld(snapshot.x, snapshot.y, 0);

        const shadow = this.add.ellipse(0, 4, 24, 11, 0x000000, 0.4);
        const body = this.add.rectangle(0, -18, 14, 22, palette.fill);
        const head = this.add.circle(0, -38, 9, palette.fill);
        const headRing = this.add.circle(0, -38, 10);
        headRing.setStrokeStyle(1.5, palette.stroke);
        headRing.setFillStyle(0, 0);

        const healthBar = this.add.graphics();
        const art = this.add.container(0, 0, [body, head, headRing, healthBar]);
        const container = this.add.container(ground.x, ground.y, [shadow, art]);
        container.setDepth(snapshot.x + snapshot.y);

        const tracked: TrackedEntity = {
            sessionId,
            snapshot,
            container,
            art,
            shadow,
            body,
            head,
            headRing,
            healthBar,
            targetRing: null,
            chatBubble: null,
            chatBubbleTimer: null,
        };

        const hitArea = new Phaser.Geom.Rectangle(-16, -76, 32, 84);
        container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

        container.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            pointer.event.stopPropagation();
            const entity = this.entities.get(sessionId);
            if (!entity || entity.snapshot.isDead || sessionId === this.mySessionId) return;
            this.safeSend("setTarget", { targetId: sessionId });
        });

        container.on("pointerover", () => {
            if (sessionId !== this.mySessionId) this.applyEntityPalette(tracked, true);
        });

        container.on("pointerout", () => {
            this.applyEntityPalette(tracked, false);
        });

        this.entities.set(sessionId, tracked);
        this.updateEntityVisuals(tracked);
    }

    private removeEntity(sessionId: string) {
        const entity = this.entities.get(sessionId);
        if (!entity) return;

        if (entity.chatBubbleTimer) clearTimeout(entity.chatBubbleTimer);
        entity.chatBubble?.destroy();

        if (this.myTargetId === sessionId) {
            this.myTargetId = "";
        }

        entity.container.destroy();
        this.entities.delete(sessionId);
    }

    private syncLocalTargetRing() {
        const me = this.entities.get(this.mySessionId);
        const nextTarget = me?.snapshot.combatTargetId ?? "";
        if (nextTarget === this.myTargetId) return;

        if (this.myTargetId) {
            const previous = this.entities.get(this.myTargetId);
            if (previous) this.updateTargetRing(previous, false);
        }

        this.myTargetId = nextTarget;
        if (!this.myTargetId) return;

        const next = this.entities.get(this.myTargetId);
        if (!next || next.snapshot.isDead) {
            this.myTargetId = "";
            return;
        }

        this.updateTargetRing(next, true);
    }

    private updateTargetRing(entity: TrackedEntity, show: boolean) {
        if (!show) {
            if (!entity.targetRing) return;
            this.tweens.killTweensOf(entity.targetRing);
            entity.targetRing.destroy();
            entity.targetRing = null;
            return;
        }

        if (entity.targetRing) return;

        const ring = this.add.ellipse(0, 4, 28, 12, 0xff8800, 0);
        ring.setStrokeStyle(2, 0xff8800, 0.9);
        entity.container.addAt(ring, 1);
        entity.targetRing = ring;

        this.tweens.add({
            targets: ring,
            alpha: { from: 0.25, to: 1 },
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
        });
    }

    private updateEntityVisuals(entity: TrackedEntity) {
        this.applyEntityPalette(entity, false);
        this.updateEntityPose(entity);
        this.updateHealthBar(entity);
    }

    private updateEntityPose(entity: TrackedEntity) {
        const { snapshot, body, head, headRing, art } = entity;
        const aliveAlpha = snapshot.isDead ? 0.28 : 1;

        body.setAlpha(aliveAlpha);
        head.setAlpha(aliveAlpha);
        headRing.setAlpha(snapshot.isDead ? 0.2 : 1);

        if (snapshot.isKnockedDown) {
            art.angle = 84;
            body.y = -10;
            head.y = -16;
            headRing.y = -16;
        } else {
            art.angle = 0;
            body.y = -18;
            head.y = -38;
            headRing.y = -38;
        }
    }

    private updateHealthBar(entity: TrackedEntity) {
        const graphics = entity.healthBar;
        const { hp, maxHp } = entity.snapshot;
        const ratio = maxHp > 0 ? Phaser.Math.Clamp(hp / maxHp, 0, 1) : 0;

        graphics.clear();
        graphics.fillStyle(0x330000, 0.85);
        graphics.fillRect(-15, -54, 30, 5);

        const color = ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffaa00 : 0xff3333;
        graphics.fillStyle(color, 1);
        graphics.fillRect(-15, -54, Math.round(30 * ratio), 5);
        graphics.lineStyle(1, 0x000000, 0.6);
        graphics.strokeRect(-15, -54, 30, 5);
    }

    private applyEntityPalette(entity: TrackedEntity, hovered: boolean) {
        const palette = this.getEntityPalette(entity.snapshot, entity.sessionId, hovered);
        entity.body.setFillStyle(palette.fill);
        entity.head.setFillStyle(palette.fill);
        entity.headRing.setStrokeStyle(1.5, palette.stroke);
    }

    private getEntityPalette(snapshot: EntitySnapshot, sessionId: string, hovered: boolean): EntityPalette {
        let fill = 0xff5555;
        let stroke = 0xaa2222;
        let hoverFill = 0xff8888;

        if (sessionId === this.mySessionId) {
            fill = 0x00ff88;
            stroke = 0x009944;
            hoverFill = 0x33ffaa;
        } else if (snapshot.isMob && snapshot.mobKind === "slime") {
            fill = 0x7dff5b;
            stroke = 0x2e8d2a;
            hoverFill = 0xa6ff8b;
        } else if (snapshot.isMob && snapshot.mobKind === "bat") {
            fill = 0x63b9ff;
            stroke = 0x245aa8;
            hoverFill = 0x8fd0ff;
        }

        return {
            fill: hovered ? hoverFill : fill,
            stroke,
            hoverFill,
        };
    }

    private spawnDamageNumber(x: number, y: number, damage: number, effect: CombatEffect) {
        const colorByEffect: Record<CombatEffect, string> = {
            hit: "#ff6666",
            knockup: "#ffd166",
            knockdown: "#ff9f43",
            "air-hit": "#66d9ff",
        };

        const label = this.add.text(x, y, `-${damage}`, {
            fontSize: "16px",
            fontStyle: "bold",
            color: colorByEffect[effect],
            stroke: "#000000",
            strokeThickness: 3,
        })
            .setOrigin(0.5)
            .setDepth(3000);

        this.tweens.add({
            targets: label,
            y: y - 42,
            alpha: 0,
            duration: 900,
            ease: "Cubic.Out",
            onComplete: () => label.destroy(),
        });
    }

    private buildOnlinePlayerList(): OnlinePlayerData[] {
        const players: OnlinePlayerData[] = [];

        this.entities.forEach((entity, sessionId) => {
            if (entity.snapshot.isMob || sessionId === this.mySessionId) return;
            players.push({
                sessionId,
                name: entity.snapshot.name,
                level: entity.snapshot.level,
            });
        });

        return players;
    }

    private showNotice(message: string, color: string) {
        if (!this.noticeText) return;

        this.noticeText.setText(message);
        this.noticeText.setColor(color);
        this.noticeText.setAlpha(1);
        this.noticeText.setVisible(true);

        this.tweens.killTweensOf(this.noticeText);
        this.tweens.add({
            targets: this.noticeText,
            alpha: 0,
            duration: 2200,
            ease: "Quad.Out",
            onComplete: () => {
                this.noticeText?.setVisible(false);
            },
        });
    }

    private spawnClickRipple(x: number, y: number) {
        const ring = this.add.circle(x, y, 5, 0xffffff, 0.12)
            .setStrokeStyle(2, 0xffffff, 0.7)
            .setDepth(100);

        this.tweens.add({
            targets: ring,
            scaleX: 3,
            scaleY: 3,
            alpha: 0,
            duration: 380,
            onComplete: () => ring.destroy(),
        });
    }

    private spawnChatBubble(entity: TrackedEntity, text: string) {
        if (entity.chatBubbleTimer) clearTimeout(entity.chatBubbleTimer);
        entity.chatBubble?.destroy();
        entity.chatBubble = null;
        entity.chatBubbleTimer = null;

        const probe = this.add.text(0, 0, text, {
            fontSize: "11px",
            fontFamily: "monospace",
            color: "#ffffff",
            wordWrap: { width: 120 },
        });
        const textWidth = probe.width;
        const textHeight = probe.height;
        probe.destroy();

        const padding = 6;
        const boxWidth = textWidth + padding * 2;
        const boxHeight = textHeight + padding * 2;
        const baseY = -66;

        const background = this.add.graphics();
        background.fillStyle(0x111111, 0.88);
        background.lineStyle(1, 0x44ff88, 0.9);
        background.fillRoundedRect(-boxWidth / 2, baseY - boxHeight, boxWidth, boxHeight, 5);
        background.strokeRoundedRect(-boxWidth / 2, baseY - boxHeight, boxWidth, boxHeight, 5);
        background.fillTriangle(-5, baseY, 5, baseY, 0, baseY + 6);

        const label = this.add.text(-boxWidth / 2 + padding, baseY - boxHeight + padding, text, {
            fontSize: "11px",
            fontFamily: "monospace",
            color: "#eeffee",
            wordWrap: { width: 120 },
        });

        const bubble = this.add.container(0, 0, [background, label]);
        entity.art.add(bubble);
        entity.chatBubble = bubble;

        entity.chatBubbleTimer = setTimeout(() => {
            this.tweens.add({
                targets: bubble,
                alpha: 0,
                duration: 800,
                onComplete: () => {
                    bubble.destroy();
                    entity.chatBubble = null;
                    entity.chatBubbleTimer = null;
                },
            });
        }, 5000);
    }

    private createChatInput() {
        this.chatWrapper?.remove();
        document.getElementById("chat-input-wrapper")?.remove();

        const wrapper = document.createElement("div");
        wrapper.id = "chat-input-wrapper";
        Object.assign(wrapper.style, {
            position: "fixed",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "none",
            alignItems: "center",
            gap: "8px",
            zIndex: "9999",
        });

        const hint = document.createElement("span");
        hint.textContent = "say:";
        Object.assign(hint.style, {
            color: "#88ffaa",
            fontFamily: "monospace",
            fontSize: "13px",
        });

        const input = document.createElement("input");
        Object.assign(input.style, {
            background: "#0d1f0d",
            border: "1px solid #44ff88",
            borderRadius: "4px",
            color: "#eeffee",
            fontFamily: "monospace",
            fontSize: "13px",
            padding: "4px 10px",
            outline: "none",
            width: "280px",
        });
        input.maxLength = 100;
        input.placeholder = "Type and press Enter...";

        input.addEventListener("keydown", (event) => {
            event.stopPropagation();

            if (event.key === "Enter") {
                const text = input.value.trim();
                if (text) this.safeSend("chat", { text });
                this.closeChat();
                return;
            }

            if (event.key === "Escape") {
                this.closeChat();
            }
        });

        wrapper.appendChild(hint);
        wrapper.appendChild(input);
        document.body.appendChild(wrapper);

        this.chatWrapper = wrapper;
        this.chatInput = input;
    }

    private openChat() {
        if (!this.chatInput || !this.chatWrapper) return;
        this.chatOpen = true;
        this.chatWrapper.style.display = "flex";
        this.chatInput.value = "";
        if (this.input.keyboard) this.input.keyboard.enabled = false;
        this.chatInput.focus();
    }

    private closeChat() {
        if (!this.chatInput || !this.chatWrapper) return;
        this.chatOpen = false;
        this.chatWrapper.style.display = "none";
        this.chatInput.blur();
        if (this.input.keyboard) this.input.keyboard.enabled = true;
    }

    private handleSceneShutdown() {
        this.isRoomActive = false;
        this.closeChat();
        this.chatWrapper?.remove();
        this.chatWrapper = null;
        this.chatInput = null;
        this.hudManager?.destroy();
        this.hudManager = null;

        this.entities.forEach((entity) => {
            if (entity.chatBubbleTimer) clearTimeout(entity.chatBubbleTimer);
            entity.container.destroy();
        });
        this.entities.clear();

        const room = this.room;
        this.room = null;
        if (room && this.isRoomTransportOpen(room)) {
            void room.leave();
        }
    }

    private resolveServerUrl(): string {
        const configuredUrl = (import.meta as { env?: { VITE_SERVER_URL?: string } }).env?.VITE_SERVER_URL?.trim();
        if (configuredUrl) return configuredUrl;

        const hostname = window.location.hostname;
        const isLocalhost =
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1";

        if (isLocalhost) {
            return "ws://localhost:2567";
        }

        throw new Error(
            "Missing VITE_SERVER_URL for this deployment. Configure the hosted websocket server URL instead of falling back to localhost."
        );
    }

    private safeSend(type: string, payload?: unknown): boolean {
        if (!this.canSendToRoom()) return false;
        if (!this.room) return false;

        try {
            if (payload === undefined) {
                this.room.send(type);
            } else {
                this.room.send(type, payload);
            }
            return true;
        } catch (error) {
            this.isRoomActive = false;
            if (this.isRoomTransportOpen(this.room)) {
                console.error(`[Send failed] ${type}`, error);
            } else {
                console.warn(`[Send dropped] ${type} skipped because the room connection is closing.`);
            }
            return false;
        }
    }

    private canSendToRoom(): boolean {
        if (!this.room || !this.isRoomActive) return false;

        const isOpen = this.isRoomTransportOpen(this.room);
        if (!isOpen) this.isRoomActive = false;
        return isOpen;
    }

    private isRoomTransportOpen(room: Colyseus.Room): boolean {
        const connection = (room as Colyseus.Room & { connection?: RoomConnectionLike }).connection;
        const transport = connection?.transport;

        if (typeof transport?.isOpen === "boolean") {
            return transport.isOpen;
        }

        const readyState = transport?.ws?.readyState;
        if (typeof readyState === "number" && typeof WebSocket !== "undefined") {
            return readyState === WebSocket.OPEN;
        }

        return true;
    }

    private cartToIso(x: number, y: number) {
        return {
            x: (x - y) * (this.tileWidth / 2),
            y: (x + y) * (this.tileHeight / 2),
        };
    }

    private isoToCart(x: number, y: number) {
        return {
            x: y / this.tileHeight + x / this.tileWidth,
            y: y / this.tileHeight - x / this.tileWidth,
        };
    }

    private pointToWorld(x: number, y: number, z: number) {
        const iso = this.cartToIso(x, y);
        return {
            x: iso.x,
            y: iso.y - this.heightToScreen(z),
        };
    }

    private screenToGroundCart(worldX: number, worldY: number) {
        return this.isoToCart(worldX, worldY);
    }

    private heightToScreen(height: number): number {
        return height * this.heightStep;
    }

    private getGroundHeight(x: number, y: number): number {
        const rampEast = Math.max(0, (x - 4) * 0.12);
        const rampNorth = Math.max(0, (8 - y) * 0.1);

        const hillDx = x - 14;
        const hillDy = y - 6;
        const hillDistance = Math.sqrt(hillDx * hillDx + hillDy * hillDy);
        const hill = Math.max(0, 1.05 - hillDistance * 0.18);

        return Phaser.Math.Clamp(rampEast + rampNorth + hill, 0, 2.4);
    }

    private drawGrid() {
        const graphics = this.add.graphics().setDepth(0);

        for (let row = 0; row < this.worldSize; row += 1) {
            for (let col = 0; col < this.worldSize; col += 1) {
                const tl = this.pointToWorld(col, row, 0);
                const tr = this.pointToWorld(col + 1, row, 0);
                const br = this.pointToWorld(col + 1, row + 1, 0);
                const bl = this.pointToWorld(col, row + 1, 0);
                const even = (row + col) % 2 === 0;
                const fill = even ? 0x1e3a1e : 0x172d17;
                const edge = 0x2d6a2d;

                const points = [
                    { x: tl.x, y: tl.y },
                    { x: tr.x, y: tr.y },
                    { x: br.x, y: br.y },
                    { x: bl.x, y: bl.y },
                ];

                graphics.fillStyle(fill, 1);
                graphics.fillPoints(points, true);
                graphics.lineStyle(1, edge, 0.72);
                graphics.strokePoints(points, true);
            }
        }
    }

    private normalizeSnapshot(
        incoming: Partial<EntitySnapshot>,
        previous?: EntitySnapshot
    ): EntitySnapshot {
        const fallback = previous ?? this.createDefaultSnapshot();

        return {
            name: this.readString(incoming.name, fallback.name),
            isMob: this.readBoolean(incoming.isMob, fallback.isMob),
            mobKind: this.readString(incoming.mobKind, fallback.mobKind),
            x: this.readNumber(incoming.x, fallback.x),
            y: this.readNumber(incoming.y, fallback.y),
            z: this.readNumber(incoming.z, fallback.z),
            groundZ: this.readNumber(incoming.groundZ, fallback.groundZ),
            level: this.readNumber(incoming.level, fallback.level),
            exp: this.readNumber(incoming.exp, fallback.exp),
            expToNextLevel: this.readNumber(incoming.expToNextLevel, fallback.expToNextLevel),
            bonusStatPoints: this.readNumber(incoming.bonusStatPoints, fallback.bonusStatPoints),
            str: this.readNumber(incoming.str, fallback.str),
            agi: this.readNumber(incoming.agi, fallback.agi),
            int: this.readNumber(incoming.int, fallback.int),
            vit: this.readNumber(incoming.vit, fallback.vit),
            attackDamage: this.readNumber(incoming.attackDamage, fallback.attackDamage),
            attackSpeed: this.readNumber(incoming.attackSpeed, fallback.attackSpeed),
            moveSpeed: this.readNumber(incoming.moveSpeed, fallback.moveSpeed),
            hp: this.readNumber(incoming.hp, fallback.hp),
            maxHp: this.readNumber(incoming.maxHp, fallback.maxHp),
            isDead: this.readBoolean(incoming.isDead, fallback.isDead),
            isGrounded: this.readBoolean(incoming.isGrounded, fallback.isGrounded),
            isFlying: this.readBoolean(incoming.isFlying, fallback.isFlying),
            isKnockedDown: this.readBoolean(incoming.isKnockedDown, fallback.isKnockedDown),
            combatTargetId: this.readString(incoming.combatTargetId, fallback.combatTargetId),
        };
    }

    private createDefaultSnapshot(): EntitySnapshot {
        return {
            name: "Player",
            isMob: false,
            mobKind: "",
            x: 0,
            y: 0,
            z: 0,
            groundZ: 0,
            level: 1,
            exp: 0,
            expToNextLevel: 35,
            bonusStatPoints: 0,
            str: 5,
            agi: 5,
            int: 5,
            vit: 5,
            attackDamage: 0,
            attackSpeed: 0,
            moveSpeed: 0,
            hp: 100,
            maxHp: 100,
            isDead: false,
            isGrounded: true,
            isFlying: false,
            isKnockedDown: false,
            combatTargetId: "",
        };
    }

    private readNumber(value: unknown, fallback: number): number {
        return typeof value === "number" && Number.isFinite(value) ? value : fallback;
    }

    private readBoolean(value: unknown, fallback: boolean): boolean {
        return typeof value === "boolean" ? value : fallback;
    }

    private readString(value: unknown, fallback: string): string {
        return typeof value === "string" ? value : fallback;
    }
}
