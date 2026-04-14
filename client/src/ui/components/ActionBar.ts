import { appendChildren, createElement } from "../dom";
import type { HudWindowId } from "../types";

interface ActionBarItem {
    id: HudWindowId;
    label: string;
    hotkey: string;
}

const ACTIONS: ActionBarItem[] = [
    { id: "stats", label: "Stats", hotkey: "C" },
    { id: "pack", label: "Pack", hotkey: "I" },
    { id: "quests", label: "Quests", hotkey: "L" },
    { id: "party", label: "Party", hotkey: "P" },
    { id: "skills", label: "Skills", hotkey: "K" },
];

export class ActionBar {
    private root: HTMLDivElement;
    private buttons = new Map<HudWindowId, HTMLButtonElement>();

    constructor(host: HTMLElement, onSelect: (windowId: HudWindowId) => void) {
        this.root = createElement("div", ["hud-card-shell", "hud-action-bar"]);

        ACTIONS.forEach((item) => {
            const button = createElement("button", "hud-action-button");
            button.type = "button";

            const key = createElement("span", "hud-action-button__key", item.hotkey);
            const label = createElement("span", "hud-action-button__label", item.label);
            appendChildren(button, key, label);
            button.addEventListener("click", () => onSelect(item.id));

            this.buttons.set(item.id, button);
            this.root.append(button);
        });

        host.append(this.root);
    }

    public setWindowState(windowId: HudWindowId, open: boolean) {
        const button = this.buttons.get(windowId);
        if (!button) return;
        button.classList.toggle("is-active", open);
    }
}
