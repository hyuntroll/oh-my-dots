# Computer Use 자료 조사: 눈, 손, 실행 공간을 분리하기

확인일: 2026-10-06. 공식 저장소·모델 카드와 현재 OhMyDots 소스를 읽었다. 아래 **사실**은 해당 소스에서 확인한 내용이고, **판단/제안**은 우리 제품에 대한 설계 의견이다. 타 프로젝트를 설치하거나 모델을 실행해 성능을 측정한 결과는 아니다.

## 먼저 이해할 개념

| 개념 | 쉽게 설명하면 | OhMyDots의 예 |
| --- | --- | --- |
| Observation, 관찰 | 지금 컴퓨터가 어떤 상태인지 찍은 사진과 설명 | 스크린샷, 창 목록, 앞으로 추가할 페이지 구조 |
| Grounding, 화면 위치 연결 | “전송 버튼”이라는 말을 실제 좌표나 버튼 번호로 바꾸기 | `(x, y)` 또는 관찰에 포함된 `element_id` |
| Operator, 실행기 | 결정한 행동을 실제 마우스·키보드에 전달하는 손 | `computer/daemon.py`의 X11 입력 |
| Agent loop | 보고 → 행동 하나 선택 → 실행 → 결과 확인을 반복 | 현재 provider → Tools → desktop 경로 |
| DOM/접근성 트리 | 화면의 버튼·입력칸 이름과 구조를 텍스트로 읽는 방식 | 웹 양식과 링크를 좌표보다 의미 중심으로 찾기 |
| CDP | Chrome을 프로그램으로 조작하는 원격 제어 통로 | 브라우저용 실행기를 만들 때 사용할 연결 방식 |
| Sandbox | 에이전트가 작업할 별도 컴퓨터/공간 | 현재 computer와 shell 컨테이너 |
| MCP | 에이전트와 도구가 대화하는 공통 연결 규격 | 도구 이름·입력·결과를 교환; 권한 통제 자체는 별도 구현 |

스크린샷은 앱 종류에 덜 구애받지만 이미지 해석과 좌표 선택에 비용·오차가 있다. DOM은 웹의 이름 붙은 버튼과 양식에서 유리하지만 데스크톱 앱이나 캔버스 내부에는 동일하게 적용되지 않는다. **판단:** Dots 같은 제품에는 둘 중 하나를 버리기보다 하나의 실행 규약 아래 교체 가능한 관찰·실행기를 두는 편이 맞다.

## 소스 확인 기준

GitHub API의 HEAD 응답으로 아래 커밋을 확인했다. `main` 링크가 바뀌어도 재검토할 수 있도록 고정 링크를 남긴다.

