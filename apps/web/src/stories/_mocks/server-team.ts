/**
 * Mock for @/server/team used in Storybook stories. The real module reads the
 * better-auth member/invitation tables; stories drive the shapes the members
 * page renders and the write paths it offers.
 */

export type TeamData = {
	organization: { id: string; name: string; role: string };
	members: { id: string; userId: string; name: string | null; email: string; role: string }[];
	invitations: { id: string; email: string; role: string; expiresAt: string | null }[];
	canManage: boolean;
};

let _team: TeamData = {
	organization: { id: "org-1", name: "Acme", role: "admin" },
	members: [
		{ id: "m1", userId: "u1", name: "Demo User", email: "demo@example.com", role: "admin" },
		{ id: "m2", userId: "u2", name: "Sam Rivers", email: "sam@example.com", role: "member" },
	],
	invitations: [{ id: "i1", email: "pending@example.com", role: "member", expiresAt: null }],
	canManage: true,
};

export function setMockTeam(team: Partial<TeamData>) {
	_team = { ..._team, ...team };
}

export const listTeamFn = async () => _team;
export const inviteTeamMemberFn = async () => ({ ok: true });
export const cancelInvitationFn = async () => ({ ok: true });
export const removeTeamMemberFn = async () => ({ ok: true });
