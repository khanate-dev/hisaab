import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { ChartPie, House, PiggyBank, ReceiptText } from "lucide-react-native";

/** The four sections, in tab order; the centre ＋ sits between Entries and Budgets. */
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
] as const satisfies readonly {
	route: string;
	href: string;
	title: MessageDescriptor;
	icon: unknown;
}[];

/** The placeholder route under the centre ＋; pressing it opens quick-add instead. */
export const ADD_ROUTE = "add";
