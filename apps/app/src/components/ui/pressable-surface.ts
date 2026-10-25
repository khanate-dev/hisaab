import { useState } from "react";
import type {
	GestureResponderEvent,
	PressableProps,
	ViewStyle,
} from "react-native";

import { useColorSchemeName } from "@/theme/theme";
import { type ColorScheme, hardShadow, SHADOW_OFFSET } from "@/theme/tokens";

/**
 * The Neobrutal press-in (spec §4.1): at rest a hard offset shadow; pressed, the control moves by the shadow offset
 * and loses the shadow, as if pushed into the page.
 */
export const pressInStyle = (
	scheme: ColorScheme,
	size: keyof typeof SHADOW_OFFSET,
	pressed: boolean,
): ViewStyle =>
	pressed
		? {
				transform: [
					{ translateX: SHADOW_OFFSET[size] },
					{ translateY: SHADOW_OFFSET[size] },
				],
			}
		: { boxShadow: hardShadow(scheme, size) };

/**
 * Press-in style and handlers for a Pressable. The pressed state is tracked here, because NativeWind on web drops
 * a function `style` once `className` is set.
 */
export const usePressIn = (
	size: keyof typeof SHADOW_OFFSET,
	{
		onPressIn,
		onPressOut,
		disabled,
	}: Pick<PressableProps, "onPressIn" | "onPressOut" | "disabled">,
) => {
	const scheme = useColorSchemeName();
	const [pressed, setPressed] = useState(false);
	return {
		style: pressInStyle(scheme, size, pressed && !disabled),
		onPressIn: (event: GestureResponderEvent) => {
			setPressed(true);
			onPressIn?.(event);
		},
		onPressOut: (event: GestureResponderEvent) => {
			setPressed(false);
			onPressOut?.(event);
		},
	};
};
