# Dots UI 적용 검증 — 2026-10-06

final result: pass (기존 OhMyDot 기능 범위의 UI 적용)

## 기준과 범위

사용자가 제공한 `computer-reference-board.html` 및 연결된 `mydot-reference-board.html`의 실제 화면을 기준으로 기존 Next.js 앱을 수정했다. 보드 자체를 앱으로 복사하거나 완성 화면 이미지를 UI로 사용하지 않았다.

- 전체 배치: R22 실사용 대화/Computer 분할 화면.
- 실제 데스크톱: R21/R25의 Chromium 시작 페이지, 캐릭터, 시계, 겹치는 창과 Dock.
- 제어권: R04/R05 공식 예시, R03/R23 실제 사용 상태.
- 모바일: R12의 비율 유지/레터박스, R24의 상단 닫기와 하단 입력 도구.
- 프로필/파일: R01/R02/R17. Call/Slack 등 기존 백엔드에 없는 서비스는 작동하는 기능으로 위장하지 않았다.

원본은 `/Users/wars/Documents/Codex/2026-10-05/referenced-chatgpt-conversation-this-is-an/outputs/`에서 확인하고 `output/dots-ui/reference/`에 그대로 보관했다. 사용자 제공 localhost URL도 복원했다.

## 구현

항상 표시하던 사이드바, 큰 홍보 제목, Computer 아래 Activity 카드와 풋터를 제거하고 전체 높이의 분할 화면으로 구성했다. 대화 목록/프로필/활동은 상단에서 열고 결과 파일은 대화에서 확인한다. 회색 AI 말풍선, 파란 사용자 말풍선, 하단 둥근 입력창, Computer 탭/닫기/추가 도구/분할 보기와 제어권 바를 적용했다.

`globals.css`의 색상 토큰과 `computer-workspace.css`의 레이아웃을 공유한다. 로컬 standalone 실행과 Docker 이미지 모두 public PNG를 포함하도록 복사 경로를 보완했다. 웹 폰트는 외부 다운로드 없이 Arial/Helvetica/system-ui를 사용한다. 네이티브 시작 페이지는 설치된 Inter/Noto CJK를 사용한다. 주황 캐릭터는 R21을 참고해 생성한 투명 PNG이고, 식물/바로가기 아이콘은 설치된 Lucide에서 내보냈다. Dock은 설치된 GTK 아이콘을 사용하고 실제 Chromium/Terminal/Thunar 창을 연다.

실제 X11 데스크톱을 1280×960으로 변경하고 입력 좌표는 서버가 제공하는 width/height로 변환한다. VNC는 계속 view-only이며 입력은 기존 소유권/epoch 검증 큐를 통한다. Take over는 GUI 제어만 전환하고 Cancel은 별도 동작이다.

## 비교 증거

원본을 왼쪽, 구현을 오른쪽에 넣은 하나의 이미지 입력으로 비교했다.

- 전체 데스크톱: [최종 비교](output/dots-ui/comparison-desktop-final.png), [최종 구현](output/dots-ui/desktop-final.png).
- 모바일 전체: [비교](output/dots-ui/comparison-mobile.png), [최종 구현](output/dots-ui/mobile-computer-final.png).
- 작은 제어권 영역: [확대 비교](output/dots-ui/comparison-control.png), [최종 사용자 제어](output/dots-ui/user-control-final.png).
- 프로필: [구현 캡처](output/dots-ui/profile.png).
- HTML 원본의 브라우저 캡처: [데스크톱](output/dots-ui/reference-desktop-browser.png), [모바일](output/dots-ui/reference-mobile-browser.png).

R22 원본/최종 구현은 모두 1080×640 픽셀이다. 최종 브라우저 CSS viewport도 1080×640, devicePixelRatio=1이었다. 대화 폭은 401.76px(37.2%), 데스크톱 프레임은 x=410.21/y=68.00/w=661.33/h=495.99이다. 원본의 분할선 약 x=400, 프레임 약 x=409/y=68/w=662/h=496과 비교했다.

모바일 CSS viewport 및 구현 PNG는 390×844이다. R12 원본 552×1200을 비교용으로 390×844로 정규화했다. 원본의 iOS 상태바/시스템 하단 영역은 웹 앱에 재현하지 않았다. 따라서 모바일은 제품 영역의 구조/아이콘 정렬/레터박스를 비교했고 디바이스 장식까지 픽셀 일치를 주장하지 않는다.

## 수정 이력

