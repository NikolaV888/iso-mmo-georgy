import { MapSchema } from "@colyseus/schema";
import { GameConfig } from "../config/GameConfig";
import { Player } from "../rooms/schema/GameState";

interface PartyRecord {
    id: string;
    leaderId: string;
    members: Set<string>;
}

export interface PartyMemberView {
    sessionId: string;
    name: string;
    level: number;
    hp: number;
    maxHp: number;
    isLeader: boolean;
}

export interface PartyInviteView {
    partyId: string;
    leaderId: string;
    leaderName: string;
}

export interface PartyStateView {
    partyId: string | null;
    leaderId: string | null;
    members: PartyMemberView[];
    invites: PartyInviteView[];
}

export class PartySystem {
    private parties = new Map<string, PartyRecord>();
    private partyByMember = new Map<string, string>();
    private invitesByTarget = new Map<string, Map<string, string>>();
    private nextPartyId = 1;

    createParty(ownerId: string): { partyId?: string; error?: string } {
        if (this.partyByMember.has(ownerId)) {
            return { error: "You are already in a party." };
        }

        this.clearInvitesForTarget(ownerId);

        const partyId = `party:${this.nextPartyId++}`;
        this.parties.set(partyId, {
            id: partyId,
            leaderId: ownerId,
            members: new Set([ownerId]),
        });
        this.partyByMember.set(ownerId, partyId);
        return { partyId };
    }

    invitePlayer(
        leaderId: string,
        targetId: string,
        players: MapSchema<Player>
    ): { partyId?: string; error?: string } {
        const party = this.getPartyForMember(leaderId);
        if (!party) {
            return { error: "Create a party first." };
        }

        if (party.leaderId !== leaderId) {
            return { error: "Only the party leader can invite players." };
        }

        if (party.members.size >= GameConfig.PARTY_MAX_SIZE) {
            return { error: "Your party is already full." };
        }

        if (leaderId === targetId) {
            return { error: "You cannot invite yourself." };
        }

        const target = players.get(targetId);
        if (!target || target.isMob) {
            return { error: "That player is not available." };
        }

        if (this.partyByMember.has(targetId)) {
            return { error: "That player is already in a party." };
        }

        const invites = this.invitesByTarget.get(targetId) ?? new Map<string, string>();
        if (invites.has(party.id)) {
            return { error: "Invite already sent." };
        }

        invites.set(party.id, leaderId);
        this.invitesByTarget.set(targetId, invites);
        return { partyId: party.id };
    }

    acceptInvite(targetId: string, partyId: string): { partyId?: string; error?: string } {
        if (this.partyByMember.has(targetId)) {
            return { error: "Leave your current party first." };
        }

        const invites = this.invitesByTarget.get(targetId);
        if (!invites?.has(partyId)) {
            return { error: "That invite is no longer available." };
        }

        const party = this.parties.get(partyId);
        if (!party) {
            invites.delete(partyId);
            if (invites.size === 0) this.invitesByTarget.delete(targetId);
            return { error: "That party no longer exists." };
        }

        if (party.members.size >= GameConfig.PARTY_MAX_SIZE) {
            invites.delete(partyId);
            if (invites.size === 0) this.invitesByTarget.delete(targetId);
            return { error: "That party is already full." };
        }

        party.members.add(targetId);
        this.partyByMember.set(targetId, party.id);
        this.clearInvitesForTarget(targetId);
        if (party.members.size >= GameConfig.PARTY_MAX_SIZE) {
            this.clearInvitesForParty(party.id);
        }
        return { partyId: party.id };
    }

    declineInvite(targetId: string, partyId: string): { error?: string } {
        const invites = this.invitesByTarget.get(targetId);
        if (!invites?.has(partyId)) {
            return { error: "That invite is no longer available." };
        }

        invites.delete(partyId);
        if (invites.size === 0) this.invitesByTarget.delete(targetId);
        return {};
    }

    kickMember(leaderId: string, targetId: string): { error?: string } {
        const party = this.getPartyForMember(leaderId);
        if (!party) {
            return { error: "You are not in a party." };
        }

        if (party.leaderId !== leaderId) {
            return { error: "Only the party leader can kick players." };
        }

        if (targetId === leaderId) {
            return { error: "Use Leave to leave your own party." };
        }

        if (!party.members.has(targetId)) {
            return { error: "That player is not in your party." };
        }

        party.members.delete(targetId);
        this.partyByMember.delete(targetId);
        this.clearInvitesForTarget(targetId);
        return {};
    }

