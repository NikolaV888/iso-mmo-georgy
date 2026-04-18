import Phaser from "phaser";
import * as Colyseus from "colyseus.js";
import { HudManager } from "../ui/HudOverlay";
import type {
    AllocatableStat,
    HudChatTone,
    HudPlayerData,
    HotbarActionId,
    HudToastKind,
    InventoryStateData,
    NpcDialogStateData,
    OnlinePlayerData,
    PartyStateData,
    PvpStateData,
    QuestStateData,
    SkillStateData,
    TargetFrameData,
} from "../ui/HudOverlay";

interface EntitySnapshot extends HudPlayerData {
    name: string;
    isMob: boolean;
    mobKind: string;
    isNpc: boolean;
    npcKind: string;
    x: number;
    y: number;
    z: number;
    groundZ: number;
    isDead: boolean;
    isGrounded: boolean;
    isFlying: boolean;
    isKnockedDown: boolean;
    attackRange: number;
    pvpEnabled: boolean;
    pvpTagged: boolean;
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

interface InventoryNotice {
    kind: "info" | "error";
    message: string;
}

interface SkillNotice {
    kind: "info" | "error";
    message: string;
}

interface NpcNotice {
    kind: "info" | "error";
    message: string;
}

interface PvpNotice {
    kind: "info" | "error";
    message: string;
}

interface ChatNotice {
    kind: "info" | "error";
    message: string;
}

interface ChatMessagePayload {
    channel: "say" | "party" | "whisper";
    sessionId: string;
    senderName: string;
    text: string;
    targetSessionId?: string;
    targetName?: string;
    direction?: "incoming" | "outgoing";
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
    nameLabel: Phaser.GameObjects.Text;
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
    private static readonly PLAYER_DEPTH_BASE = 1000;

    private client: Colyseus.Client | null = null;
    private room: Colyseus.Room | null = null;
    private hudManager: HudManager | null = null;
    private statusText: Phaser.GameObjects.Text | null = null;
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
        this.input.mouse?.disableContextMenu();

        this.statusText = this.add.text(10, 10, "Connecting...", {
            fontSize: "13px",
            color: "#ffffff",
            backgroundColor: "#00000099",
            padding: { x: 8, y: 4 },
        })
            .setScrollFactor(0)
            .setDepth(2000);

        this.add.text(10, 36, "Tab cycle target / nearby mob auto-attack | Right-click player menu | Enter chat | WASD move | Space jump | Click NPC to trade | C/E/I/P/K/L panels | Esc close", {
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
            onTogglePvpMode: () => {
                this.safeSend("togglePvpMode");
            },
            onCreateParty: () => {
                this.safeSend("partyCreate");
            },
            onInviteParty: (targetId: string) => {
                this.safeSend("partyInvite", { targetId });
            },
            onWhisperPlayerTarget: (targetId: string) => {
                this.startWhisperToPlayer(targetId);
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
            onEquipInventoryItem: (tab, index) => {
                this.safeSend("inventoryEquip", { tab, index });
            },
            onUnequipInventoryItem: (slot) => {
                this.safeSend("inventoryUnequip", { slot });
            },
            onUseInventoryItem: (tab, index) => {
                this.safeSend("inventoryUse", { tab, index });
            },
            onCloseNpcDialog: () => {
                this.safeSend("npcClose");
            },
            onBuyShopItem: (itemId: string) => {
                this.safeSend("shopBuy", { itemId });
            },
            onSellShopItem: (tab, index) => {
                this.safeSend("shopSell", { tab, index });
            },
            onAcceptQuest: (questId: string) => {
                this.safeSend("questAccept", { questId });
            },
            onClaimQuest: (questId: string) => {
                this.safeSend("questClaim", { questId });
            },
            onSendDuelChallenge: (targetId, stake) => {
                this.safeSend("duelRequest", {
                    targetId,
                    gold: stake.gold,
                    tab: stake.tab,
                    index: stake.index,
                });
            },
            onAcceptDuelChallenge: (challengerId, stake) => {
                this.safeSend("duelAccept", {
                    challengerId,
                    gold: stake.gold,
                    tab: stake.tab,
                    index: stake.index,
                });
            },
            onDeclineDuelChallenge: (challengerId) => {
                this.safeSend("duelDecline", { challengerId });
            },
            onCancelDuelChallenge: () => {
                this.safeSend("duelCancel");
            },
            onSubmitChat: (channel, text) => {
                this.handleChatSubmit(channel, text);
            },
            onChatFocusChange: (focused) => {
                this.chatOpen = focused;
                if (this.input.keyboard) this.input.keyboard.enabled = !focused;
            },
            onTriggerHotbarAction: (actionId: HotbarActionId) => {
                this.handleHotbarAction(actionId);
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
            this.hudManager.showToast("Connected to game room.", "info");
            this.logSystemMessage("Connected to game room.", "neutral");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not connect to server";
            this.statusText?.setText(`Error: ${message}`);
            this.hudManager?.showToast(message, "error");
            this.logSystemMessage(message, "error");
            console.error(error);
            return;
        }

        this.registerRoomHandlers();
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

            entity.container.setDepth(this.getEntityDepth(snapshot.x, snapshot.y));
            entity.shadow.setScale(airHeight > 0.05 ? 0.82 : 1);
            entity.shadow.setAlpha(snapshot.isDead ? 0.14 : airHeight > 0.05 ? 0.2 : 0.4);
        });
    }

