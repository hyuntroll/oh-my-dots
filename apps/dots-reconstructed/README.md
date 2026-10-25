# Dots, reconstructed locally

## 원본 UI 실행 화면

이전의 수작업 React/CSS 화면과 별도로, 현재 설치된 원본의 React 구성요소·CSS·폰트·한국어 사전·캐릭터 자산을 직접 실행하는 화면을 추가했습니다. 원본 파일은 해시로 검증하며, 로컬 저장소·OpenCode·네트워크 연결은 `exact-host/`의 어댑터가 담당합니다. 원본 클라우드 하네스가 복원된 것은 아닙니다.

```sh
cd dots-reconstructed
npm ci
npm run original:verify
npm start
# 또는 npm run original:start
```

원본 UI 실행 주소: <http://127.0.0.1:3420/original/webview/>. 이 명령은 API 서버(3410)와 원본 UI 호스트(3420)를 함께 시작하며, 이미 실행 중인 같은 서비스는 재사용합니다. 기존 로컬 Dot과 대화 기록을 사용합니다. 기본 실행 중 3410의 시작 주소도 이 화면으로 이동합니다. 이전 화면은 `npm run legacy:start`로 실행할 수 있습니다.

## Grok Bot reconstructed 실행기 연결

원본 Dots UI에 로컬 **Grok Bot reconstructed의 실제 호스트·러너·대화 저장소**를 연결할 수 있습니다. 모델만 바꾸는 방식이 아닙니다. 각 Dot의 첫 메시지에서 전용 Grok 에이전트를 만들고, Grok의 `sendPrompt`와 `SendMessage` 결과를 기존 Dots 메시지·작업 상태로 전달합니다. Grok의 질문은 원본 UI의 입력 카드로 표시됩니다. 기존 Dot과 대화 기록은 유지됩니다.

```sh
# Grok 소스와 해당 프로젝트의 node_modules가 준비되어 있어야 합니다.
export DOTS_GROK_SOURCE="$HOME/Github/grok-bot-0.18-reconstructed"
# Node 26이 기본 node가 아니라면 지정합니다.
export DOTS_GROK_NODE=/opt/homebrew/opt/node@26/bin/node
npm run grok:prepare
# 기존 서버를 먼저 종료한 뒤 실행합니다.
npm run grok:start
```

선택한 실행기는 `.data/runtime-choice.json`에 저장되어 다음 `npm start`에서도 유지됩니다. 이전 실행기로 돌아가려면 서버 종료 후 `npm run opencode:start`를 실행합니다. 포트를 다른 실행기가 점유하면 자동으로 덮어쓰지 않고 오류를 냅니다.

Grok 빌드·네이티브 의존성은 `.data/grok-build/`, Dot별 Grok 기록은 `.data/grok/<Dot ID>/`에 저장합니다. Grok 원본 체크아웃과 원래 앱의 데이터는 수정하지 않습니다. 새 Grok 데이터의 기본 모델은 `opencode-go/gpt-6-luna`이며, 이미 저장된 모델 설정은 유지됩니다. 현재 계정으로 해당 모델의 실제 응답을 확인했습니다. `beam-free`는 Grok의 큰 프롬프트에서 본문 없이 종료됐고, 별도의 무료 모델은 한도 오류를 반환했습니다. 모델 목록에 있다는 것만으로 사용 가능하다고 판단하지 않습니다.

현재 연결 범위는 대화, 여러 턴의 문맥 유지, 상태·오류 표시, 질문·승인 응답, 취소·일시 정지·재개와 **Docker 컴퓨터 화면·조작**입니다. Grok 원본 `computerUse` 지침·Task 위임·Computer/Screenshot 도구를 유지하고 누락된 런타임 연결을 보완했습니다. 컴퓨터를 시작한 뒤 Dot에게 화면 확인이나 브라우저 조작을 요청하면 됩니다. 원본 프로필의 컴퓨터 버튼에서 같은 실제 화면을 볼 수 있습니다.

