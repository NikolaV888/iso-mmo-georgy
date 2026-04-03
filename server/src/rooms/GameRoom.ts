import { Room, Client } from "colyseus";
import { GameState, Player } from "./schema/GameState";
import { GameConfig } from "../config/GameConfig";
import { MovementSystem } from "../systems/MovementSystem";
import { CombatSystem } from "../systems/CombatSystem";

const TICK_MS        = 1000 / GameConfig.TICK_RATE_HZ;
const BROADCAST_MS   = 1000 / GameConfig.BROADCAST_RATE_HZ;

export class GameRoom extends Room<GameState> {
    maxClients = 100;

    private movementSystem = new MovementSystem();
    private combatSystem   = new CombatSystem();
    private broadcastAccumulator = 0;   // ms since last broadcast

    onCreate(_options: any) {
        this.setState(new GameState());

        // ── Message handlers ───────────────────────────────────────────────

        /** Client requests to move toward a cartesian position */
        this.onMessage("move", (client: Client, data: { x: number; y: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDead) return;
            player.targetX = data.x;
            player.targetY = data.y;
        });

        /** Client requests to attack a target */
        this.onMessage("attack", (client: Client, data: { targetId: string }) => {
            const now = Date.now();
            const result = this.combatSystem.processAttack(
                client.sessionId,
                data.targetId,
                this.state.players,
                now
            );

            if (!result) return;

            // Broadcast combat events for visual feedback
            result.events.forEach(evt => this.broadcast("combatEvent", evt));

            // Broadcast death notifications
            result.died.forEach(sessionId => this.broadcast("playerDied", { sessionId }));
        });

        // ── Game loop ──────────────────────────────────────────────────────
        this.setSimulationInterval((deltaTime: number) => {
            this.update(deltaTime);
        }, TICK_MS);
    }

    onJoin(client: Client, _options: any) {
        console.log(`[Room] ${client.sessionId} joined`);
        const player = new Player();
        player.x        = GameConfig.SPAWN_X;
        player.y        = GameConfig.SPAWN_Y;
        player.targetX  = GameConfig.SPAWN_X;
        player.targetY  = GameConfig.SPAWN_Y;
        player.hp       = GameConfig.PLAYER_MAX_HP;
        player.maxHp    = GameConfig.PLAYER_MAX_HP;
        this.state.players.set(client.sessionId, player);

        // Tell this client their own sessionId
        client.send("init", { sessionId: client.sessionId });
    }

    onLeave(client: Client, _consented: boolean) {
        console.log(`[Room] ${client.sessionId} left`);
        this.state.players.delete(client.sessionId);
        this.broadcast("playerLeft", { sessionId: client.sessionId });
    }

    onDispose() {
        console.log(`[Room] ${this.roomId} disposed`);
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private update(deltaTime: number) {
        const now = Date.now();

        // 1. Movement
        const anyMoved = this.movementSystem.update(this.state.players, deltaTime);

        // 2. Respawns
        const respawned = this.combatSystem.processRespawns(this.state.players, now);
        respawned.forEach(sessionId => {
            const p = this.state.players.get(sessionId);
            if (p) this.broadcast("playerRespawned", { sessionId, x: p.x, y: p.y });
        });

        // 3. Broadcast snapshot at BROADCAST_RATE_HZ
        this.broadcastAccumulator += deltaTime;
        if (this.broadcastAccumulator >= BROADCAST_MS) {
            this.broadcastAccumulator = 0;
            this.broadcastSnapshot();
        }
    }

    private broadcastSnapshot() {
        const snapshot: Record<string, {
            x: number; y: number;
            hp: number; maxHp: number;
            isDead: boolean;
        }> = {};

        this.state.players.forEach((player: Player, sessionId: string) => {
            snapshot[sessionId] = {
                x:      player.x,
                y:      player.y,
                hp:     player.hp,
                maxHp:  player.maxHp,
                isDead: player.isDead,
            };
        });

        this.broadcast("snapshot", snapshot);
    }
}
