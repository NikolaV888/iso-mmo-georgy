export type NpcKind = "quartermaster";

export interface NpcDefinition {
    id: string;
    kind: NpcKind;
    name: string;
    x: number;
    y: number;
    interactionRange: number;
    greeting: string;
    hint: string;
    shopInventory: string[];
}

const NPC_CATALOG: Record<NpcKind, NpcDefinition> = {
    quartermaster: {
        id: "npc:quartermaster",
        kind: "quartermaster",
        name: "Quartermaster Rhea",
        x: 11,
        y: 13,
        interactionRange: 3.2,
        greeting: "The camp only works if hunters keep supplies moving. Bring me trophies, stock up, and I will keep you on the field.",
        hint: "Click an item below to buy it, or cash out your loot stacks here.",
        shopInventory: ["red-potion", "jump-tonic", "bronze-band"],
    },
};

export function listNpcDefinitions(): NpcDefinition[] {
    return Object.values(NPC_CATALOG);
}

export function getNpcDefinition(kind: NpcKind): NpcDefinition {
    return NPC_CATALOG[kind];
}

export function getNpcDefinitionById(npcId: string): NpcDefinition | null {
    return listNpcDefinitions().find((definition) => definition.id === npcId) ?? null;
}

export function isNpcKind(value: unknown): value is NpcKind {
    return value === "quartermaster";
}
