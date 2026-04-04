import { Room, Client } from "colyseus";
import { GameConfig } from "../config/GameConfig";
import { CombatSystem } from "../systems/CombatSystem";
import { MobSystem } from "../systems/MobSystem";
import { MovementSystem } from "../systems/MovementSystem";
import { PartySystem } from "../systems/PartySystem";
import { PhysicsSystem } from "../systems/PhysicsSystem";
import { AllocatableStat, StatsSystem } from "../systems/StatsSystem";
import { TerrainSystem } from "../systems/TerrainSystem";
import { GameState, Player } from "./schema/GameState";

const TICK_MS = 1000 / GameConfig.TICK_RATE_HZ;
const BROADCAST_MS = 1000 / GameConfig.BROADCAST_RATE_HZ;

function isAllocatableStat(value: unknown): value is AllocatableStat {
    return value === "str" || value === "agi" || value === "int" || value === "vit";
}

function clampInput(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.max(-1, Math.min(1, value));
}

export class GameRoom extends Room<GameState> {
    maxClients = 100;

    private movementSystem = new MovementSystem();
    private combatSystem = new CombatSystem();
    private physicsSystem = new PhysicsSystem();
    private mobSystem = new MobSystem();
    private statsSystem = new StatsSystem();
    private partySystem = new PartySystem();
    private broadcastAccumulator = 0;

