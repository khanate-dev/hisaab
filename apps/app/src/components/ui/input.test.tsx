import { describe, expect, it } from "@jest/globals";
import { render, screen, userEvent } from "@testing-library/react-native";
import { useState } from "react";

import { Input } from "./input";

const Controlled = ({ error }: { error?: string }) => {
	const [value, setValue] = useState("");
	return (
		<Input
			error={error}
			label="Household name"
			onChangeText={setValue}
			value={value}
		/>
	);
};

describe("Input", () => {
	it("is found by its label and takes typing", async () => {
		await render(<Controlled />);
		await userEvent
			.setup()
			.type(screen.getByLabelText("Household name"), "Family");
		expect(screen.getByLabelText("Household name")).toHaveDisplayValue(
			"Family",
		);
	});

	it("announces its error", async () => {
		await render(<Controlled error="Give the household a name" />);
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Give the household a name",
		);
	});
});
