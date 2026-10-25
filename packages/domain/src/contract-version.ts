// ADR-0009: a manual integer contract version gates every API request from builds older than the server's minimum.
// Downloads come through PowerSync and are never gated.
// The same rule runs in Postgres (private.check_contract_version) and in Edge Functions (through this module).

export const CONTRACT_VERSION_HEADER = "x-contract-version";

/** The error code of the gate's HTTP 426, from PostgREST (SQLSTATE PT426) and Edge Functions alike. */
export const UPDATE_REQUIRED_CODE = "PT426";

export type ContractCheck =
	| { ok: true }
	/** `sent` is null when the header was missing or malformed. */
	| { ok: false; sent: number | null; minimum: number };

const VERSION = /^[0-9]{1,9}$/;

export const checkContractVersion = (
	sent: string | null,
	minimum: number,
): ContractCheck => {
	const version = sent !== null && VERSION.test(sent) ? Number(sent) : null;
	return version !== null && version >= minimum
		? { ok: true }
		: { ok: false, sent: version, minimum };
};

/** For Edge Functions: a 426 shaped like PostgREST's, or null when the request may proceed. */
export const contractVersionResponse = (
	request: Request,
	minimum: number,
): Response | null => {
	const check = checkContractVersion(
		request.headers.get(CONTRACT_VERSION_HEADER),
		minimum,
	);
	if (check.ok) return null;
	return Response.json(
		{
			code: UPDATE_REQUIRED_CODE,
			message: "Update required",
			details: `This app speaks contract version ${check.sent ?? "none"}; the server needs ${minimum} or later.`,
		},
		{ status: 426 },
	);
};
