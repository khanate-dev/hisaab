// @ts-check
const { COLORS } = require("./src/theme/tokens.ts");

/** Every token is a CSS variable, so one class works in light and dark (values set in ThemeProvider). */
const colors = Object.fromEntries(
	Object.keys(COLORS.light).map((name) => [name, `var(--color-${name})`]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./src/**/*.{ts,tsx}"],
	presets: [require("nativewind/preset")],
	// Tokens switch through CSS variables, not `dark:` classes; class mode follows the OS and allows a per-device override.
	darkMode: "class",
	theme: {
		extend: {
			colors,
			fontFamily: {
				heading: ["ArchivoBlack_400Regular"],
				body: ["SpaceGrotesk_400Regular"],
				"body-medium": ["SpaceGrotesk_500Medium"],
				"body-bold": ["SpaceGrotesk_700Bold"],
			},
			borderWidth: { 3: "3px" },
			borderRadius: { card: "12px", control: "10px" },
		},
	},
	plugins: [],
};
