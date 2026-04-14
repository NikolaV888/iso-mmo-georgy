import {
    appendChildren,
    createButton,
    createElement,
    setButtonDisabled,
} from "../dom";
import type { HudCallbacks, NpcDialogStateData } from "../types";
import { WindowPanel } from "./WindowPanel";

const CLOSED_NPC_STATE: NpcDialogStateData = {
    isOpen: false,
    npcId: null,
    npcName: "",
    greeting: "",
    hint: "",
    quest: null,
    shopItems: [],
    sellItems: [],
};

export class NpcDialogPanel {
    private readonly shell: WindowPanel;
    private readonly intro: HTMLDivElement;
    private readonly hint: HTMLDivElement;
    private readonly questSection: HTMLDivElement;
    private readonly shopList: HTMLDivElement;
    private readonly sellList: HTMLDivElement;
    private readonly callbacks: HudCallbacks;
    private state: NpcDialogStateData = CLOSED_NPC_STATE;
    private applyingState = false;

    constructor(host: HTMLElement, callbacks: HudCallbacks = {}) {
        this.callbacks = callbacks;
        this.shell = new WindowPanel(host, {
            title: "NPC",
            panelClass: "hud-panel--npc",
            onOpenChange: (open) => {
                if (!open && !this.applyingState) {
                    this.callbacks.onCloseNpcDialog?.();
                }
            },
        });

        this.intro = createElement("div", "hud-panel-copy");
        this.hint = createElement("div", "hud-card-list__meta");
        this.questSection = createElement("div", "hud-npc-section");
        this.shopList = createElement("div", "hud-list");
        this.sellList = createElement("div", "hud-list");

        appendChildren(
            this.shell.body,
            this.intro,
            this.hint,
            createElement("div", "hud-divider"),
            this.questSection,
            createElement("div", "hud-divider"),
            createElement("div", "hud-section-title", "Buy"),
            this.shopList,
            createElement("div", "hud-divider"),
            createElement("div", "hud-section-title", "Sell"),
            this.sellList
        );

        this.render();
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

    public updateState(state: NpcDialogStateData) {
        this.state = state;
        this.render();
        this.applyingState = true;
        this.shell.setTitle(state.isOpen && state.npcName ? state.npcName : "NPC");
        this.shell.setOpen(state.isOpen);
        this.applyingState = false;
    }

    private render() {
        this.intro.textContent = this.state.greeting || "No one is nearby to talk to right now.";
        this.hint.textContent = this.state.hint || "";

        this.renderQuest();
        this.renderBuyList();
        this.renderSellList();
    }

    private renderQuest() {
        this.questSection.replaceChildren();

        if (!this.state.quest) {
            this.questSection.append(
                createElement("div", "hud-empty", "No field assignments available from this NPC right now.")
            );
            return;
        }

        const quest = this.state.quest;
        const card = createElement("div", "hud-card-list__item");
        const header = createElement("div", "hud-card-list__header");
        const title = createElement("div", "hud-card-list__title", quest.title);
        const badge = createElement("span", ["hud-chip", "hud-chip--accent"], quest.status);
        const summary = createElement("div", "hud-card-list__body", quest.summary);

        header.append(title, badge);
        card.append(header, summary);

        if (quest.actionLabel) {
            const actionRow = createElement("div", "hud-inline-actions");
            const actionButton = createButton(quest.actionLabel);
            setButtonDisabled(actionButton, !quest.canAct);
            actionButton.addEventListener("click", () => {
                if (!quest.canAct) return;
                if (quest.action === "accept") {
                    this.callbacks.onAcceptQuest?.(quest.questId);
                } else if (quest.action === "claim") {
                    this.callbacks.onClaimQuest?.(quest.questId);
                }
            });
            actionRow.append(actionButton);
            card.append(actionRow);
        }

        this.questSection.append(card);
    }

    private renderBuyList() {
        this.shopList.replaceChildren();

        if (this.state.shopItems.length === 0) {
            this.shopList.append(
                createElement("div", "hud-empty", "This merchant is not stocking anything right now.")
            );
            return;
        }

        this.state.shopItems.forEach((entry) => {
            const card = createElement("div", "hud-list-card");
            const content = createElement("div", "hud-list-card__content");
            const title = createElement("div", "hud-list-card__title", entry.name);
            const meta = createElement("div", "hud-list-card__meta", `${entry.price} gold`);
            const body = createElement("div", "hud-card-list__body", entry.description);
            content.append(title, meta, body);

            const buyButton = createButton("Buy", ["hud-button", "hud-button--small"]);
            setButtonDisabled(buyButton, !entry.canAfford);
            buyButton.addEventListener("click", () => {
                if (!entry.canAfford) return;
                this.callbacks.onBuyShopItem?.(entry.itemId);
            });

            card.append(content, buyButton);
            this.shopList.append(card);
        });
    }

    private renderSellList() {
        this.sellList.replaceChildren();

        if (this.state.sellItems.length === 0) {
            this.sellList.append(
                createElement("div", "hud-empty", "You have nothing with sell value in your pack.")
            );
            return;
        }

        this.state.sellItems.forEach((entry) => {
            const card = createElement("div", "hud-list-card");
            const content = createElement("div", "hud-list-card__content");
            const title = createElement("div", "hud-list-card__title", entry.name);
            const meta = createElement(
                "div",
                "hud-list-card__meta",
                `${entry.count}x | ${entry.priceEach} each | ${entry.totalPrice} gold`
            );
            content.append(title, meta);

            const sellButton = createButton("Sell", ["hud-button", "hud-button--small"]);
            sellButton.addEventListener("click", () => {
                this.callbacks.onSellShopItem?.(entry.tab, entry.index);
            });

            card.append(content, sellButton);
            this.sellList.append(card);
        });
    }
}
