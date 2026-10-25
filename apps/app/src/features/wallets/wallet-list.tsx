import type { WalletType } from "@hisaab/client-schema";
import { isNegative, type Money } from "@hisaab/domain";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { View } from "react-native";

import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { formatMoney } from "@/lib/format";

export type WalletSummary = {
	id: string;
	name: string;
	type: WalletType;
	balance: Money;
};

const TYPE_LABELS: Record<WalletType, MessageDescriptor> = {
	cash: msg`Cash`,
	bank: msg`Bank`,
	mobile_wallet: msg`Mobile wallet`,
	credit_card: msg`Credit card`,
};

/** Every Wallet with its Balance, derived from its Entries (ADR-0002). */
export const WalletList = ({ wallets }: { wallets: WalletSummary[] }) => {
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
			{wallets.map((wallet) => (
				<Card
					accessible
					key={wallet.id}
					role="listitem"
				>
					<View className="flex-row flex-wrap items-end justify-between gap-x-3 gap-y-1">
						<View className="min-w-[50%] grow gap-1">
							<Text variant="title">{wallet.name}</Text>
							<Text variant="muted">{i18n._(TYPE_LABELS[wallet.type])}</Text>
						</View>
						<Text
							className={`max-w-full shrink break-all text-end ${isNegative(wallet.balance) ? "text-bad" : ""}`}
							variant="figure"
						>
							{formatMoney(wallet.balance)}
						</Text>
					</View>
				</Card>
			))}
		</View>
	);
};
