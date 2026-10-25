// Public liveness probe (no JWT, no data). CI's `supabase functions serve` smoke run checks the Deno runtime
// boots and serves it; it deploys to prod with the other functions, where it is equally harmless.
Deno.serve(() => Response.json({ ok: true }));
