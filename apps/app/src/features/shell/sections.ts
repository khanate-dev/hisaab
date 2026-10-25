import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	Bell,
	ChartPie,
	CircleUserRound,
	House,
	type LucideIcon,
	PiggyBank,
	ReceiptText,
} from "lucide-react-native";

type Section = {
	route: string;
	href: string;
	title: MessageDescriptor;
	icon: LucideIcon;
};

/** The four tab sections. */
export const SECTIONS = [
	{ route: "index", href: "/", title: msg`Home`, icon: House },
	{
		route: "entries",
		href: "/entries",
		title: msg`Entries`,
		icon: ReceiptText,
	},
	{ route: "budgets", href: "/budgets", title: msg`Budgets`, icon: PiggyBank },
	{ route: "reports", href: "/reports", title: msg`Reports`, icon: ChartPie },
] as const satisfies readonly Section[];

/** The placeholder route under the centre ＋; pressing it opens quick-add instead. */
export const ADD_ROUTE = "add";

/** Phone tab order: Home · Entries · ＋ · Budgets · Reports (Navigation ticket, #17); the ＋ sits after two sections. */
export const TAB_ORDER = [
	...SECTIONS.slice(0, 2).map((section) => section.route),
	ADD_ROUTE,
	...SECTIONS.slice(2).map((section) => section.route),
];

/** On wide web the top bar's destinations join the sidebar, after the sections. */
export const SIDEBAR_EXTRAS = [
	{
		route: "me",
		href: "/me",
		title: msg`Me & household`,
		icon: CircleUserRound,
	},
	{ route: "inbox", href: "/inbox", title: msg`Notifications`, icon: Bell },
] as const satisfies readonly Section[];
