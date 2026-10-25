import * as DialogPrimitive from "@rn-primitives/dialog";
import type { ReactNode } from "react";
import { View } from "react-native";

import { ThemeScope, useColorSchemeName } from "@/theme/theme";
import { hardShadow } from "@/theme/tokens";

import { Button } from "./button";
import { TEXT_VARIANTS } from "./text";

// A Sheet is a Dialog anchored to the bottom edge, with its own Close button.
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = ({ children }: { children: ReactNode }) => {
	const scheme = useColorSchemeName();
	return (
		<DialogPrimitive.Portal>
			<ThemeScope className="absolute inset-0">
				<DialogPrimitive.Overlay className="absolute inset-0 justify-end bg-black/50">
					<DialogPrimitive.Content
						className="max-h-[85%] gap-4 rounded-t-card border-3 border-b-0 border-border bg-surface p-5"
						style={{ boxShadow: hardShadow(scheme, "card") }}
					>
						{children}
						<SheetClose asChild>
							<Button variant="secondary">Close</Button>
						</SheetClose>
					</DialogPrimitive.Content>
				</DialogPrimitive.Overlay>
			</ThemeScope>
		</DialogPrimitive.Portal>
	);
};

export const SheetTitle = ({ children }: { children: ReactNode }) => (
	<DialogPrimitive.Title
		className={TEXT_VARIANTS.title}
		role="heading"
	>
		{children}
	</DialogPrimitive.Title>
);

export const SheetHeader = ({ children }: { children: ReactNode }) => (
	<View className="gap-1">{children}</View>
);
