import { MapSchema } from "@colyseus/schema";
import { Player } from "../rooms/schema/GameState";
import { GameConfig } from "../config/GameConfig";

export interface CombatEvent {
    attacker: string;
    target: string;
    damage: number;
    targetHp: number;
}

export interface CombatResult {
    events: CombatEvent[];
    died: string[];         // sessionIds that just died this tick
    respawned: string[];    // sessionIds that respawned this tick
}

/**
 * CombatSystem — server-authoritative attack resolution, death, and respawn.
 *
 * Rules:
 *  - Attacker must be alive
 *  - Target must exist and be alive
 *  - Distance (cartesian) must be within PLAYER_ATTACK_RANGE
 *  - Cooldown of PLAYER_ATTACK_COOLDOWN_MS must have elapsed
 *  - On death: freeze position, schedule respawn after RESPAWN_DELAY_MS
 */
export class CombatSystem {
    /**
     * Process an attack request.
     * Returns a CombatResult describing what happened, or null if invalid.
     */
    processAttack(
        attackerSessionId: string,
        targetSessionId: string,
        players: MapSchema<Player>,
        now: number
    ): CombatResult | null {
        const attacker = players.get(attackerSessionId);
        const target   = players.get(targetSessionId);

        if (!attacker || !target)            return null;
        if (attacker.isDead || target.isDead) return null;
        if (attackerSessionId === targetSessionId) return null;

        // Cooldown check
        if (now - attacker.lastAttackTime < GameConfig.PLAYER_ATTACK_COOLDOWN_MS) return null;

        // Range check (cartesian distance)
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > GameConfig.PLAYER_ATTACK_RANGE) return null;

        // Apply attack
        attacker.lastAttackTime = now;
        const damage = GameConfig.PLAYER_ATTACK_DAMAGE;
        target.hp = Math.max(0, target.hp - damage);

        const result: CombatResult = {
            events: [{
                attacker: attackerSessionId,
                target: targetSessionId,
                damage,
                targetHp: target.hp,
            }],
            died: [],
            respawned: [],
        };

        // Death check
        if (target.hp <= 0) {
            target.isDead = true;
            target.hp = 0;
            // Freeze at current position
            target.targetX = target.x;
            target.targetY = target.y;
            // Schedule respawn
            target.respawnAt = now + GameConfig.RESPAWN_DELAY_MS;
            result.died.push(targetSessionId);
        }

        return result;
    }

    /**
     * Check all dead players and respawn those whose timer has elapsed.
     */
    processRespawns(players: MapSchema<Player>, now: number): string[] {
        const respawned: string[] = [];

        players.forEach((player: Player, sessionId: string) => {
            if (player.isDead && player.respawnAt > 0 && now >= player.respawnAt) {
                player.isDead = false;
                player.hp = player.maxHp;
                player.x = GameConfig.SPAWN_X;
                player.y = GameConfig.SPAWN_Y;
                player.targetX = GameConfig.SPAWN_X;
                player.targetY = GameConfig.SPAWN_Y;
                player.respawnAt = 0;
                respawned.push(sessionId);
            }
        });

        return respawned;
    }
}
