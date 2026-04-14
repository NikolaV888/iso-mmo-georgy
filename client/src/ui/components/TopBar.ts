import { appendChildren, createElement, createMeter, updateMeter } from "../dom";
import type { HudPlayerData } from "../types";

export class TopBar {
    private root: HTMLDivElement;
    private nameLabel: HTMLDivElement;
    private levelChip: HTMLSpanElement;
    private goldChip: HTMLSpanElement;
    private pointsChip: HTMLSpanElement;
    private hpMeter = createMeter("HP", "hp");
    private expMeter = createMeter("EXP", "exp");

    constructor(host: HTMLElement) {
        this.root = createElement("div", ["hud-card-shell", "hud-topbar"]);

        const headline = createElement("div", "hud-topbar__headline");
        const identity = createElement("div", "hud-topbar__identity");
        const meta = createElement("div", "hud-topbar__meta");

        this.nameLabel = createElement("div", "hud-topbar__name", "Player");
        this.levelChip = createElement("span", ["hud-chip", "hud-chip--accent"], "Lv. 1");
        this.goldChip = createElement("span", ["hud-chip", "hud-chip--gold"], "0 gold");
        this.pointsChip = createElement("span", ["hud-chip", "hud-chip--points"], "PTS 0");

        appendChildren(meta, this.levelChip, this.goldChip, this.pointsChip);
        appendChildren(identity, this.nameLabel, meta);
        headline.append(identity);

        appendChildren(this.root, headline, this.hpMeter.root, this.expMeter.root);
        host.append(this.root);
    }

    public update(player: HudPlayerData) {
        this.nameLabel.textContent = player.name;
        this.levelChip.textContent = `Lv. ${player.level}`;
        this.goldChip.textContent = `${player.gold.toLocaleString()} gold`;
        this.pointsChip.textContent = `PTS ${player.bonusStatPoints}`;
        this.pointsChip.classList.toggle("is-ready", player.bonusStatPoints > 0);

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
