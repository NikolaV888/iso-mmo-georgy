import { createElement } from "../dom";
import type { HudToastKind } from "../types";

export class ToastFeed {
    private root: HTMLDivElement;
    private timers = new Set<number>();

    constructor(host: HTMLElement) {
        this.root = createElement("div", "hud-toast-feed");
        host.append(this.root);
    }

    public destroy() {
        this.timers.forEach((timer) => window.clearTimeout(timer));
        this.timers.clear();
        this.root.remove();
    }

    public push(message: string, kind: HudToastKind = "info") {
        if (!message.trim()) return;

        while (this.root.children.length >= 4) {
            this.root.firstElementChild?.remove();
        }

        const toast = createElement("div", ["hud-toast", `hud-toast--${kind}`]);
        const text = createElement("div", "hud-toast__text", message);
        toast.append(text);
        this.root.append(toast);

        const fadeTimer = window.setTimeout(() => {
            toast.classList.add("is-leaving");
            this.timers.delete(fadeTimer);
        }, 2800);

        const removeTimer = window.setTimeout(() => {
            toast.remove();
            this.timers.delete(removeTimer);
        }, 3200);

        this.timers.add(fadeTimer);
        this.timers.add(removeTimer);
    }

    public getRootElement(): HTMLDivElement {
        return this.root;
    }
}
