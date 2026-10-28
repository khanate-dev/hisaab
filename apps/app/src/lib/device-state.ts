import { DEVICE_STATE_ID, deviceState } from "@hisaab/client-schema";
import { toCompilableQuery } from "@powersync/drizzle-driver";
import { useQuery } from "@powersync/react";
import { eq } from "drizzle-orm";

import { db } from "@/lib/powersync";
import { whenLoaded } from "@/lib/watched";

type DeviceState = Omit<typeof deviceState.$inferSelect, "id">;

const EMPTY: DeviceState = {
	current_household_id: null,
	pending_invite_token: null,
	pending_invite_household_id: null,
	appearance: null,
	app_lock: null,
};

/** What this device remembers (the local-only `device_state` row); undefined until read. */
export const useDeviceState = (): DeviceState | undefined => {
	const rows = whenLoaded(
		useQuery(
			toCompilableQuery(
				db
					.select()
					.from(deviceState)
					.where(eq(deviceState.id, DEVICE_STATE_ID)),
			),
		),
	);
	if (rows === undefined) return undefined;
	const [row] = rows;
	return row ? { ...EMPTY, ...row } : EMPTY;
};

export const readDeviceState = async (): Promise<DeviceState> => {
	const [row] = await db
		.select()
		.from(deviceState)
		.where(eq(deviceState.id, DEVICE_STATE_ID));
	return row ? { ...EMPTY, ...row } : EMPTY;
};

/** Changes what this device remembers; its one row is made on first write. */
export const updateDeviceState = async (changes: Partial<DeviceState>) => {
	await db.transaction(async (tx) => {
		const [row] = await tx
			.select({ id: deviceState.id })
			.from(deviceState)
			.where(eq(deviceState.id, DEVICE_STATE_ID));
		if (row)
			await tx
				.update(deviceState)
				.set(changes)
				.where(eq(deviceState.id, DEVICE_STATE_ID));
		else
			await tx
				.insert(deviceState)
				.values({ ...EMPTY, ...changes, id: DEVICE_STATE_ID });
	});
};
