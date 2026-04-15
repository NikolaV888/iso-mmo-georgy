import { MapSchema } from "@colyseus/schema";
import type { InventoryTab } from "../config/ItemCatalog";
import { Player } from "../rooms/schema/GameState";
import { InventorySystem } from "./InventorySystem";
import { PartySystem } from "./PartySystem";
import { StatsSystem } from "./StatsSystem";

type NoticeKind = "info" | "error";

interface DuelStakeOffer {
    gold: number;
    itemId: string | null;
    itemName: string | null;
    tab: InventoryTab | null;
}

interface PendingDuelChallenge {
    challengerId: string;
    targetId: string;
    offeredStake: DuelStakeOffer;
}

interface EscrowedDuelStake {
    gold: number;
    itemId: string | null;
    itemName: string | null;
}

interface ActiveDuel {
    id: string;
    playerAId: string;
    playerBId: string;
    stakes: Record<string, EscrowedDuelStake>;
}

interface MutablePvpResult {
    ok: boolean;
    notices: PvpNotice[];
    stateRecipients: Set<string>;
    inventoryRecipients: Set<string>;
}

export interface DuelStakePayload {
    gold: number;
    itemId: string | null;
    itemName: string | null;
}

export interface IncomingDuelPayload {
    challengerId: string;
    challengerName: string;
    offeredStake: DuelStakePayload;
}

export interface OutgoingDuelPayload {
    targetId: string;
    targetName: string;
    offeredStake: DuelStakePayload;
}

export interface ActiveDuelPayload {
    opponentId: string;
    opponentName: string;
    yourStake: DuelStakePayload;
    opponentStake: DuelStakePayload;
}

export interface PvpStatePayload {
    pvpEnabled: boolean;
    pvpTagged: boolean;
    incomingChallenge: IncomingDuelPayload | null;
    outgoingChallenge: OutgoingDuelPayload | null;
    activeDuel: ActiveDuelPayload | null;
}

export interface PvpNotice {
    sessionId: string;
    kind: NoticeKind;
    message: string;
}

export interface PvpSystemResult {
    ok: boolean;
    notices: PvpNotice[];
    stateRecipients: string[];
    inventoryRecipients: string[];
}

export interface DuelStakeInput {
    gold?: unknown;
    tab?: unknown;
    index?: unknown;
}

export interface AttackPermission {
    allowed: boolean;
    error?: string;
    minimumTargetHp?: number;
}

export class PvpSystem {
    private readonly pendingByChallenger = new Map<string, PendingDuelChallenge>();
    private readonly pendingByTarget = new Map<string, PendingDuelChallenge>();
    private readonly activeByMember = new Map<string, ActiveDuel>();
    private nextDuelId = 1;

    constructor(
        private readonly inventorySystem: InventorySystem,
        private readonly statsSystem: StatsSystem
    ) {}

    initializePlayerState(player: Player): void {
        player.pvpEnabled = false;
        player.pvpTagged = false;
    }

    getStateFor(sessionId: string, players: MapSchema<Player>): PvpStatePayload {
        const player = players.get(sessionId);
        const pendingIncoming = this.pendingByTarget.get(sessionId) ?? null;
        const pendingOutgoing = this.pendingByChallenger.get(sessionId) ?? null;
        const activeDuel = this.activeByMember.get(sessionId) ?? null;

        return {
            pvpEnabled: player?.pvpEnabled ?? false,
            pvpTagged: player?.pvpTagged ?? false,
            incomingChallenge: pendingIncoming
                ? {
                    challengerId: pendingIncoming.challengerId,
                    challengerName: players.get(pendingIncoming.challengerId)?.name ?? "Player",
                    offeredStake: this.toStakePayload(pendingIncoming.offeredStake),
                }
                : null,
            outgoingChallenge: pendingOutgoing
                ? {
                    targetId: pendingOutgoing.targetId,
                    targetName: players.get(pendingOutgoing.targetId)?.name ?? "Player",
                    offeredStake: this.toStakePayload(pendingOutgoing.offeredStake),
                }
                : null,
            activeDuel: activeDuel
                ? this.buildActiveDuelPayload(sessionId, activeDuel, players)
                : null,
        };
    }

