import { occurrenceKey as keyOf } from "@hisaab/domain";

import type { Due } from "./types";

/** One Occurrence's key on the device: its rule and due date, as its id is derived from them. */
export const occurrenceKey = ({ rule, dueOn }: Due) => keyOf(rule.id, dueOn);
