import { describe, expect, it } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";
import { useState } from "react";

import { RadioGroup } from "./radio-group";
import { render } from "@/test/render";

const OPTIONS = [
	{ value: "cash", label: "Cash" },
	{ value: "bank", label: "Bank" },
] as const;

const Controlled = () => {
	const [value, setValue] = useState<"cash" | "bank">("cash");
	return (
		<RadioGroup
			label="Type"
			onValueChange={setValue}
			options={OPTIONS}
			value={value}
		/>
	);
};

describe("RadioGroup", () => {
	it("marks the chosen option checked and moves the choice on press", async () => {
		await render(<Controlled />);
		expect(screen.getByRole("radio", { name: "Cash" })).toBeChecked();
		expect(screen.getByRole("radio", { name: "Bank" })).not.toBeChecked();

		await userEvent.press(screen.getByRole("radio", { name: "Bank" }));

		expect(screen.getByRole("radio", { name: "Bank" })).toBeChecked();
		expect(screen.getByRole("radio", { name: "Cash" })).not.toBeChecked();
	});
});
