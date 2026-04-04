import { GameConfig } from "../config/GameConfig";

export class TerrainSystem {
    static clampCoordinate(value: number): number {
        return Math.max(
            GameConfig.WORLD_MIN + 0.25,
            Math.min(GameConfig.WORLD_MAX - 0.25, value)
        );
    }

    static getGroundHeight(x: number, y: number): number {
        const rampEast = Math.max(0, (x - 4) * 0.12);
        const rampNorth = Math.max(0, (8 - y) * 0.10);

        const hillDx = x - 14;
        const hillDy = y - 6;
        const hillDistance = Math.sqrt(hillDx * hillDx + hillDy * hillDy);
        const hill = Math.max(0, 1.05 - hillDistance * 0.18);

        return Math.max(0, Math.min(2.4, rampEast + rampNorth + hill));
    }
}