    private registerRoomHandlers() {
        if (!this.room || !this.statusText) return;

        this.room.onError((code, message) => {
            this.isRoomActive = false;
            this.statusText?.setText(`Room error ${code}`);
            this.showSystemNotice(message || `Room error ${code}`, "error");
            console.error("[Room error]", code, message);
        });

        this.room.onLeave((code) => {
            this.isRoomActive = false;
            this.statusText?.setText(`Disconnected (${code})`);
            this.showSystemNotice(`Disconnected (${code})`, "error");
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
            this.refreshTargetHud();
        });

        this.room.onMessage("playerDied", (data: { sessionId: string }) => {
            const entity = this.entities.get(data.sessionId);
            if (!entity) return;
            entity.snapshot.isDead = true;
            entity.snapshot.hp = 0;
            entity.snapshot.isKnockedDown = false;
            this.updateEntityVisuals(entity);
            this.refreshTargetHud();
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
            this.refreshTargetHud();
        });

        this.room.onMessage("playerLeft", (data: { sessionId: string }) => {
            this.removeEntity(data.sessionId);
        });

        this.room.onMessage("chatMessage", (data: ChatMessagePayload) => {
            if (data.channel === "say") {
                const entity = this.entities.get(data.sessionId);
                if (entity) this.spawnChatBubble(entity, data.text);
            }

            this.handleChatMessage(data);
        });

        this.room.onMessage("partyState", (state: PartyStateData) => {
            this.hudManager?.updatePartyState(state);
        });

        this.room.onMessage("inventoryState", (state: InventoryStateData) => {
            this.hudManager?.updateInventoryState(state);
        });

        this.room.onMessage("skillState", (state: SkillStateData) => {
            this.hudManager?.updateSkillState(state);
        });

        this.room.onMessage("questState", (state: QuestStateData) => {
            this.hudManager?.updateQuestState(state);
        });

        this.room.onMessage("npcDialogState", (state: NpcDialogStateData) => {
            this.hudManager?.updateNpcDialogState(state);
        });

        this.room.onMessage("pvpState", (state: PvpStateData) => {
            this.hudManager?.updatePvpState(state);
        });

        this.room.onMessage("partyNotice", (notice: PartyNotice) => {
            this.showSystemNotice(notice.message, notice.kind);
        });

        this.room.onMessage("inventoryNotice", (notice: InventoryNotice) => {
            this.showSystemNotice(notice.message, notice.kind);
        });

        this.room.onMessage("skillNotice", (notice: SkillNotice) => {
            this.showSystemNotice(notice.message, notice.kind);
        });

        this.room.onMessage("npcNotice", (notice: NpcNotice) => {
            this.showSystemNotice(notice.message, notice.kind);
        });

        this.room.onMessage("chatNotice", (notice: ChatNotice) => {
            this.showSystemNotice(notice.message, notice.kind);
        });

        this.room.onMessage("pvpNotice", (notice: PvpNotice) => {
            this.showSystemNotice(notice.message, notice.kind);
        });
    }

