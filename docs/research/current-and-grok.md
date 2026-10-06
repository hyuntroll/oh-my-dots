# 현재 OhMyDots 구조와 Grok fork 검토

검토일: 2026-10-06. 이 문서는 구현 전 코드 스냅샷에 대한 조사다. 아래 파일·행은 조사 시점 기준이며 후속 구현으로 이동할 수 있다. 실제 서비스나 사용자 작업은 변경하지 않았다. 테스트 이름은 기존 회귀 보장의 근거이며 이 조사에서 새로 실행했다는 뜻은 아니다.

## 먼저 내릴 결정

현재 제품은 이미 **대화 → Run → 도구 → 격리된 컴퓨터/셸 → 실행 이벤트 → 화면**을 갖췄다. 첨부 문서의 Phase 1부터 다시 시작하거나 패키지 14개를 만드는 것보다 두 경계를 강화하는 편이 낫다.

1. **Tool Registry와 입력 검증**: 도구의 이름·설명·입력 규격을 한곳에서 정의하고 OpenAI와 Codex에 같은 규격을 제공한다. 서버 실행 직전에도 검사한다.
2. **Context Builder와 크기 예산**: 현재의 최근 24개 메시지 선택을 명시적인 정책으로 분리한다. 현재 요청을 보존하고, 오래된 내용이 제외됐는지 기록한다. 자동 LLM 요약은 정확성과 비용 검증 후 추가한다.

둘 다 사용자 GUI 소유권과 기존 FIFO 실행기를 유지한 채 구현할 수 있다. 이번 종합 검토에서 실제 작은 실험으로 선택한 것은 **Registry + 읽기 전용 Skill 검색·불러오기**다. Skill은 미리 승인한 로컬 설명서를 목록에서 찾고 필요할 때 읽는 기능부터 구현한다. Context Builder는 중요하지만 이 두 실험의 범위를 넓히지 않고 후속으로 남긴다. 따라서 위 2번은 조사자의 개선 후보이며 이번 완료 기능이라는 뜻이 아니다.

사용량 UI의 수백만 input tokens는 한 Run에서 여러 번 요청한 입력의 **누적 합계**일 수 있다. 한 번의 모델 요청 context가 수백만 tokens였다는 증거가 아니며, `run.usage`의 누적 수치만으로 context overflow를 진단하면 안 된다. 요청별 input, cache hit, 현재 context budget을 따로 관측해야 한다.

## 쉬운 개념 설명

- **Conversation**은 한 주제의 대화 폴더, **Run**은 그 폴더에서 받은 한 건의 심부름이다.
- **Compute Session**은 심부름꾼이 사용하는 컴퓨터다. 심부름이 끝나도 켜둘 수 있다.
- **Registry**는 사용 가능한 공구의 목록과 사용 설명서다. **Executor**는 실제 공구를 작동시키는 담당자다.
- **Context**는 이번 작업을 위해 책상 위에 펼친 자료다. **Memory**는 다음에도 기억할 사실, **Skill**은 재사용할 작업 설명서다.
- **Event**는 작업 일지다. 일지로 화면을 복원할 수 있어도 진행 중인 프로그램까지 자동 복구되는 것은 아니다.
- **Approval**은 특정 작업 내용에 대한 사용자 동의다. 질문창을 띄우는 기능과 승인 없이는 실행되지 않는 서버의 강제 규칙은 서로 다르다.

## 첨부 문서의 12개 점검 항목

