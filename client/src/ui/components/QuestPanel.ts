import { createElement } from "../dom";
import type { QuestEntryData } from "../types";
import { WindowPanel } from "./WindowPanel";

type QuestTabId = "available" | "active" | "complete";

const TAB_LABELS: Array<{ id: QuestTabId; label: string }> = [
    { id: "available", label: "To Accept" },
    { id: "active", label: "Accepted" },
    { id: "complete", label: "Complete" },
];

export class QuestPanel {
    private shell: WindowPanel;
    private entries: QuestEntryData[] = [];
    private activeTab: QuestTabId = "active";
    private readonly tabButtons = new Map<QuestTabId, HTMLButtonElement>();
    private list: HTMLDivElement;

    constructor(host: HTMLElement) {
        this.shell = new WindowPanel(host, {
            title: "QUESTS",
            panelClass: "hud-panel--quests",
        });

        const tabs = createElement("div", "hud-tab-row");
        TAB_LABELS.forEach((tab) => {
            const button = createElement("button", "hud-button", tab.label);
            button.type = "button";
            button.addEventListener("click", () => {
                this.activeTab = tab.id;
                this.render();
            });
            this.tabButtons.set(tab.id, button);
            tabs.append(button);
        });

        this.list = createElement("div", "hud-card-list");
        this.shell.body.append(
            createElement(
                "div",
                "hud-panel-copy",
                "Tracked goals tied to the current prototype loop so we can feel progression even before persistence lands."
            ),
            tabs,
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

    public getRootElement(): HTMLDivElement {
        return this.shell.getRootElement();
    }

    public getDragHandleElement(): HTMLDivElement {
        return this.shell.getDragHandleElement();
    }

    public updateEntries(entries: QuestEntryData[]) {
        this.entries = entries.slice();
        this.ensureActiveTabHasContent();
        this.render();
    }

    private render() {
        this.renderTabs();
        this.list.replaceChildren();
        const visibleEntries = this.getEntriesForActiveTab();

        if (visibleEntries.length === 0) {
            this.list.append(
                createElement(
                    "div",
                    "hud-empty",
                    this.getEmptyMessage()
                )
            );
            return;
        }

        visibleEntries.forEach((entry) => {
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

    private renderTabs() {
        this.tabButtons.forEach((button, tabId) => {
            button.classList.toggle("is-active", tabId === this.activeTab);
        });
    }

    private getEntriesForActiveTab(): QuestEntryData[] {
        switch (this.activeTab) {
            case "available":
                return this.entries.filter((entry) => entry.phase === "available");
            case "complete":
                return this.entries.filter((entry) => entry.phase === "ready" || entry.phase === "completed");
            case "active":
            default:
                return this.entries.filter((entry) => entry.phase === "active");
        }
    }

    private ensureActiveTabHasContent() {
        if (this.getEntriesForActiveTab().length > 0) return;

        const nextTab = TAB_LABELS.find((tab) => {
            this.activeTab = tab.id;
            return this.getEntriesForActiveTab().length > 0;
        });

        this.activeTab = nextTab?.id ?? "active";
    }

    private getEmptyMessage(): string {
        switch (this.activeTab) {
            case "available":
                return "No available quests right now. Check back with a quest giver soon.";
            case "complete":
                return "No completed turn-ins waiting right now.";
            case "active":
            default:
                return "No quests are currently in progress.";
        }
    }
}