    leaveParty(memberId: string): { error?: string; newLeaderId?: string | null; disbanded?: boolean } {
        if (!this.partyByMember.has(memberId)) {
            return { error: "You are not in a party." };
        }

        return this.removeMemberFromParty(memberId);
    }

    handleDisconnect(memberId: string): { newLeaderId?: string | null; disbanded?: boolean } {
        this.clearInvitesForTarget(memberId);
        return this.partyByMember.has(memberId)
            ? this.removeMemberFromParty(memberId)
            : {};
    }

    getPartyMemberIds(memberId: string): string[] {
        const party = this.getPartyForMember(memberId);
        return party ? Array.from(party.members) : [];
    }

    getRewardRecipients(
        sourceId: string,
        players: MapSchema<Player>,
        range: number
    ): string[] {
        const party = this.getPartyForMember(sourceId);
        const source = players.get(sourceId);

        if (!source || !party) {
            return source ? [sourceId] : [];
        }

        const recipients = Array.from(party.members).filter((memberId) => {
            const candidate = players.get(memberId);
            if (!candidate || candidate.isDead || candidate.isMob) return false;

            const dx = candidate.x - source.x;
            const dy = candidate.y - source.y;
            return Math.sqrt(dx * dx + dy * dy) <= range;
        });

        recipients.sort((a, b) => {
            if (a === sourceId) return -1;
            if (b === sourceId) return 1;
            return 0;
        });

        if (!recipients.includes(sourceId) && source && !source.isDead && !source.isMob) {
            recipients.unshift(sourceId);
        }

        return recipients.length > 0 ? recipients : [sourceId];
    }

    getPartyStateFor(sessionId: string, players: MapSchema<Player>): PartyStateView {
        const party = this.getPartyForMember(sessionId);
        const invites = this.invitesByTarget.get(sessionId);

        const members = party
            ? Array.from(party.members)
                .map((memberId) => {
                    const player = players.get(memberId);
                    if (!player) return null;

                    return {
                        sessionId: memberId,
                        name: player.name,
                        level: player.level,
                        hp: player.hp,
                        maxHp: player.maxHp,
                        isLeader: memberId === party.leaderId,
                    };
                })
                .filter((member): member is PartyMemberView => member !== null)
                .sort((a, b) => {
                    if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
                    return a.name.localeCompare(b.name);
                })
            : [];

        const inviteViews = invites
            ? Array.from(invites.entries()).map(([partyId, leaderId]) => ({
                partyId,
                leaderId,
                leaderName: players.get(leaderId)?.name ?? "Party Leader",
            }))
            : [];

        return {
            partyId: party?.id ?? null,
            leaderId: party?.leaderId ?? null,
            members,
            invites: inviteViews,
        };
    }

    private getPartyForMember(memberId: string): PartyRecord | null {
        const partyId = this.partyByMember.get(memberId);
        if (!partyId) return null;
        return this.parties.get(partyId) ?? null;
    }

    private removeMemberFromParty(
        memberId: string
    ): { newLeaderId: string | null; disbanded: boolean } {
        const party = this.getPartyForMember(memberId);
        if (!party) {
            return { newLeaderId: null, disbanded: false };
        }

        party.members.delete(memberId);
        this.partyByMember.delete(memberId);

        if (party.members.size === 0) {
            this.parties.delete(party.id);
            this.clearInvitesForParty(party.id);
            return { newLeaderId: null, disbanded: true };
        }

        if (party.leaderId === memberId) {
            party.leaderId = Array.from(party.members)[0];
            this.clearInvitesForParty(party.id);
        }

        return { newLeaderId: party.leaderId, disbanded: false };
    }

    private clearInvitesForTarget(targetId: string): void {
        this.invitesByTarget.delete(targetId);
    }

    private clearInvitesForParty(partyId: string): void {
        this.invitesByTarget.forEach((invites, targetId) => {
            if (!invites.has(partyId)) return;
            invites.delete(partyId);
            if (invites.size === 0) {
                this.invitesByTarget.delete(targetId);
            }
        });
    }
}
