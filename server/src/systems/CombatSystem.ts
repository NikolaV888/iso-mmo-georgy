import { MapSchema } from "@colyseus/schema";
import { Player } from "../rooms/schema/GameState";
import { GameConfig } from "../config/GameConfig";

// ── Result types ──────────────────────────────────────────────────────────────

export interface CombatEvent {
    attacker: string;
    target: string;
    damage: number;
    targetHp: number;
}

export interface CombatResult {
    events: CombatEvent[];
    died: string[];         // sessionIds that died this tick
    respawned: string[];    // sessionIds that respawned this tick
}

// ── System ────────────────────────────────────────────────────────────────────

/**
 * CombatSystem — server-authoritative auto-attack, death, and respawn.
 *
 * Auto-attack lifecycle:
 *  1. Client sends `setTarget { targetId }` → GameRoom sets player.combatTargetId
 *  2. Each tick, `processAutoAttacks` checks every player's combatTargetId:
 *       - Skips if attacker dead, no target, or target doesn't exist / is dead
 *       - Skips if out of range (target stays locked; attacks resume when in range)
 *       - Fires attack if cooldown elapsed (1000ms / attackSpeed)
 *  3. On target death → combatTargetId cleared for ALL players targeting it
 *  4. On target disconnect → GameRoom clears combatTargetId via clearTargetForAll()
 *
 * Future extension points:
 *  - StatsSystem: write computed stats (from gear/buffs) onto Player before this runs
 *  - Critical hits: add critChance / critMultiplier to Player stats
 *  - Elemental damage: add damageType to CombatEvent
 *  - AoE: loop multiple targets per event
 *  - Skills: call applyHit() directly with custom damage / effect params
 */
export class CombatSystem {
    private static readonly CHASE_BUFFER = 0.1;

    /**
     * Keep attackers walking toward their locked target until they are close
     * enough to start swinging.
     */
    syncChasingTargets(players: MapSchema<Player>): void {
        players.forEach((attacker: Player) => {
            if (attacker.isDead || !attacker.combatTargetId) return;

            const target = players.get(attacker.combatTargetId);
            if (!target || target.isDead) {
                this.stopAttacking(attacker);
                return;
            }

            this.syncChasingTarget(attacker, target);
        });
    }

    /**
     * Run auto-attacks for every player that has a combatTargetId set.
     * Called each physics tick from GameRoom.
     */
    processAutoAttacks(players: MapSchema<Player>, now: number): CombatResult {
        const result: CombatResult = { events: [], died: [], respawned: [] };

        players.forEach((attacker: Player, attackerSid: string) => {
            if (attacker.isDead)            return;
            if (!attacker.combatTargetId)   return;

            const target = players.get(attacker.combatTargetId);

            // Target gone or dead → unlock
            if (!target || target.isDead) {
                this.stopAttacking(attacker);
                return;
            }

            // Range check — out of range: keep target locked, just don't fire yet
            const dx = target.x - attacker.x;
            const dy = target.y - attacker.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > attacker.attackRange) return;

            // Cooldown check: 1000ms / attackSpeed
            const cooldown = 1000 / attacker.attackSpeed;
            if (now - attacker.lastAttackTime < cooldown) return;

            // ── Fire ──────────────────────────────────────────────────────
            this.applyHit(attacker, attackerSid, target, attacker.combatTargetId, now, result);
        });

        return result;
    }

    /**
     * Clear a player's combat target for every player that is targeting them.
     * Call this when a player leaves the room so no one is locked onto a ghost.
     */
    clearTargetForAll(leavingSid: string, players: MapSchema<Player>): void {
        players.forEach((player: Player) => {
            if (player.combatTargetId === leavingSid) {
                this.stopAttacking(player);
            }
        });
    }

    /**
     * Check all dead players and respawn those whose timer has elapsed.
     */
    processRespawns(players: MapSchema<Player>, now: number): string[] {
        const respawned: string[] = [];
        players.forEach((player: Player, sessionId: string) => {
            if (player.isDead && player.respawnAt > 0 && now >= player.respawnAt) {
                player.isDead          = false;
                player.hp              = player.maxHp;
                player.x               = GameConfig.SPAWN_X;
                player.y               = GameConfig.SPAWN_Y;
                player.targetX         = GameConfig.SPAWN_X;
                player.targetY         = GameConfig.SPAWN_Y;
                player.combatTargetId  = "";
                player.respawnAt       = 0;
                respawned.push(sessionId);
            }
        });
        return respawned;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Core hit application — extracted so Skills can call it too later.
     * Stamps lastAttackTime, reduces HP, triggers death if needed.
     */
    private applyHit(
        attacker: Player,
        attackerSid: string,
        target: Player,
        targetSid: string,
        now: number,
        result: CombatResult
    ): void {
        attacker.lastAttackTime = now;

        const damage = attacker.attackDamage;
        target.hp = Math.max(0, target.hp - damage);

        result.events.push({
            attacker: attackerSid,
            target: targetSid,
            damage,
            targetHp: target.hp,
        });

        if (target.hp <= 0) {
            target.isDead = true;
            target.hp = 0;
            target.targetX = target.x;
            target.targetY = target.y;
            target.respawnAt = now + GameConfig.RESPAWN_DELAY_MS;
            result.died.push(targetSid);
        }
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

    private stopAttacking(player: Player): void {
        player.combatTargetId = "";
        player.targetX = player.x;
        player.targetY = player.y;
    }
}
