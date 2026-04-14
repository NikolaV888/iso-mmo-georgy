import { createElement } from "../dom";
import type { QuestEntryData } from "../types";
import { WindowPanel } from "./WindowPanel";

export class QuestPanel {
    private shell: WindowPanel;
    private list: HTMLDivElement;

    constructor(host: HTMLElement) {
        this.shell = new WindowPanel(host, {
            title: "QUESTS",
            panelClass: "hud-panel--quests",
        });

        this.list = createElement("div", "hud-card-list");
        this.shell.body.append(
            createElement(
                "div",
                "hud-panel-copy",
                "Tracked goals tied to the current prototype loop so we can feel progression even before persistence lands."
            ),
            this.list
        );
    }

    public isOpen(): boolean {
        return this.shell.isOpen();
    }

    public toggle(): boolean {
        return this.shell.toggle();
    }

    public setOpen(open: boolean): boolean {
        return this.shell.setOpen(open);
    }

    public updateEntries(entries: QuestEntryData[]) {
        this.list.replaceChildren();

        if (entries.length === 0) {
            this.list.append(
                createElement(
                    "div",
                    "hud-empty",
                    "No live quests yet. Talk to an NPC in the field to pick one up."
                )
            );
            return;
        }

        entries.forEach((entry) => {
            const card = createElement("div", "hud-card-list__item");
            const header = createElement("div", "hud-card-list__header");
            const title = createElement("div", "hud-card-list__title", entry.title);
            const badge = createElement("span", ["hud-chip", "hud-chip--accent"], entry.status);
            const summary = createElement("div", "hud-card-list__body", entry.summary);
            const objectives = createElement("div", "hud-objective-list");
            const reward = createElement("div", "hud-card-list__meta", `Reward: ${entry.rewardText}`);

            entry.objectives.forEach((objective) => {
                const classes = ["hud-objective"];
                if (objective.complete) classes.push("is-complete");

                const item = createElement("div", classes);
                item.textContent = `${objective.complete ? "[x]" : "[ ]"} ${objective.label}`;
                objectives.append(item);
            });

            header.append(title, badge);
            card.append(header, summary, objectives, reward);
            this.list.append(card);
        });
    }
}
