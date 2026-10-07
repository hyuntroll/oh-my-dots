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
