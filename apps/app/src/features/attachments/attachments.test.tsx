import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { type AttachmentItem, AttachmentList } from "./attachment-list";

const receipt: AttachmentItem = {
	id: "a1",
	mediaType: "image/jpeg",
	fileName: "receipt.jpg",
	thumbnail: "data:image/jpeg;base64,AAAA",
};
const bill: AttachmentItem = {
	id: "a2",
	mediaType: "application/pdf",
	fileName: "bill.pdf",
	thumbnail: null,
};

const setup = async (
	props: Partial<Parameters<typeof AttachmentList>[0]> = {},
) => {
	const handlers = {
		onAddPhoto: jest.fn(),
		onAddFile: jest.fn(),
		onOpen: jest.fn((_id: string) => {}),
		onRemove: jest.fn((_id: string) => {}),
	};
	await render(
		<AttachmentList
			attachments={[receipt, bill]}
			busy={false}
			canEdit
			problem={null}
			{...handlers}
			{...props}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
};

describe("AttachmentList", () => {
	it("opens and removes an Entry's images and PDFs", async () => {
		const { onOpen, onRemove, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Open bill.pdf" }));
		expect(onOpen).toHaveBeenCalledWith("a2");
		await user.press(
			screen.getByRole("button", { name: "Remove receipt.jpg" }),
		);
		expect(onRemove).toHaveBeenCalledWith("a1");
	});

	it("adds a photo or a file", async () => {
		const { onAddPhoto, onAddFile, user } = await setup();
		await user.press(screen.getByRole("button", { name: "Add photo" }));
		await user.press(screen.getByRole("button", { name: "Add file" }));
		expect(onAddPhoto).toHaveBeenCalled();
		expect(onAddFile).toHaveBeenCalled();
	});

	it("takes no more than five", async () => {
		await setup({
			attachments: ["1", "2", "3", "4", "5"].map((id) => ({
				...receipt,
				id,
				fileName: `${id}.jpg`,
			})),
		});
		expect(screen.queryByRole("button", { name: "Add photo" })).toBeNull();
		expect(
			screen.getByText("An Entry takes 5 Attachments at most."),
		).toBeVisible();
	});

	it("says why a file didn't attach", async () => {
		await setup({ problem: "That file is over 10 MB; try a smaller one." });
		expect(screen.getByRole("alert")).toHaveTextContent(/over 10 MB/);
	});

	it("lets a Viewer only open", async () => {
		await setup({ canEdit: false });
		expect(
			screen.getByRole("button", { name: "Open receipt.jpg" }),
		).toBeVisible();
		expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
		expect(screen.queryByRole("button", { name: "Add file" })).toBeNull();
	});

	it("isn't shown to a Viewer when there's nothing attached", async () => {
		await setup({ canEdit: false, attachments: [] });
		expect(screen.queryByText("Attachments")).toBeNull();
	});
});
