import { getItemDefinition } from "../config/ItemCatalog";
import { getNpcDefinition, type NpcKind } from "../config/NpcCatalog";
import {
    getQuestDefinition,
    listQuestDefinitions,
    type QuestDefinition,
    type QuestId,
} from "../config/QuestCatalog";
import { Player } from "../rooms/schema/GameState";
import { type InventoryResult, InventorySystem } from "./InventorySystem";
import { StatsSystem } from "./StatsSystem";

interface QuestObjectivePayload {
    label: string;
    complete: boolean;
}

interface QuestEntryPayload {
    id: QuestId;
    title: string;
    phase: "available" | "active" | "ready" | "completed";
    status: string;
    summary: string;
    objectives: QuestObjectivePayload[];
    rewardText: string;
}

export interface QuestStatePayload {
    entries: QuestEntryPayload[];
}

export interface NpcQuestOfferPayload {
    questId: QuestId;
    title: string;
    summary: string;
    status: string;
    action: "accept" | "claim" | null;
    actionLabel: string | null;
    canAct: boolean;
}

export interface QuestResult extends InventoryResult {}

export class QuestSystem {
    constructor(
        private readonly statsSystem: StatsSystem,
        private readonly inventorySystem: InventorySystem
    ) {}

    initializePlayerQuests(player: Player): void {
        player.acceptedQuestIds = [];
        player.claimedQuestIds = [];
        player.questProgress = {};
    }

    getQuestState(player: Player): QuestStatePayload {
        const entries = listQuestDefinitions()
            .filter((definition) => this.shouldRevealQuest(player, definition))
            .map((definition) => this.buildQuestEntry(player, definition));

        return { entries };
    }

    getNpcQuestOffer(player: Player, npcKind: NpcKind): NpcQuestOfferPayload | null {
        const relevantQuest = listQuestDefinitions().find((definition) => {
            if (definition.giverNpcKind !== npcKind) return false;
            if (this.isQuestAccepted(player, definition.id)) return true;
            if (this.isQuestClaimed(player, definition.id)) return false;
            return this.hasPrerequisite(player, definition);
        });

        if (!relevantQuest) return null;

        const progress = this.getQuestProgress(player, relevantQuest);
        const complete = progress >= relevantQuest.requiredKills;
        const accepted = this.isQuestAccepted(player, relevantQuest.id);

        if (this.isQuestClaimed(player, relevantQuest.id)) {
            return null;
        }

        if (!accepted) {
            const meetsLevel = player.level >= relevantQuest.minLevel;
            return {
                questId: relevantQuest.id,
                title: relevantQuest.title,
                summary: relevantQuest.summary,
                status: meetsLevel ? "Available" : `Reach level ${relevantQuest.minLevel}`,
                action: meetsLevel ? "accept" : null,
                actionLabel: meetsLevel ? "Accept Quest" : null,
                canAct: meetsLevel,
            };
        }

        return {
            questId: relevantQuest.id,
            title: relevantQuest.title,
            summary: relevantQuest.summary,
            status: complete ? "Ready to turn in" : `${progress}/${relevantQuest.requiredKills} complete`,
            action: complete ? "claim" : null,
            actionLabel: complete ? "Claim Reward" : null,
            canAct: complete,
        };
    }

    acceptQuest(player: Player, questId: QuestId): QuestResult {
        const definition = getQuestDefinition(questId);

        if (this.isQuestClaimed(player, questId)) {
            return { error: "That quest has already been completed." };
        }

        if (this.isQuestAccepted(player, questId)) {
            return { error: "That quest is already active." };
        }

        if (!this.hasPrerequisite(player, definition)) {
            return { error: "Finish the earlier field assignment first." };
        }

        if (player.level < definition.minLevel) {
            return { error: `${definition.title} unlocks at level ${definition.minLevel}.` };
        }

        player.acceptedQuestIds = [...player.acceptedQuestIds, questId];
        player.questProgress[questId] = 0;
        return { info: `${definition.title} accepted.` };
    }

