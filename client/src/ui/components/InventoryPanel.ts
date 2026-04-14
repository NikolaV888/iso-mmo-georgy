import { createEmptyInventoryState } from "../data/prototypeData";
import { createButton, createElement } from "../dom";
import type {
    EquipmentSlot,
    HudCallbacks,
    InventoryItem,
    InventoryStateData,
    InventoryTab,
} from "../types";
import { WindowPanel } from "./WindowPanel";

const SLOT_COUNT = 20;

const TAB_LABELS: Array<[InventoryTab, string]> = [
    ["equip", "Equip"],
    ["use", "Use"],
    ["etc", "ETC"],
    ["cash", "Cash"],
];

const EQUIPMENT_SLOTS: Array<[EquipmentSlot, string]> = [
    ["weapon", "Weapon"],
    ["head", "Head"],
    ["chest", "Chest"],
    ["hands", "Hands"],
    ["feet", "Feet"],
    ["accessory", "Accessory"],
];

type InventorySelection =
    | { type: "inventory"; tab: InventoryTab; index: number }
    | { type: "equipment"; slot: EquipmentSlot };

export class InventoryPanel {
    private shell: WindowPanel;
    private callbacks: HudCallbacks;
    private inventoryState: InventoryStateData = createEmptyInventoryState();
    private activeTab: InventoryTab = "equip";
    private selection: InventorySelection = { type: "inventory", tab: "equip", index: 0 };
    private tabButtons = new Map<InventoryTab, HTMLButtonElement>();
    private equipmentGrid: HTMLDivElement;
    private grid: HTMLDivElement;
    private details: HTMLDivElement;
    private actionRow: HTMLDivElement;
    private goldLabel: HTMLSpanElement;

    constructor(host: HTMLElement, callbacks: HudCallbacks) {
        this.callbacks = callbacks;
        this.shell = new WindowPanel(host, {
            title: "PACK",
            panelClass: "hud-panel--pack",
        });

        const equipmentSection = createElement("div", "hud-equipment");
        const equipmentTitle = createElement("div", "hud-section-title", "Loadout");
        this.equipmentGrid = createElement("div", "hud-equipment__grid");
        equipmentSection.append(equipmentTitle, this.equipmentGrid);

        const tabs = createElement("div", "hud-tab-row");
        TAB_LABELS.forEach(([tabId, label]) => {
            const button = createButton(label);
            button.addEventListener("click", () => {
                this.activeTab = tabId;
                this.selection = { type: "inventory", tab: tabId, index: 0 };
                this.render();
            });
            this.tabButtons.set(tabId, button);
            tabs.append(button);
        });

        this.grid = createElement("div", "hud-grid");
        this.details = createElement("div", "hud-detail-card", "No items in this tab yet.");
        this.actionRow = createElement("div", "hud-inline-actions");

        const footer = createElement("div", "hud-panel-footer");
        const goldTitle = createElement("span", "hud-section-title", "Gold");
        this.goldLabel = createElement("span", ["hud-chip", "hud-chip--gold"], "0 gold");
        footer.append(goldTitle, this.goldLabel);

        this.shell.body.append(equipmentSection, tabs, this.grid, this.details, this.actionRow, footer);
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

    public setGold(gold: number) {
        this.goldLabel.textContent = `${gold.toLocaleString()} gold`;
    }

    public updateInventoryState(state: InventoryStateData) {
        this.inventoryState = state;
        this.ensureSelectionStillValid();
        this.render();
    }

    private render() {
        this.renderEquipment();
        this.renderTabs();
        this.renderInventoryGrid();
        this.renderSelection();
    }

    private renderEquipment() {
        this.equipmentGrid.replaceChildren();

        EQUIPMENT_SLOTS.forEach(([slotId, label]) => {
            const equippedItem = this.inventoryState.equipment[slotId] ?? null;
            const classes = ["hud-equipment-slot"];
            if (equippedItem) classes.push("is-filled");
            if (this.selection.type === "equipment" && this.selection.slot === slotId) {
                classes.push("is-selected");
            }

            const button = createElement("button", classes);
            button.type = "button";
            button.append(
                createElement("span", "hud-equipment-slot__label", label),
                createElement(
                    "span",
                    "hud-equipment-slot__value",
                    equippedItem ? equippedItem.name : "Empty"
                )
            );
            button.addEventListener("click", () => {
                this.selection = { type: "equipment", slot: slotId };
                this.render();
            });

            this.equipmentGrid.append(button);
        });
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
            if (
                this.selection.type === "inventory" &&
                this.selection.tab === this.activeTab &&
                this.selection.index === index
            ) {
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
                    this.selection = { type: "inventory", tab: this.activeTab, index };
                    this.render();
                });
            }

            this.grid.append(slot);
        }
    }

    private renderSelection() {
        const selectedItem = this.getSelectedItem();
        const actionButton = this.buildActionButton(selectedItem);

        if (!selectedItem) {
            this.details.textContent = "No item selected.";
            this.actionRow.replaceChildren();
            return;
        }

        const metaParts: string[] = [selectedItem.kind];
        if (selectedItem.rarity) metaParts.push(selectedItem.rarity);
        if (selectedItem.statLine) metaParts.push(selectedItem.statLine);
        if (selectedItem.count > 1) metaParts.push(`stack ${selectedItem.count}`);

        this.details.replaceChildren(
            createElement("div", "hud-detail-card__title", selectedItem.name),
            createElement("div", "hud-detail-card__meta", metaParts.join(" | ")),
            createElement("div", "hud-detail-card__body", selectedItem.description)
        );

        this.actionRow.replaceChildren();
        if (actionButton) this.actionRow.append(actionButton);
    }

    private buildActionButton(selectedItem: InventoryItem | null): HTMLButtonElement | null {
        if (!selectedItem) return null;

        if (this.selection.type === "equipment") {
            const { slot } = this.selection;
            if (!selectedItem.equipSlot) return null;

            const button = createButton("Unequip");
            button.addEventListener("click", () => {
                this.callbacks.onUnequipInventoryItem?.(slot);
            });
            return button;
        }

        const { tab, index } = this.selection;

        if (selectedItem.kind === "equipment" && selectedItem.equipSlot) {
            const button = createButton("Equip");
            button.addEventListener("click", () => {
                this.callbacks.onEquipInventoryItem?.(tab, index);
            });
            return button;
        }

        if (selectedItem.kind === "consumable") {
            const button = createButton("Use");
            button.addEventListener("click", () => {
                this.callbacks.onUseInventoryItem?.(tab, index);
            });
            return button;
        }

        return null;
    }

    private getSelectedItem(): InventoryItem | null {
        if (this.selection.type === "equipment") {
            return this.inventoryState.equipment[this.selection.slot] ?? null;
        }

        return this.inventoryState.tabs[this.selection.tab][this.selection.index] ?? null;
    }

    private ensureSelectionStillValid() {
        if (this.selection.type === "equipment") {
            if (this.inventoryState.equipment[this.selection.slot]) return;
            this.selection = { type: "inventory", tab: this.activeTab, index: 0 };
            return;
        }

        const items = this.inventoryState.tabs[this.selection.tab];
        if (items[this.selection.index]) return;

        this.selection = { type: "inventory", tab: this.activeTab, index: 0 };
    }
}
