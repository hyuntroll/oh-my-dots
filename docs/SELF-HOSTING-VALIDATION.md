# Self-hosting validation — 2026-10-13

## Implemented

- `scripts/host.py`: installation, isolated production web build, local Codex CLI, private configuration, bcrypt hosting password, foreground/background service control, origin configuration and a generated Linux user-systemd unit.
- `compose.host.yaml`: persistent PostgreSQL, default desktop home, artifacts and tool volumes; loopback-published private services; password-protected gateway. `compose.host-linux.yaml` adds the Linux Docker host-gateway mapping.
- API session bootstrap accepts the configured remote host only with the gateway's secret and the existing Origin checks. Secure cookies are enabled for HTTPS origins. WebSocket access still checks the app session and Origin, in addition to gateway authentication.
- Per-Dot provisioning uses the selected Compose project. Managed Dot endpoints are refreshed when their runtime is loaded after a hosting restart.
- README uses three fresh 1280×720 screenshots of the actual workspace, settings and connections. Private conversations, account identifiers and keys are excluded from the captured views.

## Actual installation and runtime checks

A separate `ohmydots-qa` project was installed on localhost:3090 on macOS Docker Desktop. Existing localhost:3080 development services and another project's database were retained.

1. The real installer completed pip/npm dependencies, Codex CLI installation, Next.js production build and computer/shell image builds. No development web build was overwritten.
2. The machine's default Docker address pools were exhausted. Installation was corrected to allocate five explicit, non-overlapping private subnets from the existing Docker inventory, without pruning any networks.
3. Anonymous HTTP requests to the page, session API, Dot API and screenshot were all denied with 401. An unauthenticated screen WebSocket was also denied with 401.
4. With the temporary QA owner's HTTP authentication, the production page and API returned 200, an HttpOnly app session was issued, a real PNG desktop was returned and the screen WebSocket delivered the VNC `RFB` protocol greeting.
5. A second Dot was created through the authenticated API. Its separate computer and shell containers became available, with its own screenshot and appearance.
6. A Markdown artifact was saved into that Dot's isolated volume. Hosting was stopped, the QA Dot containers were stopped, and hosting was started again. The Dot identity, appearance, artifact and separate computer remained available. The default desktop's home was verified to be a persistent volume.
7. Stop/start was repeated with the final service supervisor. A generated user-systemd unit referenced the installation without credentials; systemd itself was not activated on macOS.

The protected deployment was exercised through HTTP and WebSocket clients. The automated in-app browser refused its HTTP authentication challenge (`ERR_INVALID_AUTH_CREDENTIALS`), so native browser password-dialog login is not claimed as a completed browser test. The README screenshots were captured from the actual local development UI, not from a fabricated hosted preview.

## Automated checks

- Python: 102 tests passed, including origin/CSRF/session checks, secure cookie flags, stale-process protection, subnet allocation and managed Dot port refresh.
- Web: 21 tests passed.
- Ruff, TypeScript typecheck and git diff --check passed.
- Real installer production build succeeded in its isolated web directory.

## Scope and remaining checks

This is one owner per installation, with multiple Dots. It does not implement team accounts, tenant isolation or billing. Linux bridge binding and generated systemd configuration are implemented, but a real Linux server reboot has not been exercised. Public DNS, Caddy certificate issuance and Tailscale access have documented setup paths; no public endpoint was created or verified. Long-duration network stability is not part of this hosting verification.

The temporary QA service is stopped after verification. Its test configuration and data-directory snapshot are retained under ignored `.local/qa/hosting-instance-2026-10-13/`; the normal local development service remains at localhost:3080. Test container volumes are retained while the QA containers and networks are removed. A fresh user installation can choose its own password and origin.
