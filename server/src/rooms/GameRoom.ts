import { Room, Client } from "colyseus";
import { GameConfig } from "../config/GameConfig";
import { CombatSystem } from "../systems/CombatSystem";
import { MobSystem } from "../systems/MobSystem";
import { MovementSystem } from "../systems/MovementSystem";
import { PhysicsSystem } from "../systems/PhysicsSystem";
import { AllocatableStat, StatsSystem } from "../systems/StatsSystem";
import { GameState, Player } from "./schema/GameState";

const TICK_MS = 1000 / GameConfig.TICK_RATE_HZ;
const BROADCAST_MS = 1000 / GameConfig.BROADCAST_RATE_HZ;

function isAllocatableStat(value: unknown): value is AllocatableStat {
    return value === "str" || value === "agi" || value === "int" || value === "vit";
}

export class GameRoom extends Room<GameState> {
    maxClients = 100;

    private movementSystem = new MovementSystem();
    private combatSystem = new CombatSystem();
    private physicsSystem = new PhysicsSystem();
    private mobSystem = new MobSystem();
    private statsSystem = new StatsSystem();
    private broadcastAccumulator = 0;

    onCreate(_options: unknown) {
        this.setState(new GameState());
        this.spawnDebugMobs();

        this.onMessage("move", (client: Client, data: { x: number; y: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDead || player.isKnockedDown) return;
            if (!Number.isFinite(data?.x) || !Number.isFinite(data?.y)) return;

            player.targetX = data.x;
            player.targetY = data.y;
            player.combatTargetId = "";
        });

        this.onMessage("jump", (client: Client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDead) return;
            this.physicsSystem.jump(player, GameConfig.PLAYER_JUMP_SPEED, Date.now());
        });

        this.onMessage("setTarget", (client: Client, data: { targetId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDead) return;
            if (typeof data?.targetId !== "string") return;
            if (data.targetId === client.sessionId) return;

            const target = this.state.players.get(data.targetId);
            if (!target || target.isDead) return;

            player.combatTargetId = data.targetId;
            this.combatSystem.syncChasingTarget(player, target);
        });

        this.onMessage("clearTarget", (client: Client) => {
            const player = this.state.players.get(client.sessionId);
            if (player) player.combatTargetId = "";
        });

        this.onMessage("allocateStat", (client: Client, data: { stat: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDead || !isAllocatableStat(data?.stat)) return;
            this.statsSystem.allocateStat(player, data.stat);
        });

        this.onMessage("chat", (client: Client, data: { text: string }) => {
            const sender = this.state.players.get(client.sessionId);
            if (!sender) return;

            const text = String(data.text ?? "")
                .trim()
                .slice(0, GameConfig.CHAT_MAX_LENGTH);
            if (!text) return;

            this.clients.forEach((otherClient) => {
                const other = this.state.players.get(otherClient.sessionId);
                if (!other) return;

                const dx = other.x - sender.x;
                const dy = other.y - sender.y;
                if (Math.sqrt(dx * dx + dy * dy) <= GameConfig.CHAT_RANGE) {
                    otherClient.send("chatMessage", { sessionId: client.sessionId, text });
                }
            });
        });

        this.setSimulationInterval((dt: number) => this.update(dt), TICK_MS);
    }

    onJoin(client: Client, _options: unknown) {
        console.log(`[Room] ${client.sessionId} joined`);

        const player = new Player();
        this.statsSystem.initializePlayer(player, `Player ${client.sessionId.slice(0, 4)}`);
        this.state.players.set(client.sessionId, player);
        client.send("init", { sessionId: client.sessionId });
    }

    onLeave(client: Client, _consented: boolean) {
        console.log(`[Room] ${client.sessionId} left`);
        this.combatSystem.clearTargetForAll(client.sessionId, this.state.players);
        this.state.players.delete(client.sessionId);
        this.broadcast("playerLeft", { sessionId: client.sessionId });
    }

    onDispose() {
        console.log(`[Room] ${this.roomId} disposed`);
    }

    private update(deltaTime: number) {
        try {
            const now = Date.now();

            this.mobSystem.update(this.state.players, now, this.physicsSystem);
            this.combatSystem.syncChasingTargets(this.state.players);
            this.movementSystem.update(this.state.players, deltaTime);
            this.physicsSystem.update(this.state.players, deltaTime, now);

            const combatResult = this.combatSystem.processAutoAttacks(
                this.state.players,
                now,
                this.physicsSystem,
                this.statsSystem
            );

            combatResult.events.forEach((evt) => this.broadcast("combatEvent", evt));
            combatResult.died.forEach(({ sessionId }) => {
                this.combatSystem.clearTargetForAll(sessionId, this.state.players);
                this.broadcast("playerDied", { sessionId });
            });

            const respawned = this.combatSystem.processRespawns(this.state.players, now);
            respawned.forEach((sessionId) => {
                const player = this.state.players.get(sessionId);
                if (!player) return;
                this.broadcast("playerRespawned", {
                    sessionId,
                    x: player.x,
                    y: player.y,
                    z: player.z,
                });
            });

            this.broadcastAccumulator += deltaTime;
            if (this.broadcastAccumulator >= BROADCAST_MS) {
                this.broadcastAccumulator = 0;
                this.broadcastSnapshot();
            }
        } catch (error) {
            console.error(`[Room ${this.roomId}] update failed`, error);
        }
    }

    private broadcastSnapshot() {
        const snapshot: Record<string, {
            name: string;
            isMob: boolean;
            mobKind: string;
            x: number;
            y: number;
            z: number;
            groundZ: number;
            level: number;
            exp: number;
            expToNextLevel: number;
            bonusStatPoints: number;
            str: number;
            agi: number;
            int: number;
            vit: number;
            attackDamage: number;
            attackSpeed: number;
            moveSpeed: number;
            hp: number;
            maxHp: number;
            isDead: boolean;
            isGrounded: boolean;
            isFlying: boolean;
            isKnockedDown: boolean;
            combatTargetId: string;
        }> = {};

        this.state.players.forEach((player: Player, sessionId: string) => {
            snapshot[sessionId] = {
                name: player.name,
                isMob: player.isMob,
                mobKind: player.mobKind,
                x: player.x,
                y: player.y,
                z: player.z,
                groundZ: player.groundZ,
                level: player.level,
                exp: player.exp,
                expToNextLevel: player.expToNextLevel,
                bonusStatPoints: player.bonusStatPoints,
                str: player.str,
                agi: player.agi,
                int: player.int,
                vit: player.vit,
                attackDamage: player.attackDamage,
                attackSpeed: player.attackSpeed,
                moveSpeed: player.moveSpeed,
                hp: player.hp,
                maxHp: player.maxHp,
                isDead: player.isDead,
                isGrounded: player.isGrounded,
                isFlying: player.isFlying,
                isKnockedDown: player.isKnockedDown,
                combatTargetId: player.combatTargetId,
            };
        });

        this.broadcast("snapshot", snapshot);
    }

    private spawnDebugMobs() {
        const slimeA = new Player();
        this.statsSystem.initializeMob(slimeA, "slime", 6, 12);
        this.state.players.set("mob:slime:1", slimeA);

        const slimeB = new Player();
        this.statsSystem.initializeMob(slimeB, "slime", 13, 12);
        this.state.players.set("mob:slime:2", slimeB);

        const bat = new Player();
        this.statsSystem.initializeMob(bat, "bat", 15, 7);
        this.state.players.set("mob:bat:1", bat);
    }
}
