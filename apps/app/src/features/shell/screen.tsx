import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { Text } from "@/components/ui/text";

import { useIsWide } from "./layout";

/** A screen's content: capped at about 640px on the phone layout (Navigation ticket, #17), wider next to the sidebar. */
export const Screen = ({
	title,
	children,
}: {
	title: string;
	children?: ReactNode;
}) => {
	const wide = useIsWide();
	return (
		<ScrollView contentContainerClassName="grow">
			<View
				className={`w-full gap-4 self-center p-6 ${wide ? "max-w-[960px]" : "max-w-[640px]"}`}
			>
				<Text variant="heading">{title}</Text>
				{children}
			</View>
		</ScrollView>
	);
};
