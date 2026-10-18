# Annotation interaction contract

The approved minimal v2 direction and the user's 2026-10-18 clarification govern this change: list clicks open read-only; clicking the text activates editing without a separate button; unchanged text creates no draft. README.md describes public behavior; CONTRIBUTING.md owns distribution and verification rules. The existing host and session APIs remain authoritative for preview security, storage boundaries and send admission.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Client More menu native width select | client.js, i18n.js | Fit / fixed preview widths; native popup | reliability.mjs, narrow browser review |
| Form | Overlay openCard / commit / publishDraft | overlay.js | New note, click-to-edit, resume changed draft | reliability.mjs, scroll.mjs IME and restore |
| Scrollbar | Scoped panel and card CSS | client.js PANEL_CSS, overlay.js css | Host panel and isolated preview | computed styles and narrow overflow review |
| Toast | Client flash / notice | client.js, i18n.js | Status, persistent send error with retry, reversible delete with Undo | reliability.mjs fail/retry/delete |
| CRUD | Overlay state and client session bridge | overlay.js, client.js | Read-only saved note; one changed draft per URL | reliability.mjs create/view/edit/delete/restore |

## State and recovery

- The host right sidebar is the single visible entry, with the existing keyboard shortcut preserved. There is no duplicate header entry.
- Saved notes and drafts are isolated by Harness session and full upstream URL, including query and hash. The proxy origin remains separate from Harness.
- Opening a saved note never starts a draft. Clicking or tabbing into the text starts editing in place. Opening the card does not focus the text. A draft exists only when content differs from the saved value. Reverting to the original removes the draft. Emptying an existing note is a change and is retained, but Save requires nonempty content.
- Enter/Save commits and continues picking. Shift+Enter inserts a newline; IME composition never commits. Esc/outside closes and preserves changes; Cancel discards changes. Reload restores the current draft; a previously closed draft stays closed until resumed.
- A second changed draft cannot replace the existing one. Finish or discard it first. Editing the same note resumes it.
- Reading a note leaves send available. Writing or pending changes to an existing saved note block sending stale content. Sending uses the existing session admission receipt; repeated send clicks are disabled. Failure preserves notes and the unrelated composer draft, and exposes retry.
- Payloads keep every comment in full and the complete URL once per batch. A captured unique selector uses one compact locator line. Unverified, invalid, missing or ambiguous selectors require explicit verification with available semantic and geometry hints. Styles and component chains are omitted.
- Delete offers Undo. Accepted send clears only the submitted, unchanged notes. Add to composer is explicit and does not submit.
- Floating list and menus never resize the preview. More owns history, width, language, external-open and help. Escape closes the active popover before exiting marking; keyboard closure restores trigger/marker focus where available.
- Owned icon controls have bilingual accessible names. Regions are non-modal; they do not trap focus. Panel themes follow Harness; overlay palette follows the page. Reduced motion disables decorative animation.

## Verification scope

`npm run check` synchronizes committed runtime bundles and checks catalog parity. `npm test` covers distribution, proxies, reliable interactions and real native scrolling. `npm run test:harness` uses an isolated profile and local model endpoint to verify real Harness CSS, preview and send admission. The premium static audit is scoped to production package sources; examples/demo-app is an annotation target fixture, not plugin UI. Manual Desktop inspection verifies the local linked acceptance build. Releases follow the tag-driven workflow after the same verification gates pass.