    onCreate(_options: unknown) {
        this.setState(new GameState());
        this.spawnDebugMobs();

        this.onMessage("move", (client: Client, data: { x: number; y: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDead || player.isKnockedDown) return;
            if (!Number.isFinite(data?.x) || !Number.isFinite(data?.y)) return;

            player.inputX = 0;
            player.inputY = 0;
            player.targetX = data.x;
            player.targetY = data.y;
            player.combatTargetId = "";

            this.tryAutoJumpToward(player, data.x, data.y, Date.now());
        });

        this.onMessage("moveInput", (client: Client, data: { x: number; y: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDead || player.isKnockedDown) return;

            const inputX = clampInput(data?.x);
            const inputY = clampInput(data?.y);
            const lengthSq = inputX * inputX + inputY * inputY;

            if (lengthSq <= 0.0001) {
                player.inputX = 0;
                player.inputY = 0;
                return;
            }

            player.inputX = inputX;
            player.inputY = inputY;
            player.targetX = player.x;
            player.targetY = player.y;
            player.combatTargetId = "";

            this.tryAutoJumpToward(
                player,
                player.x + inputX * GameConfig.AUTO_JUMP_SCAN_DISTANCE,
                player.y + inputY * GameConfig.AUTO_JUMP_SCAN_DISTANCE,
                Date.now()
            );
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

        this.onMessage("partyCreate", (client: Client) => {
            const result = this.partySystem.createParty(client.sessionId);
            if (result.error) {
                this.sendPartyNotice(client.sessionId, "error", result.error);
                return;
            }

            this.sendPartyNotice(client.sessionId, "info", "Party created.");
            this.broadcastPartyStates();
        });

        this.onMessage("partyInvite", (client: Client, data: { targetId: string }) => {
            if (typeof data?.targetId !== "string") return;

            const result = this.partySystem.invitePlayer(
                client.sessionId,
                data.targetId,
                this.state.players
            );
            if (result.error) {
                this.sendPartyNotice(client.sessionId, "error", result.error);
                return;
            }

            const targetName = this.state.players.get(data.targetId)?.name ?? "Player";
            const leaderName = this.state.players.get(client.sessionId)?.name ?? "Party Leader";
            this.sendPartyNotice(client.sessionId, "info", `Invite sent to ${targetName}.`);
            this.sendPartyNotice(
                data.targetId,
                "info",
                `${leaderName} invited you to join their party.`
            );
            this.broadcastPartyStates();
        });

        this.onMessage("partyAcceptInvite", (client: Client, data: { partyId: string }) => {
            if (typeof data?.partyId !== "string") return;

            const result = this.partySystem.acceptInvite(client.sessionId, data.partyId);
            if (result.error) {
                this.sendPartyNotice(client.sessionId, "error", result.error);
                return;
            }

            this.sendPartyNotice(client.sessionId, "info", "You joined the party.");
            this.broadcastPartyStates();
        });

        this.onMessage("partyDeclineInvite", (client: Client, data: { partyId: string }) => {
            if (typeof data?.partyId !== "string") return;

            const result = this.partySystem.declineInvite(client.sessionId, data.partyId);
            if (result.error) {
                this.sendPartyNotice(client.sessionId, "error", result.error);
                return;
            }

            this.sendPartyNotice(client.sessionId, "info", "Invite declined.");
            this.broadcastPartyStates();
        });

        this.onMessage("partyKick", (client: Client, data: { targetId: string }) => {
            if (typeof data?.targetId !== "string") return;

            const result = this.partySystem.kickMember(client.sessionId, data.targetId);
            if (result.error) {
                this.sendPartyNotice(client.sessionId, "error", result.error);
                return;
            }

            const targetName = this.state.players.get(data.targetId)?.name ?? "Player";
            this.sendPartyNotice(client.sessionId, "info", `${targetName} was removed from the party.`);
            this.sendPartyNotice(data.targetId, "info", "You were removed from the party.");
            this.broadcastPartyStates();
        });

        this.onMessage("partyLeave", (client: Client) => {
            const result = this.partySystem.leaveParty(client.sessionId);
            if (result.error) {
                this.sendPartyNotice(client.sessionId, "error", result.error);
                return;
            }

            this.sendPartyNotice(client.sessionId, "info", "You left the party.");
            this.broadcastPartyStates();
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
        this.sendPartyState(client);
    }

    onLeave(client: Client, _consented: boolean) {
        console.log(`[Room] ${client.sessionId} left`);
        this.combatSystem.clearTargetForAll(client.sessionId, this.state.players);
        this.partySystem.handleDisconnect(client.sessionId);
        this.state.players.delete(client.sessionId);
        this.broadcast("playerLeft", { sessionId: client.sessionId });
        this.broadcastPartyStates();
    }

    onDispose() {
        console.log(`[Room] ${this.roomId} disposed`);
    }

    private update(deltaTime: number) {
        try {
            const now = Date.now();

            this.mobSystem.update(this.state.players, now, this.physicsSystem);
            this.combatSystem.syncChasingTargets(this.state.players);
            this.movementSystem.update(this.state.players, deltaTime, this.physicsSystem, now);
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
                this.broadcastPartyStates();
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

    private broadcastPartyStates() {
        this.clients.forEach((client) => this.sendPartyState(client));
    }

    private sendPartyState(client: Client) {
        client.send("partyState", this.partySystem.getPartyStateFor(client.sessionId, this.state.players));
    }

    private sendPartyNotice(sessionId: string, kind: "info" | "error", message: string) {
        const client = this.clients.find((candidate) => candidate.sessionId === sessionId);
        if (!client) return;
        client.send("partyNotice", { kind, message });
    }

    private tryAutoJumpToward(player: Player, targetX: number, targetY: number, now: number) {
        if (player.isDead || player.isKnockedDown || player.canFly || !player.isGrounded) return;

        const dx = targetX - player.x;
        const dy = targetY - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 0.1 || distance > GameConfig.AUTO_JUMP_TARGET_DISTANCE) return;

        const scanDistance = Math.min(distance, GameConfig.AUTO_JUMP_SCAN_DISTANCE);
        const scanX = TerrainSystem.clampCoordinate(player.x + (dx / distance) * scanDistance);
        const scanY = TerrainSystem.clampCoordinate(player.y + (dy / distance) * scanDistance);
        const currentGround = TerrainSystem.getGroundHeight(player.x, player.y);
        const targetGround = TerrainSystem.getGroundHeight(scanX, scanY);
        const ascent = targetGround - currentGround;

        if (
            ascent < GameConfig.AUTO_JUMP_MIN_ASCENT ||
            ascent > GameConfig.AUTO_JUMP_MAX_ASCENT
        ) {
            return;
        }

        this.physicsSystem.jump(player, GameConfig.PLAYER_JUMP_SPEED, now);
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
