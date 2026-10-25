import { type Href, router } from "expo-router";

/** Back where the User came from; opened directly (a reload or a link), there's nothing behind, so on to `fallback`. */
export const leaveTo = (fallback: Href) => {
	if (router.canGoBack()) router.back();
	else router.replace(fallback);
};
