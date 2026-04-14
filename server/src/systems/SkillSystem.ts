import { MapSchema } from "@colyseus/schema";
import { GameConfig } from "../config/GameConfig";
import {
    getSkillDefinition,
    listSkillDefinitions,
    type SkillDefinition,
    type SkillId,
} from "../config/SkillCatalog";
import { Player } from "../rooms/schema/GameState";
import { CombatSystem, type CombatResult } from "./CombatSystem";
import { PhysicsSystem } from "./PhysicsSystem";

interface SkillEntryPayload {
    id: SkillId;
    name: string;
    category: SkillDefinition["category"];
    hotkey: SkillDefinition["hotkey"];
    description: string;
    status: string;
    unlocked: boolean;
    ready: boolean;
    cooldownRemainingMs: number;
    targeting: SkillDefinition["targeting"];
}

export interface SkillStatePayload {
    skills: SkillEntryPayload[];
}

export interface SkillUseResult {
    combat?: CombatResult;
    error?: string;
    info?: string;
}

interface ResolvedTarget {
    target: Player;
    targetSid: string;
}

export class SkillSystem {
    initializePlayerSkills(player: Player): void {
        player.skillCooldowns = {};
    }

    getSkillState(player: Player, now: number): SkillStatePayload {
        return {
            skills: listSkillDefinitions().map((definition) =>
                this.buildSkillEntry(player, definition, now)
            ),
        };
    }

    useSkill(
        player: Player,
        playerSid: string,
        skillId: SkillId,
        players: MapSchema<Player>,
        now: number,
        physicsSystem: PhysicsSystem,
        combatSystem: CombatSystem
    ): SkillUseResult {
        const definition = getSkillDefinition(skillId);
        const useError = this.getBlockedReason(player, definition, now);
        if (useError) {
            return { error: useError };
        }

        switch (skillId) {
            case "power-strike":
                return this.usePowerStrike(
                    player,
                    playerSid,
                    players,
                    now,
                    physicsSystem,
                    combatSystem,
                    definition
                );
            case "rising-uppercut":
                return this.useRisingUppercut(
                    player,
                    playerSid,
                    players,
                    now,
                    physicsSystem,
                    combatSystem,
                    definition
                );
            case "guardian-pulse":
                return this.useGuardianPulse(player, now, definition);
            default:
                return { error: "Unknown skill." };
        }
    }

    private buildSkillEntry(
        player: Player,
        definition: SkillDefinition,
        now: number
    ): SkillEntryPayload {
        const cooldownRemainingMs = this.getCooldownRemainingMs(player, definition.id, now);
        const unlocked = player.level >= definition.minLevel;
        const ready =
            unlocked &&
            cooldownRemainingMs <= 0 &&
            !player.isDead &&
            !player.isKnockedDown;

        let status = "Ready";
        if (!unlocked) {
            status = `Lv. ${definition.minLevel}`;
        } else if (player.isDead) {
            status = "KO";
        } else if (player.isKnockedDown) {
            status = "Down";
        } else if (cooldownRemainingMs > 0) {
            status = this.formatCooldownMs(cooldownRemainingMs);
        }

        return {
            id: definition.id,
            name: definition.name,
            category: definition.category,
            hotkey: definition.hotkey,
            description: definition.description,
            status,
            unlocked,
            ready,
            cooldownRemainingMs,
            targeting: definition.targeting,
        };
    }

    private usePowerStrike(
        player: Player,
        playerSid: string,
        players: MapSchema<Player>,
        now: number,
        physicsSystem: PhysicsSystem,
        combatSystem: CombatSystem,
        definition: SkillDefinition
    ): SkillUseResult {
        const resolvedTarget = this.resolveTarget(player, players);
        if ("error" in resolvedTarget) return resolvedTarget;

        const range = player.attackRange + GameConfig.SKILL_POWER_STRIKE_RANGE_BONUS;
        if (!this.isTargetInRange(player, resolvedTarget.target, range)) {
            return { error: `${definition.name} is out of range.` };
        }

        this.setCooldown(player, definition.id, now + definition.cooldownMs);

        const airborneTarget =
            resolvedTarget.target.z > resolvedTarget.target.groundZ + 0.25;
        const damage = Math.round(
            player.attackDamage * GameConfig.SKILL_POWER_STRIKE_DAMAGE_MULTIPLIER +
            GameConfig.SKILL_POWER_STRIKE_BONUS_DAMAGE
        );

        return {
            combat: combatSystem.applyDirectAttack({
                attacker: player,
                attackerSid: playerSid,
                target: resolvedTarget.target,
                targetSid: resolvedTarget.targetSid,
                now,
                damage,
                effect: airborneTarget ? "air-hit" : "hit",
                physicsSystem,
                resetCombo: true,
            }),
        };
    }

