import { appendChildren, createButton, createElement } from "../dom";
import type { PlayerContextTargetData } from "../types";

type PlayerMenuAction = "invite" | "whisper" | "duel";

export class PlayerContextMenu {
    private readonly root: HTMLDivElement;
    private readonly title: HTMLDivElement;
    private readonly meta: HTMLDivElement;
    private currentTarget: PlayerContextTargetData | null = null;
    private readonly onAction: (action: PlayerMenuAction, target: PlayerContextTargetData) => void;

    constructor(
        host: HTMLElement,
        onAction: (action: PlayerMenuAction, target: PlayerContextTargetData) => void
    ) {
        this.onAction = onAction;
        this.root = createElement("div", ["hud-card-shell", "hud-player-menu", "is-hidden"]);
        this.title = createElement("div", "hud-player-menu__title", "Player");
        this.meta = createElement("div", "hud-player-menu__meta", "Lv. 1");

        const inviteButton = this.createActionButton("Invite Party", "invite");
        const whisperButton = this.createActionButton("Whisper", "whisper");
        const duelButton = this.createActionButton("Duel", "duel");
        appendChildren(this.root, this.title, this.meta, inviteButton, whisperButton, duelButton);
        host.append(this.root);

        document.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
        document.addEventListener("keydown", this.handleDocumentKeyDown, true);
    }

    public destroy() {
        document.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
        document.removeEventListener("keydown", this.handleDocumentKeyDown, true);
        this.root.remove();
    }

    public isOpen(): boolean {
        return !this.root.classList.contains("is-hidden");
    }

    public show(target: PlayerContextTargetData, x: number, y: number) {
        this.currentTarget = target;
        this.title.textContent = target.name;
        this.meta.textContent = `Lv. ${target.level}`;
        this.root.classList.remove("is-hidden");

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const rect = this.root.getBoundingClientRect();
        const clampedX = Math.min(Math.max(12, x), Math.max(12, viewportWidth - rect.width - 12));
        const clampedY = Math.min(Math.max(12, y), Math.max(12, viewportHeight - rect.height - 12));

        this.root.style.left = `${clampedX}px`;
        this.root.style.top = `${clampedY}px`;
    }

    public hide() {
        this.currentTarget = null;
        this.root.classList.add("is-hidden");
    }

    private createActionButton(label: string, action: PlayerMenuAction): HTMLButtonElement {
        const button = createButton(label, ["hud-button", "hud-player-menu__action"]);
        button.addEventListener("click", () => {
            if (!this.currentTarget) return;
            this.onAction(action, this.currentTarget);
            this.hide();
        });
        return button;
    }

    private readonly handleDocumentPointerDown = (event: PointerEvent) => {
        if (event.target instanceof Node && this.root.contains(event.target)) return;
        this.hide();
    };

    private readonly handleDocumentKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            this.hide();
        }
    };
}
