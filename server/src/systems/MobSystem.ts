import { MapSchema } from "@colyseus/schema";
import { GameConfig } from "../config/GameConfig";
import { Player } from "../rooms/schema/GameState";
import { PhysicsSystem } from "./PhysicsSystem";
import { TerrainSystem } from "./TerrainSystem";

export class MobSystem {
    update(players: MapSchema<Player>, now: number, physicsSystem: PhysicsSystem): void {
        players.forEach((mob: Player, mobId: string) => {
            if (!mob.isMob || mob.isDead) return;

            if (mob.isKnockedDown) {
                mob.combatTargetId = "";
                return;
            }

            const targetId = this.resolveCurrentTarget(players, mob, mobId);
            if (targetId) {
                mob.combatTargetId = targetId;

                if (
                    mob.mobKind === "slime" &&
                    now - mob.lastAiActionAt >= GameConfig.SLIME_HOP_INTERVAL_MS
                ) {
                    if (physicsSystem.jump(mob, GameConfig.SLIME_JUMP_SPEED, now)) {
                        mob.lastAiActionAt = now;
                    }
                }

                return;
            }

            mob.combatTargetId = "";
            this.updateWander(mob, now);
        });
    }

    private resolveCurrentTarget(
        players: MapSchema<Player>,
        mob: Player,
        mobId: string
    ): string | null {
        if (mob.combatTargetId) {
            const existing = players.get(mob.combatTargetId);
            if (
                existing &&
                !existing.isDead &&
                !existing.isMob &&
                !existing.isNpc &&
                this.distance(mob, existing) <= GameConfig.MOB_LEASH_RANGE &&
                this.distanceToSpawn(mob) <= GameConfig.MOB_LEASH_RANGE + 1
            ) {
                return mob.combatTargetId;
            }
        }

        let nearestId: string | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        players.forEach((candidate: Player, candidateId: string) => {
            if (candidateId === mobId || candidate.isDead || candidate.isMob || candidate.isNpc) return;

            const distance = this.distance(mob, candidate);
            if (distance <= GameConfig.MOB_AGGRO_RANGE && distance < nearestDistance) {
                nearestDistance = distance;
                nearestId = candidateId;
            }
        });

        return nearestId;
    }

    private updateWander(mob: Player, now: number): void {
        const distanceToTarget = Math.hypot(mob.targetX - mob.x, mob.targetY - mob.y);
        if (distanceToTarget > 0.35 && now < mob.nextAiThinkAt) return;

        mob.nextAiThinkAt = now + GameConfig.MOB_WANDER_INTERVAL_MS;

        const angle = (mob.aiSeed + now / 1000) % (Math.PI * 2);
        const radius = mob.mobKind === "bat"
            ? GameConfig.MOB_WANDER_RADIUS * 1.2
            : GameConfig.MOB_WANDER_RADIUS * 0.8;

        mob.targetX = TerrainSystem.clampCoordinate(mob.spawnX + Math.cos(angle) * radius);
        mob.targetY = TerrainSystem.clampCoordinate(mob.spawnY + Math.sin(angle) * radius);
    }

    private distance(a: Player, b: Player): number {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private distanceToSpawn(mob: Player): number {
        const dx = mob.x - mob.spawnX;
        const dy = mob.y - mob.spawnY;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
