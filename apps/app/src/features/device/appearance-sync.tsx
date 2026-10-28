import { colorScheme } from "nativewind";
import { useEffect } from "react";

import { useDeviceSettings } from "@/lib/device/settings";

/** Applies this device's appearance override (or the OS's choice) to the theme. Renders nothing. */
export const AppearanceSync = () => {
	const appearance = useDeviceSettings()?.appearance;
	useEffect(() => {
		if (appearance !== undefined) colorScheme.set(appearance);
	}, [appearance]);
	return null;
};
