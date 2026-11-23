// The runtime is the fingerprint (app.json `runtimeVersion: { policy: "fingerprint" }`). The user-facing `version` is
// left out of it: `release` sets it only on the runner for store builds (ADR-0011: no bump commits), so leaving it in
// would give a store build a runtime no checkout of main ever resolves, and no update could reach it. The default skip
// stays too.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
	sourceSkips: [
		"ExpoConfigVersions",
		"PackageJsonAndroidAndIosScriptsIfNotContainRun",
	],
};
