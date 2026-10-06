# 런타임 레퍼런스: Hermes · OpenHands · smolagents · nanobot

조사일: 2026-10-06. 공식 저장소의 기본 브랜치 HEAD를 GitHub API로 확인한 뒤 해당 SHA에 고정된 소스·라이선스를 읽었다. 아래 **확인**은 소스에서 관찰한 사실, **제안**은 OhMyDots에 맞춘 설계 판단이다. 벤치마크 우열이나 직접 통합 성공을 주장하는 문서가 아니다.

## 먼저 알아둘 개념

| 개념 | 쉬운 설명 | OhMyDots 예 |
|---|---|---|
| Agent loop | 할 일을 고르고, 도구를 쓰고, 결과를 보고 다음 행동을 고르는 반복 | 화면 확인 → 버튼 클릭 → 새 화면 확인 |
| Tool registry | 사용할 도구의 설명·입력 형식·실행 함수를 모은 주소록 | `desktop_input`, `shell_exec`, `ask_user` |
| Availability | 지금 연결되어 쓸 수 있는가 | 컴퓨터 서비스가 응답하는가 |
| Permission / policy | 연결되어 있더라도 이 요청을 실행해도 되는가 | 사용자 GUI 주도권, 전송 승인 |
| Skill | 특정 일을 하는 방법을 적은 작업 설명서 | 회의 준비 절차와 결과 확인 순서 |
| Memory | 사용자나 환경에 관한 저장된 사실 | 선호 시간대, 이전에 확인한 프로젝트 환경 |
| Context | 이번 판단에 모델이 실제로 읽는 자료 | 현재 요청 + 최근 대화 + 필요한 설명서 |
| Event log / View | 전체 작업 기록 / 지금 판단에 필요한 기록 묶음 | UI에는 모든 기록, 모델에는 관련 최근 결과 |

주소록에 도구가 보인다는 것은 실행 승인이 아니다. Skill을 읽었다고 새 권한이 생기는 것도 아니다. 두 구분은 현재 Take over 동작을 보존하면서 확장할 때 중요하다.

## 조사 버전과 라이선스

