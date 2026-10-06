# Dots UI 비교 검증 — 2026-10-06

**Findings**

- [P2, 수정 완료] 낮은 화면에서 온보딩 Continue가 아래로 밀림. 첫 1280×720 캡처에서 연결 카드 하단 버튼이 잘렸다. 높이 820px 이하에서 일러스트/링과 여백을 줄여 해결했다. 최종 `onboarding-connect.png`에서 하단 CTA가 화면 안에 보인다.
- [P2, 수정 완료] 모니터 이미지의 투명 여백 때문에 주요 일러스트가 지나치게 작음. `onboarding-computer-before.png`와 원본 컴퓨터 선택 화면을 함께 비교했다. 이미지 배치의 object-fit과 화면 높이별 크기를 조정한 `onboarding-computer.png`에서 프레임의 비율·제목·카드 흐름을 재확인했다.
- [P2, 수정 완료] 꾸미기 색상 여섯 번째 항목이 다음 줄로 내려가 편집 화면이 길어짐. 원본은 한 줄에 나열되어 있다. 한 줄 가로 스크롤로 변경하고 최종 `customize-light.png`에서 여섯 색상이 같은 줄에 있는 것을 확인했다.
- [P2, 수정 완료] 라이트 테마의 기존 설정·질문·작업 상세에 어두운 고정 색상 잔존. 테마 토큰 적용과 보조 글자 대비를 보완했다. 실제 라이트 설정 화면을 열어 입력과 계정 카드를 확인했다.

## 비교 기준과 증거

원본 시각 기준(사용자 첨부):

- 컴퓨터 온보딩: `/var/folders/b5/20yn5mzs68bb5lwvtsl4q65m0000gn/T/codex-clipboard-4a468167-9756-44d8-8887-e51aad4ed8cc.png` — 3598×2070 pixels.
- 대화+컴퓨터: `/var/folders/b5/20yn5mzs68bb5lwvtsl4q65m0000gn/T/codex-clipboard-cb744bf2-c174-46c4-8b14-847d12e3f319.png` — 3598×2070 pixels.
- 꾸미기: `/var/folders/b5/20yn5mzs68bb5lwvtsl4q65m0000gn/T/TemporaryItems/NSIRD_screencaptureui_HpYCBh/스크린샷 2026-10-06 오후 5.13.40.png` — 1272×792 pixels, modal-focused crop.
- 밝은 활동/결과물: `/var/folders/b5/20yn5mzs68bb5lwvtsl4q65m0000gn/T/codex-clipboard-604ba06d-f2e2-40c9-8874-ea8225014705.png` — 816×495 pixels.

구현 캡처: `/Users/wars/Documents/ChatGPT/oh-my-dots/docs/assets/dots-ui/`.

| 상태 | 구현 증거 | CSS viewport / screenshot pixels |
| --- | --- | --- |
| 연결 확인, dark | onboarding-connect.png | 1280×720 / 1280×720 |
| 컴퓨터 선택, dark | onboarding-computer.png | 1280×720 / 1280×720 |
| 프로필 편집, light | customize-light.png | 1280×720 / 1280×720 |
| 대화·활동·결과물, light | chat-light.png | 1280×720 / 1280×720 |
| 대화·활동·결과물, dark | chat-dark.png | 1280×720 / 1280×720 |
| 실제 컴퓨터 분할, dark | computer-dark.png | 1280×720 / 1280×720 |
| 문서 읽기, light | artifact-light.png | 1280×720 / 1280×720 |
| 온보딩 편집, narrow | onboarding-mobile.png | 492×674 / 492×674 |
| 대화, narrow | chat-mobile.png | 492×674 / 492×674 |

브라우저는 devicePixelRatio=2를 보고하지만 캡처 API는 CSS 크기의 PNG를 반환했다. 원본의 CSS viewport와 DPR은 기록되어 있지 않아 raw pixels를 CSS pixels로 간주하지 않았다. 원본과 구현을 **같은 도구 출력의 이미지 묶음**으로 열어 대화/컴퓨터, 온보딩, 라이트 패널, 꾸미기 상태별로 비교했다. 비교 시 앱 프레임과 모달 영역을 기준으로 보았고 주변 브라우저·OS UI는 제외했다. 원본 이미지 배율이 서로 달라 절대 픽셀 오차나 동일 폰트 메트릭을 측정했다고 주장하지 않는다.

정확한 원본 viewport 재현을 위해 1799×1035/1440×900 override를 시도했지만 이 브라우저는 기존 탭의 실제 크기를 바꾸지 않았다. 따라서 검증은 실제 제공된 1280×720 / 492×674에서의 반응형 구조에 한정한다. 별도 이미지 리사이즈나 픽셀 일치 점수는 만들지 않았다. 이 제한은 정확한 1:1 픽셀 복제의 검증 공백이며, 아래 passed는 요청한 화면 형태와 작동에 대한 판정이다.

