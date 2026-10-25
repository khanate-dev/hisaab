import "react-native-url-polyfill/auto";

import {
	CONTRACT_VERSION,
	CONTRACT_VERSION_HEADER,
} from "@hisaab/client-schema";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import { env } from "./env";

export const supabase = createClient(
	env.supabaseUrl,
	env.supabasePublishableKey,
	{
		// Every request carries this build's contract version; the server answers too-old builds with 426 (ADR-0009).
		global: {
			headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
		},
		auth: {
			storage: AsyncStorage,
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: false,
		},
	},
);
