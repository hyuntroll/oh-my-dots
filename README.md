# OhMyDots

**대화하면서 함께 사용하는 AI 컴퓨터.**

OhMyDots는 AI와의 대화, 원격 컴퓨터 화면, 작업 기록을 한 공간에 연결하는 로컬 앱입니다. 원하는 작업을 메시지로 요청하고, AI가 브라우저와 셸을 사용하는 모습을 실시간으로 확인할 수 있습니다. 필요할 때는 직접 컴퓨터를 조작하고 다시 AI에게 제어권을 넘길 수 있습니다.

현재 버전은 **v0.0.1**입니다.

## 하나의 대화, 하나의 컴퓨터

- **대화:** 요청과 응답을 저장하고, 새 대화와 이전 대화를 오가며 작업합니다.
- **컴퓨터:** Linux 데스크톱을 실시간으로 표시합니다. Chromium, 터미널, 파일 관리자를 Dock에서 열 수 있습니다.
- **직접 제어:** `Take over`로 컴퓨터를 직접 조작하고, `Return control`로 AI에게 돌려줍니다. 제어권을 가져와도 대화와 셸 작업은 이어집니다.
- **질문과 선택지:** 답변이 필요하면 별도 창에서 추천 선택지나 다른 선택지를 고르거나 직접 입력할 수 있습니다. 답변 제출 전에는 작업을 재개하지 않으며, 창을 닫아도 다시 열 수 있습니다.
- **실시간 진행:** 대화 화면에서 화면 확인·명령 실행·파일 작성 등 현재 작업을 확인하고 답변을 스트리밍으로 받아봅니다. Activity에는 실행 기록이 남고 진행 중인 작업은 취소할 수 있습니다.
- **사용량:** 최근 작업의 입력·출력 토큰과 설정의 모델 제공자별 누적 사용량을 확인합니다. 모델이 보고한 값이며 계정의 잔여 한도나 청구 금액을 뜻하지 않습니다.
- **결과 파일:** 작업이 만든 파일을 목록에서 확인하고 내용을 열어볼 수 있습니다.
- **인증 설정:** Codex Auth 또는 OpenAI API를 선택해 AI를 연결합니다.

다크 테마의 대화 화면과 따뜻한 색상의 컴퓨터 화면을 나란히 배치했습니다. 주황색 캐릭터, 화면 전환, Dock의 호버와 클릭 애니메이션이 인터페이스를 이어줍니다. 화면 크기에 따라 대화와 컴퓨터를 분할하거나 탭으로 전환할 수 있습니다.

## 실행하기

Docker Desktop, Node.js 24, Python 3.11 이상이 필요합니다. Codex Auth를 사용할 때는 `codex` CLI도 설치되어 있어야 합니다.

```sh
git clone https://github.com/hyuntroll/oh-my-dots.git
cd oh-my-dots
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
npm ci --prefix apps/web
./scripts/dev.sh
```

브라우저에서 **http://localhost:3080/** 을 엽니다. 실행 스크립트는 로컬 서비스 인증값을 생성하고 PostgreSQL, 컴퓨터, 셸, 게이트웨이를 Docker로 실행한 뒤 API와 웹 서버를 시작합니다.

### AI 연결

설정에서 인증 방식을 선택합니다.

- **Codex Auth:** 기존 Codex 로그인을 사용합니다. 로그인이 필요하면 설정에서 ChatGPT 로그인을 시작하고 공식 페이지에서 기기 코드를 입력합니다.
- **OpenAI API:** 설정의 API 키 입력란에 키를 저장하거나 서버 전용 `.env.local`에 `OPENAI_API_KEY`를 설정합니다.

인증값은 서버에서 관리하며 API 키를 브라우저 번들에 포함하지 않습니다. `.env.local`은 Git에서 제외됩니다.

### macOS 데스크톱 앱

