import { render as renderComponent } from "@testing-library/react-native";
import type { ReactElement } from "react";

import { WithI18n } from "./i18n";

/** Testing Library's render, inside the providers every component expects (Lingui). */
export const render = (ui: ReactElement) =>
	renderComponent(ui, { wrapper: WithI18n });