    togglePvpMode(sessionId: string, players: MapSchema<Player>): PvpSystemResult {
        const result = this.createResult();
        const player = players.get(sessionId);
        if (!player || player.isMob || player.isNpc) {
            this.addNotice(result, sessionId, "error", "PvP mode is only available to players.");
            return this.finalize(result);
        }

        if (this.activeByMember.has(sessionId)) {
            this.addNotice(result, sessionId, "error", "Finish your duel before changing PvP mode.");
            return this.finalize(result);
        }

        player.pvpEnabled = !player.pvpEnabled;
        this.addStateRecipients(result, sessionId);
        this.addNotice(
            result,
            sessionId,
            "info",
            player.pvpEnabled ? "PvP mode enabled." : "PvP mode disabled."
        );
        return this.finalize(result);
    }

    requestDuel(
        challengerId: string,
        targetId: string,
        rawStake: DuelStakeInput,
        players: MapSchema<Player>,
        partySystem: PartySystem
    ): PvpSystemResult {
        const result = this.createResult();
        const challenger = players.get(challengerId);
        const target = players.get(targetId);

        if (!challenger || !target || challenger.isMob || challenger.isNpc || target.isMob || target.isNpc) {
            this.addNotice(result, challengerId, "error", "That player is not available for a duel.");
            return this.finalize(result);
        }

        if (challengerId === targetId) {
            this.addNotice(result, challengerId, "error", "You cannot duel yourself.");
            return this.finalize(result);
        }

        if (challenger.isDead || target.isDead) {
            this.addNotice(result, challengerId, "error", "Both duelists need to be alive.");
            return this.finalize(result);
        }

        if (!partySystem.arePartyMembers(challengerId, targetId)) {
            this.addNotice(result, challengerId, "error", "Only party members can start a duel.");
            return this.finalize(result);
        }

        if (this.isBusy(challengerId) || this.isBusy(targetId)) {
            this.addNotice(result, challengerId, "error", "One of you is already busy with another duel.");
            return this.finalize(result);
        }

        const offeredStake = this.buildStakeOffer(challenger, rawStake);
        if ("error" in offeredStake) {
            this.addNotice(result, challengerId, "error", offeredStake.error);
            return this.finalize(result);
        }

        const challenge: PendingDuelChallenge = {
            challengerId,
            targetId,
            offeredStake: offeredStake.offer,
        };

        this.pendingByChallenger.set(challengerId, challenge);
        this.pendingByTarget.set(targetId, challenge);

        this.addStateRecipients(result, challengerId, targetId);
        this.addNotice(
            result,
            challengerId,
            "info",
            `Duel challenge sent to ${target.name}${this.formatStakeSuffix(challenge.offeredStake)}.`
        );
        this.addNotice(
            result,
            targetId,
            "info",
            `${challenger.name} challenged you to a duel${this.formatStakeSuffix(challenge.offeredStake)}.`
        );

        return this.finalize(result);
    }

    cancelOutgoing(challengerId: string, players: MapSchema<Player>): PvpSystemResult {
        const result = this.createResult();
        const challenge = this.pendingByChallenger.get(challengerId);
        if (!challenge) {
            this.addNotice(result, challengerId, "error", "You have no outgoing duel challenge.");
            return this.finalize(result);
        }

        this.removePendingChallenge(challenge);
        const targetName = players.get(challenge.targetId)?.name ?? "Player";
        this.addStateRecipients(result, challenge.challengerId, challenge.targetId);
        this.addNotice(result, challengerId, "info", `Canceled your duel challenge to ${targetName}.`);
        this.addNotice(result, challenge.targetId, "info", "The duel challenge was canceled.");
        return this.finalize(result);
    }

