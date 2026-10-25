import { View } from "react-native";

import { categoryIcon, Icon } from "@/components/ui/icon";
import { useColors } from "@/theme/theme";
import { categoryColor } from "@/theme/tokens";

/** A Category's icon on its colour. Decorative: the Category's name always sits beside it. */
export const CategoryBadge = ({
	icon,
	color,
	size = 20,
}: {
	icon: string;
	color: string;
	size?: number;
}) => {
	const colors = useColors();
	return (
		<View
			aria-hidden
			className="items-center justify-center rounded-full border-2 border-border p-1.5"
			importantForAccessibility="no-hide-descendants"
			style={{ backgroundColor: categoryColor(color) }}
		>
			<Icon
				as={categoryIcon(icon)}
				color={colors["on-accent"]}
				size={size}
			/>
		</View>
	);
};
