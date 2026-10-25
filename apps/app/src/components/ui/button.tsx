import type { ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";

import { usePressIn } from "./pressable-surface";
import { Text } from "./text";

const VARIANTS = {
	/** Magenta with ink text; never white on magenta (contrast). */
	primary: "bg-primary",
	secondary: "bg-surface",
	accent: "bg-butter",
} as const;

type Props = Omit<PressableProps, "children" | "style"> & {
	children: ReactNode;
	variant?: keyof typeof VARIANTS;
	className?: string;
};

export const Button = ({
	children,
	variant = "primary",
	disabled,
	className = "",
	...props
}: Props) => {
	const pressIn = usePressIn("control", { ...props, disabled });
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ disabled: Boolean(disabled) }}
			className={`min-h-12 flex-row items-center justify-center gap-2 rounded-control border-3 border-border px-5 py-3 ${VARIANTS[variant]} ${disabled ? "opacity-50" : ""} ${className}`}
			disabled={disabled}
			{...props}
			{...pressIn}
		>
			{typeof children === "string" ? (
				<Text
					className={variant === "secondary" ? "" : "text-on-accent"}
					variant="label"
				>
					{children}
				</Text>
			) : (
				children
			)}
		</Pressable>
	);
};
