# Local Dots backend

This is a new local adapter, **not recovered ChatGPT cloud harness code**. The shipped UI evidence establishes separate profile, room and task identity; request identity and nonce fields; subscription/revision concepts; streamed task items; and user input/approval responses. It does not establish the cloud model policy, cloud scheduler or original computer execution implementation.

`server/main.mjs` serves the built frontend and JSON API on `127.0.0.1:3410`. Default data is this new folder's `.data/`, overridable with `DOTS_DATA_DIR`. Node >=24.15 is required for `node:sqlite`. The SQLite database uses WAL. Profiles, rooms, messages, tasks, settings, request deduplication and monotonic event revisions survive restart. Incomplete tasks become `interrupted`; pending approval items become `interrupted`, and the user may explicitly resume the original task. Completed tool results are retained. Resumption gives the model the persisted conversation and prior task item history; it does not claim a cloud session continued.

OpenCode 2 is executed with `run --standalone --agent dots --format json`. Its own account store supplies credentials; this app never reads or copies keys. The adapter creates a private temporary OpenCode configuration. All native tools and integrations are denied except the exact `dots_*` tools on this app's run-scoped MCP bridge. OpenCode receives a random task capability token that authorizes only that active task's local tool endpoint. The CLI and its descendants are an owned process group, terminated on cancellation, shutdown or the three minute inference timeout. Account/model failures become visible task errors; no synthetic assistant response or automatic success is inserted.

The MCP tools read/list this Dot's workspace, request approval before writing, run approved restricted filesystem commands, ask a user question, request approval before sending to another local Dot, and call the separately implemented computer bridge. File paths are canonicalized and symlink escapes are rejected. Writes produce persisted artifact items and downloadable results. The shell tool deliberately supports only `pwd`, `ls`, `cat`, `mkdir`, `touch`, `echo`, `wc`, `head`, `tail`; it rejects shell substitution, pipes, redirects and arbitrary programs. This is a restriction enforced by argument validation, not a claim of a recovered or operating-system container sandbox. Another Dot's tasks are independent and must request approval for their own peer messages, preventing silent autonomous ping-pong.

The default model is `opencode-go/beam-free` (updated after a successful local inference probe on 2026-10-25). The configured ID must match a model available to the user's OpenCode account. The model listing is cached for sixty seconds; listing availability is not proof of authenticated inference access.

## API

All JSON fields are snake_case. A profile, room and task always have different UUIDs. Profiles are soft-deleted.

- `GET /api/state`: `{profiles,rooms,messages,tasks,settings,runtime,revision}`.
- `GET /api/health`: local status and current durable revision.
- `POST /api/profiles`: `{display_name,description?,preset?,appearance_state?,snapshot?,request_id?}` → profile. Native appearance bytes must be base64 encoded `ORBAST1`, <=64 KiB; PNG snapshot has a 3 MB encoded limit. A creation request ID deduplicates retries.
- `PATCH /api/profiles/:id`: profile fields and `is_paused`. Pause interrupts current inference; resume is explicit or queued work continues when unpaused.
- `DELETE /api/profiles/:id`: soft delete and cancel active tasks.
- `GET /api/rooms/:id/messages`: message array.
- `POST /api/messaging/rooms/:id/messages`: `{content:{text},request_id,idempotency_token,reply_to?}` → `{message,task}`. Request ID and nonce both deduplicate within a room. Each message creates its own task. A supplied `task_id` does not replace local task identity.
- `GET /api/tasks/:id`: task with persisted items.
- `POST /api/tasks/:id/cancel` or `/resume`: task. Resume supports interrupted/error/paused tasks.
- `POST /api/approvals/:id/respond`: `{decision:'allow'|'deny',value?}`. A question answer uses `value`. An approval no longer active returns409 rather than inventing an answer.
- `GET /api/tasks/:id/artifacts?path=...`: exact persisted artifact bytes, scoped to the owning workspace.
- `GET/PATCH /api/settings`: `{model,theme,computer_url}`. Computer URL must be loopback HTTP.
- `GET /api/events`: durable SSE. Named events `profile.created`, `profile.updated`, `room.created`, `room.updated`, `message.created`, `message.updated`, `task.created`, `task.updated`, `settings.updated`. Every `data` is `{revision,type,data,created_at}`. Resume with `Last-Event-ID` or `?after=N`. Notifications are published only after their SQLite transaction commits.
- `POST /internal/tasks/:id/tools`: private active-task bearer capability endpoint used only by the MCP subprocess.

