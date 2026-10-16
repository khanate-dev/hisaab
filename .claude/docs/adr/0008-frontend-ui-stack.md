# The UI is NativeWind + owned react-native-reusables components, over a reactive local database

On top of Expo Router, Hisaab styles everything with **NativeWind**. Components are copied in from **react-native-reusables** and the repo owns them. They sit on the headless, accessible `@rn-primitives`. Neobrutal Pop needs every button and card to have a hard offset shadow, thick ink borders and a press-in state. Owning unstyled components makes that trivial, whereas Tamagui, Gluestack or any kit with a built-in visual style would mean fighting its defaults. Unistyles was rejected because it ships no primitives, so we would have to rebuild the accessible dialog, select and popover ourselves.

- **Theme.** Tokens are CSS variables defined for light and dark. The theme follows the OS, and the System/Light/Dark override is a **per-device** preference, never synced. This follows the biometric-lock precedent.
- **Icons.** Lucide at a global stroke width of 2.5. Category icons go through a **curated registry**: the database stores a stable Hisaab key, such as `groceries`, never a Lucide name, and unknown keys fall back to a default icon. This keeps the bundle small and stops a library rename from breaking stored data.
- **Charts.** react-native-gifted-charts (SVG, so it works on web with no WASM) sits behind our own chart components. Custom `react-native-svg` + d3 is the escape hatch. victory-native was rejected because of its roughly 3MB CanvasKit payload on web. `'use dom'` + Recharts was rejected because of how it feels inside a webview.
- **Data.** Local data is read through **Drizzle via the PowerSync driver**, using reactive watched queries. The local database is the cache, so **TanStack Query** is used only for online-only calls (edge functions, exchange rates, signed URLs, account deletion).
- **Forms, validation and state.** TanStack Form, Zod, and Zustand for client-only state.
- **i18n.** The app launches in English, but every string goes through Lingui, styling uses logical properties only (enforced by lint), and numbers and dates go through `Intl`. Urdu/RTL can then be added later without a rewrite.

Decided in [Frontend meta-framework & UI/component library](https://github.com/khanate-dev/hisaab/issues/8).
