# 내 서버에 OhMyDots 설치하기

OhMyDots의 호스팅 모드는 한 소유자가 여러 Dot을 사용하는 개인용 서비스입니다. 계정별 데이터 분리·회원 가입·결제를 제공하는 다중 사용자 SaaS는 아직 아닙니다. 설치한 서버에서 AI 작업과 Linux 컴퓨터가 실행되고, 다른 기기의 브라우저로 접속합니다. 서버가 켜져 있으면 접속용 노트북을 닫아도 서버의 작업은 계속됩니다.

## 준비

- Linux의 Docker Engine 또는 macOS의 Docker Desktop과 Docker Compose 2.24.4 이상.
- Git, curl, tar. Python 3.11+·Node.js 24+와 npm은 기존 설치를 사용하거나 설치기가 사용자 폴더에 준비합니다.
- 시작 기준으로 여유 메모리 4 GB 이상. Dot 컴퓨터가 늘어나면 그만큼 자원이 더 필요합니다.
- Linux에서는 Docker 명령을 실행할 수 있는 일반 사용자 계정을 사용합니다. API와 웹의 운영 프로세스는 그 계정으로 실행됩니다. 네이티브 Windows와 rootless Docker는 아직 검증하지 않았습니다.

## 터미널에서 한 번에 설치하기

```sh
curl -fsSL https://raw.githubusercontent.com/hyuntroll/oh-my-dots/main/install.sh | bash
```

