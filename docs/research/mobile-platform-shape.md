# Mobile + web platform shape

- **Date:** 2026-10-05
- **Ticket:** [khanate-dev/hisaab#2](https://github.com/khanate-dev/hisaab/issues/2)
- **Scope:** Which shape to use for mobile + web: PWA, native wrapper (Capacitor, Tauri mobile) or universal React (Expo / RN + react-native-web). Givens: TS + React, offline-first with multi-device household sync, solo dev, cheap hosting. Sync engines are only checked for platform support here. Choosing one is a later ticket.
- **Versions checked (npm/GitHub, 2026-10-05):** Capacitor `8.5.2`, Tauri `2.12.1` (v3 is in alpha), Expo SDK `57.0.26` (SDK 58 is in beta with RN 0.88 RC), React Native `0.87.1`, react-native-web `0.21.3`.

---

## TL;DR

**Two finalists:**

1. **A PWA built with React DOM, with Capacitor added later only if needed.** This is the recommended default.
2. **Expo universal app** (Expo Router, React Native on device, react-native-web for the browser).

**Deciding factor: how much iOS matters on day 1.**

- If the household is mostly on Android/desktop, or iOS users will install the app to the Home Screen, a PWA covers offline, push and storage persistence well enough. Web stays a full DOM app with the full DOM UI-kit ecosystem.
- There is a cheap way out later: wrap the same codebase with Capacitor. That adds native SQLite, APNs/FCM push and biometrics without a rewrite.
- **Pick Expo instead if** native-feeling iOS UI, reliable native push and biometric app-lock are must-haves from day 1. You accept that web becomes the secondary target: react-native-web is community-maintained, `expo-sqlite` web support is alpha, and `expo-notifications` has no web push.
- **Drop Tauri mobile.** It has no official push plugin and needs a Rust toolchain on top of Xcode and Android Studio. PowerSync rates its Tauri SDK alpha.
- **Drop Zero for this app.** It rejects writes while offline.
- **Solo-dev constraint (the dev machine appears to be Linux):** any iOS binary (Capacitor, Tauri, or Expo with `--local`) needs macOS and Xcode. Expo's EAS cloud builds iOS for free (15 builds/month), so you need no Mac. A Capacitor iOS build needs a Mac or a macOS CI runner. A PWA needs neither.

---

## Comparison

| Criterion | PWA (React DOM) | Capacitor (wraps the PWA) | Tauri 2 mobile | Expo / RN + RNW |
|---|---|---|---|---|
| **Local store** | IndexedDB, or SQLite-WASM on OPFS (wa-sqlite / sqlite.org wasm) | Native SQLite (`@capacitor-community/sqlite`, SQLCipher). Web build falls back to SQLite stored in IndexedDB | Official `sql` plugin, and whatever the WebView offers | `expo-sqlite` on device. Web support is **alpha** and needs COOP/COEP |
| **Durability on iOS** | Evicted by LRU under storage pressure unless `persist()` is granted. WebKit grants it more readily to Home Screen apps. Home Screen apps are exempt from the 7-day ITP cap | Native SQLite is durable. Capacitor itself says WebView storage "must be considered transient" | Same WebView caveat, so use the SQL plugin | Native files are durable |
| **Background sync** | Background Sync and Periodic Sync work in **Chromium only**, not Safari or Firefox | Native background tasks are possible with plugins | Not checked | Native (expo-background-task). Not checked in depth |
| **Push** | Android/desktop: yes. iOS 16.4+: only for **Home Screen web apps**, and the permission prompt needs a user gesture. Declarative Web Push since iOS 18.4 | APNs/FCM via `@capacitor/push-notifications`. No iOS silent push | **No official remote push plugin**; the only PR (#2066) is a draft. Local notifications only | APNs/FCM via `expo-notifications`; the Expo push service is free. **No web push** |
| **Store distribution** | Not needed. Optional TWA wrapper for Play | Needed for iOS. Guideline 4.2 risk drops once native features are used | Needed | Needed |
| **Shared code, web vs mobile** | Same code everywhere | ~100%: the same React DOM app | ~100% | High, but UI is built from RN primitives. Web is rendered via RNW. DOM-only libraries need `'use dom'` WebViews |
| **Is web first-class?** | Yes | Yes | Yes | Second-class. RNW is "community" maintained per reactnative.dev |
| **Native UX feel** | Web UI. iOS has no vibrate API | Web UI with native plugins | Web UI | Native views and native navigation |
| **Biometric lock** | WebAuthn only (platform authenticator) | Community plugins (e.g. `@capgo/capacitor-native-biometric`) | Official `biometric` plugin | `expo-local-authentication` (Face ID needs a dev build) |
| **Camera / share / haptics** | `<input capture>`; Web Share works on iOS and Android; haptics on Android only | Official plugins | Official `haptics`, `barcode-scanner`. No official share plugin | expo-camera / expo-image-picker, expo-sharing, expo-haptics |
| **Toolchain** | Node only | Node, Xcode 26+ (Capacitor 8), Android Studio 2025.2.1+ | Node, Rust with mobile targets, Xcode, Android Studio + NDK | Node. EAS cloud builds iOS/Android from Linux |
| **OTA updates** | Free (just deploy) | Web-content updates are allowed by stores. Appflow **reaches end of life 2027-12-31** (Capawesome/Capgo replace it) | Not checked | EAS Update: free up to 1K MAU, JS/assets only |
| **Recurring cost** | Static hosting only | $99/yr Apple, $25 one-time Google | Same as Capacitor | Same, plus EAS free tier or $19/mo Starter |

---

## Per-option findings

### 1. PWA (React DOM, installable, service worker)

**Storage quota and eviction**
- Since Safari 17, WebKit gives browser apps up to 60% of disk per origin. Home Screen web apps get "the same origin quota and overall quota" as the browser ([WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)).
- Eviction is least-recently-used, triggered by storage pressure or long non-use. Origins in persistent mode are protected from eviction.
- WebKit grants `persist()` "based on heuristics like whether the website is opened as a Home Screen Web App" ([same source](https://webkit.org/blog/14403/updates-to-storage-policy/)).
- Tracking Prevention deletes all script-writable storage (IndexedDB, Cache, SW registrations) after 7 days without interaction. The first-party domain of Home Screen web apps "is exempt" ([WebKit Tracking Prevention](https://webkit.org/tracking-prevention/)).
- **Implication:** tell iOS users to install the app and call `persist()`. Treat the local DB as a replica: an eviction loses only writes that have not synced yet.
- Chromium grants `persist()` silently based on engagement, install or notification permission. Firefox prompts the user ([web.dev](https://web.dev/articles/persistent-storage)).

**SQLite in the browser**
- OPFS `FileSystemSyncAccessHandle` is available in Safari 15.2+, Chrome 102+ and Firefox 111+ ([MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/FileSystemSyncAccessHandle.json)).
- The official SQLite WASM `opfs-sahpool` VFS needs no COOP/COEP headers and works on Safari 16.4+. Its catch is that it has no transparent multi-tab concurrency.
- The plain OPFS VFS needs COOP/COEP and Safari 17+ ([sqlite.org/wasm persistence](https://sqlite.org/wasm/doc/trunk/persistence.md)).
- wa-sqlite is at `v1.1.2` ([repo](https://github.com/rhashimoto/wa-sqlite)).

**Background sync**
- `SyncManager` exists only in Chrome 49+. `PeriodicSyncManager` exists only in Chrome 80+. Safari and Firefox have neither ([MDN BCD SyncManager](https://github.com/mdn/browser-compat-data/blob/main/api/SyncManager.json), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)).
- **Implication:** sync on app open/focus and on the `online` event. Do not rely on background sync.

**Push**
- iOS/iPadOS 16.4+ supports Web Push only for Home Screen web apps (`display: standalone`). The permission request must come from a user gesture. No Apple Developer membership is needed. Badging is included ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/); MDN BCD notes "supported in web apps saved to the home screen").
- iOS 18.4 added **Declarative Web Push**: notifications display without a service worker ([WebKit](https://webkit.org/blog/16535/meet-declarative-web-push/)).
- iOS 26 opens every site added to the Home Screen as a web app by default, with "zero requirements for installability" ([Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).
- Push works on Android Chrome and on desktop.

**Store distribution**
- Not needed.
- Android can optionally ship a **Trusted Web Activity** to Play using Bubblewrap or PWABuilder. It requires Digital Asset Links, and the content is rendered by Chrome rather than a WebView ([Android dev](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)).
- An iOS App Store submission of a thin wrapper hits **guideline 4.2**: apps must be "beyond a repackaged website". 4.2.2 excludes "web clippings" ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).

**Device APIs**
- Web Share is in Safari 12.1+ and Chrome Android 61+.
- `navigator.vibrate` is absent in Safari, so there are no haptics on iOS.
- WebAuthn (`PublicKeyCredential`) is in Safari 13+ and all majors ([MDN BCD](https://github.com/mdn/browser-compat-data/tree/main/api)). It can serve as a passkey re-auth "lock", but it is not a true native app-lock.
- Camera input works through `<input type=file accept=image/* capture>`.

**Maintenance**
- The lowest of all options: no native toolchains and no store reviews.
- Updates ship on deploy. The risk is service-worker cache staleness, which needs a deliberate update UX.

### 2. Capacitor (native shell around the same web app)

**Status**
- v8 has been the active major since 2025-12-08. Minimums: iOS 15, Android 7, Node 22, Xcode 26.0, Android Studio 2025.2.1 ([support policy](https://capacitorjs.com/docs/main/reference/support-policy)).
- Capacitor is MIT and stays free. Ionic halted new sales of all its commercial products in Feb 2025, and **Appflow ends 2027-12-31**. Capawesome is the recommended migration partner ([Ionic blog](https://ionic.io/blog/important-announcement-the-future-of-ionics-commercial-products)).
- So Capacitor's "enterprise SQLite / Identity Vault" options are effectively gone for new users.

**Storage**
- The docs warn that localStorage, and similarly IndexedDB, in the WebView "must be considered transient". The OS can reclaim it. They recommend SQLite for large data ([Capacitor storage guide](https://capacitorjs.com/docs/guides/storage)).
- `@capacitor-community/sqlite` (`v8.1.1`) covers iOS, Android, Electron and Web.
  - SQLCipher encryption works on native only.
  - On web it is jeep-sqlite/sql.js persisted to IndexedDB, with no encryption ([repo](https://github.com/capacitor-community/sqlite)).
- **Implication:** you need an adapter layer. Native SQLite on device, wa-sqlite/OPFS on web. Sync engines with a Capacitor SDK (PowerSync, beta) handle this for you.

**Push**
- `@capacitor/push-notifications` supports iOS (APNs) and Android (FCM, needs a Firebase project) ([docs](https://capacitorjs.com/docs/apis/push-notifications)).
- It does **not** support iOS silent push.
- On Android, data-only messages do not reach JS when the app has been killed.

**Device APIs**
- Official plugins cover camera, haptics, share and others.
- Biometrics come from community plugins, e.g. `@capgo/capacitor-native-biometric` `8.7.0` and `@aparajita/capacitor-biometric-auth` `10.0.0`. Their versions are confirmed on npm, but I did not audit their maintenance.

**Store and updates**
- Apple charges $99/yr ([Apple](https://developer.apple.com/programs/enroll/)). Google charges $25 one-time ([Play](https://support.google.com/googleplay/android-developer/answer/6112435)).
- New personal Play accounts must run a closed test with **12 testers for 14 consecutive days** before production access ([Play](https://support.google.com/googleplay/android-developer/answer/14151465)). This is a real hurdle for a household app, so consider sideloaded APKs or a TWA.
- Capacitor states that "Apple and Google explicitly allow web content updates" ([docs](https://capacitorjs.com/docs/guides/deploying-updates)).
- The 4.2 risk is mitigated by real native features (biometrics, native push, offline SQLite).

**Maintenance**
- You own the `ios/` and `android/` projects and must keep Xcode and Android Studio current.
- iOS builds need macOS. A free Apple account can sideload to your own device, but profiles **expire every 7 days** ([Apple](https://developer.apple.com/support/compare-memberships/)).

### 3. Tauri 2 mobile

**Status and toolchain**
- The stable line is `2.12.1`. Tauri v3 is in alpha (`cli v3.0.0-alpha.4`, 2026-10-01) ([releases](https://github.com/tauri-apps/tauri/releases)). Expect churn.
- Prerequisites: Rust with 4 Android targets and 3 iOS targets, Android Studio + NDK, and Xcode on macOS for iOS ([prereqs](https://v2.tauri.app/start/prerequisites/)).

**Plugins and push**
- Official mobile plugins: biometric, barcode-scanner, haptics, NFC, notification, sql, store, deep-link ([plugins](https://v2.tauri.app/plugin/)).
- The notification plugin does **local notifications only** ([docs](https://v2.tauri.app/plugin/notification/)). The only remote-push PR is a draft ([plugins-workspace#2066](https://github.com/tauri-apps/plugins-workspace/pull/2066)).
- There is no official share-sheet plugin (checked against the [plugins-workspace](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins) directory list).

**Sync engines**
- Rated **alpha** by PowerSync. LiveStore has an adapter.
- **Verdict:** the most toolchain for the least mobile payoff. Its strength is desktop, which is not a target here.

### 4. Expo (React Native + react-native-web, Expo Router)

**Status**
- SDK 57 (RN 0.86, React 19.2) shipped 2026-06-30 ([changelog](https://expo.dev/changelog/sdk-57)).
- SDK 58 has been in beta since 2026-09-15 on RN 0.88 RC. It brings async web routes by default, and "data loaders, SSR, and middleware are now stable" in Router ([SDK 58 beta](https://expo.dev/changelog/sdk-58-beta)).
- Expo Go on iOS now requires login. Dev builds do not ([changelog](https://expo.dev/changelog/expo-go-57-login)).

**Web**
- Expo positions web as "first-class" via RNW. You can use universal `View`/`Text` or web-only DOM elements ([docs](https://docs.expo.dev/workflow/web/)).
- reactnative.dev, however, lists react-native-web as **community-maintained** (by necolas) ([out-of-tree platforms](https://reactnative.dev/docs/out-of-tree-platforms)).
- DOM-only libraries (charts, rich text) need `'use dom'` components. On native these run in a WebView: no children, async-only function props, and slower ([DOM components](https://docs.expo.dev/guides/dom-components/)).
- **Implication:** the DOM UI-kit ecosystem (shadcn/Radix/MUI) is unavailable. You need RN-compatible kits.

**Offline**
- `expo-sqlite` covers Android, iOS and Web. Web is "**alpha** and may be unstable". It needs wasm in Metro plus COOP/COEP headers. The Session extension (changesets) is available on all platforms ([docs](https://docs.expo.dev/versions/latest/sdk/sqlite/)).
- SDK 58 removes libSQL sync from expo-sqlite.
- PWA offline is manual (Workbox). Expo itself recommends native apps for the best offline experience ([PWA guide](https://docs.expo.dev/guides/progressive-web-apps/)).

**Push**
- `expo-notifications` supports Android and iOS only, **no web** ([docs](https://docs.expo.dev/versions/latest/sdk/notifications/)).
- Remote push is not available in Expo Go on Android since SDK 53, so it needs a dev build.
- The Expo push service is free (600 notifications/s per project) ([FAQ](https://docs.expo.dev/push-notifications/faq/)).
- **Implication:** web push would need a separate Web Push implementation.

**Device APIs**
- `expo-local-authentication` (Android/iOS). Face ID needs `NSFaceIDUsageDescription` and does not work in Expo Go ([docs](https://docs.expo.dev/versions/latest/sdk/local-authentication/)).
- Camera, haptics and sharing are first-party modules.

**Build, cost and OTA**
- EAS free tier: 15 Android + 15 iOS builds/month, low-priority queue (waits can exceed 90 min), Update to 1K MAU ([pricing](https://expo.dev/pricing)).
- Starter is $19/mo.
- `eas build --local` for iOS still needs macOS + Xcode ([local builds](https://docs.expo.dev/build-reference/local-builds/)).
- EAS Update ships JS/assets only and must comply with store rules ([EAS Update](https://docs.expo.dev/eas-update/introduction/)).
- **This is the only option that builds iOS from Linux with no Mac.**

---

## Sync-engine platform support (official, brief)

| Engine | Web | RN / Expo | Capacitor | Tauri | Notes |
|---|---|---|---|---|---|
| PowerSync | Stable | Stable | **Beta** | **Alpha** | Local SQLite per SDK ([SDK list](https://docs.powersync.com/client-sdk-references/introduction)) |
| ElectricSQL | TS client, React | Listed | — | — | Primarily **read-path** sync; writes go through your API. Integrates with TanStack DB ([docs](https://electric.ax/docs/guides/client-development)) |
| Zero `1.9.0` | Yes | Yes (expo-sqlite / op-sqlite kv store) | — | — | **Offline writes are rejected**; queues for about 1 minute only ([offline](https://zero.rocicorp.dev/docs/offline), [RN](https://zero.rocicorp.dev/docs/react-native)). Disqualified |
| Replicache `15.3.0` | Yes | Not stated | — | — | **Maintenance mode**. Maintainers say migrate to Zero ([replicache.dev](https://replicache.dev/)) |
| TinyBase `10.0.x` | indexed-db, sqlite-wasm, pglite | expo-sqlite, RN sqlite, mmkv | `persister-capacitor-sqlite` | — | WS synchronizer included ([API](https://tinybase.org/api/)) |
| RxDB `17.5.0` | Free: LocalStorage/Dexie. **Premium:** IndexedDB/OPFS | SQLite (**premium**) | SQLite (**premium**) | — | Paid storages for the good backends ([storages](https://rxdb.info/rx-storage.html)) |
| Triplit `1.0.x` | Yes | `packages/react-native` in repo | — | — | ⚠ Last npm release 2025-07-31, last push 2026-01 ([repo](https://github.com/aspen-cloud/triplit)). Maintenance status unconfirmed |
| Jazz | React/Vue/Svelte/Solid | Expo/RN | — | — | Jazz 2.0 in **alpha** (`2.0.0-alpha.59`); stable `jazz-tools` is `0.20.x` ([docs](https://jazz.tools/docs), [releases](https://github.com/garden-co/jazz/releases)) |
| LiveStore `0.4.0` | Yes | Expo adapter | — | Tauri adapter | Pre-1.0; docs say WIP ([docs](https://docs.livestore.dev/)) |

"—" means no official adapter was found. Web SDKs inside Capacitor/Tauri WebViews may still work, but with the WebView durability caveat above.

---

## Open questions for downstream tickets

**Frontend meta-framework ticket**
1. Is a PWA-first approach (any React DOM framework) acceptable? Or is native iOS UI a hard requirement, which forces Expo Router?
2. If PWA: service-worker strategy and update UX. Choose Vite PWA/Workbox vs framework-native, and the SPA vs SSR mode. Note that offline-first favors an SPA shell.
3. Is COOP/COEP allowed on the host? It is needed for OPFS-VFS / expo-sqlite web, but not for `opfs-sahpool`.
4. Plan a Capacitor-ready structure from day 1 (no SSR-only data paths, a storage adapter seam), so wrapping later costs little.

**Backend and data-layer ticket**
1. Pick the sync engine from the matrix. It must support **offline writes** (rules out Zero and pure Electric without a write layer) and must support the chosen platform officially.
2. Conflict model for shared household wallets. Balance invariants under concurrent offline writes need either server-authoritative mutations or CRDT/last-writer-wins. This is a decision, not a default.
3. Recovering from eviction: how a client detects lost unsynced writes on iOS.
4. Push backend: Web Push (VAPID) vs APNs/FCM vs both. This depends on the platform choice.

**For the user**
1. Which devices does the household use (iOS share)? Is installing to the Home Screen acceptable?
2. Is a Mac available, for Capacitor iOS builds and for testing?
3. Is App Store presence wanted now or only for future SaaS? The $99/yr fee, 4.2 review and Play's 12-tester rule all bear on this.
4. Is a biometric app-lock required for v1, or is a WebAuthn re-auth good enough?

---

## Sources

- WebKit: [Storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) · [Tracking Prevention](https://webkit.org/tracking-prevention/) · [Web Push iOS 16.4](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) · [Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/) · [Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- MDN: [Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) · [browser-compat-data](https://github.com/mdn/browser-compat-data) (SyncManager, PeriodicSyncManager, FileSystemSyncAccessHandle, StorageManager.persist/getDirectory, PushManager, setAppBadge, vibrate, share, PublicKeyCredential)
- web.dev: [Persistent storage](https://web.dev/articles/persistent-storage)
- SQLite: [WASM persistence](https://sqlite.org/wasm/doc/trunk/persistence.md) · [wa-sqlite](https://github.com/rhashimoto/wa-sqlite)
- Apple: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) · [Program fee](https://developer.apple.com/programs/enroll/) · [Memberships compared](https://developer.apple.com/support/compare-memberships/)
- Google: [Play registration fee](https://support.google.com/googleplay/android-developer/answer/6112435) · [Play testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465) · [Trusted Web Activities](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
- Capacitor/Ionic: [Support policy](https://capacitorjs.com/docs/main/reference/support-policy) · [Storage](https://capacitorjs.com/docs/guides/storage) · [Push](https://capacitorjs.com/docs/apis/push-notifications) · [Deploying updates](https://capacitorjs.com/docs/guides/deploying-updates) · [capacitor-community/sqlite](https://github.com/capacitor-community/sqlite) · [Ionic commercial products sunset](https://ionic.io/blog/important-announcement-the-future-of-ionics-commercial-products)
- Tauri: [Prerequisites](https://v2.tauri.app/start/prerequisites/) · [Plugins](https://v2.tauri.app/plugin/) · [Notification](https://v2.tauri.app/plugin/notification/) · [Push PR #2066 (draft)](https://github.com/tauri-apps/plugins-workspace/pull/2066) · [Releases](https://github.com/tauri-apps/tauri/releases)
- Expo / RN: [Web](https://docs.expo.dev/workflow/web/) · [DOM components](https://docs.expo.dev/guides/dom-components/) · [PWA](https://docs.expo.dev/guides/progressive-web-apps/) · [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) · [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) · [Push FAQ](https://docs.expo.dev/push-notifications/faq/) · [local-authentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/) · [Local builds](https://docs.expo.dev/build-reference/local-builds/) · [EAS Update](https://docs.expo.dev/eas-update/introduction/) · [Pricing](https://expo.dev/pricing) · [SDK 57](https://expo.dev/changelog/sdk-57) · [SDK 58 beta](https://expo.dev/changelog/sdk-58-beta) · [Expo Go login](https://expo.dev/changelog/expo-go-57-login) · [RN out-of-tree platforms](https://reactnative.dev/docs/out-of-tree-platforms)
- Sync engines: [PowerSync SDKs](https://docs.powersync.com/client-sdk-references/introduction) · [Electric](https://electric.ax/docs/guides/client-development) · [Zero offline](https://zero.rocicorp.dev/docs/offline) · [Zero RN](https://zero.rocicorp.dev/docs/react-native) · [Replicache](https://replicache.dev/) · [TinyBase API](https://tinybase.org/api/) · [RxDB storages](https://rxdb.info/rx-storage.html) · [Triplit](https://github.com/aspen-cloud/triplit) · [Jazz](https://jazz.tools/docs) · [LiveStore](https://docs.livestore.dev/)

### Unconfirmed / flagged

- Versions come from npm `latest` and GitHub releases on 2026-10-05. They were not cross-checked against each project's changelog.
- I did not confirm whether iOS Web Push on Safari 18.4+ still requires a Home Screen install. The Declarative Web Push post implies it does not, but MDN BCD still notes Home Screen-only support on iOS. Test on a device.
- I did not deeply verify Expo background tasks or Tauri mobile background execution.
- Maintenance of the Capacitor community biometric plugins was not audited.
- I did not confirm Triplit's maintenance status.
- Replicache's React Native support is not stated in its docs.
