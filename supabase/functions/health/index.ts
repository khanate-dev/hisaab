// Liveness probe: CI's `supabase functions serve` smoke run checks the Deno runtime boots and serves it.
Deno.serve(() => Response.json({ ok: true }));
