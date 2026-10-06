# Hisaab is an Expo universal app, with web at full parity

Hisaab is built as one **Expo universal** app: Expo Router, React Native on iOS and Android, and react-native-web for the browser. Web gets full feature parity, offline included. The app is listed publicly on the App Store and Play from day 1. Binaries are built on EAS cloud's free tier, so no Mac is needed, and day-to-day changes ship as EAS Update OTA.

The other finalist was a PWA built with React DOM, with Capacitor added later. It would keep web first-class and give access to the whole DOM UI-kit ecosystem. We rejected it because a native-feeling iOS app, reliable native push and native biometrics outweigh those benefits. A PWA on iOS also depends on users installing it to the Home Screen and on WebKit's storage heuristics. Tauri mobile was ruled out earlier: it has no remote push and needs a heavy toolchain.

The costs we accept:

- **Web is the secondary target.** react-native-web is community-maintained, and DOM-only libraries need `'use dom'` components. The UI kit must be React Native-compatible.
- **Offline web storage is the risky part.** `expo-sqlite` on web is alpha and needs COOP/COEP headers. Local storage therefore sits behind a swappable per-platform seam, and the sync engine must have official Expo and web SDKs.
- **`expo-notifications` has no web push.**
- **Public listings bring a minimum compliance set:** a privacy policy and support URL, App Store privacy labels and the Play Data safety form, in-app account deletion, and Sign in with Apple whenever any social login is offered. Play's closed test (12 testers × 14 days) is a launch checklist item.

The biometric app lock is optional, per device, and off by default (`expo-local-authentication`, with a passcode fallback). It is a device preference, not synced data. Web has no app lock in v1.

Decided in [Platform pick](https://github.com/khanate-dev/hisaab/issues/11).
