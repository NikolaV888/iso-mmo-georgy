export type AllocatableStat = "str" | "agi" | "int" | "vit";
export type InventoryTab = "equip" | "use" | "etc" | "cash";

export interface HudPlayerData {
    name: string;
    level: number;
    exp: number;
    expToNextLevel: number;
    gold: number;
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

export interface OnlinePlayerData {
    sessionId: string;
    name: string;
    level: number;
}

export interface PartyMemberData {
    sessionId: string;
    name: string;
    level: number;
    hp: number;
    maxHp: number;
    isLeader: boolean;
}

export interface PartyInviteData {
    partyId: string;
    leaderId: string;
    leaderName: string;
}

export interface PartyStateData {
    partyId: string | null;
    leaderId: string | null;
    members: PartyMemberData[];
    invites: PartyInviteData[];
}

interface InventoryItem {
    name: string;
    count: number;
    description: string;
}

interface HudCallbacks {
    onAllocateStat?: (stat: AllocatableStat) => void;
    onCreateParty?: () => void;
    onInviteParty?: (targetId: string) => void;
    onKickParty?: (targetId: string) => void;
    onLeaveParty?: () => void;
    onAcceptPartyInvite?: (partyId: string) => void;
    onDeclinePartyInvite?: (partyId: string) => void;
}

export class HudManager {
    private wrapper: HTMLDivElement;
    private callbacks: HudCallbacks;
    private localSessionId = "";

    private statsWindow: HTMLDivElement | null = null;
    private packWindow: HTMLDivElement | null = null;
    private partyWindow: HTMLDivElement | null = null;

    private nameLabel: HTMLSpanElement | null = null;
    private hpLabel: HTMLSpanElement | null = null;
    private levelLabel: HTMLSpanElement | null = null;
    private expLabel: HTMLSpanElement | null = null;
    private pointsLabel: HTMLSpanElement | null = null;

    private statLabels: Record<string, HTMLSpanElement> = {};
    private statButtons: Partial<Record<AllocatableStat, HTMLButtonElement>> = {};

    private packTabButtons: Partial<Record<InventoryTab, HTMLButtonElement>> = {};
    private packGrid: HTMLDivElement | null = null;
    private packDetails: HTMLDivElement | null = null;
    private goldLabel: HTMLSpanElement | null = null;
    private activePackTab: InventoryTab = "equip";

    private partyStatus: HTMLDivElement | null = null;
    private partyMembers: HTMLDivElement | null = null;
    private inviteSelect: HTMLSelectElement | null = null;
    private inviteWrap: HTMLDivElement | null = null;
    private pendingInvites: HTMLDivElement | null = null;
    private createPartyButton: HTMLButtonElement | null = null;
    private leavePartyButton: HTMLButtonElement | null = null;

    private onlinePlayers: OnlinePlayerData[] = [];
    private partyState: PartyStateData = {
        partyId: null,
        leaderId: null,
        members: [],
        invites: [],
    };

    private readonly inventory: Record<InventoryTab, InventoryItem[]> = {
        equip: [
            { name: "Bronze Sword", count: 1, description: "A starter blade with a dependable swing." },
            { name: "Traveler Hat", count: 1, description: "Light headgear for new adventurers." },
            { name: "Leather Vest", count: 1, description: "Keeps the first few hits from stinging too much." },
        ],
        use: [
            { name: "Red Potion", count: 10, description: "Restores a little HP." },
            { name: "Jump Tonic", count: 3, description: "A draft for training airborne combos later." },
        ],
        etc: [
            { name: "Slime Gel", count: 7, description: "Soft residue collected from slimes." },
            { name: "Bat Wing", count: 2, description: "A fluttery trophy from cave pests." },
        ],
        cash: [],
    };

    constructor(callbacks: HudCallbacks = {}) {
        const existing = document.getElementById("hud-wrapper");
        if (existing) existing.remove();

        this.callbacks = callbacks;
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
        this.buildPackWindow();
        this.buildPartyWindow();
    }

    public destroy() {
        this.wrapper.remove();
        this.statsWindow = null;
        this.packWindow = null;
        this.partyWindow = null;
        this.nameLabel = null;
        this.hpLabel = null;
        this.levelLabel = null;
        this.expLabel = null;
        this.pointsLabel = null;
        this.statLabels = {};
        this.statButtons = {};
        this.packTabButtons = {};
        this.packGrid = null;
        this.packDetails = null;
        this.goldLabel = null;
        this.partyStatus = null;
        this.partyMembers = null;
        this.inviteSelect = null;
        this.inviteWrap = null;
        this.pendingInvites = null;
        this.createPartyButton = null;
        this.leavePartyButton = null;
    }

