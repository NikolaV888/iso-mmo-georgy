import { createButton, createElement, setButtonDisabled } from "../dom";
import type { AllocatableStat, HudCallbacks, HudPlayerData } from "../types";
import { WindowPanel } from "./WindowPanel";

export class StatsPanel {
    private shell: WindowPanel;
    private statLabels: Record<string, HTMLSpanElement> = {};
    private statButtons: Partial<Record<AllocatableStat, HTMLButtonElement>> = {};
    private callbacks: HudCallbacks;

    constructor(host: HTMLElement, callbacks: HudCallbacks) {
        this.callbacks = callbacks;
        this.shell = new WindowPanel(host, {
            title: "CHARACTER",
            panelClass: "hud-panel--stats",
        });

        this.addRow("HP", "hp", "hud-value--danger");
        this.addRow("Damage", "damage", "hud-value--gold");
        this.addRow("Atk Speed", "speed", "hud-value--good");
        this.addRow("Move Speed", "move", "hud-value--accent");
        this.addRow("EXP", "exp", "hud-value--accent");
        this.addRow("Unspent", "points", "hud-value--gold");

        this.shell.body.append(this.createDivider());
        this.addRow("STR", "str", "hud-value--text", "str");
        this.addRow("AGI", "agi", "hud-value--text", "agi");
        this.addRow("INT", "int", "hud-value--text", "int");
        this.addRow("VIT", "vit", "hud-value--text", "vit");
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

    public update(player: HudPlayerData) {
        this.updateLabel("hp", `${player.hp} / ${player.maxHp}`);
        this.updateLabel("damage", String(player.attackDamage));
        this.updateLabel("speed", player.attackSpeed.toFixed(2));
        this.updateLabel("move", player.moveSpeed.toFixed(2));
        this.updateLabel("exp", `${player.exp} / ${player.expToNextLevel}`);
        this.updateLabel("points", String(player.bonusStatPoints));
        this.updateLabel("str", String(player.str));
        this.updateLabel("agi", String(player.agi));
        this.updateLabel("int", String(player.int));
        this.updateLabel("vit", String(player.vit));

        const canAllocate = player.bonusStatPoints > 0;
        (["str", "agi", "int", "vit"] as AllocatableStat[]).forEach((stat) => {
            const button = this.statButtons[stat];
            if (!button) return;
            setButtonDisabled(button, !canAllocate);
        });
    }

    private updateLabel(key: string, value: string) {
        const label = this.statLabels[key];
        if (label) label.textContent = value;
    }

    private addRow(
        labelText: string,
        key: string,
        valueClass: string,
        allocatableStat?: AllocatableStat
    ) {
        const row = createElement("div", "hud-stat-row");
        const label = createElement("span", "hud-stat-label", labelText);
        const valueWrap = createElement("div", "hud-stat-value-wrap");
        const value = createElement("span", ["hud-stat-value", valueClass], "0");
        this.statLabels[key] = value;
        valueWrap.append(value);

        if (allocatableStat) {
            const button = createButton("+", ["hud-button", "hud-button--small"]);
            setButtonDisabled(button, true);
            button.addEventListener("click", () => {
                if (button.disabled) return;
                this.callbacks.onAllocateStat?.(allocatableStat);
            });
            this.statButtons[allocatableStat] = button;
            valueWrap.append(button);
        }

        row.append(label, valueWrap);
        this.shell.body.append(row);
    }

    private createDivider(): HTMLDivElement {
        return createElement("div", "hud-divider");
    }
}