Grok 클라우드 자동 심사기는 로컬에서 사용할 수 없어 원래 수동 승인 경로로 전달하며, 실행 전에 Dots 컴퓨터 승인도 받습니다. 두 승인 카드가 나타날 수 있습니다. 사용자가 제어권을 가져가면 봇 입력은 차단됩니다. `request_box_help`로 넘긴 컴퓨터를 원본 화면의 **제어권 가져오기 → 제어권 반환**으로 돌려주면 Grok이 새 화면을 읽고 재개합니다. 로컬 컴퓨터는 모든 Dot이 공유하는 한 화면이며 한 작업씩 사용합니다. Mac 화면·임의 셸·파일 전송은 연결하지 않습니다.

취소하면 해당 Dot이 소유한 호스트를 종료하며 Grok 저장소는 유지합니다. 승인을 영구 허용으로 바꾸지 않습니다. 파일 첨부·비밀 입력·외부 provider 설치·Grok 에이전트 간 메시지의 Dots UI 동기화는 아직 지원하지 않습니다. Grok 소스를 이 저장소에 복제하거나 번들로 게시하지 않습니다.

[Grok 연결 구현 및 실제 검증](docs/grok-integration.md)

사이드바 아래의 프로필 메뉴에서 **설정**을 열거나 `⌘,`/`Ctrl+,`를 누릅니다. 원본 설정 사이드바·검색·일반·모양·계정·개인 맞춤 설정·키보드 단축키·플러그인 화면을 연결했습니다. 모양의 테마와 계정의 로컬 이름은 브라우저에 저장됩니다. 사이드바 **플러그인**에서 공개/개인용 디렉터리와 관리 화면을 오갈 수 있습니다. 현재 로컬 연결 목록은 비어 있으며 설치·OAuth·클라우드 사용량은 연결하지 않았습니다. 펫 오버레이·초대·로그아웃은 미지원 상태로 표시합니다.

현재 원본 기준은 `app.asar` SHA-256 `5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869`입니다. 파일이 같다는 사실만으로 모든 화면·상태·서버 동작의 동일성을 보증하지 않습니다. [원본 렌더러 연결과 검증 범위](docs/exact-ui/verification.md)를 참고하세요.

`oh-my-dots` 저장소의 작업 브랜치에서는 이 프로젝트가 `apps/dots-reconstructed/`에 들어 있습니다. 그 경우 해당 폴더에서 위 명령을 실행합니다. 원본 자산은 manifest 해시로 검증하며, 동일한 원본 앱이 설치되어 있다면 `npm run original:extract`로 다시 추출할 수 있습니다. 추출 도구의 의존성도 `package-lock.json`에 고정되어 있어 개인 npm 캐시가 필요하지 않습니다. 원본 앱 버전이 바뀌면 기존 렌더러의 내부 계약이 달라질 수 있습니다.

## 이전 재구성 버전

설치된 ChatGPT 앱에서 **Dots 부분만 REA로 분석**하고, 별도의 로컬 앱으로 재구성한 프로젝트입니다. 생성, 대화, 작업 상태, 원본 캐릭터 엔진, 실제 Linux 컴퓨터 화면을 포함합니다.

원본 클라이언트의 UI 구조와 프로토콜을 근거로 만들었습니다. 원본 클라우드 하네스의 소스가 복구된 것은 아닙니다. 모델 실행·저장·도구 승인·컴퓨터 서비스는 이 프로젝트에서 새로 구현했습니다. 원본 캐릭터 WASM과 리소스는 추출한 로컬 자산이며 소유권이나 공개 배포 권한을 주장하지 않습니다.

## 실행

Node.js 24.15 이상, OpenCode 2 CLI와 사용할 수 있는 모델 연결이 필요합니다. 컴퓨터 화면에는 Docker Desktop이 필요합니다.

```sh
cd dots-reconstructed
npm ci
npm run build
npm run legacy:start
```

앱: <http://127.0.0.1:3410> 또는 <http://localhost:3410>

