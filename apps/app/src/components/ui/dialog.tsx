import * as DialogPrimitive from "@rn-primitives/dialog";
import type { ReactNode } from "react";
import { View } from "react-native";

import { ModalSurface, ModalTitle } from "./modal";
import { TEXT_VARIANTS } from "./text";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = ModalTitle;

/** A centred card over a dimmed page. Pressing outside closes it. */
export const DialogContent = ({ children }: { children: ReactNode }) => (
	<ModalSurface
		overlayClassName="items-center justify-center p-6"
		surfaceClassName="w-full max-w-md rounded-card"
	>
		{children}
	</ModalSurface>
);

export const DialogDescription = ({ children }: { children: ReactNode }) => (
	<DialogPrimitive.Description className={TEXT_VARIANTS.muted}>
		{children}
	</DialogPrimitive.Description>
);

export const DialogFooter = ({ children }: { children: ReactNode }) => (
	<View className="flex-row justify-end gap-3">{children}</View>
);
