import { createEmptyInventoryState, createEmptyPvpState } from "../data/prototypeData";
import { appendChildren, createButton, createElement } from "../dom";
import type {
    DuelStakeSelectionData,
    HudCallbacks,
    InventoryStateData,
    InventoryTab,
    PlayerContextTargetData,
    PvpStateData,
} from "../types";
import { WindowPanel } from "./WindowPanel";

interface WagerOption {
    label: string;
    tab: InventoryTab;
    index: number;
}

export class DuelPanel {
    private readonly shell: WindowPanel;
    private readonly callbacks: HudCallbacks;
    private readonly summary: HTMLDivElement;
    private readonly subcopy: HTMLDivElement;
    private readonly offeredStake: HTMLDivElement;
    private readonly goldInput: HTMLInputElement;
    private readonly itemSelect: HTMLSelectElement;
    private readonly primaryButton: HTMLButtonElement;
    private readonly secondaryButton: HTMLButtonElement;
    private inventoryState: InventoryStateData = createEmptyInventoryState();
    private pvpState: PvpStateData = createEmptyPvpState();
    private composeTarget: PlayerContextTargetData | null = null;
    private lastRenderKey = "";

    constructor(host: HTMLElement, callbacks: HudCallbacks = {}) {
        this.callbacks = callbacks;
        this.shell = new WindowPanel(host, {
            title: "DUEL",
            panelClass: "hud-panel--duel",
        });

        this.summary = createElement("div", "hud-panel-copy", "Challenge a party member to a clean duel.");
        this.subcopy = createElement("div", "hud-detail-card__meta");
        this.offeredStake = createElement("div", ["hud-detail-card", "hud-detail-card--duel"]);

        const wagerWrap = createElement("div", "hud-duel-panel__wager");
        const goldWrap = createElement("label", "hud-duel-panel__field");
        const goldLabel = createElement("span", "hud-stat-label", "Gold Wager");
        this.goldInput = createElement("input", "hud-chatbox__input");
        this.goldInput.type = "number";
        this.goldInput.min = "0";
        this.goldInput.step = "1";
        this.goldInput.value = "0";
        appendChildren(goldWrap, goldLabel, this.goldInput);

        const itemWrap = createElement("label", "hud-duel-panel__field");
        const itemLabel = createElement("span", "hud-stat-label", "Item Wager");
        this.itemSelect = createElement("select", "hud-chatbox__channel");
        appendChildren(itemWrap, itemLabel, this.itemSelect);

        appendChildren(wagerWrap, goldWrap, itemWrap);

        const actions = createElement("div", "hud-inline-actions");
        this.primaryButton = createButton("Send", ["hud-button", "hud-button--small"]);
        this.secondaryButton = createButton("Cancel", ["hud-button", "hud-button--small"]);
        this.primaryButton.addEventListener("click", () => this.handlePrimaryAction());
        this.secondaryButton.addEventListener("click", () => this.handleSecondaryAction());
        appendChildren(actions, this.primaryButton, this.secondaryButton);

        appendChildren(
            this.shell.body,
            this.summary,
            this.subcopy,
            this.offeredStake,
            wagerWrap,
            actions
        );

        this.render();
    }

