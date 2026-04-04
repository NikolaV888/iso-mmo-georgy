import { MapSchema } from "@colyseus/schema";
import { Player } from "../rooms/schema/GameState";
import { TerrainSystem } from "./TerrainSystem";

/**
 * MovementSystem moves all living entities toward their target each tick.
 * Horizontal movement is shared by players and mobs; vertical motion lives in
 * PhysicsSystem so slopes, jumps, hover, and knockups can stack on top.
 */
export class MovementSystem {
    update(players: MapSchema<Player>, deltaTime: number): boolean {
        let anyMoved = false;

        players.forEach((player: Player) => {
            if (player.isDead || player.isKnockedDown) return;

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
}
