# 계정 서비스와 모델 연결

2026-10-28, Asia/Seoul. 원본 클라이언트의 인증·생성 계약을 기준으로 로컬 서비스 경계를 구현했습니다. 원본 인증 서버의 복구를 주장하지 않습니다.

## REA와 원본 근거

기존 원본 ASAR SHA256은 `5b5cf52887cfd4de19cb5862155a8ef6cf58830c0a2fc592b72060cfcc3be869`입니다. 이번 REA 분석 대상은 불변 추출 디렉터리 `public/original/webview`, SHA256 `02a08402d78901262e2375ad5a1167112bb48f5c584bfbc56c7b3f17b96c9f7b`입니다. 부모 Evidence는 `ev_ecdd0ee8174ddfa86029372678a723c2d7e87730fdaef394247ffd6ef2b47661`, 요약 뷰는 `ev_8aeebae2dec1cb46d86d086824441ce1855502db70e26089a435f82dac766c5f`입니다. 763개 JavaScript 파일을 정적으로 파싱했으며, 큰 공통 번들의 그래프 확장과 의미 관계는 예산 제한으로 **partial**입니다. 정적 분석은 실행 관측이나 클라우드 서버 동작의 증거가 아닙니다.

원본 소스 계약을 직접 확인한 범위:

- `app-initial-dddef47d6ef6.js`의 `_mr` 인증 컨텍스트와 `czn` AuthNonce, `NOc` 프로필 푸터, `R7c` 제품 헤더가 로컬 어댑터의 결합 지점입니다. 실제 로컬 세션에서 얻은 계정 ID와 사용자 ID를 원본 인증 컨텍스트와 쿼리 키에 전달합니다. 원본 계정 메뉴의 로그아웃이 실제 세션을 종료합니다.
- `page-a0db2051c101.js`의 실제 `rc` 생성 컨트롤러, `Gs` 소개 화면, `Ja` 컴퓨터 설정 화면을 서비스에서도 직접 렌더합니다. 별도 이름·설명 생성 폼은 제거했습니다. 원본 `orbitIds.length > 0` 제출 제한만 HTTP 응답에서 완화하며 실제 기존 Dot 목록은 유지합니다. 불변 원본 파일의 SHA256은 `9c76fc60a4d65659bfbf0d89d9138fce5ba99019abf69b657911b4ab2a333ab9`입니다.
- 원본 흐름 초기화 `Frr`/`Mrr`와 `Prr` atom을 사용합니다. 추가할 때 새 flow ID로 마법사를 마운트하며 진행 중인 생성은 원본 초기화 규칙에 따라 보존합니다. 완료 후 생성된 실제 Dot 경로로 이동합니다. 원본 사이드바의 `ZTc` descriptor와 렌더러에 Dot 추가 항목을 연결했습니다.
- 계정·모양·일반·플러그인은 기존 원본 Settings shell을 사용합니다. 별도 `/account` 페이지는 제거하고 원본 `/settings/account`로 연결합니다. 로컬 비밀번호·사용자 관리만 원본 계정 본문에 원본 행·대화상자로 추가했습니다. 로컬 인증의 로그인 진입 화면은 별도 서비스 UI입니다.
- 모델 연결은 원본 메타데이터의 `gateways`(모델 제공업체)에 통합했습니다. 원본 Gateways 본문 `settings-660d7de134d3.js`는 보존 추출물에 없으며, 현재 설치 ASAR는 다른 버전이므로 섞지 않았습니다. 이 본문은 보존 번들의 `QF`, `LF`, `sA`, `sw`, `$C`, `ZLn`, `Y3`, `mut`, `dialog-shell` 컴포넌트와 실제 로컬 API로 구성한 어댑터입니다. 전체 원본 Gateway 본문을 복원했다는 의미는 아닙니다.

## 저장과 인증

