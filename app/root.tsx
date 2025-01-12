import {
	ColorSchemeScript,
	mantineHtmlProps,
	MantineProvider,
} from "@mantine/core";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";
import { theme } from "./theme/theme";

import mantineCss from "@mantine/core/styles.css?url";
import type { Route } from "./+types/root";
import themeCss from "./theme/theme.css?url";

export const links: Route.LinksFunction = () => [
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
	{ rel: "stylesheet", href: themeCss },
	{ rel: "stylesheet", href: mantineCss },
];

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html
			lang="en"
			{...mantineHtmlProps}
		>
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404" : "Error";
		details =
			error.status === 404
				? "The requested page could not be found."
				: error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main>
			<h1>{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre>
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
