import type { Session } from "@supabase/supabase-js";
import { createContext, type ReactNode, use, useEffect, useState } from "react";

import {
	clearAttachments,
	startAttachments,
	stopAttachments,
} from "./attachments/queue";
import { powersync, startSync, stopSync } from "./powersync";
import { supabase } from "./supabase";

/** `undefined` while the stored session is still loading. */
const SessionContext = createContext<Session | null | undefined>(undefined);

export const useSession = () => use(SessionContext);

/** The signed-in User's id, for screens that only render behind the signed-in guard. */
export const useSignedInUserId = () => {
	const id = useSession()?.user.id;
	if (id === undefined)
		throw new Error("useSignedInUserId used outside the signed-in routes");
	return id;
};

export const SessionProvider = ({ children }: { children: ReactNode }) => {
	const [session, setSession] = useState<Session | null | undefined>(undefined);

	useEffect(() => {
		void supabase.auth
			.getSession()
			.then(({ data }) => setSession(data.session));
		const { data } = supabase.auth.onAuthStateChange((event, next) => {
			setSession(next);
			// Only an explicit sign-out wipes the local replica; a remount or fast refresh must never lose data.
			if (event === "SIGNED_OUT") void clearAttachments().finally(stopSync);
		});
		return () => data.subscription.unsubscribe();
	}, []);

	const userId = session?.user.id;
	useEffect(() => {
		if (userId === undefined) return;
		void startSync();
		// Files queued while offline upload once the device is back; the queue survives restarts.
		void startAttachments();
		return () => {
			void stopAttachments();
			void powersync.disconnect();
		};
	}, [userId]);

	return <SessionContext value={session}>{children}</SessionContext>;
};