    private registerInputHandlers() {
        this.input.keyboard?.on("keydown-ENTER", () => {
            if (!this.chatOpen) this.openChat();
        });

        this.input.keyboard?.on("keydown-ESC", (event: KeyboardEvent) => {
            event.preventDefault();

            if (this.chatOpen) {
                this.closeChat();
                return;
            }

            if (this.hudManager?.closeTransientPanels()) {
                return;
            }

            if (this.hudManager?.closeAllWindows()) {
                return;
            }

            if (this.myTargetId) {
                this.clearLocalTarget();
            }
        });

        this.input.keyboard?.on("keydown-TAB", (event: KeyboardEvent) => {
            if (this.chatOpen) return;
            event.preventDefault();
            this.cycleTarget(event.shiftKey ? -1 : 1);
        });

        this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
            if (this.chatOpen) return;
            if (this.hudManager?.handleHotbarKey(event.key)) {
                event.preventDefault();
                return;
            }
            if (this.hudManager?.handleWindowHotkey(event.key)) {
                event.preventDefault();
            }
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
                this.hudManager?.hidePlayerContextMenu();
                if (currentlyOver.length > 0) return;
                if (this.isRightClick(pointer)) return;

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
        this.refreshTargetHud();

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
        const nameLabel = this.add.text(0, -66, snapshot.name, {
            fontSize: "10px",
            fontFamily: "monospace",
            color: this.getEntityLabelColor(snapshot, sessionId),
            stroke: "#000000",
            strokeThickness: 2,
        }).setOrigin(0.5);
        const healthBar = this.add.graphics();
        const art = this.add.container(0, 0, [body, head, headRing, healthBar, nameLabel]);
        const container = this.add.container(ground.x, ground.y, [shadow, art]);
        container.setDepth(this.getEntityDepth(snapshot.x, snapshot.y));

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
            nameLabel,
            targetRing: null,
            chatBubble: null,
            chatBubbleTimer: null,
        };

        const hitArea = new Phaser.Geom.Rectangle(-16, -76, 32, 84);
        container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

        container.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            pointer.event.stopPropagation();
            if (this.isRightClick(pointer)) {
                pointer.event.preventDefault();
            }

            this.hudManager?.hidePlayerContextMenu();
            const entity = this.entities.get(sessionId);
            if (!entity || entity.snapshot.isDead || sessionId === this.mySessionId) return;
            if (entity.snapshot.isNpc) {
                this.safeSend("interactNpc", { npcId: sessionId });
                return;
            }

            this.selectTarget(sessionId);
            if (this.isRightClick(pointer) && !entity.snapshot.isMob) {
                this.openPlayerContextMenu(entity, pointer);
            }
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
            this.clearLocalTarget(false);
        }