    declineDuel(targetId: string, challengerId: string, players: MapSchema<Player>): PvpSystemResult {
        const result = this.createResult();
        const challenge = this.pendingByTarget.get(targetId);
        if (!challenge || challenge.challengerId !== challengerId) {
            this.addNotice(result, targetId, "error", "That duel challenge is no longer available.");
            return this.finalize(result);
        }

        this.removePendingChallenge(challenge);
        const targetName = players.get(targetId)?.name ?? "Player";
        this.addStateRecipients(result, challengerId, targetId);
        this.addNotice(result, targetId, "info", "Duel declined.");
        this.addNotice(result, challengerId, "info", `${targetName} declined your duel challenge.`);
        return this.finalize(result);
    }

    acceptDuel(
        targetId: string,
        challengerId: string,
        rawStake: DuelStakeInput,
        players: MapSchema<Player>,
        partySystem: PartySystem
    ): PvpSystemResult {
        const result = this.createResult();
        const challenge = this.pendingByTarget.get(targetId);
        if (!challenge || challenge.challengerId !== challengerId) {
            this.addNotice(result, targetId, "error", "That duel challenge is no longer available.");
            return this.finalize(result);
        }

        const challenger = players.get(challengerId);
        const target = players.get(targetId);
        if (!challenger || !target || challenger.isDead || target.isDead) {
            this.removePendingChallenge(challenge);
            this.addStateRecipients(result, challengerId, targetId);
            this.addNotice(result, targetId, "error", "That duel challenge is no longer available.");
            if (challenger) {
                this.addNotice(result, challengerId, "error", "Your duel challenge expired.");
            }
            return this.finalize(result);
        }

        if (!partySystem.arePartyMembers(challengerId, targetId)) {
            this.removePendingChallenge(challenge);
            this.addStateRecipients(result, challengerId, targetId);
            this.addNotice(result, targetId, "error", "Only party members can start a duel.");
            this.addNotice(result, challengerId, "error", "Your duel challenge expired because party membership changed.");
            return this.finalize(result);
        }

        const responderStake = this.buildStakeOffer(target, rawStake);
        if ("error" in responderStake) {
            this.addNotice(result, targetId, "error", responderStake.error);
            return this.finalize(result);
        }

        const challengerEscrow = this.previewEscrow(challenger, challenge.offeredStake);
        if ("error" in challengerEscrow) {
            this.removePendingChallenge(challenge);
            this.addStateRecipients(result, challengerId, targetId);
            this.addNotice(result, targetId, "error", "That duel challenge expired because the wager changed.");
            this.addNotice(result, challengerId, "error", challengerEscrow.error);
            return this.finalize(result);
        }

        const responderEscrow = this.previewEscrow(target, responderStake.offer);
        if ("error" in responderEscrow) {
            this.addNotice(result, targetId, "error", responderEscrow.error);
            return this.finalize(result);
        }

        this.commitEscrow(challenger, challenge.offeredStake);
        this.commitEscrow(target, responderStake.offer);
        this.removePendingChallenge(challenge);

        const duelId = `duel:${this.nextDuelId++}`;
        const duel: ActiveDuel = {
            id: duelId,
            playerAId: challengerId,
            playerBId: targetId,
            stakes: {
                [challengerId]: challengerEscrow.stake,
                [targetId]: responderEscrow.stake,
            },
        };

        this.activeByMember.set(challengerId, duel);
        this.activeByMember.set(targetId, duel);

        this.stopPlayerCombat(challenger);
        this.stopPlayerCombat(target);
        this.addStateRecipients(result, challengerId, targetId);
        this.addInventoryRecipients(result, challengerId, targetId);
        this.addNotice(
            result,
            challengerId,
            "info",
            `Duel started against ${target.name}. First to 1 HP loses.`
        );
        this.addNotice(
            result,
            targetId,
            "info",
            `Duel started against ${challenger.name}. First to 1 HP loses.`
        );

        return this.finalize(result);
    }

