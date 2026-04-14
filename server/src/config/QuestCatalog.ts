import type { MobKind } from "./ItemCatalog";
import type { NpcKind } from "./NpcCatalog";

export type QuestId = "slime-sweep" | "bat-watch";

export interface QuestRewardItem {
    itemId: string;
    count: number;
}

export interface QuestDefinition {
    id: QuestId;
    title: string;
    summary: string;
    giverNpcKind: NpcKind;
    minLevel: number;
    prerequisiteQuestId?: QuestId;
    mobKind: MobKind;
    requiredKills: number;
    rewardExp: number;
    rewardGold: number;
    rewardItems: QuestRewardItem[];
}

const QUEST_CATALOG: Record<QuestId, QuestDefinition> = {
    "slime-sweep": {
        id: "slime-sweep",
        title: "Slime Sweep",
        summary: "Thin out the slimes near camp so the supply line stops getting bogged down in gel.",
        giverNpcKind: "quartermaster",
        minLevel: 1,
        mobKind: "slime",
        requiredKills: 4,
        rewardExp: 45,
        rewardGold: 20,
        rewardItems: [{ itemId: "red-potion", count: 2 }],
    },
    "bat-watch": {
        id: "bat-watch",
        title: "Bat Watch",
        summary: "Drive the bats off the ridge before they start harassing runners and scouts.",
        giverNpcKind: "quartermaster",
        minLevel: 2,
        prerequisiteQuestId: "slime-sweep",
        mobKind: "bat",
        requiredKills: 3,
        rewardExp: 70,
        rewardGold: 35,
        rewardItems: [{ itemId: "jump-tonic", count: 2 }],
    },
};

export function listQuestDefinitions(): QuestDefinition[] {
    return Object.values(QUEST_CATALOG);
}

export function getQuestDefinition(questId: QuestId): QuestDefinition {
    return QUEST_CATALOG[questId];
}

export function isQuestId(value: unknown): value is QuestId {
    return value === "slime-sweep" || value === "bat-watch";
}
