import { Text as NativeText, type TextProps } from "react-native";

export const TEXT_VARIANTS = {
	body: "font-body text-base text-ink",
	muted: "font-body text-sm text-muted",
	label: "font-body-medium text-sm text-ink",
	heading: "font-heading text-2xl text-ink",
	title: "font-heading text-lg text-ink",
	/** Amounts and big numbers: the heading face with tabular figures, so digits line up. */
	figure: "font-heading text-2xl text-ink tabular-nums",
} as const;

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