[Hermes의 터미널 설치 흐름](https://hermes-agent.nousresearch.com/docs/getting-started/installation)을 참고했습니다. 실행 중인 Docker는 먼저 준비해야 합니다. Docker 설치·실행이나 관리자 권한 변경은 자동으로 수행하지 않습니다. 설치기는 필요한 항목을 검사하고, 부족하면 안내하고 종료합니다.

터미널에서 다음 순서로 설정합니다. 엔터를 누르면 표시된 기본값을 사용합니다.

1. **설치 폴더:** 기본 `~/.ohmydots`. 다른 절대 경로를 입력할 수 있습니다.
2. **접속 포트:** 기본 3080. 이미 사용 중이면 빈 포트를 제안하며 직접 바꿀 수 있습니다.
3. **접속 주소:** 기본 로컬 주소. 원격 접속은 준비한 HTTPS 프록시 주소를 입력합니다. 도메인·프록시·인증서는 별도로 설정합니다.
4. **설치 이름:** 기본 `ohmydots`. 이미 같은 이름의 컨테이너가 있으면 다른 이름을 선택합니다.
5. **로그인 이름과 비밀번호:** 기본 `owner`, 비밀번호는 12자 이상·UTF-8 72바이트 이하이며 입력 중 표시하지 않습니다.
6. **명령어 경로와 서버 시작:** 셸 경로 추가 여부와 지금 시작할지 선택합니다. 웹·API·비밀번호 게이트웨이가 준비되면 로컬 접속 주소를 표시합니다.

Python이 부족하면 [uv](https://docs.astral.sh/uv/)로 Python 3.12를 준비합니다. Node가 부족하면 공식 배포의 Node.js 24.19.0을 내려받아 SHA-256을 확인합니다. 두 도구는 설치 폴더의 `.local/runtime/` 안에 두며 시스템 Python·Node를 바꾸지 않습니다. 자동 Node 설치는 macOS/Linux의 arm64·x64를 지원합니다. Alpine/musl 등 공식 Node 바이너리가 실행되지 않는 환경은 Node.js 24+를 먼저 설치하세요.

다운로드·빌드 로그는 `.local/hosting/install.log`에 저장하고 소유자만 읽을 수 있게 합니다. 실패하면 로그를 확인한 뒤 다시 실행합니다. 비밀번호를 설정한 뒤 빌드가 실패해도 다음 실행에서 저장한 비밀번호를 재사용합니다. 취소하려면 Ctrl+C를 누릅니다.

설치 후 새 터미널에서:

```sh
ohmydots start
ohmydots stop
ohmydots status
ohmydots setup
ohmydots update
ohmydots doctor
ohmydots password --user owner
```

`~/.local/bin/ohmydots` 실행기를 만듭니다. bash/zsh의 경로 추가 질문에 동의하면 `.bashrc`/`.zshrc` 끝에 PATH 한 줄을 추가합니다. 현재 터미널은 `~/.local/bin/ohmydots`를 직접 실행합니다. `setup`은 현재 체크아웃을 다시 빌드하고 기존 포트·주소·비밀번호·데이터를 유지합니다. 기준 주소 변경은 `ohmydots stop` → `ohmydots configure --origin https://내주소` → `ohmydots start`입니다. 포트 변경은 현재 별도 체크아웃의 새 설치로 진행합니다.

`update`는 변경 사항 없는 main 브랜치의 공식 저장소만 fast-forward로 갱신하고 설정 마법사를 다시 실행합니다. 로컬 수정이 있으면 덮어쓰지 않고 중단합니다. 이미 실행 중이면 먼저 중지하며, 설치 후 다시 실행할지 묻습니다. systemd로 관리한다면 먼저 `systemctl --user stop ohmydots`를 실행하고 업데이트 후 해당 서비스를 다시 시작하세요.

인터랙티브 터미널이 없는 CI에서는 설치 마법사가 진행되지 않습니다. 자동화에는 아래 수동 설치와 `host.py install --password-stdin`을 사용하고 비밀번호는 비밀 저장소에서 표준 입력으로 전달하세요.

### 소스를 직접 받아 설치하기

Python 3.11+·Node.js 24+·npm을 직접 준비한 경우:

```sh
git clone https://github.com/hyuntroll/oh-my-dots.git
cd oh-my-dots
python3 scripts/cli.py setup
```

마법사 없이 설치하려면 `python3 scripts/host.py install`과 `python3 scripts/host.py start --detach`를 사용합니다. 설치기를 먼저 읽거나 보관하려면 루트의 [install.sh](../install.sh)를 내려받아 `bash install.sh --dir /절대/설치/경로`로 실행할 수도 있습니다.

설치 도중 호스팅용 비밀번호를 두 번 입력합니다. 입력값은 화면에 표시하거나 평문으로 저장하지 않습니다. 기본 로그인 이름은 `owner`이며 `install --user 이름`으로 바꿀 수 있습니다. 브라우저가 표시하는 HTTP 인증 창에서 로그인합니다. 모델 계정 로그인과는 별도의 호스팅 접속 비밀번호입니다.

수동 설치에서 포트 3080이 이미 사용 중이면 처음 설치할 때 지정합니다.

```sh
python3 scripts/host.py install --port 3090
```

호스팅 설정은 `.local/hosting/`에 보관합니다. 기존 개발 환경의 데이터나 컨테이너는 자동으로 옮기거나 삭제하지 않습니다. 기본 Compose 프로젝트 이름은 `ohmydots`이고 개발 환경은 `ohmydot`이므로 둘을 구분합니다. 한 체크아웃에서는 하나의 호스팅 인스턴스를 관리합니다. 다른 인스턴스는 별도 체크아웃과 `install --project 다른이름 --port 다른포트`로 설치합니다.

## 어떤 환경이 실행되나요?

```text
브라우저 → HTTPS 프록시(원격 접속 시) → 비밀번호 게이트웨이
                                         ├─ 운영용 Next.js 웹
                                         └─ API / 작업 관리자
                                              ├─ PostgreSQL
                                              ├─ Dot별 Linux 컴퓨터
                                              └─ Dot별 작업용 셸
```

설치기는 웹을 별도 디렉터리에 복사해 운영 빌드하므로 개발용 `.next`를 덮어쓰지 않습니다. API·웹·Codex CLI는 호스트에서 실행하고, 데이터베이스·컴퓨터·셸·게이트웨이는 Docker에서 실행합니다. 신뢰된 API가 Docker CLI로 Dot 컴퓨터를 만듭니다. 에이전트의 컴퓨터나 셸에는 Docker 소켓을 마운트하지 않습니다.

웹 접속 포트는 기본적으로 loopback에만 열립니다. 데이터베이스·컴퓨터·셸의 포트도 loopback에만 공개하고, 호스팅 서비스를 다시 시작하면 실제 포트를 다시 조회합니다. Docker만 따로 재시작해 연결 주소가 바뀌었다면 호스팅 서비스도 재시작합니다. Linux의 API·웹은 Docker 호스트 브리지 주소에, macOS에서는 loopback에 바인딩합니다. 모든 외부 접속은 비밀번호 게이트웨이를 통과하도록 구성합니다. 설치기는 기존 Docker 네트워크와 겹치지 않는 사설 서브넷 다섯 개를 골라 저장합니다. LAN·VPN 경로까지 자동 검사하지는 않습니다. 다른 사설망과 겹치면 `.local/hosting/settings.json`의 `subnets`를 사용 가능한 값으로 바꾼 뒤 `configure --origin 현재주소`로 실행 환경 파일을 다시 만드세요. 기존 네트워크가 있다면 해당 호스팅 프로젝트만 중지·재생성한 뒤 적용합니다.

## AI와 앱 연결

처음 접속한 뒤 설정에서 Codex Auth 또는 OpenAI API를 연결합니다. 설치기가 로컬 Codex CLI를 준비합니다. 로그인·API 키·연결 토큰은 호스팅 서버에서 관리합니다. 기존 개발 환경의 AI 인증이나 개인 브라우저 로그인을 자동 복사하지 않습니다.

지원되는 Gmail·Calendar·Drive·Slack 읽기 작업은 OAuth/API 연결을 사용할 수 있습니다. 서비스 앱 등록과 클라이언트 정보가 필요하며, 등록하지 않았거나 지원하지 않는 작업은 Dot 컴퓨터 브라우저를 사용합니다. 외부 주소를 바꾸면 서비스에 등록한 OAuth redirect URI도 함께 맞춰야 합니다. 로그인·MFA·CAPTCHA는 Take over로 직접 처리합니다.

## 다른 기기에서 접속하기

비밀번호만으로 HTTP 통신이 암호화되지는 않습니다. 원격 접속에는 HTTPS 프록시를 사용하고, 게이트웨이의 loopback 바인딩은 유지합니다. [Nginx HTTP 인증](https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html)은 페이지·API·화면 WebSocket 전체에 적용됩니다.

### 개인 기기끼리: Tailscale

호스트와 접속 기기를 같은 개인 tailnet에 연결한 후:

```sh
tailscale serve --bg http://127.0.0.1:3080
```

표시된 `https://서버이름.tailnet이름.ts.net` 주소를 복사해 앱의 기준 주소로 저장합니다.

```sh
python3 scripts/host.py stop
python3 scripts/host.py configure --origin https://서버이름.tailnet이름.ts.net
python3 scripts/host.py start --detach
```

Tailscale Serve는 tailnet 내부에서 접속하며 HTTPS를 처리합니다. 개인 서버의 접근 권한도 소유자의 기기로 제한하세요. [공식 Serve 안내](https://tailscale.com/docs/reference/tailscale-cli/serve).

### 내 도메인: Caddy

도메인을 서버로 연결하고, 호스트에서 실행하는 Caddy의 Caddyfile에 다음을 넣습니다.

```caddyfile
dots.example.com {
    reverse_proxy 127.0.0.1:3080
}
```

```sh
python3 scripts/host.py stop
python3 scripts/host.py configure --origin https://dots.example.com
python3 scripts/host.py start --detach
```

DNS·80/443 포트와 Caddy 인증서 발급 조건을 먼저 갖춰야 합니다. HTTPS 프록시가 원래 Host·Origin·WebSocket 업그레이드를 전달해야 합니다. [Caddy HTTPS 안내](https://caddyserver.com/docs/automatic-https), [reverse_proxy 안내](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). 공개 도메인·DNS·인증서는 설치기가 임의로 만들지 않습니다.

## 운영

```sh
python3 scripts/host.py status
python3 scripts/host.py stop
python3 scripts/host.py start --detach
python3 scripts/host.py password
```

`stop`은 API와 웹 프로세스를 멈춥니다. Docker 컴퓨터와 저장 볼륨은 유지합니다. 호스팅 로그는 `.local/hosting/server.log`에 남습니다. 설정·인증·데이터 디렉터리는 Git과 Docker 빌드 컨텍스트에서 제외됩니다. 비밀번호를 잊었으면 서버에서 `password` 명령으로 다시 정합니다. 브라우저에 남은 HTTP 인증 정보는 브라우저 세션을 닫거나 새 비공개 창에서 다시 입력합니다.

### Linux 재부팅 후 자동 실행

```sh
python3 scripts/host.py stop
python3 scripts/host.py systemd
mkdir -p ~/.config/systemd/user
cp .local/hosting/ohmydots.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now ohmydots
```

로그아웃 후에도 실행하려면 서버 관리자가 `sudo loginctl enable-linger "$USER"`를 적용합니다. 이 방식을 선택한 뒤에는 `systemctl --user stop/start/status ohmydots`로 관리합니다. 업데이트 전에도 systemd 서비스를 먼저 멈춥니다. macOS의 `--detach`는 터미널 종료 후 실행을 유지하지만 OS 재부팅 자동 시작은 설정하지 않습니다.

### 업데이트와 백업

```sh
python3 scripts/host.py stop
git pull --ff-only
python3 scripts/host.py install
python3 scripts/host.py start --detach
```

설정·기존 비밀번호·프로젝트 이름·데이터베이스 비밀번호를 유지하면서 코드를 다시 설치합니다. 데이터베이스와 Dot별 home·artifacts·tools는 Docker 볼륨에, AI 인증·호스팅 설정은 `.local/hosting/`에 저장됩니다. 백업에는 두 위치가 모두 필요합니다. 데이터베이스는 `pg_dump`로 백업하고, 컴퓨터 볼륨은 해당 컴퓨터를 멈춘 뒤 백업합니다. `docker compose down -v`는 데이터 볼륨을 삭제하므로 일반 중지·업데이트에는 사용하지 않습니다.

## 현재 검증 범위

설치·운영 웹 빌드·비밀번호 보호·인증된 API/화면 WebSocket·Dot별 컴퓨터 생성과 재시작을 로컬 테스트 인스턴스로 검증합니다. Linux 브리지 분기는 코드와 구성 검사 대상이며 실제 Linux 서버·공개 DNS·HTTPS 인증서 발급은 서버 환경에서 추가 확인이 필요합니다. 결과는 [호스팅 검증 기록](SELF-HOSTING-VALIDATION.md)에 남깁니다.
