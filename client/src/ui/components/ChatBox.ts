import { appendChildren, createElement } from "../dom";
import type { ChatLogEntryData, HudCallbacks, HudChatChannel } from "../types";

const CHANNEL_LABELS: Record<HudChatChannel, string> = {
    say: "Say",
    party: "Party",
    whisper: "Whisper",
    system: "System",
};

export class ChatBox {
    private readonly root: HTMLDivElement;
    private readonly header: HTMLDivElement;
    private readonly channelSelect: HTMLSelectElement;
    private readonly contextLabel: HTMLDivElement;
    private readonly log: HTMLDivElement;
    private readonly input: HTMLInputElement;
    private readonly callbacks: HudCallbacks;
    private readonly entries: ChatLogEntryData[] = [];
    private activeChannel: HudChatChannel = "say";
    private whisperTargetName: string | null = null;
    private inputFocused = false;

    constructor(host: HTMLElement, callbacks: HudCallbacks = {}) {
        this.callbacks = callbacks;
        this.root = createElement("div", ["hud-card-shell", "hud-chatbox"]);
        this.header = createElement("div", "hud-chatbox__header");
        this.channelSelect = createElement("select", "hud-chatbox__channel");
        this.contextLabel = createElement("div", "hud-chatbox__context");
        this.log = createElement("div", "hud-chatbox__log");
        this.input = createElement("input", "hud-chatbox__input");

        this.input.type = "text";
        this.input.maxLength = 100;
        this.input.placeholder = "Type and press Enter...";
        this.input.autocomplete = "off";
        this.input.spellcheck = false;

        (Object.keys(CHANNEL_LABELS) as HudChatChannel[]).forEach((channel) => {
            const option = createElement("option");
            option.value = channel;
            option.textContent = CHANNEL_LABELS[channel];
            this.channelSelect.append(option);
        });

        this.channelSelect.addEventListener("change", () => {
            this.activeChannel = this.readChannel(this.channelSelect.value);
            if (this.activeChannel === "system") {
                this.blurInput();
            }
            this.render();
        });

        this.root.addEventListener("focusin", () => {
            this.setInputFocused(true);
        });
        this.root.addEventListener("focusout", (event) => {
            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof Node && this.root.contains(nextTarget)) return;
            this.setInputFocused(false);
        });
        this.input.addEventListener("keydown", (event) => {
            event.stopPropagation();

            if (event.key === "Enter") {
                event.preventDefault();
                this.submitCurrentMessage();
                return;
            }

            if (event.key === "Escape") {
                event.preventDefault();
                this.blurInput();
            }
        });

        const inputRow = createElement("div", "hud-chatbox__input-row");
        appendChildren(inputRow, this.input);
        appendChildren(this.header, this.channelSelect, this.contextLabel);
        appendChildren(this.root, this.header, this.log, inputRow);
        host.append(this.root);

