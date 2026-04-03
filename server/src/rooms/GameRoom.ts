import { Room, Client } from "colyseus";
import { GameState, Player } from "./schema/GameState";

export class GameRoom extends Room<GameState> {
    maxClients = 100;

    onCreate(_options: any) {
        this.setState(new GameState());

        this.onMessage("move", (client: Client, data: { x: number; y: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.targetX = data.x;
                player.targetY = data.y;
            }
        });

        this.setSimulationInterval((deltaTime: number) => {
            this.update(deltaTime);
        }, 1000 / 60);
    }

    onJoin(client: Client, _options: any) {
        console.log(client.sessionId, "joined!");
        const player = new Player();
        player.x = 10;
        player.y = 10;
        player.targetX = 10;
        player.targetY = 10;
        this.state.players.set(client.sessionId, player);

        // Tell the joining client their own sessionId
        client.send("init", { sessionId: client.sessionId });
    }

    onLeave(client: Client, _consented: boolean) {
        console.log(client.sessionId, "left!");
        this.state.players.delete(client.sessionId);
        // Tell all remaining clients this player left
        this.broadcast("playerLeft", { sessionId: client.sessionId });
    }

    onDispose() {
        console.log("room", this.roomId, "disposing...");
    }

    update(deltaTime: number) {
        const speed = 4; // tiles per second
        const movementStep = (speed * deltaTime) / 1000;
        let anyMoved = false;

        this.state.players.forEach((player: Player, sessionId: string) => {
            const dx = player.targetX - player.x;
            const dy = player.targetY - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0.01) {
                if (distance > movementStep) {
                    player.x += (dx / distance) * movementStep;
                    player.y += (dy / distance) * movementStep;
                } else {
                    player.x = player.targetX;
                    player.y = player.targetY;
                }
                anyMoved = true;
            }
        });

        // Broadcast all player positions every tick
        if (anyMoved || true) {
            const snapshot: Record<string, { x: number; y: number }> = {};
            this.state.players.forEach((player: Player, sessionId: string) => {
                snapshot[sessionId] = { x: player.x, y: player.y };
            });
            this.broadcast("snapshot", snapshot);
        }
    }
}
