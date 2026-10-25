import { FLOW_KINDS, type FlowKind } from "@hisaab/domain";
import { useLingui } from "@lingui/react/macro";
import { router } from "expo-router";
import { createContext, type ReactNode, use, useMemo, useState } from "react";
import { View } from "react-native";

import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

import { useIsWide } from "./layout";

type QuickAdd = { open: () => void };

const QuickAddContext = createContext<QuickAdd>({ open: () => {} });

/** Opens quick-add: a sheet on phones, a centred dialog on wide web (Navigation ticket, #17). */
export const useQuickAdd = () => use(QuickAddContext);

/** Until the quick-add keypad lands (#35), quick-add opens the full Entry form. */
const Body = ({ onChoose }: { onChoose: () => void }) => {
	const { t } = useLingui();
	const record = (kind: FlowKind) => {
		onChoose();
		router.push(`/entries/new?kind=${kind}`);
	};
	return (
		<View className="gap-3">
			<Button
				onPress={() => record(FLOW_KINDS[0])}
			>{t`Record an Expense`}</Button>
			<Button
				onPress={() => record(FLOW_KINDS[1])}
				variant="secondary"
			>
				{t`Record an Income`}
			</Button>
		</View>
	);
};

export const QuickAddProvider = ({ children }: { children: ReactNode }) => {
	const { t } = useLingui();
	const wide = useIsWide();
	const [isOpen, setOpen] = useState(false);
	const value = useMemo(() => ({ open: () => setOpen(true) }), []);

	return (
		<QuickAddContext value={value}>
			{children}
			{wide ? (
				<Dialog
					onOpenChange={setOpen}
					open={isOpen}
				>
					<DialogContent>
						<DialogTitle>{t`New entry`}</DialogTitle>
						<Body onChoose={() => setOpen(false)} />
						<DialogClose asChild>
							<Button variant="secondary">{t`Close`}</Button>
						</DialogClose>
					</DialogContent>
				</Dialog>
			) : (
				<Sheet
					onOpenChange={setOpen}
					open={isOpen}
				>
					<SheetContent>
						<SheetTitle>{t`New entry`}</SheetTitle>
						<Body onChoose={() => setOpen(false)} />
					</SheetContent>
				</Sheet>
			)}
		</QuickAddContext>
	);
};
