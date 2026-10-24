# Dots reconstruction requirements

User-confirmed scope: all Dots features, including creation, conversation, execution state, interactive character and the computer screen. Work is in this independent folder; the existing OhMyDots and Grok projects are not modified.

## Evidence boundary

The installed artifact is `/Applications/ChatGPT.app/Contents/Resources/app.asar`, SHA-256 `5ddc4e48259aa6f979e04529b1a5a4ae54b0f5c4ad6db5c6e004924c10916ddb`. It is identical to the prior analysis input. Fresh REA parent: `ev_d5abe43373ec1b20148b2792734526fe58fe6bd2d006f852b164577c2e24bc2f`; projection: `ev_1ee69bb081d432b1906ce2292cdb366fbd21a527ca1bc2d77433f9fcbbdcdb12`. Retained execution-flow parent: `ev_32f4cfbe87510490f813b779043616a63c9fbe1aec5876da2f9b445a1404dadf`.

Static analysis proves shipped code and contracts, not that account-gated features run on the original account. The cloud planning/model/memory/tool-policy implementation is not shipped in these client modules. The local OpenCode/SQLite/computer service is independently implemented against observed client concepts and must not be described as recovered cloud harness source. The original character WASM/data are retained locally with hashes and notices; authored C++ source is not recovered. No unrelated native binaries with integrity mismatches are used.

## Completion evidence to collect

1. New standalone folder: install/build/start without importing from an older project; lockfile, scripts, documentation and state isolation.
2. Dots-only REA evidence: artifact identity, selected module/source ranges, observations versus local choices versus unknowns, reproducible asset extraction and verification.
3. Creation: new profile, onboarding, appearance selection, one idempotent creation, saved/reloaded identity, rename/pause/delete.
4. Conversation: separate room and task identifiers, actual model response, no fabricated success, persisted messages, deduplicated request IDs, delivery-unknown retry, cancellation and restart recovery.
5. State: live monotonic revisions, task activity, approvals/questions, explicit terminal/interrupted/error state and character mapping.
6. Character: original engine actually loads, native catalog/selection, binary appearance persistence, pointer/keyboard/reduced-motion/visibility behavior, original activity enum.
7. Computer: actual remote desktop frames and user input in an isolated local computer; ownership/epoch handoff, no static screenshot presented as live. Connection/starting/failure/disconnected states must be honest. A configured service contract test is not proof of a running desktop.
8. Faithful Dots UI: source-guided onboarding, sidebar/chat, floating 300px profile, hero/compact identity, appearance editor, activity transcript/back-focus, computer screen, settings, desktop/mobile and light/dark verification.
9. Preserve state and boundaries: existing projects/data unchanged; no key plaintext in UI/logs, loopback services, workspace-limited tools, explicit permission before writes/shell/computer input.

Tests, runtime responses and rendered screenshots must be evaluated against the corresponding requirement. Missing original server authority or unavailable local computer runtime remains explicit; do not substitute a mock and mark the full goal complete.
