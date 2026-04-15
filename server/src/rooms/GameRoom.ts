import { Room, Client } from "colyseus";
import { GameConfig } from "../config/GameConfig";
import {
    isEquipmentSlot,
    isInventoryTab,
    type EquipmentSlot,
    type InventoryTab,
} from "../config/ItemCatalog";
import type { NpcKind } from "../config/NpcCatalog";
import { isQuestId } from "../config/QuestCatalog";
import { isSkillId } from "../config/SkillCatalog";
import { CombatSystem, type CombatResult } from "../systems/CombatSystem";
import { InventorySystem } from "../systems/InventorySystem";
import { MobSystem } from "../systems/MobSystem";
import { MovementSystem } from "../systems/MovementSystem";
import { NpcSystem } from "../systems/NpcSystem";
import { PartySystem } from "../systems/PartySystem";
import { PhysicsSystem } from "../systems/PhysicsSystem";
import { PvpSystem } from "../systems/PvpSystem";
import { QuestSystem } from "../systems/QuestSystem";
import { ShopSystem } from "../systems/ShopSystem";
import { SkillSystem } from "../systems/SkillSystem";
import { AllocatableStat, StatsSystem } from "../systems/StatsSystem";
import { TerrainSystem } from "../systems/TerrainSystem";
import { GameState, Player } from "./schema/GameState";

const TICK_MS = 1000 / GameConfig.TICK_RATE_HZ;
const BROADCAST_MS = 1000 / GameConfig.BROADCAST_RATE_HZ;
const OWNER_STATE_MS = 1000 / GameConfig.OWNER_STATE_RATE_HZ;

function isAllocatableStat(value: unknown): value is AllocatableStat {
    return value === "str" || value === "agi" || value === "int" || value === "vit";
}

function clampInput(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.max(-1, Math.min(1, value));
}

type ChatChannel = "say" | "party" | "whisper";

function isChatChannel(value: unknown): value is ChatChannel {
    return value === "say" || value === "party" || value === "whisper";
}

export class GameRoom extends Room<GameState> {
    maxClients = 100;

    private movementSystem = new MovementSystem();
    private combatSystem = new CombatSystem();
    private physicsSystem = new PhysicsSystem();
    private mobSystem = new MobSystem();
    private statsSystem = new StatsSystem();
    private inventorySystem = new InventorySystem(this.statsSystem);
    private partySystem = new PartySystem();
    private shopSystem = new ShopSystem();
    private questSystem = new QuestSystem(this.statsSystem, this.inventorySystem);
    private npcSystem = new NpcSystem();
    private skillSystem = new SkillSystem();
    private pvpSystem = new PvpSystem(this.inventorySystem, this.statsSystem);
    private broadcastAccumulator = 0;
    private ownerStateAccumulator = 0;

