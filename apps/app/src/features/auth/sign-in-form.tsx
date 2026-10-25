import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

type Props = {
	/** Emails a one-time code to the address, creating the User on first sign-in. */
	sendCode: (email: string) => Promise<void>;
	verifyCode: (email: string, code: string) => Promise<void>;
};

/** Email OTP sign-in: the only way in (ADR-0007). */
export const SignInForm = ({ sendCode, verifyCode }: Props) => {
	const { t } = useLingui();
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		setError(null);
		try {
			await action();
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : t`Something went wrong`,
			);
		} finally {
			setBusy(false);
		}
	};

	const submitEmail = () =>
		run(async () => {
			const address = email.trim();
			await sendCode(address);
			setCodeSentTo(address);
		});

	const submitCode = () =>
		codeSentTo === null
			? undefined
			: run(() => verifyCode(codeSentTo, code.trim()));

	return (
		<View className="gap-4 p-6">
			{codeSentTo === null ? (
				<>
					<Input
						autoCapitalize="none"
						autoComplete="email"
						inputMode="email"
						label={t`Email`}
						onChangeText={setEmail}
						onSubmitEditing={submitEmail}
						placeholder={t`you@example.com`}
						value={email}
					/>
					<Button
						disabled={busy || email.trim() === ""}
						onPress={submitEmail}
					>
						{t`Send code`}
					</Button>
				</>
			) : (
				<>
					<Text>
						<Trans>We emailed a code to {codeSentTo}.</Trans>
					</Text>
					<Input
						autoComplete="one-time-code"
						inputMode="numeric"
						label={t`Code`}
						onChangeText={setCode}
						onSubmitEditing={submitCode}
						value={code}
					/>
					<Button
						disabled={busy || code.trim() === ""}
						onPress={submitCode}
					>
						{t`Sign in`}
					</Button>
				</>
			)}
			{error !== null && (
				<Text
					className="text-bad"
					role="alert"
				>
					{error}
				</Text>
			)}
		</View>
	);
};
