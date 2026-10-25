# Testing: no E2E, with the weight on the domain core, RLS and a real sync harness

There are no end-to-end tests on any platform: no Playwright, no Maestro, no screenshot or visual-regression diffs, and no snapshot tests. With no Mac and only 15 EAS builds per platform a month, device E2E would be costly and flaky, and it would mostly re-test what the layers below already cover. Instead, the risk sits in four places, and each gets a layer of its own:

- **The domain core runs on Vitest.** Money, derived balances, recurring-rule Occurrences, budget months with a custom start day, frozen Base amounts, mirrored cross-household transfers, upcasters and the logic of the Edge Functions all live in framework-free TS. A lint rule bans `react-native` imports there. Every invariant gets a fast-check property test.
- **Components run on jest-expo/universal** (ios, android and web) with `@testing-library/react-native`. The tests check behaviour, queried by role and label, never by snapshot.
- **RLS is tested with pgTAP** (`supabase test db`). A policy matrix covers every table × operation × actor (Admin, Member, Viewer, a member of another household, Former member, anon), and meta-tests fail if a `public` table lacks RLS or a policy. A thin Vitest harness covers what's only visible through PostgREST: the 426 on a missing or old `x-contract-version`, empty results treated as rejections, and exact `::text` money reads.
- **Sync runs against the real thing.** CI boots local Supabase and a self-hosted PowerSync Service in Docker, loaded with the repo's `powersync/sync-config.yaml`.
  - **RLS ⊇ Sync Streams** is a differential test. For each user in a fixed adversarial seed, a `@powersync/node` client does a full download, and the synced row ids must be a subset of the rows RLS lets that user SELECT. We rejected hand-translating the stream queries into SQL, because that copy would drift from the real config.
  - **The offline and conflict scenarios** drive two or more Node clients through the same upload connector the app ships. They cover last-writer-wins, update vs delete, RLS rejections while offline, a 426 pausing the queue, upcaster chains, mirrored transfers, duplicate Occurrence confirms and money exactness.

Edge Functions keep their logic behind injected adapters, so it's tested in Vitest with in-memory fakes and no network. A `supabase functions serve` smoke run catches Deno runtime breakage.

**Gates:**

- **Every PR runs everything:** typecheck and lint (including the money `SUM`/`AVG` guard), all the suites above, the ADR-0009 drift checks, and migrations applied from zero. The repo is public, so Linux CI minutes are free.
- **Nightly:** the fast-check suites rerun with a large `numRuns` and a random, logged seed. A failure opens an issue.
- **A store release or OTA publish** needs a green suite plus a manual Markdown smoke checklist, ticked on a physical Android device and on iOS via TestFlight.
- There's no coverage % threshold.

What's knowingly left untested automatically: native-only transport (WebSocket sync on Android), web storage eviction and `persist()`, and real push and email delivery. The smoke checklist covers them.

Decided in [Testing & QA strategy](https://github.com/khanate-dev/hisaab/issues/16).

## Amendment: component tests run on the iOS and Android presets

`@testing-library/react-native` renders React Native host components through its own test renderer. It can't render react-native-web's DOM output, so the web and node projects of `jest-expo/universal` fail on any component. Component tests therefore run on `jest-expo/ios` and `jest-expo/android` only. Web-only behaviour, if it ever needs a test, gets `@testing-library/react` on a separate web project.

Amended in [Sign in with email OTP and see your synced Personal household](https://github.com/khanate-dev/hisaab/issues/24).
