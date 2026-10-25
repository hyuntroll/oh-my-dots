# OhMyDots

원본 Dots UI에 로컬 Grok Bot reconstructed 실행기와 실제 Docker 컴퓨터를 연결한 앱입니다. 이번 구현이 저장소 루트의 기본 앱이며, 이전 Python API·Next.js 웹·PostgreSQL 실행 구성을 대체합니다.

![Grok이 실제 컴퓨터를 조작하고 결과를 확인한 화면](docs/qa/exact-ui/grok-computer-control.png)

## 설치와 실행

Node.js 24.15 이상, 사용할 모델에 연결된 OpenCode CLI, 로컬 Grok 소스와 해당 프로젝트의 `node_modules`가 필요합니다. Grok 호스트는 Node.js 26을 사용합니다. 컴퓨터 화면에는 실행 중인 Docker Desktop 또는 Docker Engine + Compose가 필요합니다.

```sh
git clone https://github.com/hyuntroll/oh-my-dots.git
cd oh-my-dots
npm ci

# 기본 위치가 다를 때만 지정합니다.
export DOTS_GROK_SOURCE="$HOME/Github/grok-bot-0.18-reconstructed"
export DOTS_GROK_NODE=/opt/homebrew/opt/node@26/bin/node
npm run setup
npm start
```

브라우저에서 **[http://127.0.0.1:3420/original/webview/](http://127.0.0.1:3420/original/webview/)** 를 엽니다. UI 호스트는 3420, API는 3410 포트를 사용하며 루프백에서만 연결을 받습니다. `npm run dev`도 같은 원본 UI를 실행합니다. `./scripts/dev.sh`도 같은 앱을 시작합니다.

Grok 소스의 기본 위치는 `~/Github/grok-bot-0.18-reconstructed`입니다. 기본 실행기는 Grok이며, 선택한 실행기는 다음 시작에도 유지됩니다. Grok 없이 기존 OpenCode 실행기를 사용하려면 `npm ci` 후 `npm run build`와 `npm run opencode:start`를 실행합니다. Grok으로 돌아갈 때는 서버를 종료하고 `npm run grok:start`를 실행합니다.

이전에 배포한 설치 주소도 새 앱의 설치 절차를 사용합니다. Node·OpenCode·Grok 소스는 먼저 준비해야 하며 설치기가 계정이나 키를 생성하지 않습니다.

```sh
curl -fsSL https://raw.githubusercontent.com/hyuntroll/oh-my-dots/main/install.sh | bash
# 설치 위치 지정: bash install.sh --dir /absolute/path
```

## 컴퓨터 사용

```sh
npm run computer:start
# 사용 후 컴퓨터만 종료
npm run computer:stop
```

Dot 프로필의 **컴퓨터** 버튼에서 실제 1280×960 Linux 화면을 엽니다. 채팅으로 화면 확인이나 브라우저 조작을 요청하면 Grok의 원본 `computerUse` 지침·Task 위임·Computer/Screenshot 도구를 사용합니다. 원본 UI·CSS·폰트·캐릭터 자산은 해시로 검증합니다.

로컬에서는 클라우드 자동 심사 대신 원래 수동 승인 경로를 사용하고 실행 전에 상태를 재확인합니다. Dots 실행 승인도 별도로 받아 카드가 두 번 나타날 수 있습니다. 사용자가 제어권을 가져가면 봇 입력은 차단됩니다. 봇이 컴퓨터를 넘기면 **제어권 가져오기 → 제어권 반환**으로 돌려주며, Grok이 새 화면을 읽고 재개합니다.

컴퓨터는 모든 Dot이 공유하는 하나의 Docker 데스크톱입니다. Mac 화면·임의 셸·Grok 파일 전송은 연결하지 않습니다. Docker의 포트 3480은 루프백에만 공개합니다.

## 데이터와 기존 버전

Dot·대화·작업·설정·Grok 기록은 `.data/`에 저장합니다. `.data/`, 인증 정보, 환경 파일, 의존성과 빌드 캐시는 Git에 올리지 않습니다. OpenCode가 이미 연결한 계정을 사용하며 설치된 앱의 인증 저장소를 복사하지 않습니다.

이전 앱은 [codex/dots-pre-original-ui 브랜치](https://github.com/hyuntroll/oh-my-dots/tree/codex/dots-pre-original-ui)에 남아 있습니다. 이전 `.local/`과 PostgreSQL 데이터는 자동 삭제하거나 새 SQLite로 변환하지 않습니다. 별도로 쓰던 이번 Dots의 `.data/`를 계속 사용하는 방법은 [이전 안내](docs/migration.md)에 있습니다.

설정·프로필·플러그인 탐색 화면은 원본 구성요소를 사용합니다. 모델 provider 설정·계정 사용량, 플러그인 설치·OAuth, 첨부·비밀 입력·Grok 에이전트 간 메시지의 Dots 동기화는 아직 연결하지 않았습니다. 원본 클라우드 하네스 전체가 복원된 것은 아닙니다.

## 검증과 구현 근거

```sh
npm test
npm run build
npm run original:verify
npm run assets:verify
# 로컬 Grok 소스가 있을 때 실제 도구 프로토콜도 검증
node --test tests/grok-protocol.mjs
```

- [Grok 실행기·컴퓨터 연결과 실제 검증](docs/grok-integration.md)
- [원본 UI 연결·검증 범위](docs/exact-ui/verification.md)
- [컴퓨터 서비스와 제어권](docs/computer.md)
- [백엔드·승인 경계](docs/backend.md)
- [캐릭터 원본·해시](docs/character-evidence.md)
- [선택형 macOS 데스크톱 셸](apps/desktop/README.md)

기준 원본은 `app.asar` SHA-256 `5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869`입니다. 원본 앱 버전이 바뀌면 내부 계약도 달라질 수 있습니다. 원본 자산의 소유권이나 공개 배포 권한을 주장하지 않습니다.
