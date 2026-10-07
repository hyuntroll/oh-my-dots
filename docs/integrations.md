# 앱 연결과 실행 경로

Gmail, Google Calendar, Google Drive, Slack은 서버 OAuth 연결 후 읽기 API를 사용할 수 있습니다. `capabilities_resolve`는 연결과 작업 지원 여부를 확인해 API 또는 Dot 브라우저를 선택합니다. `integration_read`는 고정된 API 주소만 호출합니다. API 조회는 컴퓨터 제어권 반환을 기다리지 않습니다.

| 서비스 | 현재 API 기능 | 요청 권한 |
| --- | --- | --- |
| Gmail | 메시지 검색·조회 | gmail.readonly |
| Calendar | 오늘 이후 기본 캘린더 이벤트 조회 | calendar.events.readonly |
| Drive | 파일명 검색·메타데이터 조회 (`search`, `metadata`) | drive.readonly |
| Slack | 공개 채널 목록·대화 조회 | channels:read, channels:history |

전송·수정·공유, Drive 문서 본문, Gmail 첨부파일 다운로드, 비공개 Slack 채널·DM은 현재 API 도구에 없습니다. 브라우저가 필요한 작업은 기존 컴퓨터 사용 흐름으로 진행합니다. 로컬 Mac 접근과 Slack에서 Dot에게 대화하는 메시징 채널은 아직 제공하지 않습니다.

## OAuth 서버 설정

`.env.local`에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`을 설정합니다. 자격 증명 값은 Git에 커밋하지 않습니다. 호스트 실행은 `.env.local`을 읽고, Docker API도 같은 파일을 사용합니다. 설정 후 API를 재시작합니다.

Google OAuth 클라이언트는 Web application 유형입니다. Gmail API, Calendar API, Drive API를 활성화하고 동의 화면의 테스트 사용자/게시 상태를 구성해야 합니다. Slack 앱은 위 Bot Token Scopes를 설정하며, 조회할 공개 채널에는 앱을 초대해야 합니다.

`DOT_ORIGIN`에 맞춰 다음 콜백을 등록합니다. 기본 개발 주소는 `http://localhost:3080`입니다.

- `/api/integrations/gmail/callback`
- `/api/integrations/calendar/callback`
- `/api/integrations/drive/callback`
- `/api/integrations/slack/callback`

설정 → 플러그인 → 앱 → 연결하기에서 사용자가 직접 동의합니다. 자격 증명이 없으면 설정 필요 상태를 표시하며 연결됨으로 표시하지 않습니다.

## 저장 및 검증

OAuth state는 예측 불가능하고 10분 후 만료되며 한 번만 사용합니다. 전용 HttpOnly, SameSite=Lax 콜백 쿠키에 묶어 검증합니다. 앱 세션 쿠키는 SameSite=Strict를 유지합니다. 요구 권한이 모두 승인되어야 토큰을 저장합니다. 토큰은 서버 데이터 폴더의 `integration-tokens.json`에 파일 권한 0600으로 저장하며 클라이언트/도구 결과에는 반환하지 않습니다. 운영 환경에서는 서버 데이터 볼륨을 보호해야 합니다.

연결 해제는 저장된 토큰을 삭제합니다. 서비스 측의 OAuth grant 철회는 해당 서비스 계정 설정에서 수행합니다. Google 만료 토큰은 refresh token으로 갱신합니다. 게이트웨이와 API는 콜백 코드가 access log에 기록되지 않게 구성합니다.

검증 기준은 MockTransport 기반 OAuth state·세션·만료·재사용·scope 검증, 토큰 갱신, API 목적지, 권한 해제, 오류 비밀정보 제거 테스트입니다. 실제 외부 계정의 OAuth 동의와 데이터 조회는 별도의 클라이언트 자격 증명 및 사용자 동의가 필요합니다.

공식 프로토콜 참고: [Google Web Server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Slack OAuth v2](https://api.slack.com/authentication/oauth-v2).
