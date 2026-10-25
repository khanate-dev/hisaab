import { I18nProvider } from "@lingui/react";
import type { ReactNode } from "react";

import { i18n } from "@/lib/i18n";

/** Components read their strings through Lingui, so tests render them inside its provider. */
export const WithI18n = ({ children }: { children: ReactNode }) => (
	<I18nProvider i18n={i18n}>{children}</I18nProvider>
);