    claimQuest(player: Player, questId: QuestId): QuestResult {
        const definition = getQuestDefinition(questId);

        if (!this.isQuestAccepted(player, questId)) {
            return { error: "That quest is not active." };
        }

        const progress = this.getQuestProgress(player, definition);
        if (progress < definition.requiredKills) {
            return { error: "You have not finished that objective yet." };
        }

        player.acceptedQuestIds = player.acceptedQuestIds.filter((id) => id !== questId);
        player.claimedQuestIds = [...player.claimedQuestIds, questId];

        this.statsSystem.grantExp(player, definition.rewardExp);
        this.statsSystem.grantGold(player, definition.rewardGold);

        definition.rewardItems.forEach(({ itemId, count }) => {
            this.inventorySystem.grantItem(player, itemId, count);
        });

        return {
            info: `Quest complete: ${definition.title}. ${this.buildRewardText(definition)}`,
        };
    }

    registerMobKill(player: Player, mobKind: string): boolean {
        let changed = false;

        listQuestDefinitions().forEach((definition) => {
            if (!this.isQuestAccepted(player, definition.id)) return;
            if (definition.mobKind !== mobKind) return;

            const current = this.getQuestProgress(player, definition);
            if (current >= definition.requiredKills) return;

            player.questProgress[definition.id] = current + 1;
            changed = true;
        });

        return changed;
    }

    private buildQuestEntry(player: Player, definition: QuestDefinition): QuestEntryPayload {
        const accepted = this.isQuestAccepted(player, definition.id);
        const claimed = this.isQuestClaimed(player, definition.id);
        const progress = this.getQuestProgress(player, definition);
        const npcName = getNpcDefinition(definition.giverNpcKind).name;
        const phase = claimed
            ? "completed"
            : accepted && progress >= definition.requiredKills
                ? "ready"
                : accepted
                    ? "active"
                    : "available";

        let status = "Available";
        if (claimed) {
            status = "Completed";
        } else if (accepted && progress >= definition.requiredKills) {
            status = `Return to ${npcName}`;
        } else if (accepted) {
            status = `${progress}/${definition.requiredKills}`;
        } else if (player.level < definition.minLevel) {
            status = `Lv. ${definition.minLevel}`;
        }

        return {
            id: definition.id,
            title: definition.title,
            phase,
            status,
            summary: definition.summary,
            objectives: [
                {
                    label: `${this.toMobLabel(definition.mobKind)} defeated ${Math.min(progress, definition.requiredKills)}/${definition.requiredKills}`,
                    complete: progress >= definition.requiredKills,
                },
                {
                    label: `Report back to ${npcName}`,
                    complete: claimed,
                },
            ],
            rewardText: this.buildRewardText(definition),
        };
    }

    private buildRewardText(definition: QuestDefinition): string {
        const parts = [`+${definition.rewardExp} EXP`, `+${definition.rewardGold} gold`];

        definition.rewardItems.forEach(({ itemId, count }) => {
            const itemName = getItemDefinition(itemId)?.name ?? itemId;
            parts.push(`${count}x ${itemName}`);
        });

        return parts.join(", ");
    }

    private shouldRevealQuest(player: Player, definition: QuestDefinition): boolean {
        if (this.isQuestAccepted(player, definition.id) || this.isQuestClaimed(player, definition.id)) {
            return true;
        }

        return this.hasPrerequisite(player, definition);
    }

    private hasPrerequisite(player: Player, definition: QuestDefinition): boolean {
        if (!definition.prerequisiteQuestId) return true;
        return this.isQuestClaimed(player, definition.prerequisiteQuestId);
    }

    private isQuestAccepted(player: Player, questId: QuestId): boolean {
        return player.acceptedQuestIds.includes(questId);
    }

    private isQuestClaimed(player: Player, questId: QuestId): boolean {
        return player.claimedQuestIds.includes(questId);
    }

    private getQuestProgress(player: Player, definition: QuestDefinition): number {
        return player.questProgress[definition.id] ?? 0;
    }

    private toMobLabel(mobKind: string): string {
        return mobKind === "slime" ? "Slimes" : mobKind === "bat" ? "Bats" : "Targets";
    }
}
