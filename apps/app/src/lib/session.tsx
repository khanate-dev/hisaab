import type { Session } from "@supabase/supabase-js";
import { createContext, type ReactNode, use, useEffect, useState } from "react";

import { powersync, startSync, stopSync } from "./powersync";
import { supabase } from "./supabase";

/** `undefined` while the stored session is still loading. */
const SessionContext = createContext<Session | null | undefined>(undefined);

export const useSession = () => use(SessionContext);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
	const [session, setSession] = useState<Session | null | undefined>(undefined);

	useEffect(() => {
		void supabase.auth
			.getSession()
			.then(({ data }) => setSession(data.session));
		const { data } = supabase.auth.onAuthStateChange((event, next) => {
			setSession(next);
			// Only an explicit sign-out wipes the local replica; a remount or fast refresh must never lose data.
			if (event === "SIGNED_OUT") void stopSync();
		});
		return () => data.subscription.unsubscribe();
	}, []);

	const userId = session?.user.id;
	useEffect(() => {
		if (userId === undefined) return;
		void startSync();
		return () => void powersync.disconnect();
	}, [userId]);

	return <SessionContext value={session}>{children}</SessionContext>;
};