    onCreate(_options: unknown) {
        this.setState(new GameState());
        this.npcSystem.spawnNpcs(this.state.players);
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
            this.npcSystem.closeInteraction(player);

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
            this.npcSystem.closeInteraction(player);

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
            this.npcSystem.closeInteraction(player);
            this.physicsSystem.jump(player, GameConfig.PLAYER_JUMP_SPEED, Date.now());
        });

        this.onMessage("setTarget", (client: Client, data: { targetId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDead) return;
            if (typeof data?.targetId !== "string") return;
            if (data.targetId === client.sessionId) return;

            const target = this.state.players.get(data.targetId);
            if (!target || target.isDead || target.isNpc) return;
            // Target selection is now a client-side inspect/skill target, not an auto-engage action.
        });

        this.onMessage("clearTarget", (client: Client) => {
            const player = this.state.players.get(client.sessionId);
            if (player) player.combatTargetId = "";
        });

        this.onMessage("engageTarget", (client: Client, data: { targetId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDead || player.isKnockedDown || player.isMob) return;
            if (typeof data?.targetId !== "string") return;
            if (data.targetId === client.sessionId) return;

            const target = this.state.players.get(data.targetId);
            if (!target || target.isDead || target.isNpc || !target.isMob) {
                player.combatTargetId = "";
                return;
            }

            player.combatTargetId = data.targetId;
            player.targetX = player.x;
            player.targetY = player.y;
            this.npcSystem.closeInteraction(player);
        });

        this.onMessage("togglePvpMode", (client: Client) => {
            this.applyPvpResult(this.pvpSystem.togglePvpMode(client.sessionId, this.state.players));
        });

        this.onMessage("allocateStat", (client: Client, data: { stat: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDead || !isAllocatableStat(data?.stat)) return;
            this.statsSystem.allocateStat(player, data.stat);
        });

        this.onMessage("inventoryEquip", (client: Client, data: { tab: InventoryTab; index: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isMob) return;
            if (!isInventoryTab(data?.tab)) return;

            const result = this.inventorySystem.equipItem(player, data.tab, data.index);
            if (result.error) {
                this.sendInventoryNotice(client.sessionId, "error", result.error);
                return;
            }

            this.sendInventoryState(client);
            if (result.info) this.sendInventoryNotice(client.sessionId, "info", result.info);
        });

        this.onMessage("inventoryUnequip", (client: Client, data: { slot: EquipmentSlot }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isMob) return;
            if (!isEquipmentSlot(data?.slot)) return;

            const result = this.inventorySystem.unequipItem(player, data.slot);
            if (result.error) {
                this.sendInventoryNotice(client.sessionId, "error", result.error);
                return;
            }

            this.sendInventoryState(client);
            if (result.info) this.sendInventoryNotice(client.sessionId, "info", result.info);
        });

        this.onMessage("inventoryUse", (client: Client, data: { tab: InventoryTab; index: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isMob || player.isDead) return;
            if (!isInventoryTab(data?.tab)) return;

            const result = this.inventorySystem.useItem(player, data.tab, data.index);
            if (result.error) {
                this.sendInventoryNotice(client.sessionId, "error", result.error);
                return;
            }

            this.sendInventoryState(client);
            if (result.info) this.sendInventoryNotice(client.sessionId, "info", result.info);
        });

        this.onMessage("interactNpc", (client: Client, data: { npcId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isMob || player.isNpc || typeof data?.npcId !== "string") return;

            const result = this.npcSystem.openInteraction(player, data.npcId, this.state.players);
            this.sendNpcDialogState(client);

            if (result.error) {
                this.sendNpcNotice(client.sessionId, "error", result.error);
                return;
            }

            const npcName = this.state.players.get(data.npcId)?.name ?? "NPC";
            this.sendNpcNotice(client.sessionId, "info", `Talking to ${npcName}.`);
        });

        this.onMessage("npcClose", (client: Client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isMob || player.isNpc) return;

            this.npcSystem.closeInteraction(player);
            this.sendNpcDialogState(client);
        });

        this.onMessage("shopBuy", (client: Client, data: { itemId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isMob || player.isNpc) return;

            const activeNpc = this.getActiveNpc(player);
            if (!activeNpc) {
                this.sendNpcDialogState(client);
                this.sendNpcNotice(client.sessionId, "error", "Talk to a merchant first.");
                return;
            }

            const result = this.shopSystem.buyItem(
                player,
                activeNpc.npcKind as NpcKind,
                String(data?.itemId ?? ""),
                this.inventorySystem
            );

            this.sendInventoryState(client);
            this.sendNpcDialogState(client);

            if (result.error) {
                this.sendNpcNotice(client.sessionId, "error", result.error);
                return;
            }

            if (result.info) this.sendNpcNotice(client.sessionId, "info", result.info);
        });

        this.onMessage("shopSell", (client: Client, data: { tab: InventoryTab; index: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isMob || player.isNpc) return;

            const activeNpc = this.getActiveNpc(player);
            if (!activeNpc) {
                this.sendNpcDialogState(client);
                this.sendNpcNotice(client.sessionId, "error", "Talk to a merchant first.");
                return;
            }

            const result = this.shopSystem.sellItem(player, data?.tab, data?.index, this.inventorySystem);
            this.sendInventoryState(client);
            this.sendNpcDialogState(client);

            if (result.error) {
                this.sendNpcNotice(client.sessionId, "error", result.error);
                return;
            }

            if (result.info) this.sendNpcNotice(client.sessionId, "info", result.info);
        });

        this.onMessage("questAccept", (client: Client, data: { questId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isMob || player.isNpc || !isQuestId(data?.questId)) return;

            const activeNpc = this.getActiveNpc(player);
            if (!activeNpc) {
                this.sendNpcDialogState(client);
                this.sendNpcNotice(client.sessionId, "error", "Talk to the quest giver first.");
                return;
            }

            const result = this.questSystem.acceptQuest(player, data.questId);
            this.sendQuestState(client);
            this.sendNpcDialogState(client);

            if (result.error) {
                this.sendNpcNotice(client.sessionId, "error", result.error);
                return;
            }

            if (result.info) this.sendNpcNotice(client.sessionId, "info", result.info);
        });

        this.onMessage("questClaim", (client: Client, data: { questId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isMob || player.isNpc || !isQuestId(data?.questId)) return;

            const activeNpc = this.getActiveNpc(player);
            if (!activeNpc) {
                this.sendNpcDialogState(client);
                this.sendNpcNotice(client.sessionId, "error", "Talk to the quest giver first.");
                return;
            }

            const result = this.questSystem.claimQuest(player, data.questId);
            this.sendQuestState(client);
            this.sendInventoryState(client);
            this.sendSkillState(client, Date.now());
            this.sendNpcDialogState(client);

            if (result.error) {
                this.sendNpcNotice(client.sessionId, "error", result.error);
                return;
            }

            if (result.info) this.sendNpcNotice(client.sessionId, "info", result.info);
        });

        this.onMessage("skillUse", (client: Client, data: { skillId: string; targetId?: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isMob) return;
            if (!isSkillId(data?.skillId)) return;

            const now = Date.now();
            const result = this.skillSystem.useSkill(
                player,
                client.sessionId,
                data.skillId,
                typeof data?.targetId === "string" ? data.targetId : "",
                this.state.players,
                now,
                this.physicsSystem,
                this.combatSystem,
                (attackerSid, targetSid) => {
                    const permission = this.pvpSystem.canAttackTarget(
                        attackerSid,
                        targetSid,
                        this.state.players,
                        this.partySystem
                    );

                    return permission.allowed
                        ? { minimumTargetHp: permission.minimumTargetHp ?? 0 }
                        : { error: permission.error ?? "You cannot attack that target." };
                }
            );

            if (result.error) {
                this.sendSkillState(client, now);
                this.sendSkillNotice(client.sessionId, "error", result.error);
                return;
            }

            if (result.combat) {
                this.processCombatResult(result.combat);
            }

            this.sendSkillState(client, Date.now());
            if (result.info) {
                this.sendSkillNotice(client.sessionId, "info", result.info);
            }
        });

        this.onMessage(
            "duelRequest",
            (
                client: Client,
                data: { targetId: string; gold?: number; tab?: InventoryTab; index?: number }
            ) => {
                if (typeof data?.targetId !== "string") return;
                this.applyPvpResult(
                    this.pvpSystem.requestDuel(
                        client.sessionId,
                        data.targetId,
                        {
                            gold: data.gold,
                            tab: data.tab,
                            index: data.index,
                        },
                        this.state.players,
                        this.partySystem
                    )
                );
            }
        );

        this.onMessage(
            "duelAccept",
            (
                client: Client,
                data: { challengerId: string; gold?: number; tab?: InventoryTab; index?: number }
            ) => {
                if (typeof data?.challengerId !== "string") return;
                this.applyPvpResult(
                    this.pvpSystem.acceptDuel(
                        client.sessionId,
                        data.challengerId,
                        {
                            gold: data.gold,
                            tab: data.tab,
                            index: data.index,
                        },
                        this.state.players,
                        this.partySystem
                    )
                );
            }
        );

        this.onMessage("duelDecline", (client: Client, data: { challengerId: string }) => {
            if (typeof data?.challengerId !== "string") return;
            this.applyPvpResult(
                this.pvpSystem.declineDuel(client.sessionId, data.challengerId, this.state.players)
            );
        });

        this.onMessage("duelCancel", (client: Client) => {
            this.applyPvpResult(this.pvpSystem.cancelOutgoing(client.sessionId, this.state.players));
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
            const createdPrefix = result.createdParty ? "Party created. " : "";
            this.sendPartyNotice(client.sessionId, "info", `${createdPrefix}Invite sent to ${targetName}.`);
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

            const joiningName = this.state.players.get(client.sessionId)?.name ?? "A player";
            this.notifyPartyMembers(client.sessionId, `${joiningName} joined the party.`);
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

            this.applyPvpResult(this.pvpSystem.reconcilePartyState(this.state.players, this.partySystem));

            const targetName = this.state.players.get(data.targetId)?.name ?? "Player";
            this.sendPartyNotice(client.sessionId, "info", `${targetName} was removed from the party.`);
            this.sendPartyNotice(data.targetId, "info", "You were removed from the party.");
            this.broadcastPartyStates();
        });

        this.onMessage("partyLeave", (client: Client) => {
            const leavingName = this.state.players.get(client.sessionId)?.name ?? "A player";
            const memberIds = this.partySystem.getPartyMemberIds(client.sessionId);
            const result = this.partySystem.leaveParty(client.sessionId);
            if (result.error) {
                this.sendPartyNotice(client.sessionId, "error", result.error);
                return;
            }

            this.applyPvpResult(this.pvpSystem.reconcilePartyState(this.state.players, this.partySystem));

            this.sendPartyNotice(client.sessionId, "info", "You left the party.");
            memberIds
                .filter((memberId) => memberId !== client.sessionId)
                .forEach((memberId) => {
                    this.sendPartyNotice(memberId, "info", `${leavingName} left the party.`);
                });
            this.broadcastPartyStates();
        });

        this.onMessage("chat", (client: Client, data: { text: string; channel?: string; targetSessionId?: string }) => {
            const sender = this.state.players.get(client.sessionId);
            if (!sender) return;

            const text = String(data.text ?? "")
                .trim()
                .slice(0, GameConfig.CHAT_MAX_LENGTH);
            if (!text) return;

            const channel = isChatChannel(data?.channel) ? data.channel : "say";

            if (channel === "party") {
                this.sendPartyChat(client.sessionId, sender, text);
                return;
            }

            if (channel === "whisper") {
                this.sendWhisperChat(
                    client.sessionId,
                    sender,
                    text,
                    typeof data?.targetSessionId === "string" ? data.targetSessionId : ""
                );
                return;
            }

            this.sendSayChat(client.sessionId, sender, text);
        });

        this.setSimulationInterval((dt: number) => this.update(dt), TICK_MS);
    }

    onJoin(client: Client, _options: unknown) {
        console.log(`[Room] ${client.sessionId} joined`);

        const player = new Player();
        this.statsSystem.initializePlayer(player, `Player ${client.sessionId.slice(0, 4)}`);
        this.inventorySystem.initializePlayerInventory(player);
        this.questSystem.initializePlayerQuests(player);
        this.skillSystem.initializePlayerSkills(player);
        this.pvpSystem.initializePlayerState(player);
        this.state.players.set(client.sessionId, player);
        client.send("init", { sessionId: client.sessionId });
        this.sendPartyState(client);
        this.sendInventoryState(client);
        this.sendSkillState(client, Date.now());
        this.sendQuestState(client);
        this.sendNpcDialogState(client);
        this.sendPvpState(client);
    }

    onLeave(client: Client, _consented: boolean) {
        console.log(`[Room] ${client.sessionId} left`);
        this.combatSystem.clearTargetForAll(client.sessionId, this.state.players);
        this.applyPvpResult(this.pvpSystem.handleDisconnect(client.sessionId, this.state.players));
        const leavingName = this.state.players.get(client.sessionId)?.name ?? "A player";
        const memberIds = this.partySystem.getPartyMemberIds(client.sessionId);
        this.partySystem.handleDisconnect(client.sessionId);
        this.state.players.delete(client.sessionId);
        this.broadcast("playerLeft", { sessionId: client.sessionId });
        memberIds
            .filter((memberId) => memberId !== client.sessionId)
            .forEach((memberId) => {
                this.sendPartyNotice(memberId, "info", `${leavingName} disconnected.`);
            });
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
                this.physicsSystem
            );
            this.processCombatResult(combatResult);

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

            this.ownerStateAccumulator += deltaTime;
            if (this.ownerStateAccumulator >= OWNER_STATE_MS) {
                this.ownerStateAccumulator = 0;
                this.broadcastOwnerStates(now);
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
            isNpc: boolean;
            npcKind: string;
            x: number;
            y: number;
            z: number;
            groundZ: number;
            level: number;
            exp: number;
            expToNextLevel: number;
            bonusStatPoints: number;
            gold: number;
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
            attackRange: number;
            pvpEnabled: boolean;
            pvpTagged: boolean;
            combatTargetId: string;
        }> = {};

        this.state.players.forEach((player: Player, sessionId: string) => {
            snapshot[sessionId] = {
                name: player.name,
                isMob: player.isMob,
                mobKind: player.mobKind,
                isNpc: player.isNpc,
                npcKind: player.npcKind,
                x: player.x,
                y: player.y,
                z: player.z,
                groundZ: player.groundZ,
                level: player.level,
                exp: player.exp,
                expToNextLevel: player.expToNextLevel,
                gold: player.gold,
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
                attackRange: player.attackRange,
                pvpEnabled: player.pvpEnabled,
                pvpTagged: player.pvpTagged,
                combatTargetId: player.combatTargetId,
            };
        });

        this.broadcast("snapshot", snapshot);
    }

    private broadcastPartyStates() {
        this.clients.forEach((client) => this.sendPartyState(client));
    }

    private broadcastOwnerStates(now: number) {
        this.clients.forEach((client) => {
            this.sendSkillState(client, now);
            this.sendQuestState(client);
            this.sendNpcDialogState(client);
            this.sendPvpState(client);
        });
    }

    private sendPartyState(client: Client) {
        client.send("partyState", this.partySystem.getPartyStateFor(client.sessionId, this.state.players));
    }

    private sendInventoryState(client: Client) {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;
        client.send("inventoryState", this.inventorySystem.getInventoryState(player));
    }

    private sendSkillState(client: Client, now: number) {
        const player = this.state.players.get(client.sessionId);
        if (!player || player.isMob || player.isNpc) return;
        client.send("skillState", this.skillSystem.getSkillState(player, now));
    }

    private sendQuestState(client: Client) {
        const player = this.state.players.get(client.sessionId);
        if (!player || player.isMob || player.isNpc) return;
        client.send("questState", this.questSystem.getQuestState(player));
    }

    private sendNpcDialogState(client: Client) {
        const player = this.state.players.get(client.sessionId);
        if (!player || player.isMob || player.isNpc) return;

        this.npcSystem.ensureInteractionStillValid(player, this.state.players);
        client.send(
            "npcDialogState",
            this.npcSystem.buildDialogState(
                player,
                this.state.players,
                this.questSystem,
                this.shopSystem
            )
        );
    }

    private sendPvpState(client: Client) {
        const player = this.state.players.get(client.sessionId);
        if (!player || player.isMob || player.isNpc) return;
        client.send("pvpState", this.pvpSystem.getStateFor(client.sessionId, this.state.players));
    }

    private sendPartyNotice(sessionId: string, kind: "info" | "error", message: string) {
        const client = this.clients.find((candidate) => candidate.sessionId === sessionId);
        if (!client) return;
        client.send("partyNotice", { kind, message });
    }

    private sendInventoryNotice(sessionId: string, kind: "info" | "error", message: string) {
        const client = this.findClient(sessionId);
        if (!client) return;
        client.send("inventoryNotice", { kind, message });
    }

    private sendSkillNotice(sessionId: string, kind: "info" | "error", message: string) {
        const client = this.findClient(sessionId);
        if (!client) return;
        client.send("skillNotice", { kind, message });
    }

    private sendNpcNotice(sessionId: string, kind: "info" | "error", message: string) {
        const client = this.findClient(sessionId);
        if (!client) return;
        client.send("npcNotice", { kind, message });
    }

    private sendChatNotice(sessionId: string, kind: "info" | "error", message: string) {
        const client = this.findClient(sessionId);
        if (!client) return;
        client.send("chatNotice", { kind, message });
    }

    private sendPvpNotice(sessionId: string, kind: "info" | "error", message: string) {
        const client = this.findClient(sessionId);
        if (!client) return;
        client.send("pvpNotice", { kind, message });
    }

    private applyPvpResult(result: {
        notices: Array<{ sessionId: string; kind: "info" | "error"; message: string }>;
        stateRecipients: string[];
        inventoryRecipients: string[];
    }) {
        result.notices.forEach((notice) => {
            this.sendPvpNotice(notice.sessionId, notice.kind, notice.message);
        });

        result.stateRecipients.forEach((sessionId) => {
            const client = this.findClient(sessionId);
            if (client) this.sendPvpState(client);
        });

        result.inventoryRecipients.forEach((sessionId) => {
            const client = this.findClient(sessionId);
            if (client) this.sendInventoryState(client);
        });
    }

    private notifyPartyMembers(memberId: string, message: string) {
        const memberIds = this.partySystem.getPartyMemberIds(memberId);
        memberIds.forEach((sessionId) => {
            this.sendPartyNotice(sessionId, "info", message);
        });
    }

    private distributeMobRewards(
        killerId: string,
        targetName: string,
        mobKind: string,
        expReward: number,
        goldReward: number
    ) {
        const killer = this.state.players.get(killerId);
        if (!killer || killer.isMob || killer.isNpc) return;

        const recipients = this.partySystem.getRewardRecipients(
            killerId,
            this.state.players,
            GameConfig.PARTY_SHARE_RANGE
        );
        if (recipients.length === 0) return;

        const expShares = this.splitIntegerReward(expReward, recipients.length);
        const goldShares = this.splitIntegerReward(goldReward, recipients.length);
        const shared = recipients.length > 1;
        const now = Date.now();

        recipients.forEach((sessionId, index) => {
            const player = this.state.players.get(sessionId);
            if (!player || player.isMob || player.isNpc) return;

            const expShare = expShares[index] ?? 0;
            const goldShare = goldShares[index] ?? 0;

            if (expShare > 0) {
                this.statsSystem.grantExp(player, expShare);
            }

            if (goldShare > 0) {
                this.statsSystem.grantGold(player, goldShare);
            }

            if (expShare > 0 || goldShare > 0) {
                const parts: string[] = [];
                if (expShare > 0) parts.push(`+${expShare} EXP`);
                if (goldShare > 0) parts.push(`+${goldShare} gold`);
                const suffix = shared ? " (party share)" : "";
                this.sendPartyNotice(sessionId, "info", `${parts.join(" ")} from ${targetName}${suffix}.`);
            }

            const recipientClient = this.findClient(sessionId);
            if (recipientClient) {
                const questChanged = this.questSystem.registerMobKill(player, mobKind);
                this.sendSkillState(recipientClient, now);
                if (questChanged) {
                    this.sendQuestState(recipientClient);
                    this.sendNpcDialogState(recipientClient);
                }
            }
        });

        const lootResult = this.inventorySystem.grantMobLoot(killer, mobKind);
        if (!lootResult?.info) return;

        const killerClient = this.clients.find((candidate) => candidate.sessionId === killerId);
        if (!killerClient) return;

        this.sendInventoryState(killerClient);
        this.sendInventoryNotice(killerId, "info", lootResult.info);
    }

    private processCombatResult(combatResult: CombatResult) {
        combatResult.events.forEach((event) => this.broadcast("combatEvent", event));
        this.applyPvpResult(this.pvpSystem.resolveActiveDuelsFromCombat(combatResult.events, this.state.players));

        combatResult.died.forEach(
            ({ sessionId, killerId, targetName, wasMob, mobKind, expReward, goldReward }) => {
                if (wasMob) {
                    this.distributeMobRewards(killerId, targetName, mobKind, expReward, goldReward);
                } else {
                    this.applyPvpResult(
                        this.pvpSystem.handleOpenWorldKill(killerId, sessionId, this.state.players)
                    );
                }

                this.applyPvpResult(
                    this.pvpSystem.clearChallengesForPlayer(
                        sessionId,
                        this.state.players,
                        "That duel is no longer available."
                    )
                );
                this.combatSystem.clearTargetForAll(sessionId, this.state.players);
                this.broadcast("playerDied", { sessionId });
            }
        );
    }

    private splitIntegerReward(total: number, recipients: number): number[] {
        if (recipients <= 0 || total <= 0) return [];

        const base = Math.floor(total / recipients);
        let remainder = total % recipients;

        return Array.from({ length: recipients }, () => {
            const value = base + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder -= 1;
            return value;
        });
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

    private findClient(sessionId: string): Client | undefined {
        return this.clients.find((candidate) => candidate.sessionId === sessionId);
    }

    private getActiveNpc(player: Player): Player | null {
        this.npcSystem.ensureInteractionStillValid(player, this.state.players);
        if (!player.activeNpcId) return null;

        const npc = this.state.players.get(player.activeNpcId);
        return npc && npc.isNpc ? npc : null;
    }

    private sendSayChat(senderId: string, sender: Player, text: string) {
        this.clients.forEach((otherClient) => {
            const other = this.state.players.get(otherClient.sessionId);
            if (!other) return;

            const dx = other.x - sender.x;
            const dy = other.y - sender.y;
            if (Math.sqrt(dx * dx + dy * dy) <= GameConfig.CHAT_RANGE) {
                otherClient.send("chatMessage", {
                    channel: "say",
                    sessionId: senderId,
                    senderName: sender.name,
                    text,
                });
            }
        });
    }

    private sendPartyChat(senderId: string, sender: Player, text: string) {
        const memberIds = this.partySystem.getPartyMemberIds(senderId);
        if (memberIds.length === 0) {
            this.sendChatNotice(senderId, "error", "Join a party before using party chat.");
            return;
        }

        memberIds.forEach((memberId) => {
            const client = this.findClient(memberId);
            if (!client) return;
            client.send("chatMessage", {
                channel: "party",
                sessionId: senderId,
                senderName: sender.name,
                text,
            });
        });
    }

    private sendWhisperChat(senderId: string, sender: Player, text: string, targetSessionId: string) {
        if (!targetSessionId) {
            this.sendChatNotice(senderId, "error", "Select a player target before whispering.");
            return;
        }

        if (targetSessionId === senderId) {
            this.sendChatNotice(senderId, "error", "You cannot whisper yourself.");
            return;
        }

        const target = this.state.players.get(targetSessionId);
        if (!target || target.isMob || target.isNpc) {
            this.sendChatNotice(senderId, "error", "That whisper target is not available.");
            return;
        }

        const senderClient = this.findClient(senderId);
        const targetClient = this.findClient(targetSessionId);
        if (!senderClient || !targetClient) {
            this.sendChatNotice(senderId, "error", "That player is no longer online.");
            return;
        }

        senderClient.send("chatMessage", {
            channel: "whisper",
            sessionId: senderId,
            senderName: sender.name,
            text,
            targetSessionId,
            targetName: target.name,
            direction: "outgoing",
        });
        targetClient.send("chatMessage", {
            channel: "whisper",
            sessionId: senderId,
            senderName: sender.name,
            text,
            targetSessionId,
            targetName: target.name,
            direction: "incoming",
        });
    }
}