    canAttackTarget(
        attackerId: string,
        targetId: string,
        players: MapSchema<Player>,
        partySystem: PartySystem
    ): AttackPermission {
        const attacker = players.get(attackerId);
        const target = players.get(targetId);
        if (!attacker || !target || target.isDead || target.isNpc) {
            return { allowed: false, error: "Your target is no longer available." };
        }

        if (target.isMob || attacker.isMob) {
            return { allowed: true, minimumTargetHp: 0 };
        }

        const activeDuel = this.activeByMember.get(attackerId);
        const targetDuel = this.activeByMember.get(targetId);
        const sharedDuel = activeDuel && targetDuel && activeDuel.id === targetDuel.id
            ? activeDuel
            : null;

        if (sharedDuel && this.isMemberOfDuel(sharedDuel, targetId)) {
            return { allowed: true, minimumTargetHp: 1 };
        }

        if (activeDuel) {
            return { allowed: false, error: "Finish your current duel before attacking anyone else." };
        }

        if (targetDuel) {
            return { allowed: false, error: `${target.name} is already in a duel.` };
        }

        if (partySystem.arePartyMembers(attackerId, targetId)) {
            return { allowed: false, error: "Party members can only fight each other in a duel." };
        }

        if (!attacker.pvpEnabled) {
            return { allowed: false, error: "Enable PvP mode before attacking another player." };
        }

        if (!target.pvpEnabled) {
            return { allowed: false, error: `${target.name} does not have PvP mode enabled.` };
        }

        return { allowed: true, minimumTargetHp: 0 };
    }

    resolveActiveDuelsFromCombat(
        events: Array<{ attacker: string; target: string; targetHp: number }>,
        players: MapSchema<Player>
    ): PvpSystemResult {
        const result = this.createResult();
        const resolvedDuelIds = new Set<string>();

        events.forEach(({ attacker, target, targetHp }) => {
            if (targetHp > 1) return;

            const duel = this.activeByMember.get(attacker);
            if (!duel || duel.id === "" || resolvedDuelIds.has(duel.id) || !this.isMemberOfDuel(duel, target)) {
                return;
            }

            const winner = players.get(attacker);
            const loser = players.get(target);
            if (!winner || !loser) return;

            resolvedDuelIds.add(duel.id);
            this.finishDuelWithWinner(result, duel, attacker, target, players);
        });

        return this.finalize(result);
    }

    handleOpenWorldKill(
        killerId: string,
        targetId: string,
        players: MapSchema<Player>
    ): PvpSystemResult {
        const result = this.createResult();
        const killer = players.get(killerId);
        const target = players.get(targetId);
        if (!killer || !target || killer.isMob || target.isMob || killer.isNpc || target.isNpc) {
            return this.finalize(result);
        }

        killer.pvpTagged = true;
        target.pvpTagged = false;

        const goldLoss = target.gold > 0
            ? Math.max(1, Math.floor(target.gold * 0.1))
            : 0;
        const spentGold = goldLoss > 0
            ? this.statsSystem.spendGold(target, goldLoss).amount
            : 0;
        if (spentGold > 0) {
            this.statsSystem.grantGold(killer, spentGold);
        }

        const equipmentDrops = this.inventorySystem.dropEquippedItemsByChance(target, 0.15);
        equipmentDrops.forEach((drop) => {
            this.inventorySystem.grantItem(killer, drop.itemId, 1);
        });

        this.addStateRecipients(result, killerId, targetId);
        if (equipmentDrops.length > 0) {
            this.addInventoryRecipients(result, killerId, targetId);
        }

        const lossParts: string[] = [];
        if (spentGold > 0) lossParts.push(`${spentGold} gold`);
        if (equipmentDrops.length > 0) {
            lossParts.push(equipmentDrops.map((drop) => drop.itemName).join(", "));
        }

        const lossText = lossParts.length > 0 ? lossParts.join(" and ") : "no loot";
        this.addNotice(
            result,
            killerId,
            "info",
            `You defeated ${target.name} in open PvP. ${killer.pvpTagged ? "PVP tag applied. " : ""}You claimed ${lossText}.`
        );
        this.addNotice(
            result,
            targetId,
            "error",
            `You were defeated in open PvP and lost ${lossText}.`
        );

        return this.finalize(result);
    }

