# Codex desktop tool availability regression — 2026-10-07

## Observed failure

The Google Minesweeper request failed with TASK_NOT_COMPLETED on gpt-6-luna without a single tool.started event. The MCP inventory reported 11 product tools and zero inherited host tools, so an inventory check alone did not prove model-visible tool availability. A controlled fresh-history probe used tools, while a probe containing the previous unavailable-tools answer could repeat the refusal. Strengthening instructions alone did not fix the real application.

## Change

Register the 11 shared registry definitions directly as app-server dynamicTools with deferLoading=false. Dispatch only registered tools for the active thread through the existing Tools.invoke validation, Dot runtime, budget and takeover boundary. Reject foreign thread, unknown tool and approval requests; disable inherited MCP servers and host skills as before.

Keep the required code-mode host enabled. Tool responses are JSON strings with image_url; the Codex-only instructions and descriptions require JSON.parse and image(result.image_url) so actual pixels reach the model. Returning dynamic inputImage without explicit image emission resulted in raw data URL text and the model could not inspect the desktop. Disabling the host produced an explicit code-mode host is disabled error and was reverted. The SDK/OpenAI provider retains native tool output images and has no code-mode instructions.

The app-server schema was generated from the installed codex-cli 0.159.3. The upstream string conversion can be inspected in https://github.com/openai/codex/blob/main/codex-rs/tools/src/tool_output.rs (content_items_to_code_mode_result).

## Validation

- 76 Python tests passed; Ruff and git diff --check passed.
- Protocol regression exercises a valid screenshot call, unchanged shared schema registration, JSON image result delivery, rejection of foreign-thread/unknown tool calls, inherited tool refusal, usage reporting and child process cleanup.
- Real localhost:3080 retry on the same Dot and failed conversation called desktop_screenshot, desktop_windows and desktop_input instead of claiming unavailable tools.
- After image emission correction, the real model completed a screenshot-only task and accurately described Chromium showing Google’s unusual-traffic/reCAPTCHA page. No CAPTCHA was solved and no game completion is claimed.
- Evidence: .local/qa/tool-calling-fixed.png (local screenshot, not committed). Live visual test used gpt-6-luna; other Codex models were not individually tested.

## Follow-up regression and correction

The screenshot-only verification above was insufficient. The next short message, “돌아가서 다시 해봐”, again returned an unavailable-desktop-tools refusal with zero tool calls (run b394c75d-4ad6-4e20-85be-084cc46b2d77), despite the correct dynamic inventory.

Conversation history was flattened into a single user message, including earlier assistant refusals. Inject prior messages with their original user/assistant roles using the installed app-server's experimental thread/inject_items API, and send only the latest request as the new turn. If a failed answer claims tools are unavailable without invoking any, call the actual Dot screenshot tool through the existing budget/validation boundary and provide its result for one bounded corrective turn. Preserve actual failures; the correction does not manufacture success.

- 78 Python tests passed; Ruff and git diff --check passed. Protocol tests cover role-preserving history and the bounded correction with a real image input, in addition to existing dispatch boundaries.
- Real same-conversation follow-up on gpt-6-luna (run 88caf0fe-66a6-4c7e-9ce8-d8cce583c415) completed five desktop_screenshot and six desktop_input calls. No corrective turn was needed in this live run.
- The visible desktop showed Google search and an opened Minesweeper board with revealed squares. The model ended with TASK_NOT_COMPLETED because it did not solve the board, accurately reporting the game remained in progress. Tool availability is verified; game completion is not.
- Evidence: .local/qa/tool-followup-fixed.png (local screenshot, not committed). The experimental history API was verified against installed codex-cli 0.159.3; future CLI compatibility remains a dependency.

## Persistent goal loop — 2026-10-08

### Root cause

The shared instructions explicitly classified every unfinished step as failed. Outcome exposed only completed/failed/out_of_scope, and both providers immediately returned final_answer to Runtime.execute. This ended an actionable game at the first model final answer. Desktop input already returned a screenshot, but did not check whether the target changed. Previous capability errors in assistant history could also contaminate the next attempt.

### Implementation

- A shared GoalLoop consumes in_progress and legacy failed outcomes and starts another provider turn within the same Run. Codex retains the same thread; the OpenAI SDK retains message/tool call/result pairs. Checkpoints record observed state and next action as events while the Run remains RUNNING.
- GUI completion requires a post-action observation and nonempty completion_evidence. Missing evidence causes continuation. An observed tool blocker gets a recovery attempt before it can terminate; repeated model claims without a new tool attempt do not count. Authentication/approval continues to use ask_user and the existing WAITING_USER/takeover flow.
- The runtime injects the registered computer capabilities and probes the actual Dot's control endpoint. Connection failure is a retryable observed error, not proof of missing registration.
- Each action returns a new screenshot with screen dimensions, observation_id and pixel-change metadata. Click verification additionally compares a 33×33 region around the target, so a running timer elsewhere cannot count as target change. A third identical ineffective coordinate action is rejected and requires a different target or recovery. Coordinates outside the observed screen are rejected.
- Each unfinished GUI turn gets another real screenshot attached as a native image to the continuation. The screenshot goes through Tools.invoke, preserving budget, cancellation and takeover checks. Screenshots stay out of persisted event payloads.
- The Codex output schema is normalized to the strict required-properties format; adding defaulted checkpoint fields without this normalization caused a real CODEX_RUN_FAILED and was corrected.
- Existing limits remain: 80 total tool calls, 600 active seconds and three identical tool errors. An additional 12 continuation ceiling prevents tool-free model loops. Limits produce truthful incomplete errors, never success. User cancellation still stops the current provider process.

### Validation and limits

- Regression-first tests failed before GoalLoop existed. After implementation, 89 Python tests passed; Ruff and git diff --check passed. Tests cover both provider continuations, retained tool history, native corrective images, strict schemas, completion evidence, blocker recovery, bounded loops, cancellation, coordinate bounds, ineffective-click recovery and timer-only changes.
- Live run 9c0bbdf5-ad59-4f18-8286-9e91a01f3ce4 continued across two model checkpoints and 80 tool calls instead of ending at its first unfinished answer. It ultimately ended TOOL_LIMIT_EXCEEDED; no game win is claimed. Docker restart had changed the Dot's published ports; the existing local connection settings were repaired before testing.
- Follow-up run f57c5920-1f65-4e79-876a-3047802c2f51 on gpt-6-luna used the native corrective image and target-region comparison. Its first unfinished answer at tool call 10 was followed by a real screenshot and more desktop actions within the same Run. The checkpoint described the actual Minesweeper.Online beginner board rather than the earlier Google reCAPTCHA page. Live comparison recorded target_changed=False despite screen_changed=True, confirming the timer distinction.
- That follow-up ended TOOL_LIMIT_EXCEEDED after 80 completed tools and five checkpoints; game-over checkpoints led to further restart attempts. It recorded 63 changed targets and seven unchanged targets. The final visible board was game over, not victory. Evidence: .local/qa/goal-loop-running.png and .local/qa/goal-loop-result.png (local screenshots, not committed).
- This is a bounded persistence/recovery controller, not a Minesweeper solver. Completion evidence is model-interpreted; nonempty evidence plus a fresh observation is not an independent semantic victory detector. Local pixel change is a grounding aid, not proof of a correct move. Checkpoints survive in events, but automatic resumption after process restart is not implemented. Google itself may require user takeover for CAPTCHA; the live playable board was Minesweeper.Online, not Google's own game.

Status: DONE_WITH_CONCERNS — premature finalization is fixed and reproduced; game completion and independent semantic detection remain unverified.
