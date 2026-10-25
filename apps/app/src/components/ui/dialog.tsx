import * as DialogPrimitive from "@rn-primitives/dialog";
import type { ReactNode } from "react";
import { View } from "react-native";

import { ThemeScope, useColorSchemeName } from "@/theme/theme";
import { hardShadow } from "@/theme/tokens";

import { TEXT_VARIANTS } from "./text";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** A centred card over a dimmed page. Pressing outside closes it. */
export const DialogContent = ({ children }: { children: ReactNode }) => {
	const scheme = useColorSchemeName();
	return (
		<DialogPrimitive.Portal>
			<ThemeScope className="absolute inset-0">
				<DialogPrimitive.Overlay className="absolute inset-0 items-center justify-center bg-black/50 p-6">
					<DialogPrimitive.Content
						className="w-full max-w-md gap-4 rounded-card border-3 border-border bg-surface p-5"
						style={{ boxShadow: hardShadow(scheme, "card") }}
					>
						{children}
					</DialogPrimitive.Content>
				</DialogPrimitive.Overlay>
			</ThemeScope>
		</DialogPrimitive.Portal>
	);
};

export const DialogTitle = ({ children }: { children: ReactNode }) => (
	<DialogPrimitive.Title
		className={TEXT_VARIANTS.title}
		role="heading"
	>
		{children}
	</DialogPrimitive.Title>
);

export const DialogDescription = ({ children }: { children: ReactNode }) => (
	<DialogPrimitive.Description className={TEXT_VARIANTS.muted}>
		{children}
	</DialogPrimitive.Description>
);

export const DialogFooter = ({ children }: { children: ReactNode }) => (
	<View className="flex-row justify-end gap-3">{children}</View>
);
