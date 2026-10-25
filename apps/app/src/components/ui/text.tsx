import { Text as NativeText, type TextProps } from "react-native";

import { classes } from "./classes";

export const TEXT_VARIANTS = {
	body: classes("font-body text-base text-ink"),
	muted: classes("font-body text-sm text-muted"),
	label: classes("font-body-medium text-sm text-ink"),
	heading: classes("font-heading text-2xl text-ink"),
	title: classes("font-heading text-lg text-ink"),
	/**
	 * Amounts and big numbers: the heading face with tabular figures, so digits line up. Archivo Black has no `tnum`
	 * feature, but every digit is the same width (667 units), so its figures are tabular already.
	 */
	figure: classes("font-heading text-2xl text-ink tabular-nums"),
};

type Props = TextProps & {
	variant?: keyof typeof TEXT_VARIANTS;
	className?: string;
};

export const Text = ({ variant = "body", className = "", ...props }: Props) => (
	<NativeText
		className={`${TEXT_VARIANTS[variant]} ${className}`}
		role={variant === "heading" || variant === "title" ? "heading" : undefined}
		{...props}
	/>
);
