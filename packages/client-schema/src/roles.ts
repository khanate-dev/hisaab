/** A Member's Role within one household (CONTEXT.md). Mirrors the `memberships.role` check in Postgres. */
export const ROLES = ["admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];