        this.render();
    }

    public destroy() {
        this.blurInput();
        this.setInputFocused(false);
        this.root.remove();
    }

    public getRootElement(): HTMLDivElement {
        return this.root;
    }

    public getDragHandleElement(): HTMLDivElement {
        return this.header;
    }

    public isFocused(): boolean {
        return this.inputFocused;
    }

    public focusInput() {
        if (
            this.activeChannel === "system" ||
            (this.activeChannel === "whisper" && !this.whisperTargetName)
        ) {
            this.activeChannel = "say";
            this.channelSelect.value = "say";
            this.render();
        }

        if (this.input.disabled) return;
        this.input.focus();
        this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    }

    public blurInput() {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && this.root.contains(activeElement)) {
            activeElement.blur();
        }
    }

    public setWhisperTarget(name: string | null) {
        if (this.whisperTargetName === name) return;
        this.whisperTargetName = name;
        this.render();
    }

    public addEntry(entry: ChatLogEntryData) {
        const shouldStickToBottom = this.isNearBottom();
        this.entries.push(entry);
        while (this.entries.length > 120) {
            this.entries.shift();
        }

        if (entry.channel !== this.activeChannel) {
            if (shouldStickToBottom && this.activeChannel === "system" && entry.channel === "system") {
                this.scrollToBottom();
            }
            return;
        }

        this.renderEntries(shouldStickToBottom);
    }

    private render() {
        this.updateContext();
        this.updateInputState();
        this.renderEntries(true);
    }

    private renderEntries(scrollToBottom: boolean) {
        const filteredEntries = this.entries.filter((entry) => entry.channel === this.activeChannel);
        this.log.replaceChildren();

        if (filteredEntries.length === 0) {
            this.log.append(
                createElement("div", "hud-chatbox__empty", this.getEmptyMessage())
            );
            if (scrollToBottom) this.scrollToBottom();
            return;
        }

        filteredEntries.forEach((entry) => {
            const item = createElement("div", [
                "hud-chatbox__entry",
                `hud-chatbox__entry--${entry.tone}`,
                `hud-chatbox__entry--${entry.channel}`,
            ]);
            const author = createElement("span", "hud-chatbox__author", `${entry.author}:`);
            const text = createElement("span", "hud-chatbox__text", entry.text);
            appendChildren(item, author, text);
            this.log.append(item);
        });

        if (scrollToBottom) this.scrollToBottom();
    }

    private updateContext() {
        switch (this.activeChannel) {
            case "party":
                this.contextLabel.textContent = "Party channel";
                break;
            case "whisper":
                this.contextLabel.textContent = this.whisperTargetName
                    ? `Target ${this.whisperTargetName}`
                    : "No whisper target";
                break;
            case "system":
                this.contextLabel.textContent = "Rewards, loot, quests, and notices";
                break;
            case "say":
            default:
                this.contextLabel.textContent = "Local range";
                break;
        }
    }

    private updateInputState() {
        const canType =
            this.activeChannel !== "system" &&
            !(this.activeChannel === "whisper" && !this.whisperTargetName);

        this.input.disabled = !canType;

        if (this.activeChannel === "system") {
            this.input.value = "";
            this.input.placeholder = "System log is read-only.";
            return;
        }

        if (this.activeChannel === "whisper" && !this.whisperTargetName) {
            this.input.value = "";
            this.input.placeholder = "Target a player first to whisper.";
            return;
        }

        this.input.placeholder = `Send ${CHANNEL_LABELS[this.activeChannel].toLowerCase()} message...`;
    }

    private submitCurrentMessage() {
        if (this.input.disabled) {
            this.blurInput();
            return;
        }

        const text = this.input.value.trim();
        if (!text) {
            this.blurInput();
            return;
        }

        if (this.activeChannel === "system") {
            this.blurInput();
            return;
        }

        this.callbacks.onSubmitChat?.(this.activeChannel, text);
        this.input.value = "";
        this.blurInput();
    }

    private setInputFocused(focused: boolean) {
        if (this.inputFocused === focused) return;
        this.inputFocused = focused;
        this.callbacks.onChatFocusChange?.(focused);
    }

    private getEmptyMessage(): string {
        switch (this.activeChannel) {
            case "party":
                return "No party chat yet.";
            case "whisper":
                return this.whisperTargetName
                    ? `No whispers with ${this.whisperTargetName} yet.`
                    : "Target a player to start whispering.";
            case "system":
                return "Rewards, loot, quest updates, and notices will collect here.";
            case "say":
            default:
                return "Local field chat will show up here.";
        }
    }

    private isNearBottom(): boolean {
        return this.log.scrollTop + this.log.clientHeight >= this.log.scrollHeight - 24;
    }

    private scrollToBottom() {
        this.log.scrollTop = this.log.scrollHeight;
    }

    private readChannel(rawValue: string): HudChatChannel {
        if (rawValue === "party" || rawValue === "whisper" || rawValue === "system") {
            return rawValue;
        }
        return "say";
    }
}
