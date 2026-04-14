import { appendChildren, createButton, createElement, createMeter, setButtonDisabled, updateMeter } from "../dom";
import type { HudCallbacks, OnlinePlayerData, PartyInviteData, PartyMemberData, PartyStateData } from "../types";
import { WindowPanel } from "./WindowPanel";

export class PartyPanel {
    private shell: WindowPanel;
    private callbacks: HudCallbacks;
    private localSessionId = "";
    private onlinePlayers: OnlinePlayerData[] = [];
    private partyState: PartyStateData = {
        partyId: null,
        leaderId: null,
        members: [],
        invites: [],
    };

    private statusLabel: HTMLDivElement;
    private createPartyButton: HTMLButtonElement;
    private leavePartyButton: HTMLButtonElement;
    private inviteButton: HTMLButtonElement;
    private inviteWrap: HTMLDivElement;
    private inviteSelect: HTMLSelectElement;
    private memberList: HTMLDivElement;
    private inviteList: HTMLDivElement;

    constructor(host: HTMLElement, callbacks: HudCallbacks) {
        this.callbacks = callbacks;
        this.shell = new WindowPanel(host, {
            title: "PARTY",
            panelClass: "hud-panel--party",
        });

        this.statusLabel = createElement("div", "hud-panel-copy", "No active party.");

        const actionRow = createElement("div", "hud-inline-actions");
        this.createPartyButton = createButton("Create Party");
        this.leavePartyButton = createButton("Leave");
        this.createPartyButton.addEventListener("click", () => this.callbacks.onCreateParty?.());
        this.leavePartyButton.addEventListener("click", () => this.callbacks.onLeaveParty?.());
        appendChildren(actionRow, this.createPartyButton, this.leavePartyButton);

        this.inviteWrap = createElement("div", "hud-inline-actions");
        this.inviteSelect = createElement("select", "hud-select");
        this.inviteButton = createButton("Invite");
        this.inviteButton.addEventListener("click", () => {
            const targetId = this.inviteSelect.value;
            if (targetId) this.callbacks.onInviteParty?.(targetId);
        });
        appendChildren(this.inviteWrap, this.inviteSelect, this.inviteButton);

        const membersTitle = createElement("div", "hud-section-title", "Members");
        this.memberList = createElement("div", "hud-list");

        const invitesTitle = createElement("div", "hud-section-title", "Pending Invites");
        this.inviteList = createElement("div", "hud-list");

        appendChildren(
            this.shell.body,
            this.statusLabel,
            actionRow,
            this.inviteWrap,
            membersTitle,
            this.memberList,
            createElement("div", "hud-divider"),
            invitesTitle,
            this.inviteList
        );

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

    public setLocalSessionId(sessionId: string) {
        this.localSessionId = sessionId;
        this.render();
    }

    public updateOnlinePlayers(players: OnlinePlayerData[]) {
        this.onlinePlayers = players.slice();
        this.render();
    }

    public updatePartyState(state: PartyStateData) {
        this.partyState = state;
        this.render();
    }

    private render() {
        const isInParty = this.partyState.partyId !== null;
        const isLeader = isInParty && this.partyState.leaderId === this.localSessionId;
        const memberIds = new Set(this.partyState.members.map((member) => member.sessionId));
        const inviteablePlayers = this.onlinePlayers.filter(
            (player) => player.sessionId !== this.localSessionId && !memberIds.has(player.sessionId)
        );

        this.statusLabel.textContent = isInParty
            ? `Party ${this.partyState.partyId} | Members ${this.partyState.members.length} | Shared rewards online`
            : "No active party.";

        setButtonDisabled(this.createPartyButton, isInParty);
        setButtonDisabled(this.leavePartyButton, !isInParty);

        this.inviteWrap.classList.toggle("is-hidden", !isLeader);
        this.inviteSelect.replaceChildren();

        if (inviteablePlayers.length === 0) {
            const option = createElement("option", undefined, "No players to invite");
            option.value = "";
            this.inviteSelect.append(option);
        } else {
            inviteablePlayers.forEach((player) => {
                const option = createElement("option");
                option.value = player.sessionId;
                option.textContent = `${player.name} Lv.${player.level}`;
                this.inviteSelect.append(option);
            });
        }

        setButtonDisabled(this.inviteButton, !isLeader || inviteablePlayers.length === 0);

        this.memberList.replaceChildren();
        if (!isInParty) {
            this.memberList.append(
                createElement("div", "hud-empty", "Create a party to start grouping up.")
            );
        } else {
            this.partyState.members.forEach((member) => {
                this.memberList.append(this.renderMember(member, isLeader));
            });
        }

        this.inviteList.replaceChildren();
        if (this.partyState.invites.length === 0) {
            this.inviteList.append(createElement("div", "hud-empty", "No pending invites."));
        } else {
            this.partyState.invites.forEach((invite) => {
                this.inviteList.append(this.renderInvite(invite));
            });
        }
    }

    private renderMember(member: PartyMemberData, isLeader: boolean): HTMLDivElement {
        const row = createElement("div", "hud-list-card");
        const name = createElement(
            "div",
            "hud-list-card__title",
            `${member.isLeader ? "[Leader] " : ""}${member.name}`
        );
        const meta = createElement(
            "div",
            "hud-list-card__meta",
            `Lv.${member.level}`
        );
        const meter = createMeter("HP", "hp");
        meter.root.classList.add("hud-meter--compact");
        updateMeter(meter, member.hp, member.maxHp, `${member.hp} / ${member.maxHp}`);

        const info = createElement("div", "hud-list-card__content");
        appendChildren(info, name, meta, meter.root);
        row.append(info);

        if (isLeader && member.sessionId !== this.localSessionId) {
            const kickButton = createButton("Kick", ["hud-button", "hud-button--small"]);
            kickButton.addEventListener("click", () => {
                this.callbacks.onKickParty?.(member.sessionId);
            });
            row.append(kickButton);
        }

        return row;
    }

    private renderInvite(invite: PartyInviteData): HTMLDivElement {
        const row = createElement("div", "hud-list-card");
        const info = createElement("div", "hud-list-card__content");
        const title = createElement("div", "hud-list-card__title", `${invite.leaderName}'s party`);
        const meta = createElement("div", "hud-list-card__meta", "Invitation pending");
        appendChildren(info, title, meta);

        const controls = createElement("div", "hud-inline-actions");
        const acceptButton = createButton("Accept", ["hud-button", "hud-button--small"]);
        const declineButton = createButton("Decline", ["hud-button", "hud-button--small"]);

        acceptButton.addEventListener("click", () => {
            this.callbacks.onAcceptPartyInvite?.(invite.partyId);
        });
        declineButton.addEventListener("click", () => {
            this.callbacks.onDeclinePartyInvite?.(invite.partyId);
        });

        appendChildren(controls, acceptButton, declineButton);
        appendChildren(row, info, controls);
        return row;
    }
}
