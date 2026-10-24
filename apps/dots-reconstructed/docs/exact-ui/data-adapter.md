# Original Dots renderer: local data boundary

`exact-host/local-adapter.mjs` connects the original shipped React components to the existing SQLite/OpenCode process at port 3410 through the exact host's same-origin `/api/` proxy. It does not implement a replacement chat DOM, CSS, animation, composer, profile panel, or creation controller.

## Version-specific observed contracts

Source artifact SHA-256: `5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869`.

| Shipped symbol | Observed responsibility | Local integration |
| --- | --- | --- |
| `app-initial.iRr` (`_g`) | HTTP client singleton with `safeGet`, `safePost`, `safePatch`, `safePut`, `safeDelete` | Replace transport methods with an allowlisted local dispatcher. Unknown services reject with 501. |
| `app-shared.Oit` / `Eit` (`axt` / `p1`) | Original WebFetch initializer and singleton used by `EN` for actual Blob downloads | Adapt only GET of same-origin actual artifact and saved-avatar URLs to browser fetch. Preserve real Response/Blob, errors, and abort signals; reject other resources. |
| `app-initial.VRr` (`$h`) | Mutable account context read by derived account/user atoms | Use identities `local` and `local-user`, `authMethod: local`, `hasChatGptToken: false`. No credential store is accessed. |
| `app-initial.E_r` (`Fw`) | Profile query key `['cloud-aeon', accountId, userId, profileId]` | Seed original profile objects mapped from SQLite. |
| `app-initial.D_r` (`Iw`) | Profile-by-root query key `['cloud-aeon-by-thread', accountId, userId, rootThreadId]` | Stable local root alias per profile. |
| `app-initial.Nur` (`pE`) | Catalog key `['cloud-aeon-profiles', accountId, userId]` | Seed actual local profiles. |
| `app-initial.Y_r` (`kw`) | Primary selection key `['primary-aeon', accountId, userId]` | First actual local profile supplies selection. |
| `app-initial.lLr` (`Yg`) | Account capability key `['usage-settings', 'accounts-check', 'v4-2023-04-27', accountId, userId]` | Local capability descriptor, no cloud membership or token claim. |
| `app-initial.uBr` (`Fh`) | Mutable client feature flags | Select original messaging/catalog client implementation with `codex-app-aeon-cloud-mode`; transport remains local. |
| `app-initial.Ber` (`pcr`) | Thread execution-category override | Map local persistent Dot root aliases to the original `durable` product category, enabling the original native editor. This is a client category, not an external server connection. |
| `app-initial.Ver` (`scr`) | Host connection-state setter | Set connected only after successful local state/SSE connection, and disconnected on transport failure. |
| `Pjn` | Cloud WebSocket room subscription | Host exposes `ExactSetMessagingSubscription`; replace transport with real local `/api/events` SSE. |
| `c4c` | Original messaging backend client factory | `ExactAdaptMessagingClient` preserves its room/history parser and replaces send with local API delivery plus persisted-message readback. Cloud attestation is not used for a local model request. |
| `pEt` | Native account-input subscription state | Host exposes `ExactUseLocalAccountInputs` to select a ready local capability source, without consulting the installed app's account store. |
| `gh` | Native executor manager lookup | Local manager confirms room readiness against SQLite and rejects unimplemented operations promptly. |
| `Pic` | Original room-live state consumed by status rows and native character activity | Host exposes a local data setter; the adapter projects actual task states into the original room-live schema. |
| `E9n` | Original output ledger | Actual artifact items become original `message-file` cards with original file icons, preview, and download controllers. |
| `room-view.Lt` | Original room implementation below cloud-account eligibility wrapper | Host may expose as `ExactRoom`, so local mode does not impersonate a cloud login. |

The observed original creation request is `POST /tbo` with `display_name: ''`, `create_thread: true`, `should_initialize: true`. Its response requires profile `id`, `root_thread_id`, and `messaging_room_id`. The local adapter creates a real SQLite profile and room; `dot` is the local fallback name for the original empty-name request. It returns a stable **local alias** `local-dot-{profileId}` as the root identity. This is not a recovered server thread. The older reconstruction's `active_root_thread_id` is its most recent task ID, which must not be used as a stable original room route.

## Mapped operations

