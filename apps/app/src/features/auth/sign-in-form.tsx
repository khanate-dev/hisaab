import { useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
	/** Emails a one-time code to the address, creating the User on first sign-in. */
	sendCode: (email: string) => Promise<void>;
	verifyCode: (email: string, code: string) => Promise<void>;
};

const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : "Something went wrong";

/** Email OTP sign-in: the only way in (ADR-0007). */
export const SignInForm = ({ sendCode, verifyCode }: Props) => {
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
			setError(messageOf(caught));
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
		<View style={styles.form}>
			{codeSentTo === null ? (
				<>
					<TextInput
						accessibilityLabel="Email"
						autoCapitalize="none"
						autoComplete="email"
						inputMode="email"
						onChangeText={setEmail}
						onSubmitEditing={submitEmail}
						placeholder="you@example.com"
						style={styles.input}
						value={email}
					/>
					<Button
						disabled={busy || email.trim() === ""}
						onPress={submitEmail}
						title="Send code"
					/>
				</>
			) : (
				<>
					<Text>We emailed a code to {codeSentTo}.</Text>
					<TextInput
						accessibilityLabel="Code"
						autoComplete="one-time-code"
						inputMode="numeric"
						onChangeText={setCode}
						onSubmitEditing={submitCode}
						style={styles.input}
						value={code}
					/>
					<Button
						disabled={busy || code.trim() === ""}
						onPress={submitCode}
						title="Sign in"
					/>
				</>
			)}
			{error !== null && <Text role="alert">{error}</Text>}
		</View>
	);
};

const styles = StyleSheet.create({
	form: { gap: 12, padding: 24 },
	input: { borderWidth: 1, paddingBlock: 8, paddingInline: 12 },
});
