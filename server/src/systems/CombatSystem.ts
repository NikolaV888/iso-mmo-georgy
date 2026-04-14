import { MapSchema } from "@colyseus/schema";
import { GameConfig } from "../config/GameConfig";
import { Player } from "../rooms/schema/GameState";
import { PhysicsSystem } from "./PhysicsSystem";
import { TerrainSystem } from "./TerrainSystem";

export interface CombatEvent {
    attacker: string;
    target: string;
    damage: number;
    targetHp: number;
    effect: "hit" | "knockup" | "knockdown" | "air-hit";
}

export interface DeathResult {
    sessionId: string;
    killerId: string;
    targetName: string;
    wasMob: boolean;
    mobKind: string;
    expReward: number;
    goldReward: number;
}

export interface CombatResult {
    events: CombatEvent[];
    died: DeathResult[];
}

export interface DirectAttackOptions {
    attacker: Player;
    attackerSid: string;
    target: Player;
    targetSid: string;
    now: number;
    damage: number;
    effect: CombatEvent["effect"];
    physicsSystem: PhysicsSystem;
    knockupImpulse?: number;
    slamSpeed?: number;
    resetCombo?: boolean;
}

export class CombatSystem {
    private static readonly CHASE_BUFFER = 0.1;

    syncChasingTargets(players: MapSchema<Player>): void {
        players.forEach((attacker: Player) => {
            if (attacker.isDead || attacker.isKnockedDown || !attacker.combatTargetId) return;

            const target = players.get(attacker.combatTargetId);
            if (!target || target.isDead) {
                this.stopAttacking(attacker);
                return;
            }

            this.syncChasingTarget(attacker, target);
        });
    }

    processAutoAttacks(
        players: MapSchema<Player>,
        now: number,
        physicsSystem: PhysicsSystem
    ): CombatResult {
        const result: CombatResult = { events: [], died: [] };

        players.forEach((attacker: Player, attackerSid: string) => {
            if (attacker.isDead || attacker.isKnockedDown || !attacker.combatTargetId) return;

            const target = players.get(attacker.combatTargetId);
            if (!target || target.isDead) {
                this.stopAttacking(attacker);
                return;
            }

            const dx = target.x - attacker.x;
            const dy = target.y - attacker.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > attacker.attackRange) return;

            const cooldown = 1000 / attacker.attackSpeed;
            if (now - attacker.lastAttackTime < cooldown) return;

            this.applyHit(
                attacker,
                attackerSid,
                target,
                attacker.combatTargetId,
                now,
                physicsSystem,
                result
            );
        });

