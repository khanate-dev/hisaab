import { inviteTokenFromLink } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

/** Joining with an Invite link someone pasted rather than opened: it goes to that link's landing. */
export const JoinWithLinkForm = ({
	onOpen,
}: {
	onOpen: (token: string) => void;
}) => {
	const { t } = useLingui();
	const [link, setLink] = useState("");
	const [error, setError] = useState<string | null>(null);

	const open = () => {
		const token = inviteTokenFromLink(link);
		if (token === null)
			return setError(
				t`That isn't an Invite link. Paste the whole link you were sent.`,
			);
		setError(null);
		onOpen(token);
	};

	return (
		<View className="gap-4">
			<Input
				autoCapitalize="none"
				label={t`Invite link`}
				onChangeText={setLink}
				value={link}
			/>
			{error !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{error}
				</Text>
			)}
			<Button
				disabled={link.trim() === ""}
				onPress={open}
			>
				{t`Open Invite`}
			</Button>
		</View>
	);
};
