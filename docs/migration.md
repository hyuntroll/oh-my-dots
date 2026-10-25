# 이번 Dots로 교체

저장소 루트가 원본 Dots UI + Grok reconstructed 실행기 + Docker 컴퓨터 앱으로 바뀌었다. `apps/dots-reconstructed` 별도 앱 경로는 제거했고, `npm start`·`npm run dev`·`scripts/dev.sh`·`install.sh`와 선택형 Electron 셸이 같은 앱을 사용한다. 기본 주소는 `http://127.0.0.1:3420/original/webview/`이다.

이전 Python API·Next.js 웹·PostgreSQL·게이트웨이 Compose 구성은 main에서 제거했다. 기존 코드는 `codex/dots-pre-original-ui` 브랜치에서 확인할 수 있다. 새 앱은 기존 서버의 인증·OAuth·사용량 기능을 그대로 이식한 버전이 아니다. 현재 지원 범위는 루트 README에 기록했다.

## 별도 폴더에서 쓰던 이번 Dots 데이터

기존 서버를 먼저 종료한다. 이전 `.data/`에는 대화 DB, Grok 기록, 작업 파일과 컴퓨터 토큰이 함께 있으므로 폴더 전체를 보존해야 한다. 빈 새 `.data/`와 기존 데이터를 섞지 않는다.

데이터를 이동하지 않고 이어 쓰려면 다음 중 하나를 사용한다.

```sh
# 새 저장소의 .data가 아직 없을 때만 생성
ln -s /absolute/previous-dots/.data .data
npm run grok:prepare
npm start

# 또는 현재 실행에만 이전 데이터 위치를 지정
DOTS_DATA_DIR=/absolute/previous-dots/.data npm start
```

`DOTS_DATA_DIR`만 지정하면 Grok 빌드 캐시의 기본 위치는 여전히 새 저장소의 `.data/grok-build`다. 먼저 새 저장소에서 `npm run grok:prepare`를 실행한다. `.data` 심볼릭 링크를 사용한 경우 빌드도 그 데이터 위치에 저장된다. 동일한 DB를 사용하는 서버를 동시에 실행하지 않는다. 기본 실행기를 새로 정할 때는 `npm run grok:start` 또는 `npm run opencode:start`를 사용한다.

기존 Docker 컴퓨터가 실행 중이면 새 앱은 같은 서비스에 연결할 수 있다. 실행 중인 컴퓨터의 마운트와 브라우저 데이터는 이 저장소 전환만으로 바꾸지 않는다. 나중에 컴퓨터를 재생성할 경우 기존 컨테이너의 필요한 브라우저·작업 데이터를 먼저 보존한다.

## 이전 Python/Next.js 앱 데이터

`.local/`, 기존 환경 파일, PostgreSQL/Docker 볼륨은 삭제하지 않는다. 새 앱의 데이터 형식은 별도의 SQLite이며 자동 변환은 제공하지 않는다. 복구가 필요하면 이전 브랜치의 앱과 데이터 백업을 사용한다. 미추적 연구 문서나 실험 폴더도 교체 대상이 아니다.

## 2026-10-25 전환 검증

- 저장소 루트에서 의존성 설치와 `npm run setup` 성공: 원본 UI 1,479개 및 캐릭터 자산 465개 해시 일치, Grok 호스트 준비, 타입 검사·빌드 통과.
- 기본 테스트 62개와 실제 Grok 프로토콜 선택 테스트 1개 통과.
- 별도 데이터·포트에서 `npm run dev` 실행 시 기본 Grok 모드·원본 UI 이동·Dot 생성·실제 모델 응답·작업 완료 확인.
- 주 로컬 저장소를 main으로 전환하고 그 루트에서 `npm start`로 실행. 기존 이번 Dots의 `.data`를 링크해 Dot 2개·메시지 23개·작업 12개와 메시지 내용 해시 및 모델 설정 보존 확인.
- Docker 컴퓨터는 같은 서비스와 소유권 epoch를 유지하며 1280×960 화면에 연결. 기존 컨테이너를 재생성하지 않음.
- 기존 `.local/`과 미추적 연구 문서·실험 폴더는 유지.
