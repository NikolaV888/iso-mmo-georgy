export type AllocatableStat = "str" | "agi" | "int" | "vit";

export interface HudPlayerData {
    name: string;
    level: number;
    exp: number;
    expToNextLevel: number;
    bonusStatPoints: number;
    hp: number;
    maxHp: number;
    str: number;
    agi: number;
    int: number;
    vit: number;
    attackDamage: number;
    attackSpeed: number;
    moveSpeed: number;
}

export class HudManager {
    private wrapper: HTMLDivElement;
    private onAllocateStat?: (stat: AllocatableStat) => void;

    private statsWindow: HTMLDivElement | null = null;
    private nameLabel: HTMLSpanElement | null = null;
    private hpLabel: HTMLSpanElement | null = null;
    private levelLabel: HTMLSpanElement | null = null;
    private expLabel: HTMLSpanElement | null = null;
    private pointsLabel: HTMLSpanElement | null = null;

    private statLabels: Record<string, HTMLSpanElement> = {};
    private statButtons: Partial<Record<AllocatableStat, HTMLButtonElement>> = {};

    constructor(onAllocateStat?: (stat: AllocatableStat) => void) {
        const existing = document.getElementById("hud-wrapper");
        if (existing) existing.remove();

        this.onAllocateStat = onAllocateStat;
        this.wrapper = document.createElement("div");
        this.wrapper.id = "hud-wrapper";

        Object.assign(this.wrapper.style, {
            position: "fixed",
            top: "0",
            left: "0",
            right: "0",
            bottom: "0",
            pointerEvents: "none",
            zIndex: "1000",
            fontFamily: "monospace, sans-serif",
        });

        document.body.appendChild(this.wrapper);
        this.buildTopLeftPortrait();
        this.buildBottomActionBar();
        this.buildStatsWindow();
    }

    public destroy() {
        this.wrapper.remove();
        this.statsWindow = null;
        this.nameLabel = null;
        this.hpLabel = null;
        this.levelLabel = null;
        this.expLabel = null;
        this.pointsLabel = null;
        this.statLabels = {};
        this.statButtons = {};
    }

    public updateLocalPlayer(player: Partial<HudPlayerData>) {
        const name = this.readString(player.name, "Player");
        const level = this.readNumber(player.level, 1);
        const exp = this.readNumber(player.exp, 0);
        const expToNextLevel = this.readNumber(player.expToNextLevel, 35);
        const bonusStatPoints = this.readNumber(player.bonusStatPoints, 0);
        const hp = this.readNumber(player.hp, 100);
        const maxHp = this.readNumber(player.maxHp, 100);
        const str = this.readNumber(player.str, 0);
        const agi = this.readNumber(player.agi, 0);
        const int = this.readNumber(player.int, 0);
        const vit = this.readNumber(player.vit, 0);
        const attackDamage = this.readNumber(player.attackDamage, 0);
        const attackSpeed = this.readNumber(player.attackSpeed, 0);
        const moveSpeed = this.readNumber(player.moveSpeed, 0);

        if (this.nameLabel) this.nameLabel.innerText = name;
        if (this.levelLabel) this.levelLabel.innerText = `Lv. ${level}`;
        if (this.hpLabel) this.hpLabel.innerText = `${hp} / ${maxHp}`;
        if (this.expLabel) this.expLabel.innerText = `EXP ${exp} / ${expToNextLevel}`;
        if (this.pointsLabel) this.pointsLabel.innerText = `PTS ${bonusStatPoints}`;

        if (this.statLabels["hp"]) this.statLabels["hp"].innerText = `${hp} / ${maxHp}`;
        if (this.statLabels["damage"]) this.statLabels["damage"].innerText = String(attackDamage);
        if (this.statLabels["speed"]) this.statLabels["speed"].innerText = attackSpeed.toFixed(2);
        if (this.statLabels["move"]) this.statLabels["move"].innerText = moveSpeed.toFixed(2);
        if (this.statLabels["exp"]) this.statLabels["exp"].innerText = `${exp} / ${expToNextLevel}`;
        if (this.statLabels["points"]) this.statLabels["points"].innerText = String(bonusStatPoints);
        if (this.statLabels["str"]) this.statLabels["str"].innerText = String(str);
        if (this.statLabels["agi"]) this.statLabels["agi"].innerText = String(agi);
        if (this.statLabels["int"]) this.statLabels["int"].innerText = String(int);
        if (this.statLabels["vit"]) this.statLabels["vit"].innerText = String(vit);

        const canAllocate = bonusStatPoints > 0;
        (["str", "agi", "int", "vit"] as AllocatableStat[]).forEach((stat) => {
            const button = this.statButtons[stat];
            if (!button) return;
            button.disabled = !canAllocate;
            button.style.opacity = canAllocate ? "1" : "0.45";
            button.style.cursor = canAllocate ? "pointer" : "default";
        });
    }

