import { supabase } from "@/lib/supabase";

export const sendCode = async (email: string) => {
	const { error } = await supabase.auth.signInWithOtp({
		email,
		options: { shouldCreateUser: true },
	});
	if (error) throw error;
};

export const verifyCode = async (email: string, code: string) => {
	const { error } = await supabase.auth.verifyOtp({
		email,
		token: code,
		type: "email",
	});
	if (error) throw error;
};
