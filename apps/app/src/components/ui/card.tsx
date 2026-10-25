import type { ReactNode } from "react";
import { Pressable, type PressableProps, View } from "react-native";

import { useColorSchemeName } from "@/theme/theme";
import { hardShadow } from "@/theme/tokens";

import { usePressIn } from "./pressable-surface";
import { Text } from "./text";

type Props = Omit<PressableProps, "children" | "style"> & {
	children: ReactNode;
	className?: string;
};

const CARD = "gap-2 rounded-card border-3 border-border bg-surface p-4";

/** A bordered panel with a hard shadow. With an action it's a button that presses in. */
export const Card = ({
	children,
	onPress,
	className = "",
	...props
}: Props) => {
	const scheme = useColorSchemeName();
	const pressIn = usePressIn("card", props);
	const content =
		typeof children === "string" ? <Text>{children}</Text> : children;
	if (!onPress) {
		return (
			<View
				className={`${CARD} ${className}`}
				style={{ boxShadow: hardShadow(scheme, "card") }}
			>
				{content}
			</View>
		);
	}
	return (
		<Pressable
			accessibilityRole="button"
			className={`${CARD} ${className}`}
			onPress={onPress}
			{...props}
			{...pressIn}
		>
			{content}
		</Pressable>
	);
};
