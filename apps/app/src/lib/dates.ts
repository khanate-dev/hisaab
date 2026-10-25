/** Now, as stored in created_at columns. */
export const nowIso = () => new Date().toISOString();

/** Today on this device, YYYY-MM-DD. The household timezone arrives with household settings (#40). */
export const localToday = () => new Date().toLocaleDateString("en-CA");