개발 모드는 `npm run dev`입니다. 브라우저는 3411, API는 3410 포트를 사용합니다. 개발 모드와 운영 모드를 동시에 실행하지 마세요.

컴퓨터는 앱의 **컴퓨터 → 컴퓨터 시작**에서 준비하거나 다음 명령으로 시작합니다. 최초 빌드는 파일 다운로드와 수 GB의 여유 공간이 필요합니다.

```sh
npm run computer:start
# 컴퓨터 소스를 수정한 경우에만 이미지 재빌드
npm run computer:start -- --rebuild
# 사용 후 컴퓨터만 종료
npm run computer:stop
```

앱의 설정에서 OpenCode 모델을 바꿀 수 있습니다. 기본 모델은 `opencode-go/beam-free`입니다. 모델 목록에 보여도 계정에서 실제 사용할 수 있는지는 다를 수 있습니다. 이 앱은 OpenCode에 이미 연결된 계정을 사용하며 인증 파일이나 키를 복사하지 않습니다. 다른 CLI 경로는 `OPENCODE_BIN`, 기본 모델은 `DOTS_MODEL`, 앱 포트는 `PORT` 환경 변수로 지정할 수 있습니다.

## 사용

- **새 dot**: 이름·설명과 외형을 정합니다. 네이티브 편집기에서 프리셋, 모양, 색상, 눈, 안경, 액세서리와 깊이를 바꿀 수 있습니다.
- **대화**: 실제 모델 답변과 작업 기록을 저장합니다. 파일을 만들거나 컴퓨터를 조작할 때 승인 카드가 나타납니다. 질문 카드에는 답을 입력합니다.
- **프로필**: 활동·결과물, 이름·설명 수정, 일시 정지와 삭제를 관리합니다. 삭제는 로컬 소프트 삭제입니다.
- **다른 Dot**: 메시지 전달도 도구 승인 후 실행됩니다. 받은 Dot은 독립된 작업으로 답합니다. 무제한 자동 대화를 켜지 않습니다.
- **컴퓨터**: 실제 데스크톱 스트림을 봅니다. **직접 제어하기**로 마우스·키보드를 사용하고, **Dot에게 돌려주기**로 에이전트에게 제어권을 반환합니다.

각 Dot의 파일은 `.data/workspaces/<Dot ID>/`에 저장되고, 대화·작업·설정은 `.data/`의 SQLite에 남습니다. 원래 OhMyDots/Grok 프로젝트와 데이터를 공유하지 않습니다. 앱을 껐다 켜면 미완료 작업은 중단 상태로 복구되며 **계속하기**로 재개합니다. 과거 도구 실행 결과를 모델에 전달하지만 원본 클라우드 세션을 이어 붙이는 방식은 아닙니다.

## 분석 및 구현 근거

- [분석 결과와 복구 범위](docs/reverse-engineering.md)
- [UI 근거 및 차이](docs/ui-evidence.md)
- [캐릭터 원본·해시·프로토콜](docs/character-evidence.md)
- [로컬 실행기·API·승인 경계](docs/backend.md)
- [컴퓨터 서비스](docs/computer.md)
- [실행 검증](docs/verification.md)

원본 이메일·캘린더 연동, 클라우드 메모리·스케줄러·모델 정책과 서버 도구 구현은 복구 범위 밖입니다. 온보딩의 연결 가능 안내가 실제 서비스 연결을 뜻하지는 않습니다. 캐릭터와 화면을 가짜 이미지로 대체해 연결 성공을 표시하지 않습니다.

## 검증·원본 자산 재추출

```sh
npm test
npm run build
npm run assets:verify
# 설치된 원본 app.asar에서 지정 자산만 다시 추출
npm run assets:extract
```

추출 목록과 원본/로컬 해시는 `tools/character-assets.json`, `public/dot-engine/provenance.json`에 기록되어 있습니다. 정적 REA 결과는 `docs/evidence/`에 있습니다. 대형 REA 세션의 gzip 원본은 Git에서 제외되며, 복원 검증 값은 별도 manifest에 남습니다.