| 항목 | 현재 코드와 판단 | 조치 |
|---|---|---|
| 1. Agent loop 위치 | `runtime.py:121-223`은 FIFO·Run 수명·시간 제한을 관리한다. 실제 LLM/도구 반복은 `providers.py:122-179`의 Agents SDK와 `codex_stream.py:14-108`의 Codex app-server가 맡는다. 자체 while-loop로 다시 구현할 필요 없음. | **KEEP** 역할 분리 |
| 2. Conversation / Run / Compute | `store.py:36-76`에 각각의 모델이 있다. Run은 전역 FIFO 하나, 컴퓨터는 `computer-1` 하나다. `Run`에 compute FK가 없으므로 여러 컴퓨터를 배정하는 기능까지 구현된 것은 아니다. | **KEEP**, 멀티 compute 배정은 **ADD LATER** |
| 3. 중앙 Registry | `tools.py:23-82`의 TOOLS와 `Tools.invoke`가 공통 목록/진입점이다. 다만 핸들러와 설명·진행문구·이벤트 메타데이터가 여러 조건문에 나뉜다. | **CHANGE** 작은 정의 객체와 lookup으로 통일 |
| 4. Schema와 실행 분리 | OpenAI는 TOOLS schema를 사용하지만 `mcp_bridge.py:26-77`은 함수 signature로 별도 schema를 만든다. 예컨대 desktop action enum이 MCP에서는 단순 string이고 ask_user 2–4개 제한도 선언이 다르다. 공통 실행 전 전체 schema 검증도 없다(`main.py:388-392`). | **CHANGE**, 최우선 |
| 5. arbitrary eval/exec | GUI는 `computer/daemon.py:57-81`의 Literal/범위 검증과 allowlist 명령이다. LLM이 만든 명령을 수행하는 `shell_exec`는 의도적인 격리 셸 도구다. host에서 eval하는 것과 다르다. artifact 도구의 Python 코드는 개발자가 생성하고 경로를 제한한다(`tools.py:209-237`). | **KEEP** sandbox와 typed GUI |
| 6. Browser vs Desktop | 현재 browser는 Chromium GUI이며 별도 DOM/AX/CDP operator가 없다. 프롬프트도 DOM 조작을 금지한다(`providers.py:25-26`). | **ADD LATER**, 현재 규약을 바꿀 때 별도 browser observer/operator 도입 |
| 7. 주요 상태 Event | `store.py:89-97,129-165`, `tools.py:111-168`, `execution.py`가 상태·질문·도구·스트림·사용량을 저장한다. call_id와 sequence로 복원 가능. 상태 DB commit과 Event commit은 별도이므로 완전한 event sourcing/원자적 outbox는 아니다. | **KEEP**, context 선택·정책 결정 event 추가; 원자성은 운영 규모 증가 시 보강 |
| 8. Context 누적 | `runtime.py:150-169`에서 새 Run에 최근 24개 메시지만 전달한다. 따라서 영구 무한 누적은 아니다. 그러나 메시지 길이·토큰 예산과 과거 요약이 없고 Run 안의 tool/screenshot 이력은 provider에 맡긴다. `providers.py:155-156`에서 앱이 SDK 압축 옵션을 켜지 않는다. | **CHANGE** 길이 예산과 관측; provider 내부 압축과 앱의 대화 선택을 구분 |
| 9. Memory / Skill | 현재 별도 저장·검색 계층 없음. Codex host skill discovery도 꺼둠(`providers.py:110-112`). | **ADD LATER** curated read-only skills부터; 자동 학습/장기 기억은 provenance·삭제 정책과 함께 |
| 10. Policy / Approval | GUI owner/epoch, 격리 셸, cancel 등은 서버에서 강제한다. 온라인 저장·메일 전송의 의미적 승인 규칙은 프롬프트(`providers.py:38-43`)와 ask_user에 의존한다. 클릭 좌표만으로 Gmail 발송 여부를 증명할 수 없음. | **CHANGE** 정확한 한계를 문서화. 구조화된 앱 도구가 생길 때 내용에 바인딩한 approval ticket 구현 |
| 11. Agent 재시작 후 attach | API는 기존 desktop adapter에 다시 연결한다(`runtime.py:30-43`). 진행 Run은 SERVER_RESTARTED로 실패하고 재시도해야 함(`store.py:194-202`). Docker가 살아있으면 GUI는 유지되지만 compose의 `/home/dot`·`/workspace` tmpfs는 컨테이너 재시작/교체 내구성이 없다. artifacts volume만 별도 영속. | **KEEP** 보수적 Run 복구, durable compute/session 저장은 **ADD LATER** |
| 12. Subagent 도구 확장 | 공통 invoke 뒤에 붙일 수 있다. 단 현재 Codex multi_agent off, 전역 active Run 하나, desktop owner 하나다. 별도 설계 없이 병렬 GUI를 허용하면 충돌함. | **ADD LATER** 읽기 전용 조사 delegate + 제한된 toolset + 취소 전파부터 |

