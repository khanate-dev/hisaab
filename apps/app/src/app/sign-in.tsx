import { sendCode, verifyCode } from "@/features/auth/otp";
import { SignInForm } from "@/features/auth/sign-in-form";

export default function SignIn() {
	return (
		<SignInForm
			sendCode={sendCode}
			verifyCode={verifyCode}
		/>
	);
}