    public setLocalSessionId(sessionId: string) {
        this.localSessionId = sessionId;
        this.renderPartyWindow();
    }

    public updateLocalPlayer(player: Partial<HudPlayerData>) {
        const name = this.readString(player.name, "Player");
        const level = this.readNumber(player.level, 1);
        const exp = this.readNumber(player.exp, 0);
        const expToNextLevel = this.readNumber(player.expToNextLevel, 35);
        const gold = this.readNumber(player.gold, 0);
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
        if (this.goldLabel) this.goldLabel.innerText = `${gold.toLocaleString()} mesos`;

        if (this.statLabels.hp) this.statLabels.hp.innerText = `${hp} / ${maxHp}`;
        if (this.statLabels.damage) this.statLabels.damage.innerText = String(attackDamage);
        if (this.statLabels.speed) this.statLabels.speed.innerText = attackSpeed.toFixed(2);
        if (this.statLabels.move) this.statLabels.move.innerText = moveSpeed.toFixed(2);
        if (this.statLabels.exp) this.statLabels.exp.innerText = `${exp} / ${expToNextLevel}`;
        if (this.statLabels.points) this.statLabels.points.innerText = String(bonusStatPoints);
        if (this.statLabels.str) this.statLabels.str.innerText = String(str);
        if (this.statLabels.agi) this.statLabels.agi.innerText = String(agi);
        if (this.statLabels.int) this.statLabels.int.innerText = String(int);
        if (this.statLabels.vit) this.statLabels.vit.innerText = String(vit);

        const canAllocate = bonusStatPoints > 0;
        (["str", "agi", "int", "vit"] as AllocatableStat[]).forEach((stat) => {
            const button = this.statButtons[stat];
            if (!button) return;
            button.disabled = !canAllocate;
            button.style.opacity = canAllocate ? "1" : "0.45";
            button.style.cursor = canAllocate ? "pointer" : "default";
        });
    }

    public updateOnlinePlayers(players: OnlinePlayerData[]) {
        this.onlinePlayers = players.slice().sort((a, b) => a.name.localeCompare(b.name));
        this.renderPartyWindow();
    }

    public updatePartyState(state: Partial<PartyStateData>) {
        this.partyState = {
            partyId: this.readNullableString(state.partyId),
            leaderId: this.readNullableString(state.leaderId),
            members: Array.isArray(state.members) ? state.members : [],
            invites: Array.isArray(state.invites) ? state.invites : [],
        };
        this.renderPartyWindow();
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

        const actions: Array<{ label: string; onClick?: () => void }> = [
            { label: "Stats", onClick: () => this.toggleWindow(this.statsWindow) },
            { label: "Pack", onClick: () => this.toggleWindow(this.packWindow) },
            { label: "Quests" },
            { label: "Party", onClick: () => this.toggleWindow(this.partyWindow) },
            { label: "Skills" },
        ];

        actions.forEach(({ label, onClick }) => {
            const button = document.createElement("button");
            button.innerText = label;
            this.applyUiButtonStyle(button);
            button.addEventListener("mouseenter", () => {
                button.style.backgroundColor = "#4c392b";
            });
            button.addEventListener("mouseleave", () => {
                button.style.backgroundColor = "#3a2d21";
            });

            if (onClick) {
                button.addEventListener("click", onClick);
            } else {
                button.style.opacity = "0.65";
            }

            bottomBar.appendChild(button);
        });

        this.wrapper.appendChild(bottomBar);
    }

    private buildStatsWindow() {
        this.statsWindow = this.createWindow("CHARACTER STATS", {
            left: "10px",
            bottom: "60px",
            width: "260px",
        });

        this.addStatRow("HP", "hp", "#ff6666");
        this.addStatRow("Damage", "damage", "#ffaa00");
        this.addStatRow("Atk Speed", "speed", "#aaffaa");
        this.addStatRow("Move Speed", "move", "#88ccff");
        this.addStatRow("EXP", "exp", "#88ccff");
        this.addStatRow("Unspent", "points", "#ffe17a");

        this.statsWindow.appendChild(this.makeDivider());
        this.addStatRow("STR", "str", "#ffffff", "str");
        this.addStatRow("AGI", "agi", "#ffffff", "agi");
        this.addStatRow("INT", "int", "#ffffff", "int");
        this.addStatRow("VIT", "vit", "#ffffff", "vit");
    }

