import type { Member } from "./use-members";

/** Whether this User is the household's only Admin, who can't leave or step down until someone else is one. */
export const isLastAdmin = (members: readonly Member[], userId: string) =>
	members.some(
		(member) => member.userId === userId && member.role === "admin",
	) && members.filter((member) => member.role === "admin").length === 1;