    private useRisingUppercut(
        player: Player,
        playerSid: string,
        players: MapSchema<Player>,
        now: number,
        physicsSystem: PhysicsSystem,
        combatSystem: CombatSystem,
        definition: SkillDefinition
    ): SkillUseResult {
        const resolvedTarget = this.resolveTarget(player, players);
        if ("error" in resolvedTarget) return resolvedTarget;

        if (!resolvedTarget.target.isGrounded || resolvedTarget.target.isKnockedDown) {
            return { error: `${definition.name} needs a standing grounded target.` };
        }

        const range = player.attackRange + GameConfig.SKILL_RISING_UPPERCUT_RANGE_BONUS;
        if (!this.isTargetInRange(player, resolvedTarget.target, range)) {
            return { error: `${definition.name} is out of range.` };
        }

        this.setCooldown(player, definition.id, now + definition.cooldownMs);

        const damage = Math.round(
            player.attackDamage * GameConfig.SKILL_RISING_UPPERCUT_DAMAGE_MULTIPLIER +
            GameConfig.SKILL_RISING_UPPERCUT_BONUS_DAMAGE
        );

        return {
            combat: combatSystem.applyDirectAttack({
                attacker: player,
                attackerSid: playerSid,
                target: resolvedTarget.target,
                targetSid: resolvedTarget.targetSid,
                now,
                damage,
                effect: "knockup",
                physicsSystem,
                knockupImpulse: GameConfig.SKILL_RISING_UPPERCUT_IMPULSE,
                resetCombo: true,
            }),
        };
    }

    private useGuardianPulse(
        player: Player,
        now: number,
        definition: SkillDefinition
    ): SkillUseResult {
        if (player.hp >= player.maxHp) {
            return { error: "HP is already full." };
        }

        this.setCooldown(player, definition.id, now + definition.cooldownMs);

        const previousHp = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + GameConfig.SKILL_GUARDIAN_PULSE_HEAL_AMOUNT);
        const healed = player.hp - previousHp;

        return { info: `${definition.name} restored ${healed} HP.` };
    }

    private getBlockedReason(
        player: Player,
        definition: SkillDefinition,
        now: number
    ): string | null {
        if (player.isDead) return "You cannot use skills while dead.";
        if (player.isKnockedDown) return "You cannot use skills while knocked down.";
        if (player.level < definition.minLevel) {
            return `${definition.name} unlocks at level ${definition.minLevel}.`;
        }

        const cooldownRemainingMs = this.getCooldownRemainingMs(player, definition.id, now);
        if (cooldownRemainingMs > 0) {
            return `${definition.name} is on cooldown for ${this.formatCooldownMs(cooldownRemainingMs)}.`;
        }

        return null;
    }

    private resolveTarget(
        player: Player,
        players: MapSchema<Player>
    ): ResolvedTarget | { error: string } {
        const targetSid = player.combatTargetId.trim();
        if (!targetSid) {
            return { error: "Select a target first." };
        }

        const target = players.get(targetSid);
        if (!target || target.isDead) {
            player.combatTargetId = "";
            return { error: "Your target is no longer available." };
        }

        return { target, targetSid };
    }

    private isTargetInRange(attacker: Player, target: Player, range: number): boolean {
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        return Math.sqrt(dx * dx + dy * dy) <= range;
    }

    private getCooldownRemainingMs(player: Player, skillId: SkillId, now: number): number {
        const readyAt = player.skillCooldowns[skillId] ?? 0;
        return Math.max(0, readyAt - now);
    }

    private setCooldown(player: Player, skillId: SkillId, readyAt: number): void {
        player.skillCooldowns[skillId] = readyAt;
    }

    private formatCooldownMs(cooldownMs: number): string {
        return `${(Math.ceil(cooldownMs / 100) / 10).toFixed(1)}s`;
    }
}
