# Research rooms: professor-only Responses integration

The existing dashboard administrator boundary protects all room reads and writes.
The public Site audience and other dashboard permissions are unchanged.

Configure OPENAI_API_KEY as a Sites server secret and deploy. Local .env.local
is not uploaded or embedded. With no runtime secret, AI actions remain disabled.
The exact model is gpt-6.1-sol, standard service tier and low reasoning by default;
there is no fallback model. Local model-access verification succeeded 2026-10-21.

Implemented: topic CRUD/archive, persistent messages/replies, selected reference
text, AI answers, range-selected AI meeting-summary drafts, human edits and
confirmation, polling, monthly budget configuration and usage attribution.
Only the current topic's recent messages and selected materials are sent.
Input is conservatively bounded by UTF-8 bytes plus overhead. Truncated chat
context is disclosed; summary ranges must fit in full. Long-history automatic
compaction, live web search, image generation and student rollout are not enabled.

Before every paid request an atomic SQL statement reserves integer micro-USD
against the lab's monthly budget (default USD 50). It includes unresolved requests
from previous months and allows only one active request per topic. IDs deduplicate
retries. Responses are persisted before settlement; ambiguous timeout, missing
usage, or persistence failure retains the reservation and blocks repeat generation.
Explicit pre-generation 400/401/403/404/422/429 rejection releases it. Uncertain
jobs require administrator investigation; do not delete them to force a retry.

Pricing snapshot 2026-10-21: conservatively estimate all input at USD 2.50/million
(the cache-write rate) and output including reasoning at USD 10/million. No tools
are enabled. Usage stores response ID, token counts, rate snapshot and amounts.
Cached discounts are deliberately not deducted. The estimate is not a guarantee
of an exact billing cap: pricing, actual processing and provider billing can vary.
https://developers.openai.com/api/docs/models/gpt-6.1-sol

Run node --test tests/access.test.mjs tests/mobile.test.mjs tests/research-room.test.mjs
and node scripts/build.mjs. The unified Site mounts the runtime below /dashboard,
passes only the server secret, and owns schema migrations. Never log API errors
verbatim, store credentials in source, or pass keys to the browser.
