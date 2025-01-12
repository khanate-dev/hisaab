import "@mantine/core/styles.css";

import { ColorSchemeScript, MantineProvider } from "@mantine/core";
import {
	Links,
	LinksFunction,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";
import { theme } from "./theme/theme";

export const links: LinksFunction = () => {
	return [
		{
			rel: "icon",
			href: "/favicon.ico",
			sizes: "32x32",
		},
		{
			rel: "icon",
			href: "/favicon.svg",
			type: "image/svg+xml",
		},
		{
			rel: "apple-touch-icon",
			href: "/apple-touch-icon.png",
		},
	];
};

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1"
				/>
				<Meta />
				<Links />
				<ColorSchemeScript />
			</head>
			<body>
				<MantineProvider theme={theme}>{children}</MantineProvider>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}
