# Grok reconstructed 연결

2026-10-25 로컬 검증. UI 원본 자산 1,479개(82,727,116 bytes)는 그대로 유지했다.

## 실행 경로

원본 Dots UI → 기존 Dots REST API → `GrokRuntime` → Dot별 Grok 호스트의 인증된 loopback gateway → 원본 transcript/send pipeline/runner → Grok의 OpenCode inference executor → `SendMessage` → Dots Store/SSE → 원본 UI.

`tools/grok-prepare.mjs`는 로컬 Grok 프로젝트의 검증된 production binding inventory와 원본 worker 소스를 빌드한다. 원본 소스 파일은 변경하지 않는다. Node 26 및 해당 ABI용 tree-sitter가 필요하다. 빌드 결과는 Git에서 제외한다. 이 연결용 composition은 box transport에서 미연결 오류를 반환하므로 기존 네이티브 데스크톱/exec daemon에 연결하지 않는다.

`server/grok-host.mjs`는 호스트 프로세스, 비공개 gateway 토큰과 격리된 데이터 경로를 소유한다. 인증 파일은 복사하지 않고 기존 OpenCode CLI를 실행한다. API 토큰을 브라우저에 전달하지 않는다. 한 Dot의 취소가 다른 Dot을 멈추지 않도록 호스트를 분리한다.

`server/grok-runtime.mjs`는 최초 연결에서 Dot → Grok agent ID를 저장한다. 기존 Dots 대화는 첫 요청에 과거 문맥 데이터로 제공한다. Grok의 private `thinking`/`assistant-text`는 사용자 메시지로 노출하지 않고, 실제 `send-message`만 기록한다. 새로운 메시지는 원본 Grok transcript에 남으며 호스트가 다시 시작되어도 같은 에이전트를 사용한다. 작업별 nonce와 시도 번호를 사용한다. 재개 요청은 이전 transcript를 읽어 완료된 행동을 반복하지 않도록 전달하지만 외부 도구의 exactly-once 실행을 보증하지는 않는다.

질문은 `respondToWidget`, 로컬 도구 승인은 `resolveLocalToolPermission`의 `allow-once`/`deny`, auto review 승인은 `resolveAutoReviewApproval`의 `approved`/`denied`로 전달한다. 비밀 요청을 일반 텍스트 입력으로 바꾸지 않는다. 첨부와 미지원 카드 유형은 명시적인 미지원 항목으로 남긴다.

## 확인한 결과

- 원본 UI에서 메시지 전송 → 실제 Grok agent `4b2ea4a3-ee63-4e6c-bad3-6cd96e7abece` → OpenCode `opencode-go/gpt-6-luna` → 실제 SendMessage 표시 및 작업 완료.
- 같은 에이전트의 두 번째 요청에서 질문 위젯 생성 → 원본 Dots 입력 카드 표시 → 브라우저에서 “초록” 입력/수락 → Grok이 “좋아하는 색이 초록이라고 확인했어요.” 전송 → 작업 완료.
- 두 작업 모두 `completed`, 질문 항목 `allowed`. 스크린샷은 로컬 `.data/grok-evidence/conversation-and-question.png`에 저장했다.
- 기본 3420 UI/3410 API를 Grok 모드로 재시작했고 기존 두 Dot과 과거 대화는 유지했다. 모델 설정은 실제 응답을 확인한 `opencode-go/gpt-6-luna`로 바꿨다.
- 질문/승인 API 응답의 중복 처리, 오류 시 가짜 응답 방지, 취소 시 소유 호스트 종료, private transcript 제외는 자동 테스트로 검증한다. 실제 임의 파일/셸 도구 실행과 컴퓨터 조작은 검증하거나 활성화하지 않았다.

## 남은 연결

Docker 컴퓨터와 Grok 도구 런타임의 연결, 첨부/결과물 전송, 비밀 입력, provider OAuth, Grok 내부 에이전트 간 메시지와 Dots 프로필의 동기화는 별도 구현이 필요하다. 설치된 Grok/원본 앱의 계정 저장소를 가져오거나 권한을 자동 허용하는 방식으로 연결하지 않는다.