| 프로젝트 | 확인한 커밋 | 담당하는 층 |
| --- | --- | --- |
| [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop/tree/2ff41a9e515828c5bd5b276e493d73aa0bdf4a3a) | `2ff41a9e515828c5bd5b276e493d73aa0bdf4a3a` | GUI 모델·operator·하이브리드 에이전트 |
| [Agent-S](https://github.com/simular-ai/Agent-S/tree/3aa272d23d2994c7bbde1acbbe0ef8e8d06b8693) | `3aa272d23d2994c7bbde1acbbe0ef8e8d06b8693` | 작업 추론·grounding·실행 루프 |
| [browser-use](https://github.com/browser-use/browser-use/tree/7be96ed8bafa8dfe1eef228b59cf5c884b8b2431) | `7be96ed8bafa8dfe1eef228b59cf5c884b8b2431` | 브라우저 에이전트·CDP 연결 |
| [open-computer-use](https://github.com/e2b-dev/open-computer-use/tree/610bac85d242b2fdf43fbe36bce2348658a2d4c9) | `610bac85d242b2fdf43fbe36bce2348658a2d4c9` | 클라우드 데스크톱과 다중 모델 예제 |
| [OmniParser](https://github.com/microsoft/OmniParser/tree/354021201345a96178360b28733573e27269f2de) | `354021201345a96178360b28733573e27269f2de` | 스크린샷 요소 검출·설명 |

## 1. UI-TARS-desktop: 실행기를 갈아 끼우는 구조

**사실:** 저장소는 UI-TARS Desktop과 Agent TARS를 함께 소개한다. Desktop의 로컬/원격 computer·browser operator와 Agent TARS의 DOM/GUI 혼합 전략, 이벤트 스트림은 서로 관련 있지만 같은 하나의 기능으로 뭉뚱그리면 안 된다. [공식 개요](https://github.com/bytedance/UI-TARS-desktop/blob/2ff41a9e515828c5bd5b276e493d73aa0bdf4a3a/README.md)

핵심으로 볼 코드는 `Operator`다. 지원 행동 목록, 화면 크기·배율, 초기화, 스크린샷, 실행을 구분한다. 에이전트가 화면을 이해하는 로직과 실제 OS를 조작하는 로직을 나눌 때 참고하기 좋다. [Operator 소스](https://github.com/bytedance/UI-TARS-desktop/blob/2ff41a9e515828c5bd5b276e493d73aa0bdf4a3a/multimodal/gui-agent/shared/src/base/operator.ts)

**판단:** 장점은 Linux/X11에서 다른 OS나 원격 브라우저로 확장할 때 작업 루프를 덜 바꿀 수 있다는 점이다. 단점은 전체 TypeScript/Electron 스택을 현재 Python API에 가져오면 중복 런타임과 화면·좌표 변환 관리가 늘어난다는 점이다. 이번에는 코드 전체보다 `observe / supported_actions / execute` 경계만 작게 차용하는 편이 낫다.

코드는 Apache-2.0이다. UI-TARS-1.5-7B 모델도 별도 공식 카드에서 Apache-2.0을 표시한다. 다른 모델·호스팅 API까지 같은 조건이라는 뜻은 아니다. 로컬 앱이라도 원격 모델 엔드포인트를 쓰면 이미지가 해당 공급자에게 전달되므로 “모든 처리가 로컬”이라고 제품 전체를 설명해서는 안 된다. [코드 LICENSE](https://github.com/bytedance/UI-TARS-desktop/blob/2ff41a9e515828c5bd5b276e493d73aa0bdf4a3a/LICENSE), [모델 카드, revision 고정](https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B/blob/683d002dd99d8f95104d31e70391a39348857f4e/README.md)

## 2. Agent-S: 작업 판단과 좌표 선택을 분업

**사실:** 현재 Agent S3 문서는 주 모델과 별도 grounding 모델을 구성하고, `AgentS3.predict`와 `OSWorldACI`를 사용한다. `generate_coords`는 화면과 대상 설명을 grounding 모델에 보내고, `resize_coordinates`가 모델 좌표를 실제 화면 크기로 환산한다. `click/type`는 실행할 Python/pyautogui 코드를 만든다. [S3 grounding 소스](https://github.com/simular-ai/Agent-S/blob/3aa272d23d2994c7bbde1acbbe0ef8e8d06b8693/gui_agents/s3/agents/grounding.py)

**판단:** “무엇을 할지”와 “어디를 누를지”를 나누면 작은 버튼 인식 모델만 교체해 비교할 수 있다. 반대로 매 행동에 모델 호출이 추가되고, 화면 해상도·OCR·grounding 엔드포인트를 함께 운영해야 한다. 현재 서비스에 `exec(action)`이나 로컬 Python 실행 경로를 그대로 붙이면 GUI 제어권과 격리 셸 규칙을 우회한다. 좌표 후보만 반환받고 실제 입력은 기존 daemon을 거치도록 변환해야 한다.

문서에 나오는 72.6%는 특정 OSWorld 조건에서 Behavior Best-of-N을 포함한 연구 결과다. 우리 사용자의 로그인된 Gmail·Calendar 작업 성공률이나 한 번 실행할 때의 성능으로 바꿔 말할 수 없다. 코드는 Apache-2.0이며 grounding 모델과 API 조건은 별도다. [README의 평가 조건·실행 예](https://github.com/simular-ai/Agent-S/blob/3aa272d23d2994c7bbde1acbbe0ef8e8d06b8693/README.md), [LICENSE](https://github.com/simular-ai/Agent-S/blob/3aa272d23d2994c7bbde1acbbe0ef8e8d06b8693/LICENSE)

**적용 순서:** 모델 추가 전에 한글 UI·작은 아이콘·스크롤 후 위치·확대 배율이 섞인 우리 화면 평가 세트를 만든다. 이후 기존 모델 좌표 선택과 별도 grounding 방식을 같은 화면으로 비교한다. 비용은 주 모델 호출 + grounding 호출 + 선택적 재시도/후보 실행 수로 추적한다.

## 3. browser-use: 웹 작업에는 브라우저 구조 활용

**사실:** 현재 저장소는 자체 에이전트 라이브러리, 기존 에이전트에 브라우저를 연결하는 CLI, 호스팅 제품을 구분한다. 로컬/클라우드 브라우저를 사용할 수 있고 CDP 연결 예제가 있다. 오픈소스 Python 라이브러리는 MIT다. 클라우드 서비스와 공급자 모델까지 MIT로 제공된다는 뜻은 아니다. [README](https://github.com/browser-use/browser-use/blob/7be96ed8bafa8dfe1eef228b59cf5c884b8b2431/README.md), [CDP 예제](https://github.com/browser-use/browser-use/blob/7be96ed8bafa8dfe1eef228b59cf5c884b8b2431/examples/browser/using_cdp.py), [LICENSE](https://github.com/browser-use/browser-use/blob/7be96ed8bafa8dfe1eef228b59cf5c884b8b2431/LICENSE)

**판단:** 메일 목록, 일정 양식, 검색결과처럼 텍스트와 구조가 많은 화면에서 DOM/접근성 관찰이 좌표 추측을 줄일 수 있다. 하지만 새 `Agent.run()` 루프를 OhMyDots 안에 그대로 넣으면 작업 상태·취소·질문·사용량이 이중으로 관리될 수 있다. 우선은 작은 브라우저 도구 어댑터가 더 적합하다. 클라우드 브라우저는 현재 사용자에게 보이는 computer와 다른 세션일 수 있으므로 화면·로그인·제어권이 같은 컴퓨터를 가리키는지 먼저 해결해야 한다.

운영비는 로컬 브라우저 자원 + LLM 사용량, 클라우드 선택 시 세션 시간·부가 기능·공급자 요금이 더해진다. “브라우저만 임대”와 “에이전트 전체 실행”은 다른 상품이다. 이 문서는 특정 가격을 고정 예산으로 삼지 않는다.

## 4. E2B open-computer-use: 모델과 작업 컴퓨터 분리

**사실:** 예제는 E2B Desktop Sandbox의 Linux 화면을 보여주고, `vision_model / action_model / grounding_model`을 나눈다. `SandboxAgent.click_element`는 새 스크린샷을 받고 대상 위치를 찾은 다음 sandbox 마우스를 움직인다. 코드 Apache-2.0, E2B API 키와 선택한 LLM 자격증명은 별도다. [README](https://github.com/e2b-dev/open-computer-use/blob/610bac85d242b2fdf43fbe36bce2348658a2d4c9/README.md), [실행 루프](https://github.com/e2b-dev/open-computer-use/blob/610bac85d242b2fdf43fbe36bce2348658a2d4c9/os_computer_use/sandbox_agent.py), [LICENSE](https://github.com/e2b-dev/open-computer-use/blob/610bac85d242b2fdf43fbe36bce2348658a2d4c9/LICENSE)

**판단:** 사용자별 독립 computer를 만들고 종료·수명 연장을 관리하는 발상이 장점이다. 단점은 현재 Docker를 교체할 때 사용자 세션·파일 영속성·네트워크·종료 시점과 비용 추적까지 바뀐다는 점이다. 예제의 같은 sandbox에서 shell과 desktop을 함께 조작하는 구조도 현재 OhMyDots의 분리 셸 계약과 다르다. E2B의 격리가 우리 애플리케이션의 사용자 권한·승인·개인 계정 데이터 정책까지 자동 해결하지는 않는다.

현재는 기존 Docker 유지가 단순하다. 여러 사용자의 computer를 동시에 제공할 시점에 `ComputerSession` 어댑터로 수명·연결·종료를 추상화하고, E2B를 백엔드 후보로 평가한다. 자원 사용 시간과 유휴 세션을 기록해야 클라우드 운영비를 비교할 수 있다.

## 5. OmniParser: 화면에 번호표 붙이기

**사실:** OmniParser는 스크린샷을 상호작용 가능한 영역과 설명으로 바꾸는 관찰/grounding 부품이다. 작업 관리·승인·취소 전체를 대신하는 에이전트는 아니다. [공식 README](https://github.com/microsoft/OmniParser/blob/354021201345a96178360b28733573e27269f2de/README.md)

**판단:** DOM이 없는 네이티브 앱이나 아이콘 중심 화면의 요소 목록을 만들기 좋다. 다만 번호표는 다음 화면에서도 동일한 대상을 보장하지 않는다. 모델 로딩·추론 자원·이미지 전처리·좌표 변환과 실패 기준을 함께 관리해야 한다. 먼저 저장된 비민감 테스트 화면에서 요소 검출 품질을 평가하고, 실행 기능과 분리해 도입하는 것이 적절하다.

**라이선스 확인에서 발견한 불일치:** GitHub README의 배지는 MIT지만 같은 고정 커밋의 루트 LICENSE 본문은 CC-BY-4.0이다. 따라서 저장소 전체 코드를 MIT라고 단정하거나 그대로 가져오지 않는다. 채택할 파일과 배포 형태에 맞는 조건을 확인해야 한다. [실제 루트 LICENSE](https://github.com/microsoft/OmniParser/blob/354021201345a96178360b28733573e27269f2de/LICENSE)

모델 카드도 폴더별 조건을 명시한다. 기존 `icon_detect`는 YOLOv8 기반 AGPL-3.0, 새 `icon_detect_v3`는 YOLOv9-E 기반 MIT, `icon_caption`은 MIT다. **“OmniParser 가중치는 모두 AGPL”도 현재에는 부정확하다.** 모델 카드가 제안하는 v3+caption 조합과 코드 저장소의 라이선스 불일치는 따로 검토해야 한다. [모델 카드, revision 고정](https://huggingface.co/microsoft/OmniParser-v2.0/blob/f55d0750e5b94db2125ef0b45b0fa4a85ddc59b4/README.md)

## 더 단순한 대안: Playwright와 작은 MCP 어댑터

**사실:** Playwright의 locator는 역할·레이블 등으로 요소를 찾고 동작 전 준비 상태를 기다리는 기능을 제공한다. Playwright MCP는 구조화된 접근성 스냅샷과 브라우저 도구를 제공하며 공식 문서 스스로 보안 경계가 아니라고 명시한다. [Locator 문서](https://playwright.dev/docs/locators), [Playwright MCP](https://github.com/microsoft/playwright-mcp)

**판단:** 우리 작업 루프·질문 카드·사용량·취소가 이미 있으므로 새로운 전체 에이전트 프레임워크보다 제한된 브라우저 실행기를 붙이는 편이 중복이 적다. 다만 MCP의 도구 이름이나 `readOnly` 힌트가 권한 검사를 대신하지 않는다. 페이지 JS 실행, 탐색, 업로드, 다운로드, 팝업 처리 같은 동작도 같은 정책을 통과해야 한다. 네트워크 API를 통해 같은 개인 계정을 변경하는 도구 역시 별도 승인 범위를 가져야 한다.

## 현재 OhMyDots에서 반드시 보존할 계약

현재 소스를 직접 확인한 결과:

1. `computer/daemon.py:93`의 `Gate`가 GUI 소유자·epoch·handoff·누른 키를 관리한다. `apply:156`은 **같은 lock 안에서 소유자와 epoch를 확인하고 실제 입력**을 수행한다.
2. Take over는 대기 중인 입력보다 먼저 handoff 표시를 설정하고, 키·버튼을 해제하고 epoch를 올린다. Return control도 새 화면과 epoch handshake를 사용한다.
3. `apps/api/ohmydot/tools.py:177`은 사용자 소유권이나 409 충돌을 만나면 기다렸다가 오래된 행동을 버리고 새 화면을 반환한다.
4. shell은 별도 도구다. GUI 소유권을 넘기는 것과 Run 취소는 구분된다.

새 브라우저 도구가 `page.click()` 또는 CDP를 직접 호출하면 위 1번을 거치지 않는다. API에서 owner를 한 번 확인한 후 네트워크로 명령만 보내는 방식도 확인과 실행 사이에 소유권이 바뀔 수 있다. **제안:** 실제 브라우저 부작용 실행점에 같은 Gate/epoch 규약을 연결하고, CDP 포트는 그 어댑터만 접근하도록 둔다. Take over는 짧은 실행 단위 사이에 적용되고 남은 동작은 폐기돼야 한다. 무제한 JS나 여러 클릭을 묶은 긴 작업은 피한다.

관찰 시점도 강화할 여지가 있다. 현재 `desktop_input`은 호출 직전에 epoch를 새로 읽는다. 관찰 후 Take over와 Return control이 모두 끝난 뒤 낡은 좌표를 제출하면 새로운 epoch가 붙을 수 있다. **제안:** 관찰 당시 epoch와 `observation_id`를 행동에 묶고, 다른 epoch면 입력 없이 다시 관찰하도록 한다. 이는 제어권 인계로 낡아진 판단을 막는 개선이다. 화면의 자동 새로고침·애니메이션까지 모두 검출하는 보장은 아니므로 화면 freshness와 행동 후 검증도 별도로 필요하다.

## 적용 우선순위와 배우면 좋은 것

| 우선순위 | 작은 적용 | 얻는 점 | 학습 주제 |
| --- | --- | --- | --- |
| 지금 | 도구의 관찰/변경 역할과 실행 환경을 명시하는 작은 계약 | 새로운 provider/도구가 기존 규칙을 우회하는지 검토하기 쉬움 | Python Protocol, JSON Schema, 기능 인터페이스 |
| 지금 또는 다음 패치 | 관찰 ID·관찰 epoch와 행동 연결, stale이면 재관찰 | 인계 전 화면을 근거로 인계 후 클릭하는 문제 감소 | 동시성, mutex, TOCTOU, fencing token |
| 다음 | 실제 작업 평가 세트와 결과 검증 | 더 좋은 모델인지 성공률·지연·비용으로 비교 | 테스트 fixture, 상태 기반 검증, p50/p95 |
| 다음 | 같은 computer의 브라우저 관찰기 → 제한된 실행기 | 웹 작업에서 좌표 의존 감소 | DOM, 접근성 트리, CDP, Playwright locator |
| 평가 후 | 별도 grounding 모델 또는 OmniParser | 작은 아이콘·비웹 앱의 위치 연결 개선 | 좌표계, 이미지 스케일, 모델 서빙·라이선스 |
| 다중 사용자 단계 | computer 세션 수명 어댑터와 클라우드 선택지 | 사용자별 격리·자원 회수 | 컨테이너/VM, 네트워크 경계, 세션 영속성 |

한 가지 학습 실험으로는 “로그인 없는 테스트 페이지의 버튼을 누르고 결과 문구 확인하기”가 좋다. 먼저 스크린샷 방식으로, 다음에는 접근성 locator로 수행하고, 중간에 Take over를 넣어 이전 행동이 취소되는지 확인한다. 성공은 `click()` 반환이 아니라 기대한 화면/문서 상태가 실제로 생긴 것으로 판정한다. 같은 조건에서 성공률, 모델 호출 수, 총 토큰, 단계 시간, 재시도 횟수를 비교하면 프레임워크 이름보다 우리 서비스에 맞는 선택을 할 수 있다.
