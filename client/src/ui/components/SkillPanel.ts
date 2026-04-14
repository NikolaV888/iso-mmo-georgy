import { createElement } from "../dom";
import type { SkillEntryData } from "../types";
import { WindowPanel } from "./WindowPanel";

export class SkillPanel {
    private shell: WindowPanel;
    private list: HTMLDivElement;

    constructor(host: HTMLElement) {
        this.shell = new WindowPanel(host, {
            title: "SKILLS",
            panelClass: "hud-panel--skills",
        });

        this.list = createElement("div", "hud-card-list");
        this.shell.body.append(
            createElement(
                "div",
                "hud-panel-copy",
                "Prototype combat book for the systems already online and the next hooks we can wire."
            ),
            this.list
        );
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

    public updateEntries(entries: SkillEntryData[]) {
        this.list.replaceChildren();

        entries.forEach((entry) => {
            const classes = ["hud-card-list__item"];
            classes.push(entry.unlocked ? "is-ready" : "is-locked");

            const card = createElement("div", classes);
            const header = createElement("div", "hud-card-list__header");
            const title = createElement("div", "hud-card-list__title", entry.name);
            const badge = createElement(
                "span",
                ["hud-chip", entry.unlocked ? "hud-chip--good" : "hud-chip--muted"],
                entry.status
            );
            const meta = createElement(
                "div",
                "hud-card-list__meta",
                `${entry.category} | ${entry.hotkey}`
            );
            const body = createElement("div", "hud-card-list__body", entry.description);

            header.append(title, badge);
            card.append(header, meta, body);
            this.list.append(card);
        });
    }
}
