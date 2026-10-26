import type { ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";

import { Text } from "./text";

type Props = Omit<PressableProps, "children" | "style"> & {
	children: ReactNode;
	/** Filled in the accent colour, say for a suggestion worth noticing. */
	accent?: boolean;
};

/** A small pill button for quick choices in a row, where a full Button would crowd the screen. */
export const Chip = ({ children, accent = false, ...props }: Props) => (
	<Pressable
		accessibilityRole="button"
		className={`min-h-9 justify-center rounded-full border-2 border-border ps-3 pe-3 py-1 ${accent ? "bg-butter" : "bg-surface"}`}
		{...props}
	>
		{typeof children === "string" ? (
			<Text
				className={accent ? "text-on-accent" : ""}
				variant="label"
			>
				{children}
			</Text>
		) : (
			children
		)}
	</Pressable>
);