1. 첫 구현: [이전 비교](output/dots-ui/comparison-desktop-v1.png). P2 — Computer 프레임의 상단이 원본보다 12px 높았다. stage 위 여백을 24px 추가해 y=68로 수정했다. 최종 전체 비교에서 확인했다.
2. P2 — 모바일 입력 아이콘이 왼쪽/오른쪽으로 흩어졌다. R12/R24처럼 세 아이콘을 하단 오른쪽에 모았다. 최종 모바일 비교에서 확인했다.
3. P2 — Dock 파일 아이콘이 데스크톱 모양으로 표시됐다. GTK folder 아이콘을 우선하도록 수정했다. 실제 Dock 클릭 후 [파일 관리자 열린 화면](output/dots-ui/dock-files-final.png)에서 확인했다.
4. 분할 보기에서 모바일로 전환 후 대화로 돌아갈 때 숨김 상태가 겹칠 가능성을 제거했다. 모바일 뒤로 가기는 확장 상태도 초기화한다.

최종 비교에서 기능 범위에 해당하는 미해결 P0/P1/P2는 없다. 글꼴/폰트 크기, 생성한 캐릭터의 세부 형태, 설치된 앱과 대화 내용은 원본과 다르다. 한국어 가독성을 위해 말풍선 12px(모바일 13px), 모바일 입력 16px를 사용했고 원본 R22의 축소된 글자 크기를 그대로 강제하지 않았다. 픽셀 단위로 동일한 Dots 복제품이라고 주장하지 않는다.

## 실제 동작 검증

- Next.js production build 및 TypeScript 통과. web/computer Docker 이미지 빌드 통과; 격리한 web 이미지에서 public PNG와 standalone 서버 파일 존재 확인.
- Python pytest 19개 통과, Ruff(`apps/api`, `computer/daemon.py`) 통과.
- 입력 복구 회귀 테스트 6개 통과.
- 실제 Take over → 원격 터미널 입력 `dots-ui-control-ok` → Return control. 화면 재관찰 결과에서 출력 확인.
- 실제 AI 메시지를 보내 현재 화면을 읽고 한국어로 답변하는 것 확인.
- 모바일 앱 목록 → Terminal 실행 → 텍스트 폼 전송 `dots-ui-mobile-ok` → 키보드 버튼의 원격 입력 포커스 → 대화 복귀 확인. 실제 터미널에 출력이 보였다.
- 새 4:3 데스크톱의 아래쪽 Dock을 브라우저 좌표로 클릭해 Thunar 창과 실제 artifacts 폴더가 열리는 것 확인.
- 새 대화 생성과 기존 대화 복원, 대화 목록, 프로필, Codex/OpenAI 설정 진입, 결과 파일 목록/실제 파일 내용 읽기, Computer 탭 닫기/재열기, 확장/분할 보기 복원 확인.
- 데스크톱/모바일에 가로 넘침 없음. 브라우저 error 로그 0개.

모바일 검증은 브라우저 viewport 시뮬레이션이다. 물리 iOS/Android 키보드 표시 여부는 검증하지 않았으며 입력 포커스와 실제 서버 전송을 확인했다. 신규 API 키 생성/인증 변경이나 외부 통합 추가는 수행하지 않았다.

## OhMyDots 이름 및 모션 추가

제품 제목, 프로필, 설정, 입력창 접근성 이름, Computer 이름, AI 안내/이름, 기본 Dot 이름과 네이티브 시작 페이지를 OhMyDots로 변경했다. 기존 대화 기록의 과거 문장은 수정하지 않는다.

- 버튼 반응 140ms, 패널 등장 220ms/종료 160ms, 레이아웃 전환 280ms.
- 대화 말풍선 등장, 제어권 문구/분홍 테두리 전환, 설정 모달과 도구·프로필·대화 목록·파일 패널 페이드 적용.
- 실제 RUNNING 상태에서만 점 세 개의 작업 중 표시를 보여준다.
- 환영 화면/네이티브 시작 페이지의 캐릭터는 5초 주기로 작게 움직인다.
- 닫히는 패널은 즉시 inert 상태가 되어 입력/포커스를 막고 160ms 후 제거한다. 빠르게 다시 열면 제거 타이머를 정리한다.
- `prefers-reduced-motion: reduce`에서는 모션과 smooth scroll을 끈다.

추가 검증: production build/TypeScript 및 기존 Python 19개·입력 복구 6개 테스트 통과, Ruff 통과. 실제 브라우저에서 프로필의 `surface-in / 0.22s`, 제어권 문구의 `label-in`, 원격 입력의 `animation: none / transition: 0s`, 가로 넘침 없음과 콘솔 error 0개를 확인했다. AI는 실제 새 대화에서 “제 이름은 오마이닷츠(OhMyDots)입니다.”라고 답했다. [최종 화면](output/dots-ui/ohmydots-motion.png).
