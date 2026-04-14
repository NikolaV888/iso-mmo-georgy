import { appendChildren, createElement } from "../dom";

interface ChatInputOptions {
    onSubmit: (text: string) => void;
    onStateChange?: (open: boolean) => void;
}

export class ChatInputController {
    private root: HTMLDivElement;
    private input: HTMLInputElement;
    private options: ChatInputOptions;
    private open = false;

    constructor(options: ChatInputOptions) {
        document.getElementById("hud-chat")?.remove();

        this.options = options;
        this.root = createElement("div", ["hud-card-shell", "hud-chat"]);
        this.root.id = "hud-chat";

        const label = createElement("span", "hud-chat__label", "Say");
        this.input = createElement("input", "hud-chat__input");
        this.input.type = "text";
        this.input.maxLength = 100;
        this.input.placeholder = "Type and press Enter...";

        this.input.addEventListener("keydown", (event) => {
            event.stopPropagation();

            if (event.key === "Enter") {
                const text = this.input.value.trim();
                if (text) this.options.onSubmit(text);
                this.close();
                return;
            }

            if (event.key === "Escape") {
                this.close();
            }
        });

        appendChildren(this.root, label, this.input);
        document.body.append(this.root);
    }

    public destroy() {
        this.root.remove();
    }

    public isOpen(): boolean {
        return this.open;
    }

    public openChat() {
        if (this.open) return;
        this.open = true;
        this.root.classList.add("is-open");
        this.input.value = "";
        this.input.focus();
        this.options.onStateChange?.(true);
    }

    public close() {
        if (!this.open) return;
        this.open = false;
        this.root.classList.remove("is-open");
        this.input.blur();
        this.options.onStateChange?.(false);
    }
}
