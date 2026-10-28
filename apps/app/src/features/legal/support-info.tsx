import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { Linking } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "./contact";

/** The support page the stores link to (spec §8). */
export const SupportInfo = () => {
	const { t } = useLingui();
	return (
		<>
			<Text>{t`For a question, a problem or a request about your data, email ${SUPPORT_EMAIL}.`}</Text>
			<Button onPress={() => void Linking.openURL(SUPPORT_MAILTO)}>
				{t`Email support`}
			</Button>
			<Text>{t`To delete your account, open Me & household in the app and choose Delete account.`}</Text>
			<Button
				onPress={() => router.push("/privacy")}
				variant="secondary"
			>
				{t`Privacy policy`}
			</Button>
		</>
	);
};
