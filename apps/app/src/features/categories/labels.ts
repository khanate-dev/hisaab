import type { CategoryKind } from "@hisaab/client-schema";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import type { CategoryIconKey } from "@/components/ui/icon";
import type { CategoryColorKey } from "@/theme/tokens";

export const CATEGORY_KIND_LABELS: Record<CategoryKind, MessageDescriptor> = {
	expense: msg`Expense`,
	income: msg`Income`,
};

/** What each icon is called, so a screen reader can tell them apart in the picker. */
export const CATEGORY_ICON_LABELS: Record<CategoryIconKey, MessageDescriptor> =
	{
		groceries: msg`Shopping cart`,
		dining: msg`Cutlery`,
		coffee: msg`Coffee cup`,
		transport: msg`Bus`,
		car: msg`Car`,
		travel: msg`Plane`,
		home: msg`House`,
		utilities: msg`Lightning bolt`,
		phone: msg`Phone`,
		health: msg`Heartbeat`,
		education: msg`Graduation cap`,
		clothing: msg`Shirt`,
		children: msg`Baby`,
		gifts: msg`Gift`,
		repairs: msg`Wrench`,
		salary: msg`Wallet`,
		income: msg`Coin`,
	};

export const CATEGORY_COLOR_LABELS: Record<
	CategoryColorKey,
	MessageDescriptor
> = {
	magenta: msg`Magenta`,
	lime: msg`Lime`,
	butter: msg`Yellow`,
	cyan: msg`Cyan`,
	green: msg`Green`,
	orange: msg`Orange`,
	red: msg`Red`,
	violet: msg`Violet`,
};
