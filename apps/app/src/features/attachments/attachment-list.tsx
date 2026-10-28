import { attachmentKind, MAX_ATTACHMENTS } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { Image, Pressable, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";

/** A full-size image fits the viewer, whatever its shape. */
const CONTAIN = "contain";

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
	/** Admins and Members add and remove; everyone opens. */
	canEdit: boolean;
	busy: boolean;
	/** Why the last add or open didn't work, if it didn't. */
	problem: string | null;
	/** An image being looked at, full size: its address and name. */
	viewing: { uri: string; name: string } | null;
	onTakePhoto: () => void;
	onChoosePhoto: () => void;
	onChooseFromFiles: () => void;
	onOpen: (attachmentId: string) => void;
	onCloseView: () => void;
	onRemove: (attachmentId: string) => void;
};

/** An Entry's Attachments (spec §3.4): up to 5 images or PDFs, each opened full size from its thumbnail. */
export const AttachmentList = ({
	attachments,
	canEdit,
	busy,
	problem,
	viewing,
	onTakePhoto,
	onChoosePhoto,
	onChooseFromFiles,
	onOpen,
	onCloseView,
	onRemove,
}: Props) => {
	const { t } = useLingui();
	const count = attachments.length;
	const limit = MAX_ATTACHMENTS;
	if (count === 0 && !canEdit) return null;
	const viewingName = viewing?.name;
	const kindName = (mediaType: string) =>
		attachmentKind(mediaType) === "pdf" ? t`PDF` : t`Image`;
	return (
		<View className="gap-3">
			<Text variant="title">{t`Attachments`}</Text>
			{viewing !== null && (
				<View className="gap-2">
					<Image
						accessibilityLabel={viewing.name}
						className="aspect-square w-full rounded-control border-2 border-border"
						resizeMode={CONTAIN}
						source={{ uri: viewing.uri }}
					/>
					<Button
						onPress={onCloseView}
						variant="secondary"
					>
						{t`Close ${viewingName}`}
					</Button>
				</View>
			)}
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
						const name = fileName ?? kindName(mediaType);
						return (
							<View
								className="w-28 gap-1"
								key={id}
							>
								<Pressable
									accessibilityLabel={t`Open ${name}`}
									className="h-28 w-28 items-center justify-center overflow-hidden rounded-control border-2 border-border bg-surface-2"
									disabled={busy}
									onPress={() => onOpen(id)}
									role="button"
								>
									{thumbnail === null ? (
										<Text variant="label">{kindName(mediaType)}</Text>
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
			{canEdit && count < limit && (
				<View className="flex-row flex-wrap gap-2">
					<Button
						disabled={busy}
						onPress={onTakePhoto}
						variant="secondary"
					>
						{t`Take photo`}
					</Button>
					<Button
						disabled={busy}
						onPress={onChoosePhoto}
						variant="secondary"
					>
						{t`Choose photo`}
					</Button>
					<Button
						disabled={busy}
						onPress={onChooseFromFiles}
						variant="secondary"
					>
						{t`Choose PDF or image`}
					</Button>
				</View>
			)}
			{canEdit && count >= limit && (
				<Text variant="muted">{t`An Entry takes ${limit} Attachments at most.`}</Text>
			)}
		</View>
	);
};