    private buildTopLeftPortrait() {
        const topBar = document.createElement("div");
        Object.assign(topBar.style, {
            position: "absolute",
            top: "10px",
            left: "10px",
            backgroundColor: "rgba(15, 15, 20, 0.88)",
            border: "2px solid #554433",
            borderRadius: "4px",
            padding: "8px 14px",
            color: "#eeffee",
            pointerEvents: "auto",
            display: "flex",
            gap: "14px",
            alignItems: "center",
            flexWrap: "wrap",
        });

        this.nameLabel = document.createElement("span");
        this.nameLabel.innerText = "Player";
        this.nameLabel.style.color = "#ffaa00";
        this.nameLabel.style.fontWeight = "bold";

        this.levelLabel = document.createElement("span");
        this.levelLabel.innerText = "Lv. 1";

        this.hpLabel = document.createElement("span");
        this.hpLabel.innerText = "100 / 100";
        this.hpLabel.style.color = "#ff6666";
        this.hpLabel.style.fontWeight = "bold";

        this.expLabel = document.createElement("span");
        this.expLabel.innerText = "EXP 0 / 35";
        this.expLabel.style.color = "#88ccff";

        this.pointsLabel = document.createElement("span");
        this.pointsLabel.innerText = "PTS 0";
        this.pointsLabel.style.color = "#ffe17a";

        topBar.appendChild(this.nameLabel);
        topBar.appendChild(this.levelLabel);
        topBar.appendChild(this.makeLabel("HP:"));
        topBar.appendChild(this.hpLabel);
        topBar.appendChild(this.expLabel);
        topBar.appendChild(this.pointsLabel);
        this.wrapper.appendChild(topBar);
    }

    private buildBottomActionBar() {
        const bottomBar = document.createElement("div");
        Object.assign(bottomBar.style, {
            position: "absolute",
            bottom: "0",
            left: "0",
            width: "100%",
            height: "48px",
            backgroundColor: "rgba(30, 20, 15, 0.95)",
            borderTop: "2px solid #554433",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px",
            pointerEvents: "auto",
        });

        ["Stats", "Jump", "Pack", "Quests", "Party", "Skills"].forEach((label) => {
            const button = document.createElement("button");
            button.innerText = label;

            Object.assign(button.style, {
                backgroundColor: "#3a2d21",
                border: "1px solid #554433",
                color: "#ddcca0",
                fontWeight: "bold",
                padding: "6px 16px",
                cursor: "pointer",
                fontFamily: "inherit",
                outline: "none",
            });

            button.addEventListener("mouseenter", () => {
                button.style.backgroundColor = "#4c392b";
            });
            button.addEventListener("mouseleave", () => {
                button.style.backgroundColor = "#3a2d21";
            });

            if (label === "Stats") {
                button.addEventListener("click", () => this.toggleStatsWindow());
            }

            bottomBar.appendChild(button);
        });

        this.wrapper.appendChild(bottomBar);
    }

