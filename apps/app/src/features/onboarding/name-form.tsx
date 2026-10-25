import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

/** Onboarding, step one: the User's name, which their fellow Members will see. */
export const NameForm = ({
	onSubmit,
}: {
	onSubmit: (name: string) => Promise<void>;
}) => {
	const { t } = useLingui();
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const submit = async () => {
		setBusy(true);
		try {
			await onSubmit(name.trim());
		} finally {
			setBusy(false);
		}
	};

	return (
		<View className="gap-4">
			<Text variant="muted">{t`This is how the people you share a household with will see you.`}</Text>
			<Input
				autoCapitalize="words"
				autoComplete="name"
				label={t`Your name`}
				onChangeText={setName}
				onSubmitEditing={() => void submit()}
				value={name}
			/>
			<Button
				disabled={busy || name.trim() === ""}
				onPress={() => void submit()}
			>
				{t`Continue`}
			</Button>
		</View>
	);
};
