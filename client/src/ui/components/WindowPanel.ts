import { appendChildren, createButton, createElement } from "../dom";

interface WindowPanelOptions {
    title: string;
    panelClass: string;
    initiallyOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export class WindowPanel {
    readonly root: HTMLDivElement;
    readonly body: HTMLDivElement;
    private readonly titleLabel: HTMLDivElement;
    private open = false;
    private readonly onOpenChange?: (open: boolean) => void;

    constructor(host: HTMLElement, options: WindowPanelOptions) {
        this.root = createElement("div", ["hud-card-shell", "hud-panel", options.panelClass]);
        this.onOpenChange = options.onOpenChange;

        const header = createElement("div", "hud-panel__header");
        this.titleLabel = createElement("div", "hud-panel__title", options.title);
        const closeButton = createButton("x", ["hud-button", "hud-button--icon"]);
        closeButton.setAttribute("aria-label", `Close ${options.title}`);
        closeButton.addEventListener("click", () => {
            this.setOpen(false);
        });

        this.body = createElement("div", "hud-panel__body");

        appendChildren(header, this.titleLabel, closeButton);
        appendChildren(this.root, header, this.body);

        host.append(this.root);
        this.setOpen(options.initiallyOpen ?? false);
    }

    public isOpen(): boolean {
        return this.open;
    }

    public toggle(): boolean {
        return this.setOpen(!this.open);
    }

    public setTitle(title: string) {
        this.titleLabel.textContent = title;
    }

    public setOpen(open: boolean): boolean {
        const changed = this.open !== open;
        this.open = open;
        this.root.classList.toggle("is-open", open);
        if (changed) {
            this.onOpenChange?.(open);
        }
        return this.open;
    }
}