    private buildStatsWindow() {
        this.statsWindow = document.createElement("div");
        Object.assign(this.statsWindow.style, {
            position: "absolute",
            bottom: "60px",
            left: "10px",
            width: "260px",
            backgroundColor: "rgba(20, 20, 25, 0.92)",
            border: "2px solid #554433",
            borderRadius: "4px",
            padding: "12px",
            display: "none",
            flexDirection: "column",
            gap: "8px",
            pointerEvents: "auto",
            color: "#eeeedd",
        });

        const title = document.createElement("div");
        title.innerText = "CHARACTER STATS";
        Object.assign(title.style, {
            textAlign: "center",
            fontWeight: "bold",
            borderBottom: "1px solid #554433",
            paddingBottom: "8px",
            marginBottom: "4px",
            color: "#ffaa00",
        });
        this.statsWindow.appendChild(title);

        this.addStatRow("HP", "hp", "#ff6666");
        this.addStatRow("Damage", "damage", "#ffaa00");
        this.addStatRow("Atk Speed", "speed", "#aaffaa");
        this.addStatRow("Move Speed", "move", "#88ccff");
        this.addStatRow("EXP", "exp", "#88ccff");
        this.addStatRow("Unspent", "points", "#ffe17a");

        const divider = document.createElement("div");
        Object.assign(divider.style, {
            height: "1px",
            backgroundColor: "#554433",
            margin: "4px 0",
        });
        this.statsWindow.appendChild(divider);

        this.addStatRow("STR", "str", "#ffffff", "str");
        this.addStatRow("AGI", "agi", "#ffffff", "agi");
        this.addStatRow("INT", "int", "#ffffff", "int");
        this.addStatRow("VIT", "vit", "#ffffff", "vit");

        this.wrapper.appendChild(this.statsWindow);
    }

    private addStatRow(
        label: string,
        key: string,
        color: string,
        allocatableStat?: AllocatableStat
    ) {
        if (!this.statsWindow) return;

        const row = document.createElement("div");
        Object.assign(row.style, {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "8px",
        });

        const left = document.createElement("span");
        left.innerText = label;
        left.style.fontWeight = "bold";

        const right = document.createElement("div");
        Object.assign(right.style, {
            display: "flex",
            alignItems: "center",
            gap: "8px",
        });

        const value = document.createElement("span");
        value.innerText = "0";
        value.style.color = color;
        value.style.minWidth = "48px";
        value.style.textAlign = "right";
        this.statLabels[key] = value;

        right.appendChild(value);

        if (allocatableStat) {
            const button = document.createElement("button");
            button.innerText = "+";
            button.disabled = true;
            Object.assign(button.style, {
                width: "24px",
                height: "24px",
                backgroundColor: "#3a2d21",
                border: "1px solid #554433",
                color: "#ffe17a",
                fontWeight: "bold",
                cursor: "default",
                fontFamily: "inherit",
                opacity: "0.45",
            });

            button.addEventListener("click", () => {
                if (button.disabled) return;
                this.onAllocateStat?.(allocatableStat);
            });

            this.statButtons[allocatableStat] = button;
            right.appendChild(button);
        }

        row.appendChild(left);
        row.appendChild(right);
        this.statsWindow.appendChild(row);
    }

    private toggleStatsWindow() {
        if (!this.statsWindow) return;
        this.statsWindow.style.display = this.statsWindow.style.display === "none" ? "flex" : "none";
    }

    private makeLabel(text: string): HTMLSpanElement {
        const label = document.createElement("span");
        label.innerText = text;
        return label;
    }

    private readNumber(value: unknown, fallback: number): number {
        return typeof value === "number" && Number.isFinite(value) ? value : fallback;
    }

    private readString(value: unknown, fallback: string): string {
        return typeof value === "string" && value.trim() ? value : fallback;
    }
}
