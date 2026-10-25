// Component tests run on the iOS and Android presets (ADR-0010 amendment); both share everything else.

// jest-expo's default allow-list, plus packages that ship ESM, JSX or .mjs that Jest must transform.
const transformed = [
	".pnpm",
	"react-native",
	"@react-native",
	"@react-native-community",
	"expo",
	"@expo",
	"@expo-google-fonts",
	"react-navigation",
	"@react-navigation",
	"standard-navigation",
	"@powersync",
	"drizzle-orm",
	"@rn-primitives",
	"lucide-react-native",
	"nativewind",
	"react-native-css-interop",
	"react-native-svg",
	"@lingui",
	"@messageformat",
];

const shared = {
	transform: { "\\.mjs$": "babel-jest" },
	transformIgnorePatterns: [
		`/node_modules/(?!(${transformed.join("|")}))`,
		"/node_modules/react-native-reanimated/plugin/",
		"/node_modules/@react-native/babel-preset/",
	],
	// Lucide's ESM build is .mjs-only; its CommonJS build runs as is.
	moduleNameMapper: {
		"^lucide-react-native$":
			"<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
	},
};

/** @type {import('jest').Config} */
module.exports = {
	testTimeout: 20_000,
	projects: ["ios", "android"].map((platform) => ({
		displayName: platform,
		preset: `jest-expo/${platform}`,
		...shared,
	})),
};
