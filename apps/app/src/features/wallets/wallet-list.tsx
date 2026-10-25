import { Trans, useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

import { Balance } from "./balance";
import { WALLET_TYPE_LABELS } from "./labels";
import type { WalletSummary } from "./types";

type Props = {
	wallets: WalletSummary[];
	/** Opens a Wallet's detail; without it the list is read-only. */
	onOpen?: (walletId: string) => void;
};

/** Every Wallet with its Balance, derived from its Entries (ADR-0002). */
export const WalletList = ({ wallets, onOpen }: Props) => {
	const { i18n } = useLingui();
	if (wallets.length === 0) {
		return (
			<Text
				role="status"
				variant="muted"
			>
				<Trans>No Wallets yet.</Trans>
			</Text>
		);
	}

	return (
		<View
			className="gap-3"
			role="list"
		>
			{wallets.map((wallet) => {
				const content = (
					<View className="flex-row flex-wrap items-end justify-between gap-x-3 gap-y-1">
						<View className="min-w-[50%] grow gap-1">
							<Text variant="title">{wallet.name}</Text>
							<Text variant="muted">
								{i18n._(WALLET_TYPE_LABELS[wallet.type])}
							</Text>
						</View>
						<Balance
							balance={wallet.balance}
							type={wallet.type}
						/>
					</View>
				);
				// A read-only row is one accessible list item; an openable one keeps its button reachable on its own.
				return onOpen ? (
					<View
						key={wallet.id}
						role="listitem"
					>
						<Card onPress={() => onOpen(wallet.id)}>{content}</Card>
					</View>
				) : (
					<Card
						accessible
						key={wallet.id}
						role="listitem"
					>
						{content}
					</Card>
				);
			})}
		</View>
	);
};
