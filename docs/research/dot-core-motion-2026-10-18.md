# Dot 핵심 UI와 애니메이션 재분석

현재 OhMyDots는 원본의 정적인 대체 아바타와 일부 외형을 옮긴 상태다. 원본에서 확인된 인터랙티브 캐릭터 렌더러, 떠 있는 프로필, 스크롤에 반응하는 헤더, 아바타와 꾸미기 화면 사이의 연결 전환이 빠져 있다. 이 차이가 UI의 인상을 크게 바꾼다는 것이 이번 비교의 결론이다.

이번 작업은 배포 파일의 정적 분석이다. 앱 구현은 변경하지 않았다. 원본 계정에서 어떤 캐릭터 경로가 활성화되어 있는지, 실제 화면의 프레임과 움직임이 어떤지는 관찰하지 않았다.

## 캐릭터 렌더링과 상태

`Dot-7cb00c0b541f.js`의 SVG와 인터랙티브 캐릭터는 다른 경로다. 캐릭터 경로는 호스트 React 컴포넌트에서 iframe의 `frame.mjs`, `presentation.mjs`, WASM 엔진으로 이어진다. 별도로 기존 SVG, sprite pet, 이미지 snapshot 경로도 존재한다. pet의 점프 효과를 인터랙티브 Dot의 동작으로 취급하면 안 된다.

| 항목 | 원본 코드에서 확인한 동작 | 현재 구현의 차이 |
| --- | --- | --- |
| 실행 상태 | Working, Searching, Creating, Payment, Thinking, NeedsInput, Ready, Paused, Error | `DotAvatar`에 활동 상태 입력이 없으며 정적인 img만 표시 |
| 상태 전환 | turnId와 episode 순서를 보존하고 같은 상태 재전송을 생략 | 캐릭터 상태 전환 계층 없음 |
| 결과 처리 | 상태 변경만으로 성공을 추정하지 않고 Neutral outcome 전달 | 구현할 때 완료 애니메이션의 근거를 별도로 정해야 함 |
| 시선 | 포인터 진입 후 10초 attention 창, touch 제외, blur/숨김 시 해제 | 포인터 반응 없음 |
| 아바타 입력 | 활동 연결 모드에서는 Move를 Ready gaze로 전달 | 일반 드래그와 구분할 필요 |
| 편집기 입력 | 이동량 6px 기준으로 클릭과 드래그 분리, 클릭/키보드로 Signature reaction 요청 | 드래그·반응 없음 |
| 편집 후 복귀 | 300ms 대기 후 200ms smoothstep으로 중앙에서 포인터로 복귀 | 복귀 전환 없음 |
| 렌더 생명주기 | 활성 여부, 가시성, reduced motion, 준비 중 snapshot 및 resize 처리 | 정적인 이미지에 한정 |

몸체 변형, 깜빡임 간격, 상태별 소품 궤적의 정확한 값은 아직 미확인이다. 관련 엔진은 `orbit-characters.wasm` 6,566,898바이트이며, REA의 WASM 분석은 WABT 1.0.42 경로 미설정으로 수행되지 못했다. 위 표는 JS가 엔진에 전달하는 상태와 입력 계약을 확인한 것이며 엔진의 결과 프레임을 복원했다는 뜻이 아니다.

근거: [캐릭터 소스와 위치](dot-character-motion-findings-2026-10-18.json), [캐릭터 REA 요약](dot-character-rea-summary-2026-10-18.json).

## 프로필과 대화 영역

실제 프로필 경로는 `side-panel-ca01b35697cf.js`에 있다. `aeon-summary-panel-identity`만으로 화면을 재구성하면 전체 동작을 놓친다. 원본에는 떠 있는 nonmodal 패널, 연락 채널, 알림 안내, 컴퓨터 accordion, 활동과 출력물이 들어간다. 활동을 선택하면 작업 transcript로 들어가고 Back으로 프로필과 포커스를 복원한다. 현재의 개요·활동·결과 탭과 inline 작업 펼치기는 이 구조와 다르다.