    clearChallengesForPlayer(sessionId: string, players: MapSchema<Player>, reason: string): PvpSystemResult {
        const result = this.createResult();
        const pendingAsTarget = this.pendingByTarget.get(sessionId);
        if (pendingAsTarget) {
            this.removePendingChallenge(pendingAsTarget);
            this.addStateRecipients(result, pendingAsTarget.challengerId, pendingAsTarget.targetId);
            this.addNotice(result, pendingAsTarget.challengerId, "error", reason);
        }

        const pendingAsChallenger = this.pendingByChallenger.get(sessionId);
        if (pendingAsChallenger) {
            this.removePendingChallenge(pendingAsChallenger);
            this.addStateRecipients(result, pendingAsChallenger.challengerId, pendingAsChallenger.targetId);
            this.addNotice(result, pendingAsChallenger.targetId, "error", reason);
        }

        return this.finalize(result);
    }

    reconcilePartyState(players: MapSchema<Player>, partySystem: PartySystem): PvpSystemResult {
        const result = this.createResult();
        const processedChallengeIds = new Set<string>();
        const processedDuelIds = new Set<string>();

        Array.from(this.pendingByChallenger.values()).forEach((challenge) => {
            const challengeId = `${challenge.challengerId}:${challenge.targetId}`;
            if (processedChallengeIds.has(challengeId)) return;
            processedChallengeIds.add(challengeId);

            if (partySystem.arePartyMembers(challenge.challengerId, challenge.targetId)) {
                return;
            }

            this.removePendingChallenge(challenge);
            this.addStateRecipients(result, challenge.challengerId, challenge.targetId);

            const challenger = players.get(challenge.challengerId);
            const target = players.get(challenge.targetId);
            if (challenger) {
                this.addNotice(
                    result,
                    challenge.challengerId,
                    "error",
                    `Your duel challenge to ${target?.name ?? "that player"} was canceled because your party changed.`
                );
            }
            if (target) {
                this.addNotice(
                    result,
                    challenge.targetId,
                    "error",
                    `The duel challenge from ${challenger?.name ?? "that player"} was canceled because your party changed.`
                );
            }
        });

        Array.from(this.activeByMember.values()).forEach((duel) => {
            if (processedDuelIds.has(duel.id)) return;
            processedDuelIds.add(duel.id);

            if (partySystem.arePartyMembers(duel.playerAId, duel.playerBId)) {
                return;
            }

            this.removeActiveDuel(duel);

            [duel.playerAId, duel.playerBId].forEach((memberId) => {
                const member = players.get(memberId);
                if (!member) return;
                this.refundStake(member, duel.stakes[memberId]);
                this.stopPlayerCombat(member);
            });

            this.addStateRecipients(result, duel.playerAId, duel.playerBId);
            this.addInventoryRecipients(result, duel.playerAId, duel.playerBId);
            [duel.playerAId, duel.playerBId].forEach((memberId) => {
                if (!players.get(memberId)) return;
                this.addNotice(
                    result,
                    memberId,
                    "error",
                    "Your duel was canceled because your party changed."
                );
            });
        });

        return this.finalize(result);
    }

    handleDisconnect(sessionId: string, players: MapSchema<Player>): PvpSystemResult {
        const result = this.createResult();
        this.mergeResult(result, this.clearChallengesForPlayer(sessionId, players, "The duel is no longer available."));

        const duel = this.activeByMember.get(sessionId);
        if (duel) {
            this.removeActiveDuel(duel);
            [duel.playerAId, duel.playerBId].forEach((memberId) => {
                const member = players.get(memberId);
                if (!member) return;
                this.refundStake(member, duel.stakes[memberId]);
                this.stopPlayerCombat(member);
            });

            this.addStateRecipients(result, duel.playerAId, duel.playerBId);
            this.addInventoryRecipients(result, duel.playerAId, duel.playerBId);
            [duel.playerAId, duel.playerBId]
                .filter((memberId) => memberId !== sessionId)
                .forEach((memberId) => {
                    this.addNotice(result, memberId, "error", "Your duel was canceled because the other player disconnected.");
                });
        }

        return this.finalize(result);
    }

