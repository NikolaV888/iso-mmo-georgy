import { appendChildren, createElement } from "../dom";
import type { HotbarActionId, HotbarEntryData } from "../types";

export class Hotbar {
    private root: HTMLDivElement;
    private buttons = new Map<HotbarActionId, HTMLButtonElement>();
    private order: HotbarActionId[] = [];

    constructor(host: HTMLElement, onActivate: (actionId: HotbarActionId) => void) {
        this.root = createElement("div", ["hud-card-shell", "hud-hotbar"]);
        host.append(this.root);
        this.onActivate = onActivate;
    }

    private onActivate: (actionId: HotbarActionId) => void;

    public updateEntries(entries: HotbarEntryData[]) {
        this.root.replaceChildren();
        this.buttons.clear();
        this.order = entries.map((entry) => entry.id);

        entries.forEach((entry) => {
            const button = createElement("button", [
                "hud-hotbar-slot",
                entry.ready ? "is-ready" : "is-disabled",
            ]);
            button.type = "button";

            const top = createElement("div", "hud-hotbar-slot__top");
            const key = createElement("span", "hud-hotbar-slot__key", entry.hotkey);
            const status = createElement(
                "span",
                [
                    "hud-hotbar-slot__status",
                    entry.category === "combat" ? "is-combat" : "is-utility",
                ],
                entry.status
            );
            top.append(key, status);

            const title = createElement("div", "hud-hotbar-slot__title", entry.shortLabel);
            const label = createElement("div", "hud-hotbar-slot__label", entry.label);

            appendChildren(button, top, title, label);
            button.addEventListener("click", () => this.onActivate(entry.id));

            this.buttons.set(entry.id, button);
            this.root.append(button);
        });
    }

    public triggerByKey(key: string): HotbarActionId | null {
        const index = Number.parseInt(key, 10) - 1;
        if (!Number.isFinite(index) || index < 0 || index >= this.order.length) return null;

        const actionId = this.order[index];
        this.flash(actionId);
        this.onActivate(actionId);
        return actionId;
    }

    public flash(actionId: HotbarActionId) {
        const button = this.buttons.get(actionId);
        if (!button) return;

        button.classList.remove("is-fired");
        void button.offsetWidth;
        button.classList.add("is-fired");
        window.setTimeout(() => {
            button.classList.remove("is-fired");
        }, 220);
    }
}