| 전환 | 확인한 설정 |
| --- | --- |
| 프로필 진입과 퇴장 | opacity 0↔1, translateX 100%↔0, spring 300ms, bounce .01 |
| 헤더 축소 | scrollTop > 1px에서 hero→compact, 아바타 64→20px, sticky 헤더 높이 48px |
| 아바타와 이름 위치 | layout 이동 150ms, cubic-bezier(.23, 1, .32, 1) |
| 대화 영역 이동 | 별도 spring 500ms, bounce .1; 기본 패널의 pinned shift는 −154px |
| 컴퓨터 행 | 앞쪽 아이콘과 연결 배지, 뒤쪽 48×32px 썸네일; 저장된 마지막 프레임 또는 회색 fallback |

기본 프로필 폭은 300px다. 사용 가능한 **콘텐츠 폭**이 1096px 미만이면 overlay, 1096px 이상 1536px 미만이면 shift, 1536px 이상이면 gutter다. 브라우저 창 폭을 그대로 이 임계값에 대입하면 안 된다. 패널 폭이 달라지면 임계값과 이동 거리도 다시 계산된다.

중첩 작업 transcript 전환에 별도 slide 효과가 있다는 근거는 확보하지 못했다. 컴퓨터 전체 뷰어의 열기·닫기 전환도 추가 추적 대상이다. 위 값은 프로필 패널과 그 안의 컴퓨터 행에 대한 것이다.

근거: [프로필 및 레이아웃 소스와 위치](dot-layout-motion-findings-2026-10-18.json).

## 꾸미기 화면

원본에는 기존 아바타 그리드와 새 CharacterEditor가 함께 존재한다. nonlegacy character conversation 조건에서 새 편집기로 진입한다. 현재 구현의 6색 SVG 선택기는 새 편집기를 재현하지 못한다.

새 편집기의 데스크톱 레이아웃은 높이 480px, controls와 preview가 3:2 비율이다. shape, eyes, eyewear, accessory 탭과 선택적 pet 경로가 있다. 모바일에서는 preview가 controls 위로 올라간다.

편집기 열기·닫기는 `document.startViewTransition`으로 작은 아바타의 실제 위치와 큰 preview 위치를 연결한다. 이미지의 폭과 높이를 따로 늘리지 않고 source/destination 비율에 맞춰 transform을 보정한다. 아바타, surface, modal, backdrop을 별도 전환 대상으로 다룬다.

- 공통 시간: 300ms.
- 곡선: cubic-bezier(.23, 1, .32, 1).
- 옆 surface: translateX(100%)와 opacity.
- modal: scale(.9)와 opacity.
- reduced motion, 키보드 진입 등 조건에서는 아바타 공유 전환을 생략한다.
- 연속 열기·닫기 시 이전 전환과 숨겨진 source를 정리한다.

근거: `new-editor-route`, `new-editor-layout`, `appearance-view-transition` 항목의 [원본 위치](dot-layout-motion-findings-2026-10-18.json).

## 온보딩에서 Dot으로 이어지는 움직임

온보딩의 링은 CSS 테두리 확대만으로 구성되지 않는다. 별도의 Three.js 렌더러가 Y축 회전, 색상, scale, 착지를 제어한다. 회전 곡선은 배열로 샘플링되어 있고, 기본 회전 구간은 3000ms에 2회전이다. 진행 중 착지 요청은 현재 각속도를 이어받으며 최대 900ms의 정착 구간을 계산한다. scale은 기본 회전 중 1에서 .96까지 변한다. 생성 중 반복에는 5000ms 대기가 설정된다.

| 단계 | 시간 또는 값 |
| --- | --- |
| 탄생 확대 | 650ms, scale .1714286→1 |
| 가운데 구멍 | 250ms 지연 후 400ms, scale 0→1 |
| 환영 화면 퇴장 | 240ms |
| 일반 단계 퇴장 | 280ms |
| 일반 위치 이동 | 650ms, 환영 화면 출발 시 80ms 지연 |
| 컴퓨터로 긴 이동 | 1050ms |
| 탄생 후 이동 지연 | 140ms |
| 문구 등장 | 800ms, 항목당 100ms stagger, translateY 6px→0 |
| travel | cubic-bezier(.77, 0, .175, 1) |
| move | cubic-bezier(.65, 0, .35, 1) |
| fade | cubic-bezier(.37, 0, .63, 1) |
| settle | cubic-bezier(.22, 1, .36, 1) |

