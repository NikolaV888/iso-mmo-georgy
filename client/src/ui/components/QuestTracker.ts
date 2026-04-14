import { createElement } from "../dom";
import type { QuestEntryData } from "../types";

export class QuestTracker {
    private root: HTMLDivElement;
    private list: HTMLDivElement;

    constructor(host: HTMLElement) {
        this.root = createElement("div", ["hud-card-shell", "hud-quest-tracker"]);
        const title = createElement("div", "hud-quest-tracker__title", "Tracked Quests");
        this.list = createElement("div", "hud-quest-tracker__list");
        this.root.append(title, this.list);
        host.append(this.root);
    }

    public updateEntries(entries: QuestEntryData[]) {
        this.list.replaceChildren();
        const trackedEntries = entries.filter((entry) => entry.phase === "active");

        if (trackedEntries.length === 0) {
            this.list.append(
                createElement("div", "hud-empty", "No tracked quests. Find an NPC to get started.")
            );
            return;
        }

        trackedEntries.slice(0, 2).forEach((entry) => {
            const card = createElement("div", "hud-quest-tracker__entry");
            const header = createElement("div", "hud-quest-tracker__entry-title", entry.title);
            const meta = createElement("div", "hud-quest-tracker__entry-meta", entry.status);
            const objectives = createElement("div", "hud-quest-tracker__objectives");

            entry.objectives.forEach((objective) => {
                const classes = ["hud-quest-tracker__objective"];
                if (objective.complete) classes.push("is-complete");
                const label = createElement("div", classes, `${objective.complete ? "[x]" : "[ ]"} ${objective.label}`);
                objectives.append(label);
            });

            card.append(header, meta, objectives);
            this.list.append(card);
        });
    }

    public getRootElement(): HTMLDivElement {
        return this.root;
    }
}