| Original request | Local operation |
| --- | --- |
| `GET /tbo`, `/tbo/primary`, `/tbo/{id}`, `/tbo/by-thread/{root}` | Actual local profile state and stable aliases |
| `POST /tbo` | `POST /api/profiles` |
| `PATCH /tbo/{id}` | `PATCH /api/profiles/{id}` |
| `DELETE /tbo/{id}` | `DELETE /api/profiles/{id}` |
| `POST /tbo/{id}/messaging-room` | Return the existing actual local room; creation always allocates it atomically |
| `GET /messaging/rooms/{id}` | Original `DM` room object built from actual local profile, members, messages |
| `GET /messaging/rooms/{id}/messages` | `/api/rooms/{id}/messages`, original cursor/page projection |
| `POST /messaging/rooms/{id}/messages` | Existing OpenCode enqueue endpoint; preserves request ID and idempotency nonce |
| `GET /messaging/rooms/{id}/messages/{message}/elicitation` | Inspect actual SQLite approval/question status and a stable local request fingerprint |
| `POST /messaging/rooms/{id}/messages/{message}/elicitation/response` | Re-read status, validate fingerprint and explicit choice, then call the real `/api/approvals/{id}/respond` endpoint |
| `GET /messaging/rooms/{id}/files/{file}` | Verify an actual artifact belongs to that room, then return original file metadata with a same-origin actual artifact download URL |
| `GET /tbo/{id}/activity` and `/activity/stream` | Actual local tasks projected into the shipped activity schema; updates follow real local SSE events |
| `GET /tbo/{id}/tasks` and `/tasks/{taskId}` | Actual local task metadata projected into original history/detail query objects |
| `GET /tbo/{id}/automations` | Empty actual local inventory; no scheduler is installed and no create/update operation is claimed |
| `GET /tbo/{id}/environment/status` | Actual local computer readiness from `/api/computer/status`; reading status never starts it |
| `POST /tbo/{id}/environment/recreate` or `/environment/start` | Explicit local computer start action, followed by a real status read |
| `POST /cloud-aeons/avatar-snapshots` | Store actual PNG bytes through immutable `/api/local-avatars` local storage and retain owned renderer metadata; return a `file-service://local-avatar-*` pointer |
| `GET /files/download/{local-avatar-id}` | Resolve the saved PNG to the same-origin HTTP `/api/local-avatars/{id}` URL |
| Read cursor | Persist local renderer read position in its own localStorage namespace |
| Typing heartbeat | Local transient no-op; never reports model completion or cloud delivery |

Original assistant messages are projected into `raw_messages` with `author.role: assistant` and text content parts. The original message client performs its own parsing and renders the resulting messages. Original user messages have `account_user_id: local-user`. The room's Dot member uses `local-dot-user-{profileId}`, allowing the original sender identity logic to distinguish the Dot from the user.

`local-approvals.mjs` projects persisted `approval`/`question` task items into Dot-authored wire messages with `content.elicitation`. The shipped native-room client already collects these into its elicitation map. Its original `card-5c0779d33063` `on`/`pr` controller validates and renders the request; no approval-card markup is authored locally. The original generic MCP form request has `request_id`, `thread_id`, `turn_id`, `status`, and params containing `mode: form`, `serverName`, matching thread/turn IDs, `message`, and `requestedSchema`. Empty properties select the original generic approval UI; a required string property selects the original question form.

The wire message's `content.text` equals the actual `params.message`. The original `sn` comparison uses that equality to select its content/fallback presentation; an empty projected text did not meet that contract and left a contentless bubble in narrow layouts. No bubble sizing CSS is replaced by the adapter.

The original controller reads `{elicitation, request_fingerprint, runtime_status, can_respond}` before a response. The local adapter checks a fresh task snapshot and exact fingerprint, maps explicit accept to allow and decline/cancel to deny, and forwards the user's actual answer. Resolved, interrupted, or stale requests cannot authorize another action. Original controller response claims remain in IndexedDB under this standalone host's origin, separate from the installed app. Task SSE events trigger an original timeline resync so a newly created approval appears without reloading.

Persisted artifact items use the shipped `message-file` shape: `roomId`, stable `fileId`, `name`, `mimeType`, `sizeBytes`, and original source identity. `open-file-ea7bd5664e81` loads the original `openOrbitFile` controller, which requests `{name,mime_type,download_url,library_file_id}` from the messaging file endpoint. Local files have no cloud Library ID; their real same-origin artifact URL supports the original plain text/Markdown preview and download handlers. Treating local files as generic external links caused unnecessary remote favicon requests; the original file card avoids that path.

The original attachment controller supplies a `loadText` closure to the original `Lp`/`t8u` text-preview tab. That closure downloads a Blob through `EN → Eit.fetch → Qbt`, which otherwise requires the installed native `httpFetch` service. The standalone adapter replaces only this binary transport for allowlisted owned local URLs; it supplies actual bytes, not preview text generated by an alternate UI. The original preview error label can misleadingly say “Cloud environment unavailable” for any read failure when its host category is `durable` and environment ID is null, even if the local `loadText` callback exists.

