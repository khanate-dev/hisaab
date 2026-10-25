import "@azure/core-asynciterator-polyfill";

import { schema } from "@hisaab/client-schema";
import { SyncStreamConnectionMethod } from "@powersync/common";
import { PowerSyncDatabase } from "@powersync/react-native";

export const openDatabase = () =>
	new PowerSyncDatabase({ schema, database: { dbFilename: "hisaab.db" } });

// HTTP streaming hangs on Android dev builds; WebSocket connects (ADR-0007, Spike).
export const connectOptions = {
	connectionMethod: SyncStreamConnectionMethod.WEB_SOCKET,
};