| 프로젝트 | 확인한 SHA | 루트 라이선스 | 조사 시점 상태 |
|---|---|---|---|
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | `206102314a811b01abb27d24ca6d05fdd1b977b5` | [MIT](https://github.com/NousResearch/hermes-agent/blob/206102314a811b01abb27d24ca6d05fdd1b977b5/LICENSE) | 미보관, 10월 6일 push |
| [OpenHands Software Agent SDK](https://github.com/OpenHands/software-agent-sdk) | `6f8c38d00e0468ac138447be905f07a8a0cd7af8` | [MIT](https://github.com/OpenHands/software-agent-sdk/blob/6f8c38d00e0468ac138447be905f07a8a0cd7af8/LICENSE) | 미보관, 10월 6일 push |
| [smolagents](https://github.com/huggingface/smolagents) | `c30b115286e000e98711fae5e85993547b73d826` | [Apache-2.0](https://github.com/huggingface/smolagents/blob/c30b115286e000e98711fae5e85993547b73d826/LICENSE) | 미보관, 9월 30일 push |
| [HKUDS/nanobot](https://github.com/HKUDS/nanobot) | `42f06ab1dcf7329f6bdcce9256fea74a99d19cbb` | [MIT](https://github.com/HKUDS/nanobot/blob/42f06ab1dcf7329f6bdcce9256fea74a99d19cbb/LICENSE) | 미보관, 10월 5일 UTC push |

루트 라이선스는 모든 선택 의존성·모델 가중치·동봉 바이너리까지 동일한 조건이라는 뜻이 아니다. 이번 제안은 개념을 참고한 자체 구현이므로 프로젝트 전체를 의존성으로 추가할 필요가 없다.

## 1. Hermes: 필요한 도구와 설명서만 꺼내 쓰기

**확인.** `ToolEntry`는 이름, toolset, schema, handler, check_fn, requires_env 등을 갖는다. `get_definitions()`는 요청한 도구를 정렬하고 가용성 검사에 통과한 schema를 반환한다. 도구 탐색·플러그인 소유권·가용성 캐시까지 들어 있어 단순 딕셔너리 이상의 제품 구조다. [registry.py](https://github.com/NousResearch/hermes-agent/blob/206102314a811b01abb27d24ca6d05fdd1b977b5/tools/registry.py)

**확인.** `skills_list`는 이름과 짧은 설명부터 주고, `skill_view`가 선택한 본문 및 연결 파일을 제공한다. 이를 progressive disclosure, 즉 필요한 순간에 더 자세한 정보를 보여주는 방식이라 부른다. [skills_tool.py](https://github.com/NousResearch/hermes-agent/blob/206102314a811b01abb27d24ca6d05fdd1b977b5/tools/skills_tool.py)

**확인.** `ContextEngine`은 세션 시작·종료, 응답 사용량 갱신, 압축 필요 판단과 압축 실행을 분리한다. 기본 정책에는 처음과 최근 메시지를 보호하는 설정이 있다. 실제 compressor 파일은 약 343KB이므로 최신 코드를 그대로 옮길 작은 모듈로 보기는 어렵다. [context_engine.py](https://github.com/NousResearch/hermes-agent/blob/206102314a811b01abb27d24ca6d05fdd1b977b5/agent/context_engine.py), [context_compressor.py](https://github.com/NousResearch/hermes-agent/blob/206102314a811b01abb27d24ca6d05fdd1b977b5/agent/context_compressor.py)

**장점.** API와 Codex가 같은 도구 설명을 쓰도록 만들기 쉽다. 설명서 본문을 항상 넣지 않아 요청마다 읽는 자료가 줄 수 있다. 새 도구와 새 작업 절차를 별도로 추가할 수 있다.

**단점.** 설명서 선택이 틀리거나 읽지 않으면 품질 개선이 없다. 모든 Skill을 자동으로 신뢰하면 오래된 절차·악성 지시가 유입된다. 가용성 캐시만 믿으면 서비스가 중간에 끊겼을 때 실행은 실패한다. 토큰 절약량은 우리 시나리오에서 따로 측정해야 한다.

**OhMyDots 제안.** 처음에는 앱에 동봉한 읽기 전용 Skill 몇 개, 짧은 목록, 이름으로 읽는 도구만 둔다. 임의 호스트 경로 읽기, 원격 설치, 에이전트의 자기 수정은 넣지 않는다. 목록과 로드 이벤트를 남겨 실제 어떤 설명서를 사용했는지 검증한다. GUI가 잠깐 사용자 소유라고 schema를 없애지 않고 기존 소유권 대기를 유지한다.

**대안.** Skill이 두세 개뿐이면 명시적 작업 템플릿 버튼이 더 예측 가능하다. 다양한 요청으로 늘어날 때 목록+선택 로딩의 가치가 커진다. 외부 표준을 따를 경우 `SKILL.md` 메타데이터부터 맞추고, 파일 이름만 같다고 모든 플러그인 기능 호환을 주장하지 않는다.

## 2. OpenHands: 원본 기록을 보존하고 모델에 주는 자료만 줄이기

**확인.** SDK는 append-only 이벤트 기록과 모델용 `View`를 구분한다. 압축 때 원본을 삭제하는 대신 `Condensation` 이벤트가 어떤 범위를 요약했는지 표현한다. 토큰/크기 임계치 또는 명시적 요청으로 압축하며, 일반 압축과 진행 불가능할 때의 강제 초기화를 구별한다. [Condenser 설명](https://github.com/OpenHands/software-agent-sdk/blob/6f8c38d00e0468ac138447be905f07a8a0cd7af8/openhands-sdk/openhands/sdk/context/condenser/README.md)

**확인.** `ToolCallMatchingProperty`는 action과 observation을 `tool_call_id`로 연결하고 그 사이를 압축 분할 경계로 삼지 않도록 한다. 모델 API에 결과 없는 호출이나 호출 없는 결과를 주지 않기 위한 구조다. [tool_call_matching.py](https://github.com/OpenHands/software-agent-sdk/blob/6f8c38d00e0468ac138447be905f07a8a0cd7af8/openhands-sdk/openhands/sdk/context/view/properties/tool_call_matching.py)

**확인.** registry는 `ToolDefinition` 또는 factory를 등록하고 usable 상태와 사용자 선택 가능 여부를 구별한다. UI에서 선택할 도구 목록과 대화별 실행 도구 생성 책임을 나누는 참고점이다. [registry.py](https://github.com/OpenHands/software-agent-sdk/blob/6f8c38d00e0468ac138447be905f07a8a0cd7af8/openhands-sdk/openhands/sdk/tool/registry.py)

**장점.** 장시간 작업에서 UI 기록은 유지하면서 모델 컨텍스트만 관리할 수 있다. 요약 오류가 생겨도 원본과 대조할 수 있다. 중단·재접속·오류 분석에 같은 사건 식별자를 쓸 수 있다.

**단점.** 요약은 손실이 있고 추가 LLM 비용도 든다. 이벤트가 남아 있다고 외부 컴퓨터 상태까지 되돌아가거나 실행이 정확히 재개되는 것은 아니다. 메일 발송처럼 외부 효과가 있는 행동을 단순 이벤트 replay로 다시 실행해서는 안 된다.

**OhMyDots 제안.** 기존 이벤트/사용량/도구 call_id를 보존한다. 추후 압축을 추가한다면 요약에 원본 sequence 범위, 남은 목표, 확인된 결과, 승인 범위, 미해결 질문을 넣고 `context.compacted` 이벤트를 기록한다. UI용 잘린 stdout만 모델의 전체 작업 기억으로 사용하지 않는다. 현 단계에서 SDK 전체로 갈아타는 이득은 작다.

**더 작은 대안.** 자동 요약 전에 오래된 큰 도구 출력에 크기 상한과 파일 참조를 적용하고, 현재 목표·사용자 답변을 따로 보존한다. 단 `takeLast(N)`만으로는 오래된 요구사항이 사라질 수 있다. 우리 `runtime.py`는 이미 최근 메시지 24개로 제한하므로 문제는 무한 축적만이 아니라 중요한 과거 결정의 누락이다. 이 제한은 실행 시작 시 가져오는 대화 기록에 적용된다. 한 Run 안에서 provider가 반복 수집하는 스크린샷·도구 결과가 만드는 비용과는 별개다. 누적 입력 토큰이 크다는 것만으로 현재 컨텍스트가 그 크기라는 뜻도 아니다. 이미지 관측 수·단계별 입력·캐시 사용량을 분리 측정한 뒤 압축이나 관측 교체 정책을 선택해야 한다. 이번 조사는 그 비용을 실측하지 않았다.

## 3. smolagents: 반복 실행의 기본 구조를 공부하기

**확인.** `MultiStepAgent`는 단계 제한, 계획 단계, step callback, streaming, 결과 상태를 갖는다. `ToolCallingAgent`와 코드를 실행하는 `CodeAgent`가 별도 클래스다. CodeAgent는 local 외에도 docker/e2b/modal/blaxel executor 선택지를 둔다. [agents.py](https://github.com/huggingface/smolagents/blob/c30b115286e000e98711fae5e85993547b73d826/src/smolagents/agents.py)

**확인.** 메모리 구조는 TaskStep, ActionStep, PlanningStep, FinalAnswerStep처럼 단계 종류를 나눈다. 여기서 memory는 실행 이력을 나타내므로 사용자 장기 기억과 같은 개념으로 혼동하면 안 된다. [memory.py](https://github.com/huggingface/smolagents/blob/c30b115286e000e98711fae5e85993547b73d826/src/smolagents/memory.py)

**장점.** 모델 호출과 도구 실행이 어떻게 반복되는지 따라가기 좋다. 성공·단계 한도·실패를 구별하고 관측 지점을 넣는 법을 배울 수 있다.

**단점.** CodeAgent의 임의 코드 실행 모델은 현재 OhMyDots의 제한된 도구·격리된 셸과 운영 방식이 다르다. 작은 라이브러리라는 소개와 별개로 현재 agents.py는 약 81KB이며 실행기·모델·도구까지 이해해야 한다.

**OhMyDots 제안.** dependency 도입보다 상태별 종료와 공통 이벤트 callback 설계만 참고한다. 현재 provider가 담당하는 반복 루프 위에 또 다른 loop를 얹지 않는다. 처음 학습할 때는 `MultiStepAgent._run_stream` → `ToolCallingAgent` → `ActionStep` 순서로 읽고 CodeAgent는 나중에 본다.

**대안.** 지금 쓰는 OpenAI Agents SDK/Codex provider를 유지하고 우리 runtime이 공통 취소·시간 한도·결과 검증을 책임지는 편이 변경량이 적다.

## 4. nanobot: 명료한 registry와 context builder

**확인.** `ToolRegistry`는 등록/제거/조회, schema 목록 캐시, 입력 해석·검증, 실행을 구분한다. 내장 도구와 MCP 도구를 각각 정렬해 프롬프트 순서를 안정화한다. 이름 유사도는 제안에만 쓰고 실제 실행 이름은 정확히 일치시킨다. [registry.py](https://github.com/HKUDS/nanobot/blob/42f06ab1dcf7329f6bdcce9256fea74a99d19cbb/nanobot/agent/tools/registry.py)

**확인.** Skill loader는 `name`·`description` 메타데이터를 검증하고 workspace, plugin, builtin 경로를 구별한다. 비활성 Skill과 요구 조건을 처리한다. [skills.py](https://github.com/HKUDS/nanobot/blob/42f06ab1dcf7329f6bdcce9256fea74a99d19cbb/nanobot/agent/skills.py)

**확인.** `ContextBuilder`는 identity, bootstrap 자료, memory, 항상 켜진 Skill, 나머지 Skill 요약, 세션 요약을 조립한다. 최신 `loop.py`는 약 114KB라 저장소 전체를 최소 에이전트 예제로 소개하기보다 이 두세 파일을 선별해서 읽는 편이 정확하다. [context.py](https://github.com/HKUDS/nanobot/blob/42f06ab1dcf7329f6bdcce9256fea74a99d19cbb/nanobot/agent/context.py), [loop.py](https://github.com/HKUDS/nanobot/blob/42f06ab1dcf7329f6bdcce9256fea74a99d19cbb/nanobot/agent/loop.py)

**장점.** 작은 registry부터 만들 때 따라가기 쉬운 책임 분리가 보인다. 도구 이름·schema·실행 함수가 서로 달라지는 실수를 줄인다.

**단점.** 자동 형 변환은 편하지만 잘못된 입력을 조용히 받아들이는 정책이 될 수 있다. 폴더에 있는 문서를 모두 시스템 지시처럼 취급하는 설계는 OhMyDots의 개인 계정·GUI 작업에서 그대로 쓰기 어렵다.

**OhMyDots 제안.** 도구의 정확한 이름, JSON object 입력, 허용 필드, action enum을 중앙에서 검사한다. OpenAI 노출 schema와 Codex MCP bridge가 같은 정의를 참조하게 하고 회귀 테스트로 맞춘다. 도구 정의 순서는 안정적으로 유지한다.

**대안.** 현재 도구 수라면 플러그인 자동탐색 대신 정적인 `dict[str, ToolDefinition]`이면 충분하다. 실행 함수 전체를 바꾸지 않고 schema·메타데이터 카탈로그부터 분리하면 위험이 작다.

## 두 가지 작은 실험 제안

이 절은 조사 시점의 제안이며 구현 완료 보고가 아니다.

### A. 공통 ToolRegistry + 중앙 입력 검증

현재 `tools.py`의 TOOLS와 `mcp_bridge.py`의 데코레이터 함수가 별도로 정의된다. 예를 들어 desktop_input의 action enum은 Python `str` 선언만으로 동일하게 전달되지 않는다. 한 카탈로그에서 provider schema와 실행 검증을 만들면 새 도구를 붙일 때 누락이 줄어든다.

- 한 곳에 이름·설명·입력 schema·toolset을 정의한다.
- 실제 `Tools.invoke` 진입점에서 미등록 이름과 잘못된 인자를 거부한다.
- 사용 가능 여부와 GUI 제어권 검사는 분리한다. 등록 여부 자체는 보안 경계가 아니다.
- 검증: 잘못된 action, 누락 필드, 알 수 없는 도구, 추가 필드가 adapter 실행 전에 차단되는가; 두 provider의 도구 목록이 일치하는가.
- 기존 MCP 기본값 주의: ask_user가 `options=None`을 보내므로 선택 필드 정규화 없이 non-null JSON schema를 엄격 적용하면 기존 질문이 깨진다.

### B. 읽기 전용 Skill 목록 + 선택 로딩

회의 준비, 웹 조사, 결과 파일 검증 같은 설명서를 작은 파일로 둔다. 모델은 짧은 목록을 보고 필요한 본문을 한 번 읽는다. 로드한 이름·버전을 실행 기록에 남기면 사용자가 어떤 절차를 참고했는지 볼 수 있다.

- Skill은 권한을 바꾸지 않으며 웹페이지보다 높은 사용자 지시도 아니다.
- `skill_read(name)`처럼 등록한 이름만 받는다. `path`를 그대로 호스트에 열지 않는다.
- 이름과 설명 길이·파일 크기·중복 이름·없는 파일을 검증한다.
- 검증: 없는 이름/경로 탈출 차단, 목록에 본문이 없음, 실제 도구 호출에서 본문 반환, 취소와 Take over 동작 보존.
- 장기 기억 자동 생성, 외부 Skill 설치, 하위 에이전트 GUI 병렬 제어는 후속 단계로 둔다.

## 공부 순서

1. **JSON Schema와 typed tool call:** 함수에 어떤 입력이 들어올 수 있는지 선언하고 실행 전 검사해 본다. 예제는 `desktop_input.action` enum.
2. **상태 머신과 async 취소:** RUNNING, WAITING_USER, CANCELLED의 의미와 취소가 프로세스까지 전달되는 경로를 그려 본다.
3. **이벤트와 projection:** 같은 이벤트로 작업 타임라인과 현재 상태를 각각 만드는 법을 배운다. 저장된 기록을 재생하는 것과 외부 행동을 재실행하는 것은 다르다.
4. **Context budget와 tool-call 짝:** 최근 문맥을 남기되 호출과 결과를 함께 유지한다. 요약에서 사용자 승인을 누락하거나 확대하지 않는지 확인한다.
5. **Skill과 장기 기억:** 설명서와 사용자 사실을 분리하고 출처·버전·삭제 방법을 생각한다.
6. **그다음 delegation:** 독립적인 읽기 작업부터 나누고, GUI는 한 주체만 제어하며 서브에이전트에 최소 문맥·도구만 넘긴다.