    public isOpen(): boolean {
        return this.shell.isOpen();
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

    public updateInventoryState(state: InventoryStateData) {
        this.inventoryState = state;
        this.render();
    }

    public updatePvpState(state: PvpStateData) {
        this.pvpState = state;
        if (state.incomingChallenge || state.outgoingChallenge || state.activeDuel) {
            this.composeTarget = null;
        }
        this.render();
    }

    public openCompose(target: PlayerContextTargetData) {
        this.composeTarget = target;
        this.render();
        this.shell.setOpen(true);
    }

    private handlePrimaryAction() {
        const stake = this.readStakeSelection();

        if (this.pvpState.incomingChallenge) {
            this.callbacks.onAcceptDuelChallenge?.(this.pvpState.incomingChallenge.challengerId, stake);
            return;
        }

        if (this.composeTarget) {
            this.callbacks.onSendDuelChallenge?.(this.composeTarget.sessionId, stake);
            return;
        }

        if (this.pvpState.outgoingChallenge) {
            this.callbacks.onCancelDuelChallenge?.();
        }
    }

    private handleSecondaryAction() {
        if (this.pvpState.incomingChallenge) {
            this.callbacks.onDeclineDuelChallenge?.(this.pvpState.incomingChallenge.challengerId);
            return;
        }

        if (this.pvpState.outgoingChallenge) {
            this.callbacks.onCancelDuelChallenge?.();
            return;
        }

        this.composeTarget = null;
        this.shell.setOpen(false);
    }

    private render() {
        const modeKey = this.getRenderKey();
        if (this.lastRenderKey !== modeKey) {
            this.resetWagerInputs();
            this.lastRenderKey = modeKey;
        }

        this.renderItemOptions();

        if (this.pvpState.activeDuel) {
            this.shell.setTitle("DUEL ACTIVE");
            this.summary.textContent = `Facing ${this.pvpState.activeDuel.opponentName}.`;
            this.subcopy.textContent = "First to 1 HP loses. Duel damage is non-lethal.";
            this.offeredStake.textContent =
                `Your stake: ${this.formatStake(this.pvpState.activeDuel.yourStake)} | ` +
                `${this.pvpState.activeDuel.opponentName}'s stake: ${this.formatStake(this.pvpState.activeDuel.opponentStake)}`;
            this.goldInput.disabled = true;
            this.itemSelect.disabled = true;
            this.primaryButton.disabled = true;
            this.primaryButton.textContent = "In Duel";
            this.secondaryButton.textContent = "Close";
            this.shell.setOpen(true);
            return;
        }

        if (this.pvpState.incomingChallenge) {
            const challenge = this.pvpState.incomingChallenge;
            this.shell.setTitle("DUEL CHALLENGE");
            this.summary.textContent = `${challenge.challengerName} wants to duel.`;
            this.subcopy.textContent = "Optional wager: add your own gold or item before you accept.";
            this.offeredStake.textContent = `Offered stake: ${this.formatStake(challenge.offeredStake)}`;
            this.goldInput.disabled = false;
            this.itemSelect.disabled = false;
            this.primaryButton.disabled = false;
            this.primaryButton.textContent = "Accept";
            this.secondaryButton.textContent = "Decline";
            this.shell.setOpen(true);
            return;
        }

        if (this.pvpState.outgoingChallenge) {
            const challenge = this.pvpState.outgoingChallenge;
            this.shell.setTitle("DUEL PENDING");
            this.summary.textContent = `Waiting on ${challenge.targetName}.`;
            this.subcopy.textContent = "The duel will begin once they accept.";
            this.offeredStake.textContent = `Your stake: ${this.formatStake(challenge.offeredStake)}`;
            this.goldInput.disabled = true;
            this.itemSelect.disabled = true;
            this.primaryButton.disabled = false;
            this.primaryButton.textContent = "Cancel Challenge";
            this.secondaryButton.textContent = "Close";
            this.shell.setOpen(true);
            return;
        }

        if (this.composeTarget) {
            this.shell.setTitle("DUEL CHALLENGE");
            this.summary.textContent = `Challenge ${this.composeTarget.name} to a duel.`;
            this.subcopy.textContent = "Party duels stop at 1 HP. Gold and item wagers are optional.";
            this.offeredStake.textContent = "Set your wager, or send it empty for a clean spar.";
            this.goldInput.disabled = false;
            this.itemSelect.disabled = false;
            this.primaryButton.disabled = false;
            this.primaryButton.textContent = "Send Challenge";
            this.secondaryButton.textContent = "Cancel";
            this.shell.setOpen(true);
            return;
        }

        this.shell.setTitle("DUEL");
        this.summary.textContent = "Challenge a party member to a clean duel.";
        this.subcopy.textContent = "No active duel flow.";
        this.offeredStake.textContent = "Right-click a player to start.";
        this.goldInput.disabled = false;
        this.itemSelect.disabled = false;
        this.primaryButton.textContent = "Send";
        this.primaryButton.disabled = true;
        this.secondaryButton.textContent = "Close";
        this.shell.setOpen(false);
    }

    private renderItemOptions() {
        const options = this.buildWagerOptions();
        const previousValue = this.itemSelect.value;
        this.itemSelect.replaceChildren();

        const none = createElement("option");
        none.value = "";
        none.textContent = "No item wager";
        this.itemSelect.append(none);

        options.forEach((option) => {
            const selectOption = createElement("option");
            selectOption.value = `${option.tab}:${option.index}`;
            selectOption.textContent = option.label;
            this.itemSelect.append(selectOption);
        });

        this.itemSelect.value = options.some((option) => `${option.tab}:${option.index}` === previousValue)
            ? previousValue
            : "";
    }

    private buildWagerOptions(): WagerOption[] {
        const options: WagerOption[] = [];
        (Object.keys(this.inventoryState.tabs) as InventoryTab[]).forEach((tab) => {
            this.inventoryState.tabs[tab].forEach((item, index) => {
                options.push({
                    tab,
                    index,
                    label: `${item.name}${item.count > 1 ? ` x${item.count}` : ""} [${tab.toUpperCase()}]`,
                });
            });
        });
        return options;
    }

    private readStakeSelection(): DuelStakeSelectionData {
        const gold = Number.parseInt(this.goldInput.value || "0", 10);
        const selectionValue = this.itemSelect.value;
        if (!selectionValue) {
            return { gold: Number.isFinite(gold) ? Math.max(0, gold) : 0 };
        }

        const [tab, index] = selectionValue.split(":");
        return {
            gold: Number.isFinite(gold) ? Math.max(0, gold) : 0,
            tab: this.isInventoryTab(tab) ? tab : undefined,
            index: Number.isFinite(Number(index)) ? Number(index) : undefined,
        };
    }

    private formatStake(stake: { gold: number; itemName: string | null }): string {
        const parts: string[] = [];
        if (stake.gold > 0) parts.push(`${stake.gold} gold`);
        if (stake.itemName) parts.push(stake.itemName);
        return parts.length > 0 ? parts.join(" and ") : "No wager";
    }

    private resetWagerInputs() {
        this.goldInput.value = "0";
        this.itemSelect.value = "";
    }

    private getRenderKey(): string {
        if (this.pvpState.activeDuel) return `active:${this.pvpState.activeDuel.opponentId}`;
        if (this.pvpState.incomingChallenge) return `incoming:${this.pvpState.incomingChallenge.challengerId}`;
        if (this.pvpState.outgoingChallenge) return `outgoing:${this.pvpState.outgoingChallenge.targetId}`;
        if (this.composeTarget) return `compose:${this.composeTarget.sessionId}`;
        return "idle";
    }

    private isInventoryTab(value: string): value is InventoryTab {
        return value === "equip" || value === "use" || value === "etc" || value === "cash";
    }
}