## 현재 지켜야 할 동작과 기존 테스트

- Take over는 GUI 소유권만 바꾸고 Cancel과 독립: `tests/test_control.py:16,50,86`에서 진행 중 입력, epoch, 반환 뒤 낡은 좌표 폐기를 검사한다.
- FIFO와 동일 요청 중복 제거: `tests/test_runs.py:96`.
- 질문 답변은 같은 Run을 재개하고 다음 Run을 앞당기지 않음: `tests/test_runs.py:129`.
- 뒤에 들어온 요청이 이전 Run context에 섞이지 않음: `tests/test_runs.py:218`.
- 서버 재시작은 명시적인 재시도이며 남은 셸을 종료: `tests/test_runs.py:153,242`.
- 새로고침 후 질문 선택지 복원 및 이전 질문 답변 거부: `tests/test_runs.py:275`.
- 스트리밍/사용량/도구 call_id/출력 제한/취소 terminal 이벤트: `tests/test_execution.py:19,33,63,117,144,166,181`.

이 테스트들을 유지하면서 Registry 변경에는 잘못된 action·추가 필드·비정상 타입·MCP/OpenAI schema 동등성·취소 시 도구 부작용 없음 테스트를 추가하면 좋다. Context에는 긴 한글/영문, 최신 요청 보존, 다른 대화/미래 FIFO 메시지 제외, trim 기록, 원본 DB 보존 테스트를 추가한다.

**추가로 남은 GUI 검증 경계**: `tools.py:178-186`은 실행 직전에 받은 최신 epoch를 입력에 붙인다. 모델이 화면 A를 본 뒤 사용자가 Take over/Return control을 모두 마치고, 모델이 화면 A의 좌표로 나중에 호출하는 경우 그 좌표가 새로운 epoch와 함께 제출될 수 있다. 지금 테스트는 소유권이 실제로 바뀌는 시점의 대기·레이스는 잡지만 이 전체 시나리오를 보장하지 않는다. 후속 높은 우선순위로 screenshot observation ID와 관측 당시 epoch를 행동에 바인딩하고, 오래된 관측 기반 입력은 최신 screenshot을 반환하며 폐기하도록 검증해야 한다. 이 점은 Registry나 Skill만 추가해 해결되는 문제가 아니다.

## 사용자 Grok fork의 정확한 정체

