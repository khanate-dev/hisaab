import { useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { pushAvailable, turnOnPush } from "@/lib/device/push";
import { deviceRegistered, forgetDevice } from "@/lib/device/push-registration";

import { type PushState, PushSetting } from "./push-setting";

const ON: PushState = "on";
const OFF: PushState = "off";
const UNAVAILABLE: PushState = "unavailable";
const DENIED: PushState = "denied";

const KEY = ["device-push"] as const;

/** Push on this device: whether the build can, and whether the server has this device (online calls). */
export const ThisDevicePush = ({ userId }: { userId: string }) => {
	const { t } = useLingui();
	const client = useQueryClient();
	const [denied, setDenied] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const status = useQuery({
		queryKey: KEY,
		queryFn: async () =>
			(await pushAvailable())
				? (await deviceRegistered())
					? ON
					: OFF
				: UNAVAILABLE,
	});
	const change = useMutation({
		mutationFn: async (on: boolean) => {
			setProblem(null);
			if (!on) return forgetDevice();
			setDenied((await turnOnPush(userId)) === DENIED);
		},
		onError: () =>
			setProblem(t`That didn't change. Check you're online and try again.`),
		onSettled: () => client.invalidateQueries({ queryKey: KEY }),
	});
	if (status.data === undefined) return null;
	const state: PushState = denied && status.data === OFF ? DENIED : status.data;
	return (
		<PushSetting
			busy={change.isPending}
			onTurnOff={() => change.mutate(false)}
			onTurnOn={() => change.mutate(true)}
			problem={problem}
			state={state}
		/>
	);
};
