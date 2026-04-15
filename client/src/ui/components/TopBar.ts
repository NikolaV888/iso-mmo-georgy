import { appendChildren, createButton, createElement, createMeter, updateMeter } from "../dom";
import type { HudCallbacks, HudPlayerData } from "../types";

export class TopBar {
    private root: HTMLDivElement;
    private nameLabel: HTMLDivElement;
    private levelChip: HTMLSpanElement;
    private goldChip: HTMLSpanElement;
    private pointsChip: HTMLSpanElement;
    private pvpTagChip: HTMLSpanElement;
    private pvpToggleButton: HTMLButtonElement;
    private hpMeter = createMeter("HP", "hp");
    private expMeter = createMeter("EXP", "exp");

    constructor(host: HTMLElement, callbacks: HudCallbacks = {}) {
        this.root = createElement("div", ["hud-card-shell", "hud-topbar"]);

        const headline = createElement("div", "hud-topbar__headline");
        const identity = createElement("div", "hud-topbar__identity");
        const meta = createElement("div", "hud-topbar__meta");
        const controls = createElement("div", "hud-topbar__controls");

        this.nameLabel = createElement("div", "hud-topbar__name", "Player");
        this.levelChip = createElement("span", ["hud-chip", "hud-chip--accent"], "Lv. 1");
        this.goldChip = createElement("span", ["hud-chip", "hud-chip--gold"], "0 gold");
        this.pointsChip = createElement("span", ["hud-chip", "hud-chip--points"], "PTS 0");
        this.pvpTagChip = createElement("span", ["hud-chip", "hud-chip--danger", "is-hidden"], "(PVP)");
        this.pvpToggleButton = createButton("PvP Off", ["hud-button", "hud-button--small", "hud-topbar__toggle"]);
        this.pvpToggleButton.addEventListener("click", () => {
            callbacks.onTogglePvpMode?.();
        });

        appendChildren(meta, this.levelChip, this.goldChip, this.pointsChip, this.pvpTagChip);
        appendChildren(identity, this.nameLabel, meta);
        controls.append(this.pvpToggleButton);
        appendChildren(headline, identity, controls);

        appendChildren(this.root, headline, this.hpMeter.root, this.expMeter.root);
        host.append(this.root);
    }

    public update(player: HudPlayerData) {
        this.nameLabel.textContent = player.name;
        this.levelChip.textContent = `Lv. ${player.level}`;
        this.goldChip.textContent = `${player.gold.toLocaleString()} gold`;
        this.pointsChip.textContent = `PTS ${player.bonusStatPoints}`;
        this.pointsChip.classList.toggle("is-ready", player.bonusStatPoints > 0);
        this.pvpTagChip.classList.toggle("is-hidden", !player.pvpTagged);
        this.pvpToggleButton.textContent = player.pvpEnabled ? "PvP On" : "PvP Off";
        this.pvpToggleButton.classList.toggle("is-active", player.pvpEnabled);
        this.pvpToggleButton.classList.toggle("is-tagged", player.pvpTagged);

        updateMeter(this.hpMeter, player.hp, player.maxHp, `${player.hp} / ${player.maxHp}`);
        updateMeter(
            this.expMeter,
            player.exp,
            player.expToNextLevel,
            `${player.exp} / ${player.expToNextLevel}`
        );
    }

    public getRootElement(): HTMLDivElement {
        return this.root;
    }
}
