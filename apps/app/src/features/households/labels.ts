import type { Role } from "@hisaab/client-schema";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const ROLE_LABELS: Record<Role, MessageDescriptor> = {
	admin: msg`Admin`,
	member: msg`Member`,
	viewer: msg`Viewer`,
};
