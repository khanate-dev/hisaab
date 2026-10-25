// @ts-check
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The PowerSync web SDK resolves through package exports, with the react-native-web condition Expo drops on web.
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionsByPlatform = {
	...config.resolver.unstable_conditionsByPlatform,
	web: [
		...(config.resolver.unstable_conditionsByPlatform?.["web"] ?? []),
		"react-native-web",
	],
};

module.exports = config;