`server/accounts.mjs`는 계정 DB와 만료되는 세션을 저장합니다. 비밀번호는 salt가 있는 scrypt(N32768/r8/p3)로 해시하고, 세션에는 무작위 토큰의 SHA256만 저장합니다. 쿠키는 HttpOnly·SameSite=Lax이며 공개 HTTPS에서는 Secure와 `__Host-` 이름을 사용합니다. 쓰기 요청은 설정된 공개 origin과 JSON Content-Type을 확인합니다. 초기 관리자 생성에는 서버의 private bootstrap code가 필요하고 공개 회원가입은 기본으로 꺼져 있습니다.

`server/service.mjs`는 로그인한 계정에만 계정별 `createApp()` 저장소와 런타임을 연결합니다. 내부 API는 루프백에만 열고 별도 임의 gateway token도 요구합니다. 다른 계정의 room/task/artifact/avatar/SSE에는 같은 ID를 알아도 접근할 수 없습니다. 로그아웃·비밀번호 변경·세션 만료는 해당 세션 스트림도 닫습니다. 계정 DB, 각 계정의 SQLite·작업 폴더, OpenCode의 XDG 데이터·설정·캐시는 분리됩니다.

`exact-host/account-state.mjs`와 어댑터는 캐릭터 manifest·스냅샷 참조·읽음 상태·원본 persisted atom과 화면 설정을 계정 저장소에 저장합니다. 서비스 모드에서 브라우저 저장소는 기록의 기준이 아닙니다. 기존 데이터 폴더에 연결한 소유자만 이전 단일 사용자 브라우저 설정을 최초 가져올 수 있습니다. 설정 저장 실패는 화면에 표시합니다. 새 계정에는 이전 브라우저의 설정을 자동 복사하지 않습니다.

이전 공용 컴퓨터는 legacy 데이터 소유자만 사용합니다. 다른 계정은 HTTP 화면·입력·시작과 런타임 컴퓨터 도구를 모두 차단합니다. 계정마다 Docker desktop을 자동 생성하는 멀티 테넌트 컴퓨터 프로비저닝은 이 설치기에 포함되지 않습니다.

## 제공자와 모델 목록

