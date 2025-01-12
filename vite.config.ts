import { reactRouter } from "@react-router/dev/vite";
import presetMantine from "postcss-preset-mantine";
import simpleVars from "postcss-simple-vars";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	css: {
		postcss: {
			plugins: [
				presetMantine(),
				simpleVars({
					variables: {
						"mantine-breakpoint-xs": "36em",
						"mantine-breakpoint-sm": "48em",
						"mantine-breakpoint-md": "62em",
						"mantine-breakpoint-lg": "75em",
						"mantine-breakpoint-xl": "88em",
					},
				}),
			],
		},
	},
	plugins: [reactRouter(), tsconfigPaths()],
});