    private buildPackWindow() {
        this.packWindow = this.createWindow("PACK", {
            right: "10px",
            bottom: "60px",
            width: "360px",
        });

        const tabRow = document.createElement("div");
        Object.assign(tabRow.style, {
            display: "flex",
            gap: "6px",
            marginBottom: "10px",
            flexWrap: "wrap",
        });

        ([
            ["equip", "Equip"],
            ["use", "Use"],
            ["etc", "ETC"],
            ["cash", "Cash"],
        ] as Array<[InventoryTab, string]>).forEach(([tabId, label]) => {
            const button = document.createElement("button");
            button.innerText = label;
            this.applyUiButtonStyle(button);
            button.addEventListener("click", () => {
                this.activePackTab = tabId;
                this.renderPackWindow();
            });
            this.packTabButtons[tabId] = button;
            tabRow.appendChild(button);
        });

        this.packWindow.appendChild(tabRow);

        this.packGrid = document.createElement("div");
        Object.assign(this.packGrid.style, {
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "8px",
        });
        this.packWindow.appendChild(this.packGrid);

        this.packDetails = document.createElement("div");
        Object.assign(this.packDetails.style, {
            marginTop: "10px",
            minHeight: "52px",
            padding: "8px",
            backgroundColor: "rgba(35, 28, 23, 0.78)",
            border: "1px solid #554433",
            color: "#ddcca0",
            lineHeight: "1.4",
        });
        this.packWindow.appendChild(this.packDetails);

        const footer = document.createElement("div");
        Object.assign(footer.style, {
            marginTop: "8px",
            paddingTop: "8px",
            borderTop: "1px solid #554433",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#ffe17a",
        });

        const goldTitle = document.createElement("span");
        goldTitle.innerText = "Gold";
        goldTitle.style.fontWeight = "bold";
        footer.appendChild(goldTitle);

        this.goldLabel = document.createElement("span");
        this.goldLabel.innerText = "0 mesos";
        footer.appendChild(this.goldLabel);

        this.packWindow.appendChild(footer);

        this.renderPackWindow();
    }

    private buildPartyWindow() {
        this.partyWindow = this.createWindow("PARTY", {
            right: "380px",
            bottom: "60px",
            width: "300px",
        });

        this.partyStatus = document.createElement("div");
        Object.assign(this.partyStatus.style, {
            color: "#ddcca0",
            marginBottom: "8px",
        });
        this.partyWindow.appendChild(this.partyStatus);

        const actionRow = document.createElement("div");
        Object.assign(actionRow.style, {
            display: "flex",
            gap: "8px",
            marginBottom: "10px",
            flexWrap: "wrap",
        });

        this.createPartyButton = document.createElement("button");
        this.createPartyButton.innerText = "Create Party";
        this.applyUiButtonStyle(this.createPartyButton);
        this.createPartyButton.addEventListener("click", () => {
            this.callbacks.onCreateParty?.();
        });
        actionRow.appendChild(this.createPartyButton);

        this.leavePartyButton = document.createElement("button");
        this.leavePartyButton.innerText = "Leave";
        this.applyUiButtonStyle(this.leavePartyButton);
        this.leavePartyButton.addEventListener("click", () => {
            this.callbacks.onLeaveParty?.();
        });
        actionRow.appendChild(this.leavePartyButton);

        this.partyWindow.appendChild(actionRow);

        this.inviteWrap = document.createElement("div");
        Object.assign(this.inviteWrap.style, {
            display: "flex",
            gap: "8px",
            marginBottom: "10px",
        });

        this.inviteSelect = document.createElement("select");
        Object.assign(this.inviteSelect.style, {
            flex: "1",
            backgroundColor: "#1b1a1f",
            border: "1px solid #554433",
            color: "#eeeedd",
            padding: "6px",
            fontFamily: "inherit",
        });
        this.inviteWrap.appendChild(this.inviteSelect);

        const inviteButton = document.createElement("button");
        inviteButton.innerText = "Invite";
        this.applyUiButtonStyle(inviteButton);
        inviteButton.addEventListener("click", () => {
            const targetId = this.inviteSelect?.value ?? "";
            if (targetId) this.callbacks.onInviteParty?.(targetId);
        });
        this.inviteWrap.appendChild(inviteButton);

        this.partyWindow.appendChild(this.inviteWrap);

        const memberTitle = this.makeSectionTitle("Members");
        this.partyWindow.appendChild(memberTitle);

        this.partyMembers = document.createElement("div");
        Object.assign(this.partyMembers.style, {
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            minHeight: "92px",
        });
        this.partyWindow.appendChild(this.partyMembers);

        this.partyWindow.appendChild(this.makeDivider());

        const inviteTitle = this.makeSectionTitle("Pending Invites");
        this.partyWindow.appendChild(inviteTitle);

        this.pendingInvites = document.createElement("div");
        Object.assign(this.pendingInvites.style, {
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            minHeight: "54px",
        });
        this.partyWindow.appendChild(this.pendingInvites);

        this.renderPartyWindow();
    }