The adapter retains original appearance manifest metadata and PNG snapshot bytes in `dots-exact-local-metadata-v1` localStorage after successful local writes. Startup preserves the original save controller's existing appearance atom and its sync/version metadata. Profiles without a native manifest use the original preset fallback instead of falsely declaring an interactive saved avatar. It does not label the previous reconstruction's preset values as original appearance identifiers. Local storage is only renderer metadata, not a shared cloud appearance database. It never accesses the original installed app's persisted account or settings store.

Saved native profiles send `avatar: null` and `avatar_id: null`. A legacy preset ID and a rendered manifest are mutually exclusive in the original snapshot protocol: the native room's `HMn` avatar snapshot prioritizes its `avatarId`, and `Pac` rejects native state when that ID is non-null. Sending `sunglasses` alongside a valid native manifest therefore restored a legacy SVG after reload, even though decoding the manifest succeeded. The original native selectors and widgets handle the cleared-ID representation themselves.

The shipped ChatGPT image resolver rejects `data:` download URLs. The adapter therefore returns a real same-origin HTTP URL for a saved `file-service://local-avatar-*` snapshot. Startup awaits idempotent migration of any existing owned PNG metadata to immutable `/api/local-avatars` storage before rendering children. IDs stay stable, and repeating migration repopulates a replaced local backend store. The original image and native character widgets remain responsible for loading and rendering the actual bytes; no substitute avatar markup or generated image is introduced.

## Validation and limits

Validated without executing original app code outside the browser:

- `node --check exact-host/local-adapter.mjs` passed.
- Read through live port 3420 proxy returned two actual SQLite profiles.
- Original room projection returned `DM`, two members, and nine persisted messages from the first room.
- User and assistant message projections retained real stored text.
- Unknown cloud endpoint rejected with 501.
- Original activity stream snapshot includes required `next_cursor: null` (the shipped `Za` schema uses Zod null, not an optional value). Eight actual persisted task rows across two profiles passed the corresponding field/type checks.
- The local manager returned ready only for an existing persisted room and rejected an unsupported native operation with 501.
- Isolated approval contract checks confirmed explicit decline maps to `decision: deny`, a repeated/stale response rejects with 409, and question answer text reaches the backend request unchanged. These checks are separate from browser confirmation of the shipped card.
- Parent browser QA confirmed a real `opencode-go/beam-free` tool plan reached the shipped approval card. Clicking its original Allow button released the real local runtime waiter; `write_file` created `ui-check.txt` and `read_file` returned the exact content `원본 UI 도구 연결 확인`. Evidence: `docs/qa/exact-ui/approval-pending.png`, task `82943f2a-80b7-4354-b07f-56cb988dba59` on the isolated QA backend. A subsequent real `/api/state` read confirmed the task completed with no error, both tools completed, the approval was allowed, and the artifact persisted. Question-form browser QA is not yet established by this check.
- A read-only artifact transport check against that real task confirmed `ui-check.txt` projects into an original `message-file`, resolves through original attachment metadata to the actual download URL, and returns the exact file content. An unknown file ID rejects with 404. Browser preview interaction remains a separate QA check.
- The binary adapter contract returned an actual Response/Blob containing those exact file bytes, rejected an external URL with 501, propagated AbortError, and restored the original fetch method on disposal.
- Parent fresh-page browser QA on port 3423 confirmed the saved pink native triangle renders in both profile and sidebar after reload. The original manifest encoder and native selector both retained 66 bytes, native canvas eligibility was true, and no pending/older-version suppression remained. Clearing conflicting legacy avatar IDs fixed the remaining fallback. The temporary avatar render observer was removed after this confirmation.

This transport check does not establish visual fidelity or the full browser interaction path. Those require the parent task's browser QA using the actual original components.

Unsupported original services fail explicitly. Cloud connector setup, cloud upload/widget services, native account attestation, cloud account permissions, and cloud planning are not recreated by returning successful dummy responses. Local connector/plugin inventories are explicitly empty because this standalone installation has no connected cloud apps. Attachment sending currently rejects with 501. The original cloud creation controller also intentionally refuses to create a second primary Dot when its catalog already contains profiles; mounting that controller with an existing local catalog must preserve or explicitly route around that product restriction.

The local settings service uses only the adapter's own metadata namespace. Its initial `conversationDetailMode: STEPS_PROSE` selects the original Work interface. Neither local preferences nor original-component atom snapshots read from the installed application's native settings store.

Bounded diagnostic console entries contain service method names, request paths, status codes, capability booleans, and avatar manifest-presence/state-length fields only. They never include request bodies, user message text, authentication material, file contents, PNG bytes, or encoded character state.
