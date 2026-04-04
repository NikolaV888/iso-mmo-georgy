import { Room, Client } from "colyseus";
import { GameState, Player } from "./schema/GameState";
import { GameConfig } from "../config/GameConfig";
import { MovementSystem } from "../systems/MovementSystem";
import { CombatSystem } from "../systems/CombatSystem";

const TICK_MS       = 1000 / GameConfig.TICK_RATE_HZ;
const BROADCAST_MS  = 1000 / GameConfig.BROADCAST_RATE_HZ;

export class GameRoom extends Room<GameState> {
    maxClients = 100;

    private movementSystem       = new MovementSystem();
    private combatSystem         = new CombatSystem();
    private broadcastAccumulator = 0;

    onCreate(_options: any) {
        this.setState(new GameState());

        // ── Message handlers ─────────────────────────────────────────────

        /**
         * Move — clears combat target so walking away stops the auto-attack loop.
         * In the future a "chase-to-attack" mode can re-engage when in range.
         */
        this.onMessage("move", (client: Client, data: { x: number; y: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDead) return;
            player.targetX = data.x;
            player.targetY = data.y;
            // Clicking the ground disengages auto-attack
            player.combatTargetId = "";
        });

        /**
         * setTarget — lock an auto-attack target.
         * Clicking an enemy calls this; the server loop does the rest.
         */
        this.onMessage("setTarget", (client: Client, data: { targetId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDead) return;

            const target = this.state.players.get(data.targetId);
            if (!target || target.isDead) return;

            player.combatTargetId = data.targetId;
        });

        /**
         * clearTarget — manually disengage (right-click, UI button, etc.).
         */
        this.onMessage("clearTarget", (client: Client) => {
            const player = this.state.players.get(client.sessionId);
            if (player) player.combatTargetId = "";
        });

        /**
         * Proximity chat — send only to players within CHAT_RANGE tiles.
         */
        this.onMessage("chat", (client: Client, data: { text: string }) => {
            const sender = this.state.players.get(client.sessionId);
            if (!sender) return;
            const text = String(data.text ?? "").trim().slice(0, GameConfig.CHAT_MAX_LENGTH);
            if (!text) return;

            this.clients.forEach((c) => {
                const other = this.state.players.get(c.sessionId);
                if (!other) return;
                const dx = other.x - sender.x;
                const dy = other.y - sender.y;
                if (Math.sqrt(dx * dx + dy * dy) <= GameConfig.CHAT_RANGE) {
                    c.send("chatMessage", { sessionId: client.sessionId, text });
                }
            });
        });

        // ── Game loop ────────────────────────────────────────────────────
        this.setSimulationInterval((dt: number) => this.update(dt), TICK_MS);
    }

    onJoin(client: Client, _options: any) {
        console.log(`[Room] ${client.sessionId} joined`);
        const player = new Player();
        player.x            = GameConfig.SPAWN_X;
        player.y            = GameConfig.SPAWN_Y;
        player.targetX      = GameConfig.SPAWN_X;
        player.targetY      = GameConfig.SPAWN_Y;
        
        player.level        = GameConfig.PLAYER_BASE_LEVEL;
        player.exp          = GameConfig.PLAYER_BASE_EXP;
        player.str          = GameConfig.PLAYER_BASE_STR;
        player.agi          = GameConfig.PLAYER_BASE_AGI;
        player.int          = GameConfig.PLAYER_BASE_INT;
        player.vit          = GameConfig.PLAYER_BASE_VIT;
        
        player.hp           = GameConfig.PLAYER_MAX_HP;
        player.maxHp        = GameConfig.PLAYER_MAX_HP;
        player.attackDamage = GameConfig.PLAYER_ATTACK_DAMAGE;
        player.attackSpeed  = GameConfig.PLAYER_ATTACK_SPEED;
        player.attackRange  = GameConfig.PLAYER_ATTACK_RANGE;
        this.state.players.set(client.sessionId, player);
        client.send("init", { sessionId: client.sessionId });
    }

    onLeave(client: Client, _consented: boolean) {
        console.log(`[Room] ${client.sessionId} left`);
        // Clear this player as a combat target for everyone before removing
        this.combatSystem.clearTargetForAll(client.sessionId, this.state.players);
        this.state.players.delete(client.sessionId);
        this.broadcast("playerLeft", { sessionId: client.sessionId });
    }

    onDispose() {
        console.log(`[Room] ${this.roomId} disposed`);
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private update(deltaTime: number) {
        const now = Date.now();

        // 1. Movement
        this.movementSystem.update(this.state.players, deltaTime);

        // 2. Auto-attacks
        const combatResult = this.combatSystem.processAutoAttacks(this.state.players, now);
        combatResult.events.forEach(evt  => this.broadcast("combatEvent", evt));
        combatResult.died.forEach(sid    => {
            // Clear everyone targeting the dead player
            this.combatSystem.clearTargetForAll(sid, this.state.players);
            this.broadcast("playerDied", { sessionId: sid });
        });

        // 3. Respawns
        const respawned = this.combatSystem.processRespawns(this.state.players, now);
        respawned.forEach(sid => {
            const p = this.state.players.get(sid);
            if (p) this.broadcast("playerRespawned", { sessionId: sid, x: p.x, y: p.y });
        });

        // 4. Snapshot broadcast at BROADCAST_RATE_HZ
        this.broadcastAccumulator += deltaTime;
        if (this.broadcastAccumulator >= BROADCAST_MS) {
            this.broadcastAccumulator = 0;
            this.broadcastSnapshot();
        }
    }

    private broadcastSnapshot() {
        const snapshot: Record<string, {
            x: number; y: number;
            level: number; exp: number;
            str: number; agi: number; int: number; vit: number;
            attackDamage: number; attackSpeed: number;
            hp: number; maxHp: number;
            isDead: boolean;
            combatTargetId: string;
        }> = {};

        this.state.players.forEach((p: Player, sid: string) => {
            snapshot[sid] = {
                x:              p.x,
                y:              p.y,
                level:          p.level,
                exp:            p.exp,
                str:            p.str,
                agi:            p.agi,
                int:            p.int,
                vit:            p.vit,
                attackDamage:   p.attackDamage,
                attackSpeed:    p.attackSpeed,
                hp:             p.hp,
                maxHp:          p.maxHp,
                isDead:         p.isDead,
                combatTargetId: p.combatTargetId,
            };
        });

        this.broadcast("snapshot", snapshot);
    }
}
