// Neobrutal Pop (spec §4.1; the token table is in the Look & theme ticket, #3). The one source for colours:
// NativeWind reads them as CSS variables (see ThemeProvider), and primitives read them for hard shadows.

export type ColorScheme = "light" | "dark";

const shared = {
	primary: "#D24CFF",
	"on-accent": "#200D26",
	lime: "#C6F432",
	butter: "#FFD23F",
	cyan: "#5CE1E6",
	good: "#2BB673",
	warn: "#FFB020",
	bad: "#FF4D6D",
	violet: "#A78BFA",
};

type Token =
	| keyof typeof shared
	| "bg"
	| "surface"
	| "surface-2"
	| "ink"
	| "muted"
	| "border"
	| "shadow";

export const COLORS: Record<ColorScheme, Record<Token, string>> = {
	light: {
		...shared,
		bg: "#FFF4E6",
		surface: "#FFFFFF",
		"surface-2": "#FFE6FA",
		ink: "#200D26",
		muted: "#5B4763",
		border: "#200D26",
		shadow: "#200D26",
	},
	dark: {
		...shared,
		bg: "#160919",
		surface: "#26112D",
		"surface-2": "#3A1B44",
		ink: "#FFF4E6",
		muted: "#CDB8D6",
		border: "#FFF4E6",
		shadow: "#D24CFF",
	},
};

/** Hard offset shadows, no blur: cards cast 5px, buttons and chips 3px. A pressed control loses its shadow. */
export const SHADOW_OFFSET = { card: 5, control: 3 } as const;

export const hardShadow = (
	scheme: ColorScheme,
	size: keyof typeof SHADOW_OFFSET,
) =>
	`${SHADOW_OFFSET[size]}px ${SHADOW_OFFSET[size]}px 0 ${COLORS[scheme].shadow}`;

export const FONTS = {
	/** Headings and big numbers. */
	heading: "ArchivoBlack_400Regular",
	body: "SpaceGrotesk_400Regular",
	bodyMedium: "SpaceGrotesk_500Medium",
	bodyBold: "SpaceGrotesk_700Bold",
} as const;

/**
 * Category colours by stable Hisaab key (ADR-0008); the database stores the key, never a hex value, so the palette
 * can be retuned without touching data. They're the shared accents, the same in light and dark, with on-accent ink
 * reading on every one. Add keys; never rename or remove one.
 */
export const CATEGORY_COLORS = {
	magenta: shared.primary,
	lime: shared.lime,
	butter: shared.butter,
	cyan: shared.cyan,
	green: shared.good,
	orange: shared.warn,
	red: shared.bad,
	violet: shared.violet,
} as const satisfies Record<string, string>;

export type CategoryColorKey = keyof typeof CATEGORY_COLORS;

/** The colour for a stored key; unknown keys (say, from a newer build) show as butter, the default. */
export const categoryColor = (key: string): string =>
	Object.hasOwn(CATEGORY_COLORS, key)
		? CATEGORY_COLORS[key as CategoryColorKey]
		: CATEGORY_COLORS.butter;
