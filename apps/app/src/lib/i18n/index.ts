import { i18n } from "@lingui/core";

import { messages } from "../../locales/en/messages";

// English is the only locale at launch; the catalog is compiled from src/locales by `pnpm i18n:compile`.
i18n.load("en", messages);
i18n.activate("en");

export { i18n };
