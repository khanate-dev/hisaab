import { useLingui } from "@lingui/react/macro";
import * as DialogPrimitive from "@rn-primitives/dialog";
import type { ReactNode } from "react";

import { Button } from "./button";
import { ModalSurface, ModalTitle } from "./modal";

// A Sheet is a Dialog anchored to the bottom edge, with its own Close button.
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = ModalTitle;

export const SheetContent = ({ children }: { children: ReactNode }) => {
	const { t } = useLingui();
	return (
		<ModalSurface
			overlayClassName="justify-end"
			surfaceClassName="max-h-[85%] rounded-t-card border-b-0"
		>
			{children}
			<SheetClose asChild>
				<Button variant="secondary">{t`Close`}</Button>
			</SheetClose>
		</ModalSurface>
	);
};
