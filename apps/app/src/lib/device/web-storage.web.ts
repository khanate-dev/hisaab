import { useEffect } from "react";

import { powersync } from "../powersync";

/**
 * On the web (spec §5): asks the browser to keep the local database (persistent storage), so it isn't cleared under
 * storage pressure, and warns before leaving while changes are still waiting to upload.
 */
export const useWebStorageGuard = () => {
	useEffect(() => {
		void navigator.storage?.persist?.();
		let waiting = 0;
		const abort = new AbortController();
		void (async () => {
			for await (const { rows } of powersync.watch(
				"SELECT count(*) AS n FROM ps_crud",
				[],
				{
					signal: abort.signal,
				},
			))
				waiting = Number(
					(rows?._array?.[0] as { n?: number } | undefined)?.n ?? 0,
				);
		})().catch(() => {});
		const warn = (event: BeforeUnloadEvent) => {
			if (waiting === 0) return;
			event.preventDefault();
			// Older browsers show their own words, but only when this is set.
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", warn);
		return () => {
			abort.abort();
			window.removeEventListener("beforeunload", warn);
		};
	}, []);
};
