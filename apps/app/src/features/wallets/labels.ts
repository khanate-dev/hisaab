import type { WalletType } from "@hisaab/client-schema";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const WALLET_TYPE_LABELS: Record<WalletType, MessageDescriptor> = {
	cash: msg`Cash`,
	bank: msg`Bank`,
	mobile_wallet: msg`Mobile wallet`,
	credit_card: msg`Credit card`,
};
