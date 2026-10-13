# Research laboratory dashboard
- Preserve the existing tab-based layout and Korean UI.
- Keep raw workbooks, personal data, preview HTML, runtime configuration and credentials out of this public repository.
- Run build and access tests before committing.
- Do not infer publication status or actual payment from planning records.
- Preserve server-side role separation for financial records.

## User-requested GitHub workflow
- The authoritative code repository is https://github.com/tsshim0105/ajou-lab-dashboard.
- For each requested dashboard change, inspect the current remote state, implement the change, run relevant verification, commit and push to that repository, then verify the remote result.
- Preserve concurrent changes and history. Never force-push to resolve a mismatch.
- Do not replace direct implementation with instructions asking the user to upload source files.
- Report a concrete connection blocker when remote writing is unavailable; do not claim synchronization succeeded.
- Keep online deployment coordinated with the source revision after GitHub saving succeeds. This workflow runs during requested tasks; it is not unattended continuous synchronization.

- The user explicitly renewed authorization on 2026-09-20 to automatically save requested dashboard code changes to this GitHub repository and deploy after validation. Do not ask for routine approval again; report actual tool-enforced blocks if any.

## Default student feature parity (user instruction, 2026-10-13)
- Apply requested dashboard content and UI features equally to approved students and the professor unless the user explicitly requests a restriction.
- Research funds and payroll remain professor-only, including server reads/writes and imports.
- Shared research and reagent content supports add/edit/delete/import/export and shared name mappings for students. Keep financial records and hidden paper metadata intact during student saves.
- Account access grants/revocations and private device subscription administration remain security administration; never silently expose them as content management.
- Verify both student UI and server permissions for each applicable change.
