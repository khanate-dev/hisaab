// The shared contract version helper on a trivial handler, for CI's `supabase functions serve` smoke run (ADR-0009).
import { withContractVersion } from "../_shared/contract-version.ts";

Deno.serve(withContractVersion(() => Response.json({ ok: true })));