    private buildActiveDuelPayload(
        sessionId: string,
        duel: ActiveDuel,
        players: MapSchema<Player>
    ): ActiveDuelPayload {
        const opponentId = duel.playerAId === sessionId ? duel.playerBId : duel.playerAId;
        return {
            opponentId,
            opponentName: players.get(opponentId)?.name ?? "Player",
            yourStake: this.toStakePayload(duel.stakes[sessionId]),
            opponentStake: this.toStakePayload(duel.stakes[opponentId]),
        };
    }

    private buildStakeOffer(
        player: Player,
        rawStake: DuelStakeInput
    ): { offer: DuelStakeOffer } | { error: string } {
        const gold = this.readGold(rawStake.gold);
        const hasItemSelection = rawStake.tab !== undefined || rawStake.index !== undefined;
        if (!hasItemSelection) {
            return {
                offer: {
                    gold,
                    itemId: null,
                    itemName: null,
                    tab: null,
                },
            };
        }

        const itemLookup = this.inventorySystem.getInventoryItemAt(player, rawStake.tab, rawStake.index);
        if (itemLookup.error || !itemLookup.selection) {
            return { error: itemLookup.error ?? "That duel wager item is no longer available." };
        }

        return {
            offer: {
                gold,
                itemId: itemLookup.selection.itemId,
                itemName: itemLookup.selection.name,
                tab: itemLookup.selection.tab,
            },
        };
    }

    private previewEscrow(
        player: Player,
        offer: DuelStakeOffer
    ): { stake: EscrowedDuelStake } | { error: string } {
        if (offer.gold > player.gold) {
            return { error: "You do not have enough gold for that wager." };
        }

        if (offer.itemId && offer.tab) {
            const itemLookup = this.inventorySystem.getInventoryItemAt(
                player,
                offer.tab,
                this.findInventoryIndex(player, offer.tab, offer.itemId)
            );
            if (itemLookup.error || !itemLookup.selection || itemLookup.selection.itemId !== offer.itemId) {
                return { error: "That wager item is no longer in your inventory." };
            }
        }

        return {
            stake: {
                gold: offer.gold,
                itemId: offer.itemId,
                itemName: offer.itemName,
            },
        };
    }

    private commitEscrow(player: Player, offer: DuelStakeOffer): void {
        if (offer.gold > 0) {
            this.statsSystem.spendGold(player, offer.gold);
        }

        if (offer.itemId && offer.tab) {
            this.inventorySystem.removeItemUnitById(player, offer.tab, offer.itemId);
        }
    }

    private refundStake(player: Player, stake: EscrowedDuelStake): void {
        if (stake.gold > 0) {
            this.statsSystem.grantGold(player, stake.gold);
        }

        if (stake.itemId) {
            this.inventorySystem.grantItem(player, stake.itemId, 1);
        }
    }

    private finishDuelWithWinner(
        result: MutablePvpResult,
        duel: ActiveDuel,
        winnerId: string,
        loserId: string,
        players: MapSchema<Player>
    ): void {
        const winner = players.get(winnerId);
        const loser = players.get(loserId);
        if (!winner || !loser) return;

        const duelStakes = [duel.stakes[duel.playerAId], duel.stakes[duel.playerBId]];
        const totalGold = duelStakes.reduce((sum, stake) => sum + stake.gold, 0);
        if (totalGold > 0) {
            this.statsSystem.grantGold(winner, totalGold);
        }

        const wonItems = duelStakes
            .map((stake) => stake.itemId)
            .filter((itemId): itemId is string => typeof itemId === "string");
        wonItems.forEach((itemId) => {
            this.inventorySystem.grantItem(winner, itemId, 1);
        });

        this.removeActiveDuel(duel);
        this.stopPlayerCombat(winner);
        this.stopPlayerCombat(loser);

        this.addStateRecipients(result, winnerId, loserId);
        if (totalGold > 0 || wonItems.length > 0) {
            this.addInventoryRecipients(result, winnerId);
        }

        const rewardParts: string[] = [];
        if (totalGold > 0) rewardParts.push(`${totalGold} gold`);
        if (wonItems.length > 0) {
            rewardParts.push(
                wonItems
                    .map((itemId) => duelStakes.find((stake) => stake.itemId === itemId)?.itemName ?? itemId)
                    .join(", ")
            );
        }

        const rewardText = rewardParts.length > 0
            ? ` You won ${rewardParts.join(" and ")}.`
            : "";

        this.addNotice(result, winnerId, "info", `You won the duel against ${loser.name}.${rewardText}`);
        this.addNotice(result, loserId, "error", `You lost the duel against ${winner.name}.`);
    }

