# 내 서버에 OhMyDots 설치하기

OhMyDots의 호스팅 모드는 한 소유자가 여러 Dot을 사용하는 개인용 서비스입니다. 계정별 데이터 분리·회원 가입·결제를 제공하는 다중 사용자 SaaS는 아직 아닙니다. 설치한 서버에서 AI 작업과 Linux 컴퓨터가 실행되고, 다른 기기의 브라우저로 접속합니다. 서버가 켜져 있으면 접속용 노트북을 닫아도 서버의 작업은 계속됩니다.

## 준비

- Linux의 Docker Engine 또는 macOS의 Docker Desktop과 Docker Compose 2.24.4 이상.
- Python 3.11 이상, Node.js 24 이상과 npm, Git.
- 시작 기준으로 여유 메모리 4 GB 이상. Dot 컴퓨터가 늘어나면 그만큼 자원이 더 필요합니다.
- Linux에서는 Docker 명령을 실행할 수 있는 일반 사용자 계정을 사용합니다. API와 웹의 운영 프로세스는 그 계정으로 실행됩니다. 네이티브 Windows와 rootless Docker는 아직 검증하지 않았습니다.

```sh
git clone https://github.com/hyuntroll/oh-my-dots.git
cd oh-my-dots
python3 scripts/host.py install
python3 scripts/host.py start --detach
```

설치 도중 호스팅용 비밀번호를 두 번 입력합니다. 입력값은 화면에 표시하거나 평문으로 저장하지 않습니다. 기본 로그인 이름은 `owner`이며 `install --user 이름`으로 바꿀 수 있습니다. 브라우저가 표시하는 HTTP 인증 창에서 로그인합니다. 모델 계정 로그인과는 별도의 호스팅 접속 비밀번호입니다.

포트 3080이 이미 사용 중이면 처음 설치할 때 지정합니다.

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
