import { describe, expect, it, jest } from "@jest/globals";
import { PortalHost } from "@rn-primitives/portal";
import { Text } from "react-native";
import { userEvent, within } from "@testing-library/react-native";
import { renderRouter, screen } from "expo-router/testing-library";

import { WithI18n } from "@/test/i18n";

import { TabsLayout } from "./tabs-layout";

jest.mock("@/features/households/use-households", () => ({
	useHouseholds: () => [
		{ id: "h1", name: "Personal", isPersonal: true, role: "admin" },
	],
}));
jest.mock("@/lib/session", () => ({
	useSession: () => ({ user: { id: "u1" } }),
}));

const width = { current: 390 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
	__esModule: true,
	default: () => ({
		width: width.current,
		height: 800,
		scale: 2,
		fontScale: 1,
	}),
}));

const stub = (name: string) => () => <Text role="heading">{name} screen</Text>;

const renderShell = async () => {
	const view = renderRouter(
		{
			"(tabs)/_layout": () => (
				<WithI18n>
					<TabsLayout />
					<PortalHost />
				</WithI18n>
			),
			"(tabs)/index": stub("Home"),
			"(tabs)/entries": stub("Entries"),
			"(tabs)/add": stub("Add"),
			"(tabs)/budgets": stub("Budgets"),
			"(tabs)/reports": stub("Reports"),
			me: stub("Me & household"),
			inbox: stub("Inbox"),
		},
		{ initialUrl: "/" },
	);
	// The router helpers sit on the returned promise itself; awaiting it would drop them.
	await view;
	return { user: userEvent.setup(), pathname: () => view.getPathname() };
};

describe("phone navigation", () => {
	it("moves between the tabs", async () => {
		width.current = 390;
		const { user, pathname } = await renderShell();

		for (const [tab, path] of [
			["Entries", "/entries"],
			["Budgets", "/budgets"],
			["Reports", "/reports"],
			["Home", "/"],
		] as const) {
			await user.press(screen.getByRole("tab", { name: tab }));
			expect(pathname()).toBe(path);
		}
	});

	it("opens quick-add from the centre ＋ without leaving the tab", async () => {
		width.current = 390;
		const { user, pathname } = await renderShell();

		await user.press(screen.getByRole("button", { name: "New entry" }));
		expect(
			await screen.findByRole("heading", { name: "New entry" }),
		).toBeOnTheScreen();
		expect(pathname()).toBe("/");
	});

	it("reaches Me & household, the switcher and the inbox from the top bar", async () => {
		width.current = 390;
		const { user, pathname } = await renderShell();

		await user.press(
			screen.getByRole("button", { name: "Switch household: Personal" }),
		);
		expect(
			await screen.findByRole("heading", { name: "Households" }),
		).toBeOnTheScreen();
		await user.press(screen.getByRole("button", { name: "Close" }));

		await user.press(screen.getByRole("button", { name: "Notifications" }));
		expect(pathname()).toBe("/inbox");
	});

	it("opens Me & household from the avatar", async () => {
		width.current = 390;
		const { user, pathname } = await renderShell();

		await user.press(screen.getByRole("button", { name: "Me & household" }));
		expect(pathname()).toBe("/me");
	});
});

describe("wide web navigation", () => {
	it("puts the household, New entry and every destination in the sidebar, with no tabs or top bar", async () => {
		width.current = 1280;
		const { user, pathname } = await renderShell();

		expect(screen.queryByRole("tab")).toBeNull();
		// The sidebar is a navigation landmark; it stays non-grouping so each link is reachable on its own.
		const sidebar = screen.getByLabelText("Sections");
		expect(
			within(sidebar).getByRole("button", {
				name: "Switch household: Personal",
			}),
		).toBeOnTheScreen();
		for (const destination of [
			"Home",
			"Entries",
			"Budgets",
			"Reports",
			"Me & household",
			"Notifications",
		]) {
			expect(
				within(sidebar).getByRole("link", { name: destination }),
			).toBeOnTheScreen();
		}
		expect(
			screen.getAllByRole("button", { name: "Switch household: Personal" }),
		).toHaveLength(1);

		for (const [destination, path] of [
			["Budgets", "/budgets"],
			["Me & household", "/me"],
		] as const) {
			await user.press(
				within(sidebar).getByRole("link", { name: destination }),
			);
			expect(pathname()).toBe(path);
		}
	});

	it("opens quick-add as a dialog from + New entry", async () => {
		width.current = 1280;
		const { user } = await renderShell();

		await user.press(screen.getByRole("button", { name: "New entry" }));
		expect(
			await screen.findByRole("heading", { name: "New entry" }),
		).toBeOnTheScreen();
	});
});
