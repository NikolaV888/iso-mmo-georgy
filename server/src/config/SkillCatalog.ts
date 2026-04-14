import { GameConfig } from "./GameConfig";

export type SkillId = "power-strike" | "rising-uppercut" | "guardian-pulse";

export interface SkillDefinition {
    id: SkillId;
    name: string;
    category: "Combat" | "Recovery";
    hotkey: "1" | "2" | "3";
    description: string;
    minLevel: number;
    cooldownMs: number;
    targeting: "target" | "self";
}

const SKILL_CATALOG: Record<SkillId, SkillDefinition> = {
    "power-strike": {
        id: "power-strike",
        name: "Power Strike",
        category: "Combat",
        hotkey: "1",
        description: "Drive a heavier single-target strike into your current target.",
        minLevel: 1,
        cooldownMs: GameConfig.SKILL_POWER_STRIKE_COOLDOWN_MS,
        targeting: "target",
    },
    "rising-uppercut": {
        id: "rising-uppercut",
        name: "Rising Uppercut",
        category: "Combat",
        hotkey: "2",
        description: "Launch a grounded target upward to start an air route.",
        minLevel: 1,
        cooldownMs: GameConfig.SKILL_RISING_UPPERCUT_COOLDOWN_MS,
        targeting: "target",
    },
    "guardian-pulse": {
        id: "guardian-pulse",
        name: "Guardian Pulse",
        category: "Recovery",
        hotkey: "3",
        description: "Restore HP to yourself with a short recovery pulse.",
        minLevel: 2,
        cooldownMs: GameConfig.SKILL_GUARDIAN_PULSE_COOLDOWN_MS,
        targeting: "self",
    },
};

export function listSkillDefinitions(): SkillDefinition[] {
    return Object.values(SKILL_CATALOG);
}

export function getSkillDefinition(skillId: SkillId): SkillDefinition {
    return SKILL_CATALOG[skillId];
}

export function isSkillId(value: unknown): value is SkillId {
    return value === "power-strike" || value === "rising-uppercut" || value === "guardian-pulse";
}
