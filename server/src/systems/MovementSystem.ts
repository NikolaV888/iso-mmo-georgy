import { MapSchema } from "@colyseus/schema";
import { Player } from "../rooms/schema/GameState";
import { GameConfig } from "../config/GameConfig";

/**
 * MovementSystem — moves all living players toward their target each tick.
 * Speed is normalized by actual cartesian distance so it's identical
 * regardless of direction (diagonal, cardinal, or anything in between).
 */
export class MovementSystem {
    update(players: MapSchema<Player>, deltaTime: number): boolean {
        const movementStep = (GameConfig.PLAYER_SPEED * deltaTime) / 1000;
        let anyMoved = false;

        players.forEach((player: Player) => {
            // Dead players don't move
            if (player.isDead) return;

            const dx = player.targetX - player.x;
            const dy = player.targetY - player.y;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq < 0.0001) return; // already at target

            const distance = Math.sqrt(distanceSq);

            if (distance <= movementStep) {
                // Close enough — snap to target
                player.x = player.targetX;
                player.y = player.targetY;
            } else {
                // Normalize direction then scale by step
                // This ensures identical speed in all directions
                player.x += (dx / distance) * movementStep;
                player.y += (dy / distance) * movementStep;
            }

            anyMoved = true;
        });

        return anyMoved;
    }
}
