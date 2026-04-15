import { createEmptyInventoryState } from "../data/prototypeData";
import { createButton, createElement } from "../dom";
import type {
    HudCallbacks,
    InventoryItem,
    InventoryStateData,
    InventoryTab,
} from "../types";
import { ItemTooltip } from "./ItemTooltip";
import { WindowPanel } from "./WindowPanel";

const SLOT_COUNT = 20;

const TAB_LABELS: Array<[InventoryTab, string]> = [
    ["equip", "Gear"],
    ["use", "Use"],
    ["etc", "ETC"],
    ["cash", "Cash"],
];

export class InventoryPanel {
    private shell: WindowPanel;
    private callbacks: HudCallbacks;
    private tooltip: ItemTooltip;
    private inventoryState: InventoryStateData = createEmptyInventoryState();
    private activeTab: InventoryTab = "equip";
    private selection = { tab: "equip" as InventoryTab, index: 0 };
    private tabButtons = new Map<InventoryTab, HTMLButtonElement>();
    private grid: HTMLDivElement;
    private actionRow: HTMLDivElement;
    private goldLabel: HTMLSpanElement;

    constructor(host: HTMLElement, callbacks: HudCallbacks, tooltip: ItemTooltip) {
        this.callbacks = callbacks;
        this.tooltip = tooltip;
        this.shell = new WindowPanel(host, {
            title: "PACK",
            panelClass: "hud-panel--pack",
        });

        const intro = createElement(
            "div",
            "hud-panel-copy",
            "Hover items for a floating tooltip. Double-click to equip or use them fast."
        );

        const tabs = createElement("div", "hud-tab-row");
        TAB_LABELS.forEach(([tabId, label]) => {
            const button = createButton(label);
            button.addEventListener("click", () => {
                this.activeTab = tabId;
                this.selection = { tab: tabId, index: 0 };
                this.render();
            });
            this.tabButtons.set(tabId, button);
            tabs.append(button);
        });

        this.grid = createElement("div", "hud-grid");
        this.actionRow = createElement("div", "hud-inline-actions");

        const footer = createElement("div", "hud-panel-footer");
        const goldTitle = createElement("span", "hud-section-title", "Gold");
        this.goldLabel = createElement("span", ["hud-chip", "hud-chip--gold"], "0 gold");
        footer.append(goldTitle, this.goldLabel);

        this.shell.body.append(intro, tabs, this.grid, this.actionRow, footer);
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

    public getRootElement(): HTMLDivElement {
        return this.shell.getRootElement();
    }

    public getDragHandleElement(): HTMLDivElement {
        return this.shell.getDragHandleElement();
    }

    public setGold(gold: number) {
        this.goldLabel.textContent = `${gold.toLocaleString()} gold`;
    }

    public updateInventoryState(state: InventoryStateData) {
        this.inventoryState = state;
        this.ensureSelectionStillValid();
        this.render();
    }

    private render() {
        this.tooltip.hide();
        this.renderTabs();
        this.renderInventoryGrid();
        this.renderSelection();
    }

    private renderTabs() {
        this.tabButtons.forEach((button, tabId) => {
            button.classList.toggle("is-active", tabId === this.activeTab);
        });
    }

    private renderInventoryGrid() {
        const items = this.inventoryState.tabs[this.activeTab];
        this.grid.replaceChildren();

        for (let index = 0; index < SLOT_COUNT; index += 1) {
            const item = items[index];
            const slotClasses = ["hud-slot"];
            slotClasses.push(item ? "is-filled" : "is-empty");
            if (this.selection.tab === this.activeTab && this.selection.index === index) {
                slotClasses.push("is-selected");
            }

            const slot = createElement("button", slotClasses);
            slot.type = "button";
            slot.disabled = !item;

            if (item) {
                const title = createElement("span", "hud-slot__name", item.name);
                const count =
                    item.count > 1
                        ? createElement("span", "hud-slot__count", `x${item.count}`)
                        : null;
                slot.append(title);
                if (count) slot.append(count);
                slot.addEventListener("click", () => {
                    this.selection = { tab: this.activeTab, index };
                    this.render();
                });
                slot.addEventListener("dblclick", (event) => {
                    event.preventDefault();
                    this.triggerItemAction(this.activeTab, index, item);
                });
                slot.addEventListener("pointerenter", (event) => {
                    this.showTooltip(item, event, this.activeTab);
                });
                slot.addEventListener("pointermove", (event) => {
                    this.tooltip.move(event.clientX, event.clientY);
                });
                slot.addEventListener("pointerleave", () => {
                    this.tooltip.hide();
                });
            }

            this.grid.append(slot);
        }
    }

    private renderSelection() {
        const selectedItem = this.getSelectedItem();
        const actionButton = this.buildActionButton(selectedItem);

        if (!selectedItem) {
            this.actionRow.replaceChildren();
            return;
        }

        this.actionRow.replaceChildren();
        if (actionButton) this.actionRow.append(actionButton);
    }

    private buildActionButton(selectedItem: InventoryItem | null): HTMLButtonElement | null {
        if (!selectedItem) return null;
        const { tab, index } = this.selection;

        if (selectedItem.kind === "equipment" && selectedItem.equipSlot) {
            const button = createButton("Equip");
            button.addEventListener("click", () => {
                this.triggerItemAction(tab, index, selectedItem);
            });
            return button;
        }

        if (selectedItem.kind === "consumable") {
            const button = createButton("Use");
            button.addEventListener("click", () => {
                this.triggerItemAction(tab, index, selectedItem);
            });
            return button;
        }

        return null;
    }

    private getSelectedItem(): InventoryItem | null {
        return this.inventoryState.tabs[this.selection.tab][this.selection.index] ?? null;
    }

    private ensureSelectionStillValid() {
        const items = this.inventoryState.tabs[this.selection.tab];
        if (items[this.selection.index]) return;

        this.selection = { tab: this.activeTab, index: 0 };
    }

    private triggerItemAction(tab: InventoryTab, index: number, item: InventoryItem) {
        if (item.kind === "equipment" && item.equipSlot) {
            this.callbacks.onEquipInventoryItem?.(tab, index);
            return;
        }

        if (item.kind === "consumable") {
            this.callbacks.onUseInventoryItem?.(tab, index);
        }
    }

    private showTooltip(item: InventoryItem, event: PointerEvent, tab: InventoryTab) {
        this.tooltip.show(item, event.clientX, event.clientY, {
            slotLabel: tab.toUpperCase(),
            actionHint: this.getItemActionHint(item),
        });
    }

    private getItemActionHint(item: InventoryItem): string | undefined {
        if (item.kind === "equipment" && item.equipSlot) {
            return "Double-click to equip";
        }

        if (item.kind === "consumable") {
            return "Double-click to use";
        }

        return undefined;
    }
}