Computer HTTP routes and execution are implemented separately in `server/computer.mjs`. The main server calls `handleComputerRequest(req,res,{store,runtime,dataDir,url,readJson,json})` and the tool runtime calls `executeComputerTool(name,args,{task,workspace,signal,store,dataDir})`.

The server validates loopback Host, same-port loopback Origin on writes, and rejects cross-site fetches. It serves JS modules/WASM/data with appropriate MIME types. A missing asset is a404, not the SPA fallback. No old OhMyDots or Grok source file is imported at runtime.

## Verification

`node --test tests/backend.test.mjs tests/runtime.test.mjs` verifies separate IDs, persisted request dedupe, actual assistant messages from provider output, honest errors, paused/resumed tasks, same-site protections, SSE revision replay, real approval allow/deny, stored tool results/artifact download, file symlink escape rejection, restart recovery, OpenCode private config and stdin contract, process-group cancellation including a child process, restricted command execution and transaction rollback without ghost events. The CLI tests use controlled fake executables and do not spend account quota. Live generic greeting results are recorded by the integration pass separately.

## Native tools and structured fallback

Native OpenCode MCP is attempted first. Ordinary text, such as a greeting, returns after this single inference call. A valid structured tool envelope, an explicit `dots_tools_unavailable` marker, literal unexecuted model tool syntax, or a generic empty/native run failure activates a bounded local tool loop. Authentication and provider routing errors are surfaced directly; no other account or model is silently substituted.

During fallback, the OpenCode agent has **all tools and integrations denied**, and receives tool schemas only as prompt data. It returns `{text,tool_calls:[{name,args}]}`. The app validates each request against its own declared tool schema and executes it through the same workspace/approval/computer boundaries as native MCP. Results are persisted and provided to the next inference call. There are at most eight rounds, twelve requested tools and two malformed outputs. Invalid loops become visible errors. Successful mutating calls already executed before native serialization failed are carried forward and identical requests reuse their result, preventing duplicate writes, shell actions or peer messages. Read operations can run again. Screenshots are passed as actual private PNG attachments to OpenCode `--file`, with metadata in the serialized tool result; base64 pixels are not presented as pretend observations in plain text.

Verification on **2026-10-19**, using installed OpenCode2 and **`opencode-go/longcat-2.5-preview-free`**:

- An actual generic Korean greeting completed and persisted the model's response.
- A harmless private-agent system canary returned the exact requested marker, confirming the temporary configuration was effective.
- The free model's native tool serialization returned unexecuted tool markup. The app correctly detected this and used the structured local loop.
- The rerunnable live test requested `hello.txt`, waited for the real write approval, allowed exactly that test write, verified actual bytes `안녕하세요`, then required the model's read-file tool result before completion. `write_file` and `read_file` both persisted as completed. The final assistant response came from the model. This live test passed in 32.3 seconds; temporary test data was removed.

Re-run the actual model test explicitly (it uses the user's existing OpenCode account):

```sh
DOTS_LIVE_TEST=1 node --test tests/runtime-live.mjs
```

Normal tests skip the live model test and use controlled fake CLIs/providers. The final backend suite has 25 controlled passing tests, including native-to-fallback mutation deduplication and ordinary greeting single-call behavior. Actual computer execution is covered separately by the computer integration pass; backend file-tool success does not establish computer availability.

Implementation references for the adapter's OpenCode2 configuration are the official [MCP server names and direct mode](https://dev.opencode.ai/v2/docs/mcp-servers/), [configuration locations](https://dev.opencode.ai/v2/docs/config/), and [deny policies and integration boundaries](https://dev.opencode.ai/v2/docs/policies/).

Computer action schemas follow the running desktop contract: `move`, `click`, `double_click`, `scroll`, `type`, `key`, `launch`; `launch` selects `app: browser|terminal|files`. Coordinates are integer1280×960 bounds, mouse buttons1..3 and scroll `delta` -20..20. Unknown actions such as `open_terminal`, legacy `direction/amount`, invalid enum choices and out-of-bounds numbers are rejected and persisted before any approval is created. The integration test exercises the approved launch payload through the actual computer adapter into a controlled HTTP desktop contract.

Computer approval items preserve the complete validated request in `args` as well as their existing top-level fields, so the approval UI can show the selected application, coordinates, keys and text before consent.

The question/elicitation API test runs actual `ask_user`: task and profile enter `needs_input`, the submitted value is delivered exactly once and persisted before task completion, and resubmission of the consumed question returns409 without another assistant message.
