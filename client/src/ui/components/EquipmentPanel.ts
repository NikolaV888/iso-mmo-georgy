import { createEmptyInventoryState } from "../data/prototypeData";
import { createButton, createElement } from "../dom";
import type {
    EquipmentSlot,
    HudCallbacks,
    InventoryItem,
    InventoryStateData,
} from "../types";
import { ItemTooltip } from "./ItemTooltip";
import { WindowPanel } from "./WindowPanel";

const EQUIPMENT_SLOTS: Array<[EquipmentSlot, string]> = [
    ["weapon", "Weapon"],
    ["head", "Head"],
    ["chest", "Chest"],
    ["hands", "Hands"],
    ["feet", "Feet"],
    ["accessory", "Accessory"],
];

export class EquipmentPanel {
    private readonly shell: WindowPanel;
    private readonly callbacks: HudCallbacks;
    private readonly tooltip: ItemTooltip;
    private inventoryState: InventoryStateData = createEmptyInventoryState();
    private selectedSlot: EquipmentSlot = "weapon";
    private readonly grid: HTMLDivElement;
    private readonly status: HTMLDivElement;
    private readonly actionRow: HTMLDivElement;

    constructor(host: HTMLElement, callbacks: HudCallbacks, tooltip: ItemTooltip) {
        this.callbacks = callbacks;
        this.tooltip = tooltip;
        this.shell = new WindowPanel(host, {
            title: "EQUIPMENT",
            panelClass: "hud-panel--equipment",
        });

        const intro = createElement(
            "div",
            "hud-panel-copy",
            "Your current field loadout. Hover equipped gear for its tooltip and double-click to unequip it."
        );
        this.grid = createElement("div", "hud-equipment__grid");
        this.status = createElement("div", "hud-panel-copy");
        this.actionRow = createElement("div", "hud-inline-actions");

        this.shell.body.append(intro, this.grid, this.status, this.actionRow);
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

    public updateInventoryState(state: InventoryStateData) {
        this.inventoryState = state;
        this.ensureSelectionStillValid();
        this.render();
    }

    private render() {
        this.tooltip.hide();
        this.renderGrid();
        this.renderSelection();
    }

    private renderGrid() {
        this.grid.replaceChildren();

        EQUIPMENT_SLOTS.forEach(([slotId, label]) => {
            const equippedItem = this.inventoryState.equipment[slotId] ?? null;
            const classes = ["hud-equipment-slot"];
            if (equippedItem) classes.push("is-filled");
            if (this.selectedSlot === slotId) classes.push("is-selected");

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
                this.selectedSlot = slotId;
                this.render();
            });
            button.addEventListener("dblclick", (event) => {
                event.preventDefault();
                if (!equippedItem) return;
                this.callbacks.onUnequipInventoryItem?.(slotId);
            });
            button.addEventListener("pointerenter", (event) => {
                if (!equippedItem) return;
                this.tooltip.show(equippedItem, event.clientX, event.clientY, {
                    slotLabel: label,
                    actionHint: "Double-click to unequip",
                });
            });
            button.addEventListener("pointermove", (event) => {
                this.tooltip.move(event.clientX, event.clientY);
            });
            button.addEventListener("pointerleave", () => {
                this.tooltip.hide();
            });

            this.grid.append(button);
        });
    }

    private renderSelection() {
        const selectedItem = this.getSelectedItem();
        this.actionRow.replaceChildren();

        if (!selectedItem) {
            this.status.textContent = `${this.getSelectedSlotLabel()} slot is empty.`;
            return;
        }
        this.status.textContent = `${this.getSelectedSlotLabel()} equipped: ${selectedItem.name}`;

        const button = createButton("Unequip");
        button.addEventListener("click", () => {
            this.callbacks.onUnequipInventoryItem?.(this.selectedSlot);
        });
        this.actionRow.append(button);
    }

    private getSelectedItem(): InventoryItem | null {
        return this.inventoryState.equipment[this.selectedSlot] ?? null;
    }

    private getSelectedSlotLabel(): string {
        return EQUIPMENT_SLOTS.find(([slot]) => slot === this.selectedSlot)?.[1] ?? "Slot";
    }

    private ensureSelectionStillValid() {
        // Equipment slots are static, so the current selection is always a valid slot.
    }
}
