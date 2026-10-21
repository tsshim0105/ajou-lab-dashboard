# Research rooms: initial owner-only, disconnected release

This release intentionally blocks every AI generation route, even if a key exists.
No mock AI answers, external API calls, or charges occur. Students cannot see the
menu or access any research-room endpoint. Existing Sites identity and dashboard
administrator authorization are reused. Site-wide public visibility is unchanged.

Implemented: topic create/edit/archive/restore, durable topic-isolated messages
and replies, five-second polling while visible, idempotent message creation,
reference-text selection, human-authored meeting drafts and confirmation with
validated conversation range, administrator budget/token/reasoning configuration,
and usage categories. Schema lives in the unified Site's Drizzle migrations.

The budget ledger stores integer micro-USD. Reservation admission is one SQL
statement across the whole lab, includes pending and uncertain requests, and
serializes active generations per topic. Settlement is idempotent. These helpers
are tested but not connected to paid execution in this release. No request is
allowed merely because the browser displays a remaining budget.

## Activation gate (separate, deliberate next step)

1. Use the OpenAI Developers plugin's secure API-key setup workflow. Configure
   OPENAI_API_KEY only as a Sites server secret; never paste it into a room,
   source, browser storage, or log. Do not put it in the hosting manifest.
2. Verify account access to the exact gpt-6.1-sol model using the server key.
   A documented model is not proof of account access. No automatic fallback.
3. Implement/validate Responses execution, pricing snapshots, actual token/tool
   usage settlement, uncertain-job reconciliation, citations and R2 image output.
   Until this step passes, generation/search/images/AI summaries remain disabled.
4. Wire reservations before every request and retain reservations on ambiguous
   timeouts. Verify duplicates, simultaneous topics, monthly rollover and usage
   errors with the actual provider contract. Default ordinary tier, low reasoning.
5. Enable student collaboration only after an explicit rollout request. Enforce
   the existing approved roster plus topic membership on every read/write. Keep
   membership, cross-topic administration and expensive settings professor-only.

Official model information checked 2026-10-21:
https://developers.openai.com/api/docs/models/gpt-6.1-sol
Responses API and tools are documented; account access remains unchecked.
The monthly estimate is not a guaranteed billing ceiling: pricing changes,
provider billing delays and usage discrepancies can change actual charges.