- Fork: [hyuntroll/grok-bot-0.18-reconstructed](https://github.com/hyuntroll/grok-bot-0.18-reconstructed)
- Upstream: [b-nnett/grok-bot-0.18-reconstructed](https://github.com/b-nnett/grok-bot-0.18-reconstructed)
- 2026-10-06 GitHub API 확인 시 양쪽 main SHA: `a9f633e09d49a85829b8236331b9e21f7e612634`.
- 공식 xAI나 Anysphere 원본 소스가 아니다. 공개 배포된 macOS 앱에서 복원·확장한 연구 프로젝트라고 README가 명시한다. GitHub `license`는 null이며, [NOTICE](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/a9f633e09d49a85829b8236331b9e21f7e612634/NOTICE.md)는 upstream source license를 부여하지 않는다고 명시한다. **공개 저장소와 자유롭게 재사용 가능한 오픈소스 라이선스는 같은 뜻이 아니다.**

따라서 이 조사에서는 구조를 읽어 이해하고 OhMyDots에서 독립 구현하는 방식을 택한다. 복원 코드, 원본 바이너리, UI assets를 프로젝트에 복사하거나 dependency로 넣지 않는다. 법률적 결론을 단정하는 대신 확인된 라이선스 부재와 저장소 자체 고지를 기준으로 결정한 것이다.

## Grok에서 참고할 부분과 피할 부분

| 패턴·직접 읽은 소스 | 장점 | 단점/현재 대안 | OhMyDots 적용 |
|---|---|---|---|
| [inference-router](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/a9f633e09d49a85829b8236331b9e21f7e612634/source/node-agent-coordinator/inference-router.ts) | provider별 스트림을 같은 transcript 항목으로 투영, agent별 실행 queue, MCP 공통 경로 | 한 transcript에 provider 구현과 UI 동작이 붙고, composing 표시를 위해 1.2초 지연도 들어 있음. 기존 우리 실행 이벤트가 더 작고 명시적 | 공통 이벤트 계약 유지. 인위적인 응답 지연이나 entire router 이식은 하지 않음 |
| [공통 usage 타입](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/a9f633e09d49a85829b8236331b9e21f7e612634/source/shared/inference-router.ts) | input/output/cache read/write와 schemaVersion 분리 | provider에 따라 값의 의미가 다름; 로컬 집계는 청구서가 아님 | 기존 run.usage를 유지하고 미래 provider 추가 시 normalization 테스트 |
| [MCP registry](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/a9f633e09d49a85829b8236331b9e21f7e612634/source/packages/agent/tools/mcp/mcp-tool-registry.ts), [execution guards](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/a9f633e09d49a85829b8236331b9e21f7e612634/source/packages/agent/tools/mcp/mcp-execution-guards.ts) | 도구 발견과 실제 호출, tool definition 읽음 상태를 분리 | 우리 도구 7개에 dynamic namespace/descriptor filesystem까지 넣으면 과함 | 지금은 단일 registry. 도구 수가 크게 늘 때 search/load 도입 |
| [loop detector](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/a9f633e09d49a85829b8236331b9e21f7e612634/source/packages/agent/loop-detection/agent-loop-detector.ts) | 오류뿐 아니라 반복된 모델 출력도 감지 | 정상적인 반복 작업과 혼동 가능, 복잡한 임계값·metrics 의존 | 기존 동일 실패 3회 중단 유지. 향후 같은 화면·같은 행동 연속 감지는 경고부터 실험 |
| [Codex direct responses](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/a9f633e09d49a85829b8236331b9e21f7e612634/source/host/extensions/inference/codex-direct-responses.ts), [local auth status](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/a9f633e09d49a85829b8236331b9e21f7e612634/source/shared/node/inference-router-local.ts) | provider tool loop, streaming, usage를 통일 | direct transport와 auth-file 해석은 provider 변경에 민감. tool executor 유지관리까지 떠맡음 | 현재 Codex app-server로 로그인 재사용, 자격증명을 앱 코드가 읽지 않는 경로 유지 |

## 다음 단계의 우선순위

**지금**: Registry/검증과 context 선택의 명시화. **다음**: 읽기 전용 Skill index, context 요약의 정확도 평가, event DB 보존/retention. **그다음**: browser DOM/AX observer를 독립 도입하고 GUI ownership·fresh observation 계약을 함께 확장. **외부 앱 도구 도입과 동시에**: 서버가 작업 payload를 알고 승인 범위를 검사하는 policy. **멀티 사용자·여러 컴퓨터 단계**: compute session FK/상태/영속 프로필/lease와 per-compute queue. **마지막**: 도구 범위와 비용 예산이 제한된 delegation.

첨부 문서의 Phase 6까지 Approval을 미루는 순서는 조정해야 한다. 실제 메일·Calendar 변경을 지원하는 순간부터 승인 규약이 필요하며, 지금은 프롬프트에 있는 규칙과 기술적으로 강제된 규칙의 차이를 분명히 해야 한다.

## 학습 순서

1. Python `asyncio` task·cancel·queue: 사용자가 취소했을 때 왜 background task까지 닫아야 하는지 이해.
2. JSON Schema / Pydantic: LLM의 JSON 출력은 프로그램에 넣기 전 검사해야 하는 외부 입력임을 이해.
3. 상태 머신·idempotency·event sequence: 중복 클릭·재연결·새로고침에도 작업이 두 번 실행되지 않는 이유.
4. Context window·token·tool result: 대화 DB 전체와 이번 모델 요청에 들어가는 자료의 차이.
5. Docker process/network/filesystem 격리: tool permission과 OS sandbox의 차이.
6. 그 후 Memory retrieval·Skill progressive disclosure·browser AX/CDP·agent evaluation. 프레임워크 이름을 외우기보다 현재 코드의 한 Run을 끝까지 따라 읽는 편이 빠르다.
