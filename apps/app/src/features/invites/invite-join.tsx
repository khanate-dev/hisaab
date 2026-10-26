import { joinedHousehold } from "@hisaab/domain";
import { useQuery } from "@tanstack/react-query";

import { fetchInvitePreview } from "./api";
import { InviteLanding } from "./invite-landing";
import { joinInvite } from "./join-invite";

const INVITE_QUERY = "invite";

/** The landing for one Invite token, fetched online; signing in and leaving are the caller's. */
export const InviteJoin = ({
	token,
	onSignIn,
	onJoined,
	onLeave,
}: {
	token: string;
	onSignIn?: (() => void) | undefined;
	onJoined?: (() => void) | undefined;
	onLeave?: (() => void) | undefined;
}) => {
	const preview = useQuery({
		queryKey: [INVITE_QUERY, token],
		queryFn: () => fetchInvitePreview(token),
		retry: false,
	});
	return (
		<InviteLanding
			failed={preview.isError}
			onJoin={async () => {
				const result = await joinInvite(token);
				if (joinedHousehold(result) !== null) onJoined?.();
				return result;
			}}
			onLeave={onLeave}
			onSignIn={onSignIn}
			preview={preview.data}
		/>
	);
};
