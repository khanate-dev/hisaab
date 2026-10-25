// Metro applies babel-preset-expo implicitly; Jest needs it spelled out. NativeWind compiles className; Lingui's
// macro turns t`…` and <Trans> into message lookups.
module.exports = (api) => {
	api.cache(true);
	return {
		presets: [
			["babel-preset-expo", { jsxImportSource: "nativewind" }],
			"nativewind/babel",
		],
		plugins: ["@lingui/babel-plugin-lingui-macro"],
	};
};
