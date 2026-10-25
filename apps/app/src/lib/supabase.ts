import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import { env } from "./env";

export const supabase = createClient(
	env.supabaseUrl,
	env.supabasePublishableKey,
	{
		auth: {
			storage: AsyncStorage,
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: false,
		},
	},
);
