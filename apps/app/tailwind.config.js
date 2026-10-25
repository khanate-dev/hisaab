// @ts-check
const { COLORS, FONTS } = require("./src/theme/tokens.ts");

/** Every token is a CSS variable, so one class works in light and dark (values set in ThemeProvider). */
const colors = Object.fromEntries(
	Object.keys(COLORS.light).map((name) => [name, `var(--color-${name})`]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./src/**/*.{ts,tsx}"],
	presets: [require("nativewind/preset")],
	// Tokens switch through CSS variables, not `dark:` classes. Class mode still follows the OS, and unlike media mode
	// it lets the app set the scheme, which the per-device override (#65) needs.
	darkMode: "class",
	theme: {
		extend: {
			colors,
			fontFamily: {
				heading: [FONTS.heading],
				body: [FONTS.body],
				"body-medium": [FONTS.bodyMedium],
				"body-bold": [FONTS.bodyBold],
			},
			borderWidth: { 3: "3px" },
			borderRadius: { card: "12px", control: "10px" },
		},
	},
	plugins: [],
};
