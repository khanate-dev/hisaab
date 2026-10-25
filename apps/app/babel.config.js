// Metro applies babel-preset-expo implicitly; Jest needs it spelled out.
module.exports = (api) => {
	api.cache(true);
	return { presets: ["babel-preset-expo"] };
};