전체 화면 비교에 더해 원본의 모달 확대 캡처와 구현 모달을 함께 열어 색상 줄, 이름 입력, 미리보기, Save 위치를 집중 비교했다. 연결 카드의 글자, 상태, 버튼과 컴퓨터 하단 제어권 버튼은 브라우저 캡처에서 읽을 수 있는 크기로 점검했다.

## 필수 표면

- **Fonts / typography:** Arial/Helvetica 및 시스템 한글 대체 서체. 본문 14px, 헤더 22px, 낮은 대비의 보조 문구 계층을 유지했다. 좁은 화면 입력은 16px. 원본 정확한 서체는 미확인. 긴 대화 제목은 말줄임, 본문은 줄바꿈.
- **Spacing / layout:** 56px 아이콘 레일, 접을 수 있는 260px 탐색, 중심 정렬 온보딩, 36.5% 대화/나머지 컴퓨터. 흰 CTA와 얇은 카드 테두리, 둥근 말풍선. 폭 720px 이하에서는 컴퓨터와 대화를 탭 전환한다. 492px에서 scrollWidth=492, composer가 화면 안에 위치함을 DOM으로 확인했다.
- **Colors / tokens:** 어두운 배경 #0e0e0e, 회색 답변 #202020, 푸른 사용자 말풍선. 라이트에서는 흰 배경, 회색 답변, 노란 사용자 말풍선. 이름 편집·활동·결과물·설정에 동일 토큰 적용. 상태 표시만 의미별 색상을 유지한다.
- **Image quality:** 별도 생성된 투명 모니터 PNG, 기존 OhMyDots 캐릭터 PNG 재사용. CSS/수작업 SVG로 삽화를 흉내 내지 않았다. 링과 일반 아이콘은 라이브러리 아이콘. 실제 컴퓨터 영역은 VNC이며 정적 이미지가 아니다.
- **Copy / content:** OhMyDots 브랜드와 한국어 안내. 실제 AI 연결과 컴퓨터 상태를 반영한다. 미지원 로컬 기기 제어는 준비 중, 전화·Slack·Google 연결은 가짜 조작 버튼으로 노출하지 않는다. 프로필의 결과물은 전체 작업 공간이라는 문구를 붙였다.

## 구현에 맞춘 차이

- 원본의 여러 펫 대신 기존 OhMyDots 캐릭터와 여섯 링 색상을 제공한다.
- 원본 Google 연결 카드 대신 현재 지원하는 AI/컴퓨터/파일 구성을 사용한다.
- 전화/Slack 위치에는 현재 동작하는 꾸미기와 AI 연결 버튼을 둔다.
- 프로젝트/예약 작업을 가짜 데이터로 채우지 않는다. 실제 대화와 실제 실행 목록만 표시한다.
- 원격 데스크톱의 기존 색상·앱·로그인 세션을 보존한다. 외곽 UI만 참조에 맞춘다.

## Interaction evidence

1. Onboarding 1→2, reload로 2 유지, 2→3→대화 진입, 가이드 재진입 확인.
2. 이름 `나의 닷`과 pet 저장→reload 후 유지, 최종 OhMyDots/라벤더/dark로 복원. 저장하지 않은 이름은 Escape 취소 후 반영되지 않음.
3. 실제 메시지 요청→진행 상태→응답 완료→활동 완료 표시 확인. 입력 6,291/출력 34, 모델 1회.
4. 활동 클릭→요청 상세, 결과 파일→읽기 패널, Markdown 본문 확인.
5. VNC 실제 화면 표시, Take over→You have control→Return control→OhMyDots has control, 컴퓨터 확장/분할 복귀 확인.
6. 좁은 화면 대화, 프로필 열기/닫기, 검색어 입력 후 결과 필터 확인.
7. Native dialog의 Escape 취소, 이름 빈 값 제출 차단, 포커스 경계 구현. reduced-motion은 기존 사용자 설정과 OS 규칙을 유지한다.
8. 최종 browser console error/warn 조회 결과 `[]` (두 검증 탭).

**Open Questions / test gaps**

- 정확한 원본 CSS viewport 및 폰트는 알 수 없다. 1:1 픽셀 차이 검증은 수행하지 않았다.
- 이번 턴에서는 Electron 재패키징이나 실제 휴대폰 검증을 수행하지 않았다.
- Google/Slack/전화 연결 기능은 구현 범위 밖이다.

**Implementation Checklist**

- [x] 연결/환경/꾸미기 시작 흐름 및 저장
- [x] 탐색·대화·프로필·활동·결과물 구성
- [x] 라이트/다크 및 좁은 화면
- [x] 기존 컴퓨터 제어와 스트리밍 동작
- [x] 발견한 P2 수정 후 재캡처·비교
- [x] Web 15 tests, typecheck, production build

**Follow-up Polish**

- [P3] 추가 캐릭터 컬렉션과 원본에 더 가까운 전용 서체 검토.
- [P3] 실제 원본 viewport를 확보하면 큰 화면에서 정량 픽셀 비교 추가.

final result: passed
