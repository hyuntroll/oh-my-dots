# Codex · Claude Code · Letta · OpenClaw 조사

확인일: 2026-10-06. 공식 저장소와 공식 문서만 근거로 삼았다. 아래의 장단점과 적용 제안은 해당 소스와 OhMyDots 현재 코드를 비교한 판단이며, 성능 우위를 측정했다는 뜻은 아니다. 이 문서는 설계 조사이며 아래 제안의 구현 완료를 의미하지 않는다.

## 먼저 결론

OhMyDots에 당장 필요한 것은 다른 에이전트 제품 전체를 가져오는 일보다 **필요한 작업 절차만 불러오는 작은 스킬 시스템**과 **실행에 필요한 맥락을 보존하는 규칙**이다. 장기 기억은 그 다음이다. 이미 Codex app-server와 OpenAI Agents SDK가 실행 엔진 역할을 하고 있어서 그 위에 또 다른 완성형 에이전트 엔진을 얹으면 취소·질문·로그·권한의 주인이 중복된다.

첨부 문서의 방향은 좋지만 두 부분은 정정해야 한다. Letta의 현재 구현은 `letta-ai/letta-code`로 이동했고, 기존 `letta-ai/letta`의 V1 서버는 `archive` 브랜치의 역사적 자료다. Claude Code는 공개 GitHub 저장소가 있다고 핵심 런타임 전체가 오픈소스인 것은 아니다. [Letta 현재 안내](https://github.com/letta-ai/letta/blob/5bcdd177d70fa2b31a754cfcd801e77b2e1ab16a/README.md), [Claude Code 사용 조건](https://github.com/anthropics/claude-code/blob/8e60c4cac989c0e0cc6d2c49407a5c67f5a4a8e6/LICENSE.md).

## 공개 범위와 재현 가능한 소스

GitHub API의 기본 브랜치 HEAD와 라이선스 정보를 직접 확인했다. 다음 SHA는 조사 시점 스냅샷이며 최신 버전을 자동 추적하는 의존성으로 쓰라는 뜻이 아니다.

| 대상 | 조사 SHA | 공개 범위 / 라이선스 |
|---|---|---|
| [openai/codex](https://github.com/openai/codex/tree/822e58cc3d666166c7446c5b1ea2e52f5d09594c) | `822e58cc3d666166c7446c5b1ea2e52f5d09594c` | CLI·app-server 등의 공개 코드, Apache-2.0. 모델 가중치와 모든 클라우드 서비스가 공개되었다는 의미는 아니다. |
| [anthropics/claude-code](https://github.com/anthropics/claude-code/tree/8e60c4cac989c0e0cc6d2c49407a5c67f5a4a8e6) | `8e60c4cac989c0e0cc6d2c49407a5c67f5a4a8e6` | 예제·플러그인·문서 등의 공개 저장소. 루트 LICENSE는 All rights reserved 및 Commercial Terms 참조이며, 핵심 엔진을 자유롭게 복사 가능한 OSS로 취급하지 않는다. 개별 공개 프로젝트·파일 라이선스는 별도 확인한다. |
| [letta-ai/letta](https://github.com/letta-ai/letta/tree/5bcdd177d70fa2b31a754cfcd801e77b2e1ab16a) | `5bcdd177d70fa2b31a754cfcd801e77b2e1ab16a` | Apache-2.0. 현재 main은 이전 서버 소스의 유지 위치가 아니다. |
| [letta-ai/letta-code](https://github.com/letta-ai/letta-code/tree/4b028fab07c69edaac2ddb4f7b9a43573ff20d81) | `4b028fab07c69edaac2ddb4f7b9a43573ff20d81` | 현재 harness·CLI·app-server 등의 공개 코드, Apache-2.0. Letta Cloud 서비스와 구분한다. |
| [openclaw/openclaw](https://github.com/openclaw/openclaw/tree/20306571364c5b8df244fba15e88727b2b7c7a0e) | `20306571364c5b8df244fba15e88727b2b7c7a0e` | MIT. 외부 스킬·플러그인의 개별 라이선스와 권한까지 동일하다는 뜻은 아니다. |

라이선스의 실무적 의미: 코드 자체를 가져올 때는 원 프로젝트의 고지와 조건을 보존하고, 개념을 참고해 독립적으로 구현했는지 실제 코드를 복사했는지 구분해 기록한다. 이번 권고는 작은 자체 구현이다.

## 1. Codex: 실행 프로토콜과 스킬 조회 분리

**쉬운 설명:** 모델은 작업을 생각하는 직원이고 app-server는 직원에게 일을 전달하고 진행 상황을 받는 창구다. 스킬 목록은 책의 목차, `read`는 필요한 장만 펼치는 기능이다.

Codex의 공개 구현은 스킬 `list` 응답을 이름·설명·식별자로 구성하고, `read`에서 특정 스킬 본문을 읽는다. 목록과 읽기에는 응답 크기 제한·페이지 처리·가용성 확인이 있다. 이는 모든 절차를 매 요청에 넣는 방식보다 맥락을 관리하기 쉽다. [목록 구현](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/ext/skills/src/tools/list.rs), [읽기 구현](https://github.com/openai/codex/blob/822e58cc3d666166c7446c5b1ea2e52f5d09594c/codex-rs/ext/skills/src/tools/read.rs).

- **장점:** 모델별로 같은 절차를 재사용하기 쉽고, 왜 특정 절차를 선택했는지 실행 이벤트로 남길 수 있다.
- **단점:** 선택을 잘못하면 필요한 지침이 빠진다. 스킬이 도구 접근 권한을 부여하는 것처럼 구현하면 권한 경계가 흐려진다.
- **더 간단한 대안:** 초기에는 외부 설치 기능 없이 검토한 내장 스킬 2~3개를 목록으로 제공하고 `skill_read(id)` 하나로 읽는다. 임의 파일 경로·네트워크 설치·스크립트 실행은 필요 없다.
- **우리 서비스 적용:** `providers.py`의 공통 지침은 유지하고 스킬 요약만 덧붙인다. 실제 본문은 기존 `Tools.invoke` 경로를 통해 읽게 한다. Codex의 호스트 스킬 자동 탐색을 다시 켜지 않는다. `codex_stream.py`의 현재 app-server/MCP 연결을 재사용한다.

Codex의 대규모 Rust 스킬 런타임 전체를 Python 앱으로 옮길 이유는 없다. 또한 provider의 이벤트 프로토콜과 제품의 실행 이벤트는 분리해야 한다. 제공자 버전이 바뀌어도 채팅 UI는 같은 `tool.started`, `tool.completed` 계약을 사용하도록 한다.

## 2. Claude Code: 지침·기억·스킬·강제 정책의 구분

**쉬운 설명:** `CLAUDE.md`는 팀의 작업 지침, memory는 경험 수첩, skill은 특정 업무 설명서다. 문서에 “하지 말라”고 적는 것과 실제 문을 잠그는 것은 다른 기능이다.

공식 문서는 CLAUDE.md와 auto memory를 맥락으로 설명하고, 결정적 차단은 hook 같은 실행 단계의 통제로 구분한다. 스킬은 보통 설명을 먼저 제공하고 호출될 때 본문을 넣는다. permission은 도구 사용을, sandbox는 프로세스의 파일·네트워크 접근을 제한하는 별도 층이다. [메모리 문서](https://code.claude.com/docs/en/memory), [스킬 문서](https://code.claude.com/docs/en/skills), [permission 문서](https://code.claude.com/docs/en/permissions).

- **장점:** 사람이 읽고 수정 가능한 운영 규칙과 실행기가 강제하는 제약을 분리해 이해하기 쉽다.
- **단점:** 설정 파일·hook·permission·스킬이 많아지면 어느 규칙이 적용됐는지 추적하기 어렵다. 자연어 규칙은 강제 보장을 제공하지 않는다.
- **더 간단한 대안:** v0.0.1에서는 명시적 Python 조건문과 한 곳의 도구 레지스트리면 충분하다. 임의 hook 스크립트를 설치하는 프레임워크까지 만들 필요가 없다.
- **우리 서비스 적용:** `Tools.invoke`를 정책 검사 지점으로 유지한다. 지침, 실행 도구, 화면 제어권, 외부 변경 승인을 서로 다른 필드로 설명한다. 외부 웹페이지나 스킬의 문장을 사용자 승인으로 해석하지 않는다.

Claude Code 내부 엔진을 역공학하거나 비공개 코드를 가져오는 방향은 권고하지 않는다. 공개 문서의 설계 개념과 UI 경험만 참고해도 이 목적에는 충분하다.

## 3. Letta: 대화와 장기 기억을 분리

**쉬운 설명:** 대화 기록은 녹취록이고 장기 기억은 다음에도 참고할 정리된 메모다. “오늘 오후만 가능”은 시간 제한이 있는 사실이고, “회의는 서울 시간으로 보여줘”는 지속적인 선호다. 둘을 같은 수명으로 보관하면 나중에 잘못된 판단을 한다.

현재 Letta Code README는 memory·skills·agent identity를 유지하는 stateful harness와 Git 기반 MemFS를 설명한다. 소스에는 기억 파일의 제약 검사, 변경 충돌 복구, 메모리 작업 모듈이 분리되어 있다. 오래된 V1의 memory-block API 예제를 현재 설치법으로 그대로 쓰면 안 된다. [현재 README](https://github.com/letta-ai/letta-code/blob/4b028fab07c69edaac2ddb4f7b9a43573ff20d81/README.md), [기억 제약 구현](https://github.com/letta-ai/letta-code/blob/4b028fab07c69edaac2ddb4f7b9a43573ff20d81/src/agent/memory-constraints.ts), [V1 문서임이 표시되는 기존 안내](https://docs.letta.com/v1-sdk/concepts/stateful-agents).

- **장점:** 유용한 선호·환경·결정을 다음 대화에서 재사용할 수 있고 변경 이력을 확인하기 쉽다.
- **단점:** 잘못된 기억이 다음 작업까지 오염시킬 수 있다. 개인 데이터의 범위·만료·삭제·출처와 수정 충돌까지 관리해야 한다. 기억을 많이 넣는 것만으로 성능이 좋아지지는 않는다.
- **더 간단한 대안:** Postgres에 사용자가 확인한 선호 몇 개만 저장하고, 범위와 최신성으로 조회한다. 벡터 DB·백그라운드 dreaming·자기 수정 에이전트를 첫 버전에 도입하지 않는다.
- **우리 서비스 적용:** 이후 `MemoryEntry(scope, text, source_event_id, observed_at, expires_at, superseded_by)` 정도로 시작할 수 있다. 명시적 저장 또는 검토된 저장 흐름과 수정·삭제 UI를 먼저 만든다. 계정 자격 증명은 기억 대상에서 제외한다.

첨부의 “memory는 관련된 것만 retrieval”은 좋은 방향이지만 모든 종류의 기억을 반드시 검색으로만 넣어야 하는 법칙은 아니다. 항상 필요한 짧은 선호 몇 개는 고정 맥락으로, 상세 과거 기록은 필요할 때 검색하는 혼합 방식이 더 단순하다.

## 4. OpenClaw: 스킬 자격 조건과 실행 권한을 나누기

**쉬운 설명:** “이 컴퓨터에 이 기능이 설치되어 있는가”와 “지금 이 사용자가 이 작업을 허락했는가”는 다르다. 브라우저가 있다고 메일 발송까지 허가된 것은 아니다.

OpenClaw의 스킬 문서는 환경·설정·바이너리 조건으로 스킬을 거르고, 스킬이 선택되어도 실제 도구 접근이 부여되는 것은 아니라고 구분한다. exec approval 문서는 host 명령의 정책·허용 목록·실행 문맥을 다룬다. memory 문서는 장기 요약과 일별 기록을 구분하고 기억이 정책을 강제하지 않는다고 명시한다. [스킬](https://github.com/openclaw/openclaw/blob/20306571364c5b8df244fba15e88727b2b7c7a0e/docs/tools/skills.md), [실행 승인](https://github.com/openclaw/openclaw/blob/20306571364c5b8df244fba15e88727b2b7c7a0e/docs/tools/exec-approvals.md), [기억](https://docs.openclaw.ai/concepts/memory).

- **장점:** 사용 불가능한 도구를 모델에게 보여주는 낭비를 줄이고, 실행 당시 적용된 권한을 추적하기 쉽다.
- **단점:** 많은 플러그인·외부 스킬·채널을 도입할수록 인증·업데이트·신뢰 범위가 넓어진다. 커뮤니티 스킬을 곧바로 안전한 절차로 간주할 수 없다.
- **더 간단한 대안:** 지금은 내장 도구에 capability 목록을 붙이고 서비스 측 검사로 제한한다. 확장 marketplace는 뒤로 미룬다.
- **우리 서비스 적용:** `desktop_screenshot`은 관찰, `desktop_input`은 GUI 제어, `shell_exec`는 격리 실행으로 분류한다. 앱 가용성 판단에 도움을 주되, `desktop_input`에 단순히 `external.send` 표식을 붙이면 모든 클릭이 발송처럼 보이는 문제를 피해야 한다.

## 중요한 한계: 샌드박스 허용은 메일 발송 동의가 아니다

현재 OhMyDots의 외부 문서·일정 변경 확인은 `providers.py`의 지침과 `ask_user`에 의존한다. 이 지침은 유용하지만 좌표 클릭이 Gmail의 “보내기”인지 런타임이 의미적으로 증명하는 구조는 아니다. 새 권한 이름만 추가하고 “이제 발송이 서버에서 확실히 차단된다”고 설명하면 안 된다.

향후 두 경로를 구분하는 것이 정확하다.

1. **구조화된 API 도구:** `calendar.create`처럼 받는 사람·시간·내용이 인자로 정해지면 그 내용을 해시와 action ID에 묶어 승인·만료·한 번만 실행을 검증할 수 있다. 요청 내용이 바뀌면 기존 승인을 사용할 수 없다.
2. **범용 GUI:** 같은 좌표라도 화면이 바뀌면 다른 행동이다. 대상 화면과 관찰 시각, 예상 결과를 기록하고 마지막 클릭 직전에 다시 관찰해야 한다. 의미를 확인할 수 없는 중요한 최종 행동은 사용자에게 제어권을 넘기는 방식이 더 명확하다. 이를 적용하더라도 범용 GUI의 완전한 의미 검증을 달성했다고 주장하지 않는다.

승인 응답이 왔더라도 취소된 run이 다시 실행되거나, 이전 화면의 오래된 승인이 재사용되지 않도록 하는 생명주기 검사도 필요하다. 기억에 “지난번 허용했다”고 적혀 있는 것만으로 새로운 대상에 대한 동의가 되지는 않는다.

## 현재 OhMyDots와 연결되는 지점

| 현재 파일 | 확인한 현재 책임 | 작은 확장 방향 |
|---|---|---|
| `apps/api/ohmydot/providers.py` | 공통 지침, API provider, Codex host 도구 차단 설정 | 공통 스킬 목록을 넣되 정책 지침은 별도 유지 |
| `apps/api/ohmydot/codex_stream.py` | app-server 통신, MCP 도구 연결, 스트림·사용량 변환 | 기존 접속 구조 유지, 제품 이벤트 형식은 제공자와 분리 |
| `apps/api/ohmydot/tools.py` | 공통 invoke, 실행 이벤트, GUI·셸·질문 도구 | 스킬 읽기도 동일한 검증·기록 경로 사용 |
| `apps/api/ohmydot/runtime.py` | 실행 상태, 질문 대기, history 구성 | 제한된 맥락 구성과 중요 요청·사용자 답변 보존 규칙 |
| `apps/api/ohmydot/store.py` | 대화·run·event 저장 | 미래 기억은 대화와 다른 모델 및 보관 규칙 |

맥락 절약을 위해 단순히 최근 N개 메시지만 남기면 최초 목표나 승인 조건을 잃을 수 있다. 목표·제약·미해결 질문을 보존하고, 오래된 도구 출력은 파일 참조와 짧은 요약으로 줄이는 방식부터 검증하는 것이 좋다. “본문 일부를 자른다”는 구현과 “모델의 전체 context window를 정확히 예산 관리한다”는 주장은 구분해야 한다.

## 공부 순서와 작은 실습

1. **Agent loop와 도구 호출:** 모델이 JSON으로 도구 이름·인자를 제안하고 런타임이 실행한다는 흐름을 익힌다. `artifact_read` 한 호출이 이벤트와 답변까지 가는 길을 따라간다.
2. **상태 기계와 취소:** `RUNNING → WAITING_USER → RUNNING → COMPLETED`를 그린다. 기다리다 취소한 뒤 늦게 답이 와도 재개되지 않는 테스트를 읽는다.
3. **맥락과 스킬:** 한 줄 설명만 제공한 경우와 모든 설명서를 넣은 경우의 입력량·선택 정확도를 비교한다. 스킬을 읽었다고 성공한 것이 아니라 실제 산출물이 맞는지 확인한다.
4. **권한과 샌드박스:** “실행 환경 접근”과 “사용자가 승인한 업무 결과”를 각각 적는다. 메일 내용이나 수신자가 바뀌면 기존 승인이 왜 무효인지 설명해 본다.
5. **기억과 검색:** 날짜가 지난 사실을 기억에서 꺼냈을 때 재확인·만료를 어떻게 처리할지 설계한다. 처음에는 SQL 필터·키워드 검색으로 충분한지 측정한다.
6. **평가:** 같은 시나리오를 여러 번 실행해 성공률, 잘못된 실행, 복구 가능성, 비용을 기록한다. 이 결과가 있어야 더 큰 프레임워크·벡터 검색·다중 에이전트 도입을 판단할 수 있다.

처음 구현할 두 후보로는 공통 도구 레지스트리와 읽기 전용 내장 스킬 조회를 권한다. 도구 정의를 한 곳으로 모으면 제공자별 어댑터가 같은 스키마를 쓰기 쉽고, 스킬 조회는 작은 절차를 실행기에 연결하는 실험이 된다. 실행 복구·맥락 보존은 다음 검증 과제다. 장기 기억 자동 학습과 외부 스킬 설치는 관리해야 할 상태가 빠르게 증가하므로 작은 사례를 먼저 안정화한 뒤 선택하는 편이 적합하다.
