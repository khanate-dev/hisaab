import { colorScheme } from "nativewind";
import { useEffect } from "react";

import { useDeviceState } from "@/lib/device-state";

import { appearanceOf } from "@hisaab/client-schema";

/** Applies this device's appearance override (or the OS's choice) to the theme. Renders nothing. */
export const AppearanceSync = () => {
	const saved = useDeviceState()?.appearance;
	useEffect(() => {
		colorScheme.set(appearanceOf(saved));
	}, [saved]);
	return null;
};
