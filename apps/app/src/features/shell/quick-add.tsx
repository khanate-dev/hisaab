import { useLingui } from "@lingui/react/macro";
import { createContext, type ReactNode, use, useMemo, useState } from "react";

import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";

import { useIsWide } from "./layout";

type QuickAdd = { open: () => void };

const QuickAddContext = createContext<QuickAdd>({ open: () => {} });

/** Opens quick-add: a sheet on phones, a centred dialog on wide web (Navigation ticket, #17). */
export const useQuickAdd = () => use(QuickAddContext);

const Body = () => {
	const { t } = useLingui();
	return (
		<Text variant="muted">{t`Recording an Entry arrives with the quick-add keypad.`}</Text>
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
						<Body />
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
						<Body />
					</SheetContent>
				</Sheet>
			)}
		</QuickAddContext>
	);
};
