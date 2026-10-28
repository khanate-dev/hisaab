import { describe, expect, it, jest } from "@jest/globals";
import { screen, userEvent } from "@testing-library/react-native";

import { render } from "@/test/render";

import { type AttachmentItem, AttachmentList } from "./attachment-list";

const receipt: AttachmentItem = {
	id: "a1",
	mediaType: "image/jpeg",
	fileName: "receipt.jpg",
	thumbnail: "data:image/jpeg;base64,AAAA",
	expired: false,
};
const bill: AttachmentItem = {
	id: "a2",
	mediaType: "application/pdf",
	fileName: "bill.pdf",
	thumbnail: null,
	expired: false,
};

const setup = async (
	props: Partial<Parameters<typeof AttachmentList>[0]> = {},
) => {
	const handlers = {
		onTakePhoto: jest.fn(),
		onChoosePhoto: jest.fn(),
		onChooseFromFiles: jest.fn(),
		onOpen: jest.fn((_id: string) => {}),
		onCloseView: jest.fn(),
		onRemove: jest.fn((_id: string) => {}),
	};
	await render(
		<AttachmentList
			attachments={[receipt, bill]}
			busy={false}
			canEdit
			problem={null}
			viewing={null}
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

	it("adds a photo taken now, one from the library, or a PDF or image from files", async () => {
		const { onTakePhoto, onChoosePhoto, onChooseFromFiles, user } =
			await setup();
		await user.press(screen.getByRole("button", { name: "Take photo" }));
		await user.press(screen.getByRole("button", { name: "Choose photo" }));
		await user.press(
			screen.getByRole("button", { name: "Choose PDF or image" }),
		);
		expect(onTakePhoto).toHaveBeenCalled();
		expect(onChoosePhoto).toHaveBeenCalled();
		expect(onChooseFromFiles).toHaveBeenCalled();
	});

	it("shows an opened image full size until it's closed", async () => {
		const { onCloseView, user } = await setup({
			viewing: { uri: "blob:receipt", name: "receipt.jpg" },
		});
		expect(screen.getByLabelText("receipt.jpg")).toBeVisible();
		await user.press(screen.getByRole("button", { name: "Close receipt.jpg" }));
		expect(onCloseView).toHaveBeenCalled();
	});

	it("takes no more than five", async () => {
		await setup({
			attachments: ["1", "2", "3", "4", "5"].map((id) => ({
				...receipt,
				id,
				fileName: `${id}.jpg`,
			})),
		});
		expect(screen.queryByRole("button", { name: "Take photo" })).toBeNull();
		expect(
			screen.getByText("An Entry takes 5 Attachments at most."),
		).toBeVisible();
	});

	it("shows a purged one as expired, and doesn't open it", async () => {
		const { onOpen, user } = await setup({
			attachments: [{ ...receipt, expired: true }],
		});
		const tile = screen.getByRole("button", { name: "receipt.jpg, expired" });
		expect(tile).toBeDisabled();
		await user.press(tile);
		expect(onOpen).not.toHaveBeenCalled();
	});

	it("says why a file didn't attach", async () => {
		await setup({
			problem: "That's over 10 MB; an Attachment takes 10 MB at most.",
		});
		expect(screen.getByRole("alert")).toHaveTextContent(/over 10 MB/);
	});

	it("lets a Viewer only open", async () => {
		await setup({ canEdit: false });
		expect(
			screen.getByRole("button", { name: "Open receipt.jpg" }),
		).toBeVisible();
		expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Choose PDF or image" }),
		).toBeNull();
	});

	it("isn't shown to a Viewer when there's nothing attached", async () => {
		await setup({ canEdit: false, attachments: [] });
		expect(screen.queryByText("Attachments")).toBeNull();
	});
});
