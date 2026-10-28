import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";
import { Linking } from "react-native";

import { render } from "@/test/render";

import { PrivacyPolicy } from "./privacy-policy";
import { SupportInfo } from "./support-info";

describe("PrivacyPolicy", () => {
	it("discloses the 30-day backup retention and the support contact", async () => {
		await render(<PrivacyPolicy />);
		expect(
			screen.getByText(/kept for at most 30 days, then deleted/),
		).toBeOnTheScreen();
		expect(screen.getByText(/support@hisaab\.khanate\.pk/)).toBeOnTheScreen();
	});
});

describe("SupportInfo", () => {
	it("opens an email to support", async () => {
		const open = jest
			.spyOn(Linking, "openURL")
			.mockResolvedValue(undefined as never);
		await render(<SupportInfo />);
		await userEvent.press(
			screen.getByRole("button", { name: "Email support" }),
		);
		expect(open).toHaveBeenCalledWith("mailto:support@hisaab.khanate.pk");
	});
});