        entity.container.destroy();
        this.entities.delete(sessionId);
    }

    private syncLocalTargetRing() {
        if (!this.myTargetId) return;

        const selected = this.entities.get(this.myTargetId);
        if (!selected || selected.snapshot.isDead || selected.snapshot.isNpc) {
            this.clearLocalTarget(false);
            return;
        }

        this.updateTargetRing(selected, true);
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
        const { snapshot, body, head, headRing, art, nameLabel } = entity;
        const aliveAlpha = snapshot.isDead ? 0.28 : 1;

        body.setAlpha(aliveAlpha);
        head.setAlpha(aliveAlpha);
        headRing.setAlpha(snapshot.isDead ? 0.2 : 1);
        nameLabel.setAlpha(snapshot.isDead ? 0.45 : 1);
        nameLabel.setText(this.formatEntityDisplayName(snapshot));
        nameLabel.setColor(this.getEntityLabelColor(snapshot, entity.sessionId));

        if (snapshot.isKnockedDown) {
            art.angle = 84;
            body.y = -10;
            head.y = -16;
            headRing.y = -16;
            nameLabel.y = -34;
        } else {
            art.angle = 0;
            body.y = -18;
            head.y = -38;
            headRing.y = -38;
            nameLabel.y = -66;
        }
    }

    private updateHealthBar(entity: TrackedEntity) {
        const graphics = entity.healthBar;
        if (entity.snapshot.isNpc) {
            graphics.clear();
            return;
        }

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
        } else if (snapshot.isNpc) {
            fill = 0xf1c470;
            stroke = 0x9b6b24;
            hoverFill = 0xffdda1;
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

    private getEntityLabelColor(snapshot: EntitySnapshot, sessionId: string): string {
        if (sessionId === this.mySessionId) return "#7ae9a5";
        if (snapshot.isNpc) return "#f1c470";
        if (!snapshot.isMob && snapshot.pvpTagged) return "#ff8a76";
        if (snapshot.isMob) return "#84c9ff";
        return "#efe6d0";
    }

    private formatEntityDisplayName(snapshot: EntitySnapshot): string {
        return snapshot.pvpTagged && !snapshot.isMob
            ? `${snapshot.name} (PVP)`
            : snapshot.name;
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
            if (entity.snapshot.isMob || entity.snapshot.isNpc || sessionId === this.mySessionId) return;
            players.push({
                sessionId,
                name: entity.snapshot.name,
                level: entity.snapshot.level,
            });
        });

        return players;
    }

    private isRightClick(pointer: Phaser.Input.Pointer): boolean {
        const nativeEvent = pointer.event as MouseEvent | undefined;
        return nativeEvent?.button === 2;
    }

    private openPlayerContextMenu(entity: TrackedEntity, pointer: Phaser.Input.Pointer) {
        const nativeEvent = pointer.event as MouseEvent | undefined;
        this.hudManager?.showPlayerContextMenu(
            {
                sessionId: entity.sessionId,
                name: entity.snapshot.name,
                level: entity.snapshot.level,
            },
            nativeEvent?.clientX ?? pointer.x,
            nativeEvent?.clientY ?? pointer.y
        );
    }

    private startWhisperToPlayer(targetId: string) {
        const target = this.entities.get(targetId);
        if (!target || target.snapshot.isDead || target.snapshot.isMob || target.snapshot.isNpc) {
            this.showNotice("That player is not available for whispers.", "error");
            return;
        }

        this.selectTarget(targetId);
        this.hudManager?.activateWhisperTarget(target.snapshot.name);
    }

    private selectTarget(targetId: string) {
        const target = this.entities.get(targetId);
        if (!target || target.snapshot.isDead || target.snapshot.isNpc || targetId === this.mySessionId) {
            return;
        }

        if (this.myTargetId === targetId) {
            this.refreshTargetHud();
            return;
        }

        if (this.myTargetId) {
            const previous = this.entities.get(this.myTargetId);
            if (previous) this.updateTargetRing(previous, false);
        }

        this.myTargetId = targetId;
        this.updateTargetRing(target, true);
        this.refreshTargetHud();
    }

    private clearLocalTarget(notifyServer = true) {
        this.hudManager?.hidePlayerContextMenu();
        if (this.myTargetId) {
            const target = this.entities.get(this.myTargetId);
            if (target) this.updateTargetRing(target, false);
        }

        this.myTargetId = "";
        this.hudManager?.updateTarget(null);
        this.hudManager?.setChatWhisperTarget(null);

        if (notifyServer) {
            this.safeSend("clearTarget");
        }
    }

    private cycleTarget(direction: 1 | -1) {
        const candidates = this.getVisibleTargetIds();
        if (candidates.length === 0) {
            this.showNotice("No players or mobs on screen to target.", "error");
            return;
        }

        const currentIndex = candidates.indexOf(this.myTargetId);
        const nextIndex =
            currentIndex < 0
                ? direction > 0 ? 0 : candidates.length - 1
                : (currentIndex + direction + candidates.length) % candidates.length;

        const nextTargetId = candidates[nextIndex];
        this.selectTarget(nextTargetId);
        this.syncTabbedAutoAttack(nextTargetId);
    }

    private getVisibleTargetIds(): string[] {
        const local = this.entities.get(this.mySessionId);
        if (!local) return [];

        const worldView = this.cameras.main.worldView;
        const paddedView = new Phaser.Geom.Rectangle(
            worldView.x - 24,
            worldView.y - 24,
            worldView.width + 48,
            worldView.height + 48
        );

        return Array.from(this.entities.values())
            .filter((entity) => {
                if (entity.sessionId === this.mySessionId) return false;
                if (entity.snapshot.isDead || entity.snapshot.isNpc) return false;
                return paddedView.contains(entity.container.x, entity.container.y);
            })
            .sort((a, b) => {
                const distanceA = Phaser.Math.Distance.Between(
                    a.snapshot.x,
                    a.snapshot.y,
                    local.snapshot.x,
                    local.snapshot.y
                );
                const distanceB = Phaser.Math.Distance.Between(
                    b.snapshot.x,
                    b.snapshot.y,
                    local.snapshot.x,
                    local.snapshot.y
                );

                if (Math.abs(distanceA - distanceB) > 0.01) {
                    return distanceA - distanceB;
                }

                if (Math.abs(a.container.y - b.container.y) > 0.5) {
                    return a.container.y - b.container.y;
                }

                if (Math.abs(a.container.x - b.container.x) > 0.5) {
                    return a.container.x - b.container.x;
                }

                return a.sessionId.localeCompare(b.sessionId);
            })
            .map((entity) => entity.sessionId);
    }

    private syncTabbedAutoAttack(targetId: string) {
        const local = this.entities.get(this.mySessionId);
        const target = this.entities.get(targetId);

        if (!local || !target || target.snapshot.isDead || target.snapshot.isNpc || !target.snapshot.isMob) {
            this.safeSend("clearTarget");
            return;
        }

        const distance = Phaser.Math.Distance.Between(
            local.snapshot.x,
            local.snapshot.y,
            target.snapshot.x,
            target.snapshot.y
        );

        if (distance <= local.snapshot.attackRange + 0.15) {
            this.safeSend("engageTarget", { targetId });
            return;
        }

        this.safeSend("clearTarget");
    }

    private showNotice(message: string, kind: HudToastKind = "info") {
        this.hudManager?.showToast(message, kind);
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

    private openChat() {
        this.hudManager?.focusChatInput();
    }

    private closeChat() {
        this.hudManager?.blurChatInput();
    }

    private handleSceneShutdown() {
        this.isRoomActive = false;
        this.closeChat();
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

    private getEntityDepth(x: number, y: number) {
        return GameScene.PLAYER_DEPTH_BASE + x + y;
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
            isNpc: this.readBoolean(incoming.isNpc, fallback.isNpc),
            npcKind: this.readString(incoming.npcKind, fallback.npcKind),
            x: this.readNumber(incoming.x, fallback.x),
            y: this.readNumber(incoming.y, fallback.y),
            z: this.readNumber(incoming.z, fallback.z),
            groundZ: this.readNumber(incoming.groundZ, fallback.groundZ),
            level: this.readNumber(incoming.level, fallback.level),
            exp: this.readNumber(incoming.exp, fallback.exp),
            expToNextLevel: this.readNumber(incoming.expToNextLevel, fallback.expToNextLevel),
            gold: this.readNumber(incoming.gold, fallback.gold),
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
            attackRange: this.readNumber(incoming.attackRange, fallback.attackRange),
            pvpEnabled: this.readBoolean(incoming.pvpEnabled, fallback.pvpEnabled),
            pvpTagged: this.readBoolean(incoming.pvpTagged, fallback.pvpTagged),
            combatTargetId: this.readString(incoming.combatTargetId, fallback.combatTargetId),
        };
    }

    private createDefaultSnapshot(): EntitySnapshot {
        return {
            name: "Player",
            isMob: false,
            mobKind: "",
            isNpc: false,
            npcKind: "",
            x: 0,
            y: 0,
            z: 0,
            groundZ: 0,
            level: 1,
            exp: 0,
            expToNextLevel: 35,
            gold: 0,
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
            attackRange: 2.5,
            pvpEnabled: false,
            pvpTagged: false,
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

    private refreshTargetHud() {
        this.hudManager?.updateTarget(this.getCurrentTargetData());
        this.hudManager?.setChatWhisperTarget(this.getCurrentWhisperTargetName());
    }

    private getCurrentTargetData(): TargetFrameData | null {
        if (!this.myTargetId) return null;

        const target = this.entities.get(this.myTargetId);
        if (!target || target.snapshot.isDead || target.snapshot.isNpc) return null;

        return {
            sessionId: target.sessionId,
            name: target.snapshot.name,
            level: target.snapshot.level,
            hp: target.snapshot.hp,
            maxHp: target.snapshot.maxHp,
            isMob: target.snapshot.isMob,
            mobKind: target.snapshot.mobKind,
            pvpEnabled: target.snapshot.pvpEnabled,
            pvpTagged: target.snapshot.pvpTagged,
        };
    }

    private getCurrentWhisperTarget() {
        if (!this.myTargetId) return null;

        const target = this.entities.get(this.myTargetId);
        if (!target || target.snapshot.isDead || target.snapshot.isMob || target.snapshot.isNpc) {
            return null;
        }

        return {
            sessionId: target.sessionId,
            name: target.snapshot.name,
        };
    }

    private getCurrentWhisperTargetName(): string | null {
        return this.getCurrentWhisperTarget()?.name ?? null;
    }

    private classifyNoticeKind(message: string, kind: "info" | "error"): HudToastKind {
        if (kind === "error") return "error";
        if (/(^|\s)(\+?\d+\s+EXP|\+?\d+\s+gold|looted|purchased|sold|quest complete)/i.test(message)) {
            return "reward";
        }
        return "info";
    }

    private logSystemMessage(message: string, tone: HudChatTone) {
        this.hudManager?.addChatEntry({
            channel: "system",
            author: "System",
            text: message,
            tone,
        });
    }

    private showSystemNotice(message: string, kind: "info" | "error") {
        const toastKind = this.classifyNoticeKind(message, kind);
        this.showNotice(message, toastKind);
        this.logSystemMessage(message, this.toChatTone(toastKind));
    }

    private toChatTone(kind: HudToastKind): HudChatTone {
        if (kind === "error") return "error";
        if (kind === "reward") return "reward";
        return "neutral";
    }

    private handleChatSubmit(channel: "say" | "party" | "whisper", text: string) {
        if (channel === "whisper") {
            const target = this.getCurrentWhisperTarget();
            if (!target) {
                this.showSystemNotice("Target a player before whispering.", "error");
                return;
            }

            this.safeSend("chat", {
                channel,
                text,
                targetSessionId: target.sessionId,
            });
            return;
        }

        this.safeSend("chat", { channel, text });
    }

    private handleChatMessage(message: ChatMessagePayload) {
        if (message.channel === "whisper") {
            const author =
                message.direction === "outgoing"
                    ? `To ${message.targetName ?? "target"}`
                    : `From ${message.senderName}`;
            this.hudManager?.addChatEntry({
                channel: "whisper",
                author,
                text: message.text,
                tone: "neutral",
            });
            return;
        }

        this.hudManager?.addChatEntry({
            channel: message.channel,
            author: message.senderName,
            text: message.text,
            tone: "neutral",
        });
    }

    private handleHotbarAction(actionId: HotbarActionId) {
        switch (actionId) {
            case "power-strike":
            case "rising-uppercut":
            case "guardian-pulse":
                this.safeSend("skillUse", {
                    skillId: actionId,
                    targetId: this.myTargetId,
                });
                return;
            case "clear-target":
                if (!this.myTargetId) {
                    this.showNotice("No active target to clear.", "error");
                    return;
                }

                this.clearLocalTarget();
                this.showNotice("Target cleared.", "info");
                return;
            default:
                return;
        }
    }
}