연결 동작은 [Open WebUI의 자동 조회·연결 확인 흐름](https://docs.openwebui.com/getting-started/quick-start/connect-a-provider/starting-with-openai-compatible/)을 참고했습니다. 화면은 원본 설정의 제공업체 행 → 원본 연결 대화상자 → API 키 → 모델 조회 → 검색·필터·선택 순서입니다. 설치 CLI도 같은 discovery 함수를 사용합니다. 조회가 없는 서버에는 고급 수동 입력을 제공합니다.

| 제공자 | 실제 조회 | 범위 |
| --- | --- | --- |
| OpenAI | Bearer `GET /v1/models` | 키에 반환된 모델 전체. 목록에 있다고 모든 호출·한도·기능을 보장하지 않음 |
| Anthropic | Bearer `GET /v1/models?limit=100`, `anthropic-version: 2026-10-21` | `has_more`/`after_id` 페이지 조회, 응답의 이름·입력 길이·이미지 지원 표시 |
| OpenRouter | Bearer `GET /api/v1/models/user?output_modalities=all` | 사용자 제공자·개인정보·가드레일 설정을 반영한 모델, total_count 기반 페이지 조회 |
| Ollama·호환 서버 | `GET <baseURL>/models` | 서버가 보고한 모델. Ollama 기본 주소는 `/v1` 호환 API |

최대5,000개, 응답12MB, 페이지50회, 전체30초로 제한하고 잘린 목록은 표시합니다. 검색은 조회된 전체 목록을 대상으로 하고 UI는50개씩 표시합니다. 이미지·도구·컨텍스트 배지는 제공자가 실제 반환한 필드만 사용합니다. 출력이 명시적으로 비텍스트인 모델은 Dots 대화 기본 모델로 선택하지 않습니다. 기능이 알려지지 않은 모델을 임의로 성공·호환으로 표시하지 않습니다.

모델 목록 조회는 추론 요청을 발생시키지 않습니다. 리디렉션을 따라 키를 전달하지 않으며, 저장된 키를 다른 API origin에 보낼 때는 다시 입력하게 합니다. 제공자 오류 본문은 키를 반사할 수 있어 브라우저에 그대로 전달하지 않습니다. 잘못된 제공자 키는 앱 로그인 만료와 다른 오류로 처리합니다. 키는 private `providers.json`에 저장하고 클라이언트에는 목록과 모델 이름만 반환합니다. 원본 실행기의 도구·승인 정책은 유지하고 OpenCode2의 `providers`만 병합합니다.

공식 계약: [OpenAI Models API](https://developers.openai.com/api/reference/resources/models/methods/list), [Anthropic List Models](https://platform.claude.com/docs/en/api/models/list), [OpenRouter 사용자 모델 목록](https://openrouter.ai/docs/api/api-reference/models/list-models-filtered-by-user-provider-preferences-privacy-settings-and-guardrails), [OpenCode2 제공자 설정](https://dev.opencode.ai/v2/docs/providers/), [OWASP 비밀번호 저장](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## 검증

백엔드 테스트는 로그인·관리자 제한·계정별 기록·서버 UI 상태·두 브라우저 세션·별도 계정의 ID 접근 차단·컴퓨터 차단·비밀번호 변경·로그아웃 SSE 종료를 확인합니다. 제공자 계약 테스트는 페이지 조회, 키 헤더, 중복 제거, 잘못된 키, 리디렉션과 키 미노출을 확인합니다. `tests/provider-live.mjs`는 실제 OpenCode2 CLI를 로컬 HTTP fixture에 연결해 설정한 모델·키가 실제 요청에 쓰이는지 확인합니다. 이 검증은 실제 외부 제공자의 키를 사용하지 않습니다.

브라우저에서는 별도 검증 계정으로 로그인해 첫 Dot과 두 번째 Dot을 만들고 메시지를 저장했습니다. IAB에서 만든 두 Dot과 대화가 별도 Chrome 브라우저 로그인에 그대로 보이는 것을 확인했습니다. 로컬 HTTP catalog fixture의108개 모델 조회, 검색·선택·모델 저장을 확인했습니다. 스크린샷은 `docs/qa/service/`에 있으며 모델 목록은 검증 fixture입니다. 실제 사용자의 API 키로 외부 모델 접근 권한을 검사한 결과가 아닙니다.

새 설치·대화형 모델 선택·컨테이너 검증은 [서비스 설치 안내](service-setup.md)에 기록합니다. 공개 DNS의 실제 TLS 발급과 Linux 재부팅 검증은 별도 배포 환경이 필요합니다.

## 원본 흐름 복구 검증

2026-10-28 검증 계정에서 기존 Dot 2개와 대화 2개를 유지한 채 원본 마법사로 세 번째 Dot을 생성하고 원본 대화방으로 이동했습니다. 다시 추가할 때 소개 화면부터 새 흐름이 시작됩니다. 로컬 서비스에 연결된 클라우드 앱이 없어 원본 도구 단계는 unavailable 화면과 계속 동작을 보이며, 네이티브 로컬 컴퓨터 사용은 비활성화됩니다. 이 검증은 별도 계정용 컴퓨터가 실제 연결됐다는 뜻이 아닙니다.

원본 계정·모델 제공업체·사용량 설정 화면을 브라우저에서 확인했습니다. 제공자 대화상자에서 저장된 검증 키로 루프백 fixture의108개 모델을 조회하고 검색·선택·저장했습니다. 원본 파일1479개 해시, 자동 테스트70개, 빌드가 통과했습니다. Postman CLI의 `GET /healthz`는 로컬 실행과 이벤트 전송 비활성화로2개 assertion을 통과했습니다(exit0). CLI 로그인 시도는 origin 검증으로403이었으며 보호를 완화하지 않았습니다. 인증된 제공자 흐름은 실제 브라우저에서 검증했습니다.

현재 화면: `docs/qa/service/original-dot-welcome.png`, `original-account-settings.png`, `original-provider-models.png`. 이전 `dots-tab.png`, `account-settings.png`는 교체 전 UI의 기록입니다.
