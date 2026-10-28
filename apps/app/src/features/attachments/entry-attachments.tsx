import { attachments } from "@hisaab/client-schema";
import {
	attachmentProblem,
	isAttachmentMediaType,
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { asc, eq } from "drizzle-orm";
import { useState } from "react";

import { addAttachment, removeAttachment } from "@/lib/attachments/actions";
import { openAttachment } from "@/lib/attachments/open-attachment";
import {
	NotAnAttachment,
	type PreparedAttachment,
	pickFromFiles,
	pickPhoto,
	takePhoto,
} from "@/lib/attachments/pick";
import { db } from "@/lib/powersync";

import { AttachmentList } from "./attachment-list";

const MEGABYTES = MAX_ATTACHMENT_BYTES / (1024 * 1024);

/** An Entry's Attachments, with picking, shrinking, queueing for upload and opening wired in. */
export const EntryAttachments = ({
	entry,
	userId,
	canEdit,
}: {
	entry: { id: string; household_id: string };
	userId: string;
	canEdit: boolean;
}) => {
	const { t } = useLingui();
	const rows = useQuery(
		toCompilableQuery(
			db
				.select()
				.from(attachments)
				.where(eq(attachments.entry_id, entry.id))
				.orderBy(asc(attachments.created_at)),
		),
	).data;
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const [viewing, setViewing] = useState<{ uri: string; name: string } | null>(
		null,
	);
	const limit = MAX_ATTACHMENTS;
	const megabytes = MEGABYTES;

	const add = async (pick: () => Promise<PreparedAttachment | null>) => {
		setProblem(null);
		setBusy(true);
		try {
			const picked = await pick();
			if (!picked) return;
			// An expired one no longer counts against the five.
			const reason = attachmentProblem(
				rows.filter((r) => r.purged_at === null).length,
				{
					mediaType: picked.mediaType,
					bytes: picked.data.byteLength,
				},
			);
			if (reason === "full")
				return setProblem(t`An Entry takes ${limit} Attachments at most.`);
			if (reason === "size")
				return setProblem(
					t`That's over ${megabytes} MB; an Attachment takes ${megabytes} MB at most.`,
				);
			if (reason === "type")
				return setProblem(t`An Attachment is an image or a PDF.`);
			await addAttachment(entry, userId, picked);
		} catch (error) {
			setProblem(
				error instanceof NotAnAttachment
					? t`An Attachment is an image or a PDF.`
					: t`That didn't attach. Try again.`,
			);
		} finally {
			setBusy(false);
		}
	};

	const open = async (attachmentId: string) => {
		const row = rows.find((r) => r.id === attachmentId);
		if (
			!row ||
			row.purged_at !== null ||
			!isAttachmentMediaType(row.media_type)
		)
			return;
		setProblem(null);
		setBusy(true);
		try {
			const opened = await openAttachment({
				...row,
				media_type: row.media_type,
			});
			if ("image" in opened)
				setViewing({ uri: opened.image, name: row.file_name ?? t`Image` });
		} catch {
			setProblem(
				t`That Attachment opens once you're online and it has uploaded.`,
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<AttachmentList
			attachments={rows.map((r) => ({
				id: r.id,
				mediaType: r.media_type,
				fileName: r.file_name,
				thumbnail: r.thumbnail,
				expired: r.purged_at !== null,
			}))}
			busy={busy}
			canEdit={canEdit}
			onChooseFromFiles={() => void add(pickFromFiles)}
			onChoosePhoto={() => void add(pickPhoto)}
			onCloseView={() => setViewing(null)}
			onOpen={(id) => void open(id)}
			onRemove={(id) => {
				if (viewing !== null) setViewing(null);
				void removeAttachment(id).catch(() =>
					setProblem(t`That didn't remove. Try again.`),
				);
			}}
			onTakePhoto={() => void add(takePhoto)}
			problem={problem}
			viewing={viewing}
		/>
	);
};
