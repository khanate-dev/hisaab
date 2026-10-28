import { useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { pushAvailable, pushBlocked, turnOnPush } from "@/lib/device/push";
import { deviceRegistered, forgetDevice } from "@/lib/device/push-registration";

import { type PushState, PushSetting } from "./push-setting";

const ON: PushState = "on";
const OFF: PushState = "off";
const UNAVAILABLE: PushState = "unavailable";
const DENIED: PushState = "denied";

/** Push on this device: whether the build can, whether the device allows it, and whether the server has it. */
const pushState = async (): Promise<PushState> => {
	if (!(await pushAvailable())) return UNAVAILABLE;
	if (await deviceRegistered()) return ON;
	return (await pushBlocked()) ? DENIED : OFF;
};

/** Push on this device, for the signed-in User (online calls). */
export const ThisDevicePush = ({ userId }: { userId: string }) => {
	const { t } = useLingui();
	const client = useQueryClient();
	const queryKey = ["device-push", userId] as const;
	const status = useQuery({ queryKey, queryFn: pushState });
	const change = useMutation({
		mutationFn: async (on: boolean) => {
			if (on) await turnOnPush();
			else await forgetDevice();
		},
		onSettled: () => client.invalidateQueries({ queryKey }),
	});
	const problem =
		change.isError || status.isError
			? t`Couldn't reach the server. Check you're online and try again.`
			: null;
	return (
		<PushSetting
			busy={change.isPending || status.isFetching}
			onTurnOff={() => change.mutate(false)}
			onTurnOn={() => change.mutate(true)}
			problem={problem}
			state={status.data ?? OFF}
		/>
	);
};
