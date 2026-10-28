import { attachments } from "@hisaab/client-schema";
import {
	attachmentPath,
	attachmentProblem,
	isAttachmentMediaType,
} from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { asc, eq } from "drizzle-orm";
import { openURL } from "expo-linking";
import { useState } from "react";

import { attachFile, removeAttachment } from "@/lib/attachments/actions";
import {
	type PreparedFile,
	pickFile,
	pickPhoto,
	UnsupportedFile,
} from "@/lib/attachments/pick";
import { attachmentLink } from "@/lib/attachments/queue";
import { db } from "@/lib/powersync";

import { AttachmentList } from "./attachment-list";

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

	const add = async (pick: () => Promise<PreparedFile | null>) => {
		setProblem(null);
		setBusy(true);
		try {
			const file = await pick();
			if (!file) return;
			const why = attachmentProblem(rows.length, {
				mediaType: file.mediaType,
				bytes: file.data.byteLength,
			});
			if (why === "full")
				return setProblem(t`An Entry takes 5 Attachments at most.`);
			if (why === "size")
				return setProblem(t`That file is over 10 MB; try a smaller one.`);
			if (why === "type") return setProblem(t`Attach an image or a PDF.`);
			await attachFile(entry, userId, file);
		} catch (error) {
			setProblem(
				error instanceof UnsupportedFile
					? t`Attach an image or a PDF.`
					: t`That didn't attach. Try again.`,
			);
		} finally {
			setBusy(false);
		}
	};

	const open = async (attachmentId: string) => {
		const row = rows.find((r) => r.id === attachmentId);
		if (!row || !isAttachmentMediaType(row.media_type)) return;
		try {
			await openURL(
				await attachmentLink(
					attachmentPath(row.household_id, row.id, row.media_type),
				),
			);
		} catch {
			setProblem(t`That opens once you're online and it has uploaded.`);
		}
	};

	return (
		<AttachmentList
			attachments={rows.map((r) => ({
				id: r.id,
				mediaType: r.media_type,
				fileName: r.file_name,
				thumbnail: r.thumbnail,
			}))}
			busy={busy}
			canEdit={canEdit}
			onAddFile={() => void add(pickFile)}
			onAddPhoto={() => void add(pickPhoto)}
			onOpen={(id) => void open(id)}
			onRemove={(id) => void removeAttachment(id)}
			problem={problem}
		/>
	);
};
