import { appendChildren, createElement } from "../dom";
import type { InventoryItem } from "../types";

interface TooltipOptions {
    slotLabel?: string;
    actionHint?: string;
}

export class ItemTooltip {
    private readonly root: HTMLDivElement;
    private readonly title: HTMLDivElement;
    private readonly meta: HTMLDivElement;
    private readonly body: HTMLDivElement;
    private readonly hint: HTMLDivElement;

    constructor(host: HTMLElement) {
        this.root = createElement("div", ["hud-card-shell", "hud-item-tooltip"]);
        this.title = createElement("div", "hud-item-tooltip__title");
        this.meta = createElement("div", "hud-item-tooltip__meta");
        this.body = createElement("div", "hud-item-tooltip__body");
        this.hint = createElement("div", "hud-item-tooltip__hint");

        appendChildren(this.root, this.title, this.meta, this.body, this.hint);
        host.append(this.root);
    }

    public show(item: InventoryItem, pointerX: number, pointerY: number, options: TooltipOptions = {}) {
        const metaParts: string[] = [];
        if (options.slotLabel) metaParts.push(options.slotLabel);
        metaParts.push(item.kind);
        if (item.rarity) metaParts.push(item.rarity);
        if (item.statLine) metaParts.push(item.statLine);
        if (item.count > 1) metaParts.push(`Stack ${item.count}`);

        this.title.textContent = item.name;
        this.meta.textContent = metaParts.join(" | ");
        this.body.textContent = item.description;
        this.hint.textContent = options.actionHint ?? "";
        this.hint.classList.toggle("is-hidden", !options.actionHint);
        this.root.classList.add("is-visible");
        this.move(pointerX, pointerY);
    }

    public move(pointerX: number, pointerY: number) {
        if (!this.root.classList.contains("is-visible")) return;

        const offset = 18;
        const rect = this.root.getBoundingClientRect();
        const width = rect.width || this.root.offsetWidth;
        const height = rect.height || this.root.offsetHeight;
        const maxLeft = Math.max(12, window.innerWidth - width - 12);
        const maxTop = Math.max(12, window.innerHeight - height - 12);

        const left = Math.min(maxLeft, Math.max(12, pointerX + offset));
        const top = Math.min(maxTop, Math.max(12, pointerY + offset));

        this.root.style.left = `${Math.round(left)}px`;
        this.root.style.top = `${Math.round(top)}px`;
    }

    public hide() {
        this.root.classList.remove("is-visible");
    }
}
