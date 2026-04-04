import { MapSchema } from "@colyseus/schema";
import { GameConfig } from "../config/GameConfig";
import { Player } from "../rooms/schema/GameState";
import { PhysicsSystem } from "./PhysicsSystem";
import { TerrainSystem } from "./TerrainSystem";

/**
 * MovementSystem moves all living entities toward their target each tick.
 * Horizontal movement is shared by players and mobs; vertical motion lives in
 * PhysicsSystem so slopes, jumps, hover, and knockups can stack on top.
 */
export class MovementSystem {
    update(
        players: MapSchema<Player>,
        deltaTime: number,
        physicsSystem: PhysicsSystem,
        now: number
    ): boolean {
        let anyMoved = false;

        players.forEach((player: Player) => {
            if (player.isDead || player.isKnockedDown) return;

            const inputLengthSq = player.inputX * player.inputX + player.inputY * player.inputY;
            if (inputLengthSq > 0.0001) {
                const inputLength = Math.sqrt(inputLengthSq);
                const step = (player.moveSpeed * deltaTime) / 1000;
                const moveX = (player.inputX / inputLength) * step;
                const moveY = (player.inputY / inputLength) * step;

                this.maybeAutoJump(player, player.inputX / inputLength, player.inputY / inputLength, physicsSystem, now);

                player.x = TerrainSystem.clampCoordinate(player.x + moveX);
                player.y = TerrainSystem.clampCoordinate(player.y + moveY);
                player.targetX = player.x;
                player.targetY = player.y;
                anyMoved = true;
                return;
            }

            const targetX = TerrainSystem.clampCoordinate(player.targetX);
            const targetY = TerrainSystem.clampCoordinate(player.targetY);
            player.targetX = targetX;
            player.targetY = targetY;

            const dx = targetX - player.x;
            const dy = targetY - player.y;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq < 0.0001) return;

            const distance = Math.sqrt(distanceSq);
            const movementStep = (player.moveSpeed * deltaTime) / 1000;
            this.maybeAutoJump(player, dx / distance, dy / distance, physicsSystem, now);

            if (distance <= movementStep) {
                player.x = targetX;
                player.y = targetY;
            } else {
                player.x += (dx / distance) * movementStep;
                player.y += (dy / distance) * movementStep;
            }

            player.x = TerrainSystem.clampCoordinate(player.x);
            player.y = TerrainSystem.clampCoordinate(player.y);
            anyMoved = true;
        });

        return anyMoved;
    }

    private maybeAutoJump(
        player: Player,
        directionX: number,
        directionY: number,
        physicsSystem: PhysicsSystem,
        now: number
    ) {
        if (player.canFly || !player.isGrounded || player.isDead || player.isKnockedDown) return;

        const scanX = TerrainSystem.clampCoordinate(
            player.x + directionX * GameConfig.AUTO_JUMP_SCAN_DISTANCE
        );
        const scanY = TerrainSystem.clampCoordinate(
            player.y + directionY * GameConfig.AUTO_JUMP_SCAN_DISTANCE
        );
        const currentGround = TerrainSystem.getGroundHeight(player.x, player.y);
        const nextGround = TerrainSystem.getGroundHeight(scanX, scanY);
        const ascent = nextGround - currentGround;

        if (
            ascent < GameConfig.AUTO_JUMP_MIN_ASCENT ||
            ascent > GameConfig.AUTO_JUMP_MAX_ASCENT
        ) {
            return;
        }

        physicsSystem.jump(player, GameConfig.PLAYER_JUMP_SPEED, now);
    }
}
