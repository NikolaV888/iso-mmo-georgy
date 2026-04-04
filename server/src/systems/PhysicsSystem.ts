import { MapSchema } from "@colyseus/schema";
import { GameConfig } from "../config/GameConfig";
import { Player } from "../rooms/schema/GameState";
import { TerrainSystem } from "./TerrainSystem";

export class PhysicsSystem {
    update(players: MapSchema<Player>, deltaTime: number, now: number): void {
        const dt = deltaTime / 1000;

        players.forEach((player: Player) => {
            player.groundZ = TerrainSystem.getGroundHeight(player.x, player.y);

            if (player.isDead) {
                this.resetEntityState(player);
                return;
            }

            if (player.isKnockedDown && now >= player.knockdownUntil) {
                player.isKnockedDown = false;
            }

            const shouldHover = player.canFly && !player.isKnockedDown;
            player.isFlying = shouldHover;

            if (shouldHover) {
                const bob = Math.sin((now + player.hoverPhaseOffset) / 220) * 0.15;
                player.z = player.groundZ + GameConfig.FLYING_HOVER_HEIGHT + bob;
                player.vz = 0;
                player.isGrounded = false;
                player.pendingKnockdown = false;
                return;
            }

            if (player.isGrounded) {
                player.z = player.groundZ;
                player.vz = 0;
                return;
            }

            player.vz += GameConfig.GRAVITY * dt;
            player.z += player.vz * dt;

            if (player.z <= player.groundZ) {
                player.z = player.groundZ;
                player.vz = 0;
                player.isGrounded = true;

                if (player.pendingKnockdown) {
                    player.pendingKnockdown = false;
                    player.isKnockedDown = true;
                    player.knockdownUntil = now + GameConfig.KNOCKDOWN_DURATION_MS;
                }
            }
        });
    }

    jump(player: Player, impulse: number, now: number): boolean {
        if (player.isDead || player.canFly || player.isKnockedDown || !player.isGrounded) {
            return false;
        }

        if (now - player.lastJumpTime < GameConfig.PLAYER_JUMP_COOLDOWN_MS) {
            return false;
        }

        player.isGrounded = false;
        player.vz = impulse;
        player.lastJumpTime = now;
        return true;
    }

    applyKnockup(player: Player, impulse: number): void {
        player.isGrounded = false;
        player.isKnockedDown = false;
        player.pendingKnockdown = false;
        player.vz = Math.max(player.vz, impulse);
    }

    applySlam(player: Player, downwardSpeed: number): void {
        player.isGrounded = false;
        player.pendingKnockdown = true;
        player.vz = Math.min(player.vz, downwardSpeed);
    }

    resetEntityState(player: Player): void {
        player.groundZ = TerrainSystem.getGroundHeight(player.x, player.y);
        player.z = player.canFly
            ? player.groundZ + GameConfig.FLYING_HOVER_HEIGHT
            : player.groundZ;
        player.vz = 0;
        player.isGrounded = !player.canFly;
        player.isFlying = player.canFly;
        player.isKnockedDown = false;
        player.pendingKnockdown = false;
        player.knockdownUntil = 0;
    }
}