Apple Silicon Mac에서는 같은 웹 서버에 연결하는 데스크톱 앱을 실행할 수 있습니다. 커스텀 상단바, macOS 창 제어, 새로고침과 브라우저 열기 메뉴를 제공합니다.

```sh
npm ci --prefix apps/desktop
npm start --prefix apps/desktop
```

앱 파일을 만들려면:

```sh
npm run package:mac --prefix apps/desktop
open output/desktop/OhMyDots-darwin-arm64/OhMyDots.app
```

데스크톱 앱을 사용할 때도 웹 서버가 실행 중이어야 합니다. 앱을 종료한 뒤에는 같은 주소에서 웹으로 작업할 수 있습니다. 자세한 안내는 [데스크톱 앱 README](apps/desktop/README.md)에 있습니다.

## 작업과 제어권

컴퓨터 한 대에서는 한 번에 하나의 AI 작업이 실행됩니다. 추가 요청은 순서대로 대기합니다. AI가 질문하면 같은 작업에서 답변을 받아 이어서 실행합니다.

`Take over`는 GUI 제어권을 사용자에게 넘깁니다. `Return control`은 현재 화면을 다시 확인한 뒤 AI에게 제어권을 넘깁니다. 이전 화면의 좌표나 오래된 입력은 제어 세대값으로 구분해 차단합니다. 작업 중단은 별도의 `Cancel`로 처리합니다.

결과 파일은 공유 작업 공간에 저장됩니다. 컴퓨터 컨테이너를 다시 생성하면 GUI 프로필과 임시 상태가 초기화될 수 있습니다. `docker compose down -v`는 저장 볼륨을 삭제하므로 데이터를 유지하려면 사용하지 마세요.

## 구성

| 경로 | 역할 |
| --- | --- |
| `apps/web` | Next.js · React 대화 및 컴퓨터 UI |
| `apps/api` | FastAPI · 작업 실행 · 인증 · 이벤트 · 데이터 저장 |
| `apps/desktop` | Electron macOS 앱 |
| `computer` | Linux 데스크톱 · GUI 입력 · 화면 스트림 · Dock |
| `shell` | 별도 셸 실행 환경 |
| `infra` | localhost 게이트웨이 |
| `scripts` | 실행 및 실제 환경 검증 |
| `tests` | 제어권 · 작업 큐 · 취소 · 셸 · 입력 복구 테스트 |

PostgreSQL에 대화, 작업과 이벤트를 저장합니다. 화면과 Activity는 WebSocket으로 전달하며, AI는 Codex app-server와 MCP 또는 OpenAI Agents SDK를 통해 컴퓨터·셸 도구를 사용합니다.

## 개발과 검증

```sh
.venv/bin/pytest -q
.venv/bin/ruff check apps/api computer/daemon.py shell/daemon.py tests scripts
npm run typecheck --prefix apps/web
npm test --prefix apps/web
npm run build --prefix apps/web
```

실제 모델과 컴퓨터를 사용하는 검증은 앱 실행과 AI 인증 연결 후 진행합니다.

```sh
.venv/bin/python scripts/live_smoke.py
```

OhMyDots는 localhost에서 사용하는 단일 사용자 앱입니다. 로컬 서비스 접근은 게이트웨이 쿠키와 전용 토큰으로 인증하고, GUI와 셸 실행 환경을 분리합니다. 사용자가 요청한 공개 페이지와 개인 계정의 메일·일정·문서를 GUI로 확인하고 작업을 준비합니다. 온라인 문서·일정 생성이나 수정, 메일·초대장 발송, 업로드·공유·삭제는 대상과 내용을 제시한 뒤 대화에서 확인받고 실행합니다. 자동 저장되는 편집기는 입력 전에 확인받습니다. 로그인·비밀번호·MFA·CAPTCHA는 사용자가 Take over로 직접 처리합니다. 이 확인 절차는 에이전트의 공통 지침으로 적용되며, 별도의 서버 측 승인 게이트는 아닙니다.
