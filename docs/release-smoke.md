# Release smoke checklist

Tick this for every native release (ADR-0010, ADR-0011), on a physical Android device and on an iPhone through
TestFlight, both against prod. It covers what the automated suite knowingly leaves out: native sync transport, real
push and email, and the device features.

Both paths are tested on the internal builds, which listen on `preview` (an Android APK and a TestFlight build), before
the `prod-release` approval:

- **An OTA update:** `release` has published it to `preview`; run the checklist on the internal builds already
  installed.
- **New store builds:** `release` has made new internal builds at the new runtime; install them (the APK from the
  build page, TestFlight's newest) and run the checklist on those.

Copy the list into the release's notes (or the run's summary) and tick it there.

## Getting the release

- [ ] The app opens on the new version (an OTA: close and reopen it twice, so the update downloads and then applies).
- [ ] Nothing asks for an update the server doesn't need (no "update required" screen on a current build).

## Account and sync

- [ ] Sign in with an email code: the email arrives from `mail.hisaab.khanate.pk`.
- [ ] The household's Wallets, Entries and Budgets load, and syncing settles (no endless spinner).
- [ ] Record an Entry on the device: it shows on the web app within seconds, and one recorded on the web shows here.
- [ ] Airplane mode: record an Entry, edit another, then reconnect; both sync and nothing is duplicated.

## Notifications

- [ ] Turn push on for this device in Notification preferences; the permission prompt appears once.
- [ ] Have another Member join or leave a shared household: the Membership push arrives with no amount in its text.
- [ ] Tapping the push opens the Notification inbox.

## Device features

- [ ] Attach a photo to an Entry from the camera and from the library; its thumbnail shows, and it opens full size.
- [ ] Turn the app lock on: backgrounding the app and coming back asks for Face ID or the fingerprint.
- [ ] An Invite link opens the app (not the browser) and joins the household.
- [ ] Dark mode follows the system setting.

## After approving store builds

- [ ] The Play Console and App Store Connect show the new version (the release tag) submitted.
- [ ] Android: Play shows the staged rollout at 10%; iOS: the phased release is on once it's approved.
