import { appendChildren, createElement, createMeter, updateMeter } from "../dom";
import type { TargetFrameData } from "../types";

function toTargetLabel(target: TargetFrameData): string {
    if (!target.isMob) return "PLAYER";
    return target.mobKind ? target.mobKind.toUpperCase() : "MOB";
}

export class TargetFrame {
    private root: HTMLDivElement;
    private tagLabel: HTMLSpanElement;
    private nameLabel: HTMLDivElement;
    private levelLabel: HTMLSpanElement;
    private hpMeter = createMeter("Target HP", "hp");

    constructor(host: HTMLElement) {
        this.root = createElement("div", ["hud-card-shell", "hud-target", "is-hidden"]);
        const header = createElement("div", "hud-target__header");
        const identity = createElement("div", "hud-target__identity");
        const meta = createElement("div", "hud-target__meta");

        this.tagLabel = createElement("span", ["hud-chip", "hud-chip--danger"], "TARGET");
        this.nameLabel = createElement("div", "hud-target__name", "Unknown");
        this.levelLabel = createElement("span", ["hud-chip", "hud-chip--accent"], "Lv. 1");

        appendChildren(meta, this.tagLabel, this.levelLabel);
        appendChildren(identity, this.nameLabel, meta);
        appendChildren(header, identity);
        appendChildren(this.root, header, this.hpMeter.root);
        host.append(this.root);
    }

    public update(target: TargetFrameData | null) {
        if (!target) {
            this.root.classList.add("is-hidden");
            return;
        }

        this.nameLabel.textContent = target.name;
        this.tagLabel.textContent = toTargetLabel(target);
        this.levelLabel.textContent = `Lv. ${target.level}`;
        updateMeter(this.hpMeter, target.hp, target.maxHp, `${target.hp} / ${target.maxHp}`);
        this.root.classList.remove("is-hidden");
    }
}
