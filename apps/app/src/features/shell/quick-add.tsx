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

import { useIsWide } from "./layout";

type QuickAdd = { open: () => void };

const QuickAddContext = createContext<QuickAdd>({ open: () => {} });

/** Opens quick-add: a sheet on phones, a centred dialog on wide web (Navigation ticket, #17). */
export const useQuickAdd = () => use(QuickAddContext);

/** What quick-add shows; `close` closes the sheet or dialog. The shell hosts it, the Entries feature supplies it. */
export type QuickAddContent = (close: () => void) => ReactNode;

export const QuickAddProvider = ({
	children,
	content,
}: {
	children: ReactNode;
	content: QuickAddContent;
}) => {
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
						{content(() => setOpen(false))}
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
						{content(() => setOpen(false))}
					</SheetContent>
				</Sheet>
			)}
		</QuickAddContext>
	);
};
