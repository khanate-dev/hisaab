import { MAX_ATTACHMENTS } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Image, Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";

/** An Attachment as the list shows it. */
export type AttachmentItem = {
	id: string;
	mediaType: string;
	fileName: string | null;
	/** A small JPEG data URL, for images. */
	thumbnail: string | null;
};

type Props = {
	attachments: readonly AttachmentItem[];
	/** Admins and Members attach and remove; everyone opens. */
	canEdit: boolean;
	busy: boolean;
	/** Why the last attach didn't work, if it didn't. */
	problem: string | null;
	onAddPhoto: () => void;
	onAddFile: () => void;
	onOpen: (attachmentId: string) => void;
	onRemove: (attachmentId: string) => void;
};

/** An Entry's Attachments (spec §3.4): up to 5 images or PDFs, each opened full size from its thumbnail. */
export const AttachmentList = ({
	attachments,
	canEdit,
	busy,
	problem,
	onAddPhoto,
	onAddFile,
	onOpen,
	onRemove,
}: Props) => {
	const { t } = useLingui();
	const count = attachments.length;
	const most = MAX_ATTACHMENTS;
	if (count === 0 && !canEdit) return null;
	return (
		<View className="gap-3">
			<Text variant="title">{t`Attachments`}</Text>
			{count === 0 ? (
				<Text
					role="status"
					variant="muted"
				>
					{t`No Attachments yet.`}
				</Text>
			) : (
				<View className="flex-row flex-wrap gap-3">
					{attachments.map(({ id, mediaType, fileName, thumbnail }) => {
						const name =
							fileName ?? (mediaType === "application/pdf" ? t`PDF` : t`Image`);
						return (
							<View
								className="w-28 gap-1"
								key={id}
							>
								<Pressable
									accessibilityLabel={t`Open ${name}`}
									className="h-28 w-28 items-center justify-center overflow-hidden rounded-control border-2 border-border bg-surface-2"
									onPress={() => onOpen(id)}
									role="button"
								>
									{thumbnail === null ? (
										<Text variant="label">
											{mediaType === "application/pdf" ? t`PDF` : t`Image`}
										</Text>
									) : (
										<Image
											accessible={false}
											className="h-full w-full"
											source={{ uri: thumbnail }}
										/>
									)}
								</Pressable>
								<Text
									numberOfLines={1}
									variant="muted"
								>
									{name}
								</Text>
								{canEdit && (
									<Chip
										accessibilityLabel={t`Remove ${name}`}
										onPress={() => onRemove(id)}
									>
										{t`Remove`}
									</Chip>
								)}
							</View>
						);
					})}
				</View>
			)}
			{problem !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{problem}
				</Text>
			)}
			{canEdit && count < most && (
				<View className="flex-row flex-wrap gap-2">
					<Button
						disabled={busy}
						onPress={onAddPhoto}
						variant="secondary"
					>
						{t`Add photo`}
					</Button>
					<Button
						disabled={busy}
						onPress={onAddFile}
						variant="secondary"
					>
						{t`Add file`}
					</Button>
				</View>
			)}
			{canEdit && count >= most && (
				<Text variant="muted">{t`An Entry takes ${most} Attachments at most.`}</Text>
			)}
		</View>
	);
};