    private formatStakeSuffix(stake: DuelStakeOffer): string {
        const parts: string[] = [];
        if (stake.gold > 0) parts.push(`${stake.gold} gold`);
        if (stake.itemName) parts.push(stake.itemName);
        return parts.length > 0 ? ` for ${parts.join(" and ")}` : "";
    }

    private readGold(rawValue: unknown): number {
        if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) return 0;
        return Math.max(0, Math.floor(rawValue));
    }

    private isBusy(sessionId: string): boolean {
        return (
            this.pendingByChallenger.has(sessionId) ||
            this.pendingByTarget.has(sessionId) ||
            this.activeByMember.has(sessionId)
        );
    }

    private isMemberOfDuel(duel: ActiveDuel, sessionId: string): boolean {
        return duel.playerAId === sessionId || duel.playerBId === sessionId;
    }

    private removePendingChallenge(challenge: PendingDuelChallenge): void {
        this.pendingByChallenger.delete(challenge.challengerId);
        this.pendingByTarget.delete(challenge.targetId);
    }

    private removeActiveDuel(duel: ActiveDuel): void {
        this.activeByMember.delete(duel.playerAId);
        this.activeByMember.delete(duel.playerBId);
    }

    private stopPlayerCombat(player: Player): void {
        player.combatTargetId = "";
        player.targetX = player.x;
        player.targetY = player.y;
        player.comboStage = 0;
        player.comboTargetId = "";
    }

    private findInventoryIndex(player: Player, tab: InventoryTab, itemId: string): number {
        return player.inventory[tab].findIndex((entry) => entry.itemId === itemId);
    }

    private toStakePayload(stake: DuelStakeOffer | EscrowedDuelStake): DuelStakePayload {
        return {
            gold: stake.gold,
            itemId: stake.itemId ?? null,
            itemName: stake.itemName ?? null,
        };
    }

    private createResult(): MutablePvpResult {
        return {
            ok: true,
            notices: [],
            stateRecipients: new Set<string>(),
            inventoryRecipients: new Set<string>(),
        };
    }

    private mergeResult(target: MutablePvpResult, source: PvpSystemResult): void {
        target.ok = target.ok && source.ok;
        source.notices.forEach((notice) => target.notices.push(notice));
        source.stateRecipients.forEach((sessionId) => target.stateRecipients.add(sessionId));
        source.inventoryRecipients.forEach((sessionId) => target.inventoryRecipients.add(sessionId));
    }

    private addNotice(result: MutablePvpResult, sessionId: string, kind: NoticeKind, message: string): void {
        result.notices.push({ sessionId, kind, message });
        if (kind === "error") {
            result.ok = false;
        }
    }

    private addStateRecipients(result: MutablePvpResult, ...sessionIds: string[]): void {
        sessionIds.forEach((sessionId) => {
            if (sessionId) result.stateRecipients.add(sessionId);
        });
    }

    private addInventoryRecipients(result: MutablePvpResult, ...sessionIds: string[]): void {
        sessionIds.forEach((sessionId) => {
            if (sessionId) result.inventoryRecipients.add(sessionId);
        });
    }

    private finalize(result: MutablePvpResult): PvpSystemResult {
        return {
            ok: result.ok,
            notices: result.notices,
            stateRecipients: Array.from(result.stateRecipients),
            inventoryRecipients: Array.from(result.inventoryRecipients),
        };
    }
}
