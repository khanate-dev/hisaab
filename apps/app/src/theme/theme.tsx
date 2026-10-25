import { useColorScheme, vars } from "nativewind";
import { createContext, type ReactNode, use, useMemo } from "react";
import { View } from "react-native";

import { COLORS, type ColorScheme } from "./tokens";

const ThemeContext = createContext<ColorScheme>("light");

/** The active colour scheme, for what classes can't express (hard shadows, icon colours). */
export const useColorSchemeName = () => use(ThemeContext);
export const useColors = () => COLORS[useColorSchemeName()];

/** Every token as a CSS variable for NativeWind classes, for the active scheme. */
const useThemeVariables = (scheme: ColorScheme) =>
	useMemo(
		() =>
			vars(
				Object.fromEntries(
					Object.entries(COLORS[scheme]).map(([name, value]) => [
						`--color-${name}`,
						value,
					]),
				),
			),
		[scheme],
	);

/**
 * Re-applies the theme's variables. On web the portal renders Dialog and Sheet content outside the provider's View
 * (seen in Chrome: text without theme colours otherwise), so portalled content needs its own scope.
 */
export const ThemeScope = ({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) => (
	<View
		className={className}
		style={useThemeVariables(useColorSchemeName())}
	>
		{children}
	</View>
);

/** Follows the OS (spec §4.1) and exposes every token as a CSS variable for NativeWind classes. */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
	const scheme: ColorScheme =
		useColorScheme().colorScheme === "dark" ? "dark" : "light";
	return (
		<ThemeContext value={scheme}>
			<View
				className="flex-1 bg-bg"
				style={useThemeVariables(scheme)}
			>
				{children}
			</View>
		</ThemeContext>
	);
};