        return result;
    }

    applyDirectAttack(options: DirectAttackOptions): CombatResult {
        const result: CombatResult = { events: [], died: [] };
        this.applyResolvedHit(options, result);
        return result;
    }

    clearTargetForAll(leavingSid: string, players: MapSchema<Player>): void {
        players.forEach((player: Player) => {
            if (player.combatTargetId === leavingSid) {
                this.stopAttacking(player);
            }
        });
    }

    processRespawns(players: MapSchema<Player>, now: number): string[] {
        const respawned: string[] = [];

        players.forEach((player: Player, sessionId: string) => {
            if (!player.isDead || player.respawnAt <= 0 || now < player.respawnAt) return;

            player.isDead = false;
            player.hp = player.maxHp;
            player.x = player.spawnX;
            player.y = player.spawnY;
            player.targetX = player.spawnX;
            player.targetY = player.spawnY;
            player.groundZ = TerrainSystem.getGroundHeight(player.spawnX, player.spawnY);
            player.z = player.canFly
                ? player.groundZ + GameConfig.FLYING_HOVER_HEIGHT
                : player.groundZ;
            player.isGrounded = !player.canFly;
            player.isFlying = player.canFly;
            player.isKnockedDown = false;
            player.combatTargetId = "";
            player.respawnAt = 0;
            player.vz = 0;
            player.pendingKnockdown = false;
            player.knockdownUntil = 0;
            respawned.push(sessionId);
        });

        return respawned;
    }

    syncChasingTarget(attacker: Player, target: Player): void {
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq < 0.0001) {
            attacker.targetX = attacker.x;
            attacker.targetY = attacker.y;
            return;
        }

        const distance = Math.sqrt(distanceSq);
        const stopDistance = Math.max(0, attacker.attackRange - CombatSystem.CHASE_BUFFER);

        if (distance <= stopDistance) {
            attacker.targetX = attacker.x;
            attacker.targetY = attacker.y;
            return;
        }

        const nx = dx / distance;
        const ny = dy / distance;
        attacker.targetX = target.x - nx * stopDistance;
        attacker.targetY = target.y - ny * stopDistance;
    }

    private applyHit(
        attacker: Player,
        attackerSid: string,
        target: Player,
        targetSid: string,
        now: number,
        physicsSystem: PhysicsSystem,
        result: CombatResult
    ): void {
        attacker.lastAttackTime = now;

        const comboStage = this.advanceCombo(attacker, targetSid, now);
        const airborneTarget = target.z > target.groundZ + 0.25;

        let damage = attacker.attackDamage;
        let effect: CombatEvent["effect"] = "hit";
        let knockupImpulse: number | undefined;
        let slamSpeed: number | undefined;

        if (airborneTarget) {
            damage += GameConfig.AIR_COMBO_BONUS_DAMAGE;
            effect = "air-hit";
        }

        if (comboStage === 2 && target.isGrounded && !target.isKnockedDown) {
            effect = "knockup";
            knockupImpulse = GameConfig.COMBO_KNOCKUP_SPEED;
        } else if (comboStage === 3 && airborneTarget) {
            effect = "knockdown";
            slamSpeed = GameConfig.COMBO_SLAM_SPEED;
        } else if (attacker.isMob && attacker.mobKind === "slime" && target.isGrounded) {
            effect = "knockup";
            knockupImpulse = GameConfig.SLIME_JUMP_SPEED;
        } else if (attacker.isMob && attacker.mobKind === "bat" && airborneTarget) {
            effect = "knockdown";
            slamSpeed = GameConfig.COMBO_SLAM_SPEED;
        }

        this.applyResolvedHit({
            attacker,
            attackerSid,
            target,
            targetSid,
            now,
            damage,
            effect,
            physicsSystem,
            knockupImpulse,
            slamSpeed,
        }, result);
    }

    private advanceCombo(attacker: Player, targetSid: string, now: number): number {
        if (
            attacker.comboTargetId !== targetSid ||
            now - attacker.lastComboAt > GameConfig.COMBO_RESET_MS
        ) {
            attacker.comboStage = 0;
        }

        attacker.comboTargetId = targetSid;
        attacker.lastComboAt = now;
        attacker.comboStage = (attacker.comboStage % 3) + 1;
        return attacker.comboStage;
    }

    private stopAttacking(player: Player): void {
        player.combatTargetId = "";
        player.targetX = player.x;
        player.targetY = player.y;
        player.comboStage = 0;
        player.comboTargetId = "";
    }

    private applyResolvedHit(
        {
            attacker,
            attackerSid,
            target,
            targetSid,
            now,
            damage,
            effect,
            physicsSystem,
            knockupImpulse,
            slamSpeed,
            resetCombo,
        }: DirectAttackOptions,
        result: CombatResult
    ): void {
        attacker.lastAttackTime = now;

        if (resetCombo) {
            attacker.comboStage = 0;
            attacker.comboTargetId = "";
            attacker.lastComboAt = 0;
        }

        if (typeof knockupImpulse === "number") {
            physicsSystem.applyKnockup(target, knockupImpulse);
        } else if (typeof slamSpeed === "number") {
            physicsSystem.applySlam(target, slamSpeed);
        }

        target.hp = Math.max(0, target.hp - damage);

        result.events.push({
            attacker: attackerSid,
            target: targetSid,
            damage,
            targetHp: target.hp,
            effect,
        });

        if (target.hp > 0) return;

        target.isDead = true;
        target.hp = 0;
        target.targetX = target.x;
        target.targetY = target.y;
        target.combatTargetId = "";
        target.respawnAt = now + (
            target.isMob
                ? GameConfig.MOB_RESPAWN_DELAY_MS
                : GameConfig.RESPAWN_DELAY_MS
        );
        result.died.push({
            sessionId: targetSid,
            killerId: attackerSid,
            targetName: target.name,
            wasMob: target.isMob,
            mobKind: target.mobKind,
            expReward: target.expReward,
            goldReward: target.goldReward,
        });
    }
}