    private renderPackWindow() {
        if (!this.packWindow || !this.packGrid || !this.packDetails) return;

        (Object.entries(this.packTabButtons) as Array<[InventoryTab, HTMLButtonElement]>).forEach(
            ([tabId, button]) => {
                const active = tabId === this.activePackTab;
                button.style.backgroundColor = active ? "#6a4e36" : "#3a2d21";
                button.style.color = active ? "#fff0c7" : "#ddcca0";
            }
        );

        this.packGrid.innerHTML = "";
        const items = this.inventory[this.activePackTab];
        const slotCount = 20;

        for (let index = 0; index < slotCount; index += 1) {
            const slot = document.createElement("button");
            const item = items[index];
            Object.assign(slot.style, {
                minHeight: "64px",
                border: "1px solid #554433",
                backgroundColor: item ? "#2d241e" : "#171419",
                color: item ? "#eeeedd" : "#66584d",
                fontFamily: "inherit",
                padding: "6px",
                textAlign: "left",
                cursor: item ? "pointer" : "default",
            });

            if (item) {
                slot.innerText = item.count > 1 ? `${item.name}\nx${item.count}` : item.name;
                slot.addEventListener("click", () => {
                    this.packDetails!.innerText = `${item.name}\n${item.description}`;
                });
            } else {
                slot.innerText = "";
                slot.disabled = true;
            }

            this.packGrid.appendChild(slot);
        }

        if (items[0]) {
            this.packDetails.innerText = `${items[0].name}\n${items[0].description}`;
        } else {
            this.packDetails.innerText = "No items in this tab yet.";
        }
    }

    private renderPartyWindow() {
        if (
            !this.partyWindow ||
            !this.partyStatus ||
            !this.partyMembers ||
            !this.pendingInvites ||
            !this.inviteSelect ||
            !this.inviteWrap ||
            !this.createPartyButton ||
            !this.leavePartyButton
        ) {
            return;
        }

        const isInParty = this.partyState.partyId !== null;
        const isLeader = isInParty && this.partyState.leaderId === this.localSessionId;
        const memberIds = new Set(this.partyState.members.map((member) => member.sessionId));
        const inviteablePlayers = this.onlinePlayers.filter((player) => !memberIds.has(player.sessionId));

        this.partyStatus.innerText = isInParty
            ? `Party ${this.partyState.partyId} | Members ${this.partyState.members.length} | Shared EXP/Gold`
            : "No active party.";

        this.createPartyButton.disabled = isInParty;
        this.createPartyButton.style.opacity = isInParty ? "0.45" : "1";
        this.leavePartyButton.disabled = !isInParty;
        this.leavePartyButton.style.opacity = isInParty ? "1" : "0.45";

        this.inviteWrap.style.display = isLeader ? "flex" : "none";
        this.inviteSelect.innerHTML = "";

        if (inviteablePlayers.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.innerText = "No players to invite";
            this.inviteSelect.appendChild(option);
        } else {
            inviteablePlayers.forEach((player) => {
                const option = document.createElement("option");
                option.value = player.sessionId;
                option.innerText = `${player.name} Lv.${player.level}`;
                this.inviteSelect!.appendChild(option);
            });
        }

        this.partyMembers.innerHTML = "";
        if (!isInParty) {
            this.partyMembers.innerText = "Create a party to start grouping up.";
        } else {
            this.partyState.members.forEach((member) => {
                const row = document.createElement("div");
                Object.assign(row.style, {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 8px",
                    backgroundColor: "rgba(35, 28, 23, 0.78)",
                    border: "1px solid #554433",
                });

                const info = document.createElement("div");
                info.innerText = `${member.isLeader ? "[L] " : ""}${member.name}\nLv.${member.level} HP ${member.hp}/${member.maxHp}`;
                info.style.whiteSpace = "pre-line";

                row.appendChild(info);

                if (isLeader && member.sessionId !== this.localSessionId) {
                    const kickButton = document.createElement("button");
                    kickButton.innerText = "Kick";
                    this.applyUiButtonStyle(kickButton);
                    kickButton.addEventListener("click", () => {
                        this.callbacks.onKickParty?.(member.sessionId);
                    });
                    row.appendChild(kickButton);
                }

                this.partyMembers!.appendChild(row);
            });
        }

        this.pendingInvites.innerHTML = "";
        if (this.partyState.invites.length === 0) {
            this.pendingInvites.innerText = "No pending invites.";
            return;
        }

        this.partyState.invites.forEach((invite) => {
            const row = document.createElement("div");
            Object.assign(row.style, {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                padding: "6px 8px",
                backgroundColor: "rgba(35, 28, 23, 0.78)",
                border: "1px solid #554433",
            });

            const label = document.createElement("div");
            label.innerText = `${invite.leaderName}'s party`;
            row.appendChild(label);

            const controls = document.createElement("div");
            Object.assign(controls.style, {
                display: "flex",
                gap: "6px",
            });

            const acceptButton = document.createElement("button");
            acceptButton.innerText = "Accept";
            this.applyUiButtonStyle(acceptButton);
            acceptButton.addEventListener("click", () => {
                this.callbacks.onAcceptPartyInvite?.(invite.partyId);
            });
            controls.appendChild(acceptButton);

            const declineButton = document.createElement("button");
            declineButton.innerText = "Decline";
            this.applyUiButtonStyle(declineButton);
            declineButton.addEventListener("click", () => {
                this.callbacks.onDeclinePartyInvite?.(invite.partyId);
            });
            controls.appendChild(declineButton);

            row.appendChild(controls);
            this.pendingInvites!.appendChild(row);
        });
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
            this.applyUiButtonStyle(button);
            button.style.width = "24px";
            button.style.height = "24px";
            button.style.padding = "0";
            button.style.opacity = "0.45";
            button.addEventListener("click", () => {
                if (button.disabled) return;
                this.callbacks.onAllocateStat?.(allocatableStat);
            });
            this.statButtons[allocatableStat] = button;
            right.appendChild(button);
        }

