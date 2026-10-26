import { useQuery } from "@tanstack/react-query";

import { fetchInvitePreview } from "./api";
import { InviteLanding } from "./invite-landing";
import { joinInvite } from "./join-invite";

const INVITE_QUERY = "invite";

/** The landing for one Invite token, fetched online; signing in is the caller's. */
export const InviteJoin = ({
	token,
	signedIn,
	onSignIn,
	onJoined,
}: {
	token: string;
	signedIn: boolean;
	onSignIn: () => void;
	onJoined?: () => void;
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
				if (result.status === "joined" || result.status === "already_member")
					onJoined?.();
				return result;
			}}
			onSignIn={onSignIn}
			preview={preview.data}
			signedIn={signedIn}
		/>
	);
};