이동은 출발·도착 요소의 실제 사각형을 측정해 고정 overlay로 이어간다. 상태는 departing→flying→arrived다. resize와 visibility 변경 시 전환을 마무리하고, 경로 변경과 unmount 시 정리한다. reduced motion에서는 긴 이동을 즉시 처리한다. 현재의 단일 `ring-arrive` 확대 효과로는 이 연속성이 만들어지지 않는다.

근거: `dot-onboarding-ring`, `dot-onboarding-flight`, `dot-onboarding-handoff-state`, `orbit-introduction-logo-renderer`의 [REA 요약](dot-core-rea-summary-2026-10-18.json). 출발·탄생 연결은 기존 `page-3f5e759fa37f.js` 분석과 대조했다. 추가 토큰 값은 `app-shared-52443cbe9ac4.js`에서 확인했다.

## 재구현 순서와 검증 기준

1. `DotAvatar`의 캐릭터·SVG·sprite·snapshot 역할을 분리하고 실제 실행 상태를 연결한다. 엔진 내부 움직임을 임의 bounce로 대체한 뒤 동일하다고 평가하지 않는다.
2. 프로필을 floating surface와 hero/compact header 구조로 재구성한다. 300px 패널, 콘텐츠 폭 기반 배치, 스크롤 및 Back 포커스 복원을 검증한다.
3. CharacterEditor의 3:2 구조와 공유 아바타 전환을 구현한다. pointer와 keyboard 진입, 연속 열기·닫기, reduced motion을 각각 확인한다.
4. 링의 spin/settle과 departing/flying/arrived 이동을 연결한다. 도착 좌표, resize, 숨김, 경로 전환 중 정리 동작을 확인한다.
5. WASM 모션과 실제 활성 경로를 확인한 뒤 몸체·눈·소품의 프레임 일치도를 평가한다. 컴퓨터 전체 뷰어 전환도 별도 확인한다.

## 증거 범위

대상은 설치된 ChatGPT `app.asar`, SHA-256 `5ddc4e48259aa6f979e04529b1a5a4ae54b0f5c4ad6db5c6e004924c10916ddb`다. 기존 분석을 재사용하면서 핵심 모션 JS 9개와 character MJS 4개를 새 범위로 분석했다. 선택된 13개 파일의 파싱 실패는 0개다. 애플리케이션 전체와 동적 의존 관계의 coverage는 partial이다.

| 분석 | REA Evidence ID |
| --- | --- |
| 기존 UI 분석 | ev_21def76128d9c0c1ff6ec1894cb6d707f0483952af40564487393b84f6a99cce |
| 모션 9개 파일 | ev_d19d90be8d7b629407155d8c5e740faaea455b7362d8a3ab3d4ded42b829a2aa |
| 캐릭터 4개 파일 | ev_3fb33ac4ddd21662f1f1b2aa7bbc522fae8903e68fde83bc6314bbf33df46830 |
| intro renderer export view | ev_5a9afb080ba46737075d3ec45922ce241e2e224c1b44f4a46980aeccd24d06c9 |
| activity incoming trace | ev_1c86509402299760a0761ce2c95a7e19c8a9e0d80f3e0799331973fb0a5285fe |

source별 SHA-256과 원본 위치는 두 findings JSON에, 반환된 view/trace와 WASM 도구 오류는 [REA 상세 기록](dot-motion-rea-views-2026-10-18.json)에 저장했다. Graph 연결은 런타임 실행의 증거가 아니다. ASAR 내 7개 별도 native 바이너리의 integrity 불일치는 REA 결과에 그대로 보존했으며, 이번 JS 모션 사실의 근거로 사용하지 않았다.
