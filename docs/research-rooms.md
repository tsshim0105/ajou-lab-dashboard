# Research rooms: professor-only Responses integration

The existing dashboard administrator boundary protects all room reads and writes.
The public Site audience and other dashboard permissions are unchanged.

Configure OPENAI_API_KEY as a Sites server secret and deploy. Local .env.local
is not uploaded or embedded. With no runtime secret, AI actions remain disabled.
The exact model is gpt-6.1-sol, standard service tier and medium reasoning by default;
there is no fallback model. Local model-access verification succeeded 2026-10-21.

Implemented: topic CRUD/archive, persistent messages/replies, selected reference
text, AI answers, range-selected AI meeting-summary drafts, human edits and
confirmation, polling, monthly budget configuration and usage attribution.
Only the current topic’s recent messages, latest confirmed meeting note and selected materials are sent.
Input is conservatively bounded by UTF-8 bytes plus overhead. Truncated chat
context is disclosed; summary ranges must fit in full. Long-history automatic compaction and student rollout are not enabled.
Web search (including optional source images), source citations, safe Markdown and
image generation are enabled. Paper checkboxes persist verified references to the
current topic’s Papers tab. Enter asks AI; Shift+Enter inserts a newline, respecting IME.
Responses use background=true and store=true; polling retrieves the same response ID
after navigation without another paid generation. Provider-side retention applies.

Before every paid request an atomic SQL statement reserves integer micro-USD
against the lab's monthly budget (default USD 50). It includes unresolved requests
from previous months and allows only one active request per topic. IDs deduplicate
retries. Responses are persisted before settlement; ambiguous timeout, missing
usage, or persistence failure retains the reservation and blocks repeat generation.
Explicit pre-generation 400/401/403/404/422/429 rejection releases it. Uncertain
jobs require administrator investigation; do not delete them to force a retry.

Pricing snapshot 2026-10-21: conservatively estimate all input at USD 2.50/million
(the cache-write rate) and output including reasoning at USD 10/million. Web search is estimated at USD 0.01/call plus input tokens (up to four calls).
Image generation uses gpt-image-2.5-flare, low quality. Responses does not expose
per-image token usage here, so each generated image is conservatively estimated at
USD 1; the estimate is not the actual provider charge. Usage stores response ID, token counts, rate snapshot and amounts.
Cached discounts are deliberately not deducted. The estimate is not a guarantee
of an exact billing cap: pricing, actual processing and provider billing can vary.
https://developers.openai.com/api/docs/models/gpt-6.1-sol

Run node --test tests/access.test.mjs tests/mobile.test.mjs tests/research-room.test.mjs
and node scripts/build.mjs. The unified Site mounts the runtime below /dashboard,
passes the server secret and private R2 binding, and owns schema migrations. Never log API errors
verbatim, store credentials in source, or pass keys to the browser.

## ChatGPT project publishing
The Site MCP plugin exposes list_research_topics and save_research_result.
The /mcp route verifies the existing owner identity before every tool call.
The user selects an answer in their ChatGPT 연구미팅 project and asks to save it.
The caller passes the original question/answer, papers, and transferable images;
this is explicit publishing, not automatic ChatGPT conversation synchronization.
No model request is made and no API charge is incurred by importing.
Images are stored privately in R2 (PNG/JPEG/WebP <=4MB each, max8). Base64 is
supported. HTTPS downloads use a small trusted-host allowlist, reject redirects,
and enforce response limits; unsupported/internal sandbox images yield visible
warnings. Same content retries deduplicate and may repair missing image files.
Saved papers are automatically added to the topic library. Original formatting
is safely rendered Markdown, not an exact clone of ChatGPT interactive UI.
Project name is workflow context, not an authenticated project-level boundary:
only the owner can invoke this tool, from any chat where the plugin is enabled.

## Ordered imported content

`save_research_result` accepts optional ordered `blocks` (answer) and `questionBlocks` (question attachments). The original question/answer remain unchanged in message storage and copy operations. Blocks support markdown, table, metrics, image/paper zero-based references, and bar/line charts with explicit source values. Never infer numerical data from an unavailable chart. Transfer a rendered chart as a PNG when its underlying values are unavailable. Safe SVG images may be supplied as `images[].svg`; script, external references and active markup are rejected, and SVG is served as an isolated image. Interactive ChatGPT UI/HTML is not executed or automatically mirrored. Existing text-only imports may be enriched by retrying the same question/answer with blocks and all referenced assets. Missing-image warnings must be surfaced. Topic viewing permissions also protect image assets.

## Original image file upload

Preferred: after saving an answer with an image placeholder and an ordered image block, call `attach_research_image` with the actual ChatGPT file parameter, `topicId`, and `messageId` (`ai-` plus the import result id). For older answers use `list_research_image_targets`. The Site MCP descriptor declares `_meta["openai/fileParams"]: ["file"]`; the native file object requires `download_url` and `file_id`, and declares optional `mime_type` and `file_name` per https://developers.openai.com/plugins/reference#file-apis.

The server fetches this temporary file URL directly; it does not depend on outbound networking in ChatGPT code execution. Only HTTPS OpenAI storage hosts are allowed, redirects are rejected, downloads time out after 30 seconds and are capped at 20 MB. PNG/JPEG/WebP signatures are checked. File/position retries are deduplicated, including concurrent calls. URLs are not persisted or logged. Expired/inaccessible files return an explicit failure. Missing image slots are repaired in place; text and rich blocks remain unchanged. If no original image block exists, the image appears at the end rather than inventing its position. Existing topic access checks protect the image; image-library selection remains off by default.

The previous `prepare_research_image_upload` is a legacy fallback for environments with confirmed outbound upload access. The dashboard **그림 첨부** control also uses this flow: one-image grants expire after 15 minutes, are hashed at rest, and cannot read private images. Never report upload success unless `ok:true` and `imagesSaved:1` are returned. If the ChatGPT host cannot supply a native file parameter, say so and use the manual control; do not loop on the failing execution-network upload. Automated tests cover the server path; a real ChatGPT-generated file transfer must be separately verified in the source conversation.