        row.appendChild(left);
        row.appendChild(right);
        this.statsWindow.appendChild(row);
    }

    private createWindow(
        titleText: string,
        position: Partial<Record<"top" | "right" | "bottom" | "left" | "width", string>>
    ): HTMLDivElement {
        const window = document.createElement("div");
        Object.assign(window.style, {
            position: "absolute",
            backgroundColor: "rgba(20, 20, 25, 0.92)",
            border: "2px solid #554433",
            borderRadius: "4px",
            padding: "12px",
            display: "none",
            flexDirection: "column",
            gap: "8px",
            pointerEvents: "auto",
            color: "#eeeedd",
            ...position,
        });

        const title = document.createElement("div");
        title.innerText = titleText;
        Object.assign(title.style, {
            textAlign: "center",
            fontWeight: "bold",
            borderBottom: "1px solid #554433",
            paddingBottom: "8px",
            marginBottom: "4px",
            color: "#ffaa00",
        });
        window.appendChild(title);

        this.wrapper.appendChild(window);
        return window;
    }

    private toggleWindow(window: HTMLDivElement | null) {
        if (!window) return;
        window.style.display = window.style.display === "none" ? "flex" : "none";
    }

    private makeSectionTitle(text: string): HTMLDivElement {
        const title = document.createElement("div");
        title.innerText = text;
        title.style.color = "#ffe17a";
        title.style.fontWeight = "bold";
        return title;
    }

    private makeDivider(): HTMLDivElement {
        const divider = document.createElement("div");
        Object.assign(divider.style, {
            height: "1px",
            backgroundColor: "#554433",
            margin: "4px 0",
        });
        return divider;
    }

    private makeLabel(text: string): HTMLSpanElement {
        const label = document.createElement("span");
        label.innerText = text;
        return label;
    }

    private applyUiButtonStyle(button: HTMLButtonElement) {
        Object.assign(button.style, {
            backgroundColor: "#3a2d21",
            border: "1px solid #554433",
            color: "#ddcca0",
            fontWeight: "bold",
            padding: "6px 12px",
            cursor: "pointer",
            fontFamily: "inherit",
            outline: "none",
        });
    }

    private readNumber(value: unknown, fallback: number): number {
        return typeof value === "number" && Number.isFinite(value) ? value : fallback;
    }

    private readString(value: unknown, fallback: string): string {
        return typeof value === "string" && value.trim() ? value : fallback;
    }

    private readNullableString(value: unknown): string | null {
        return typeof value === "string" && value.trim() ? value : null;
    }
}
