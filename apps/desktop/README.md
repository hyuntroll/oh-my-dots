# OhMyDots 데스크톱 미리보기

`http://127.0.0.1:3420/original/webview/`의 원본 Dots UI를 여는 macOS Apple Silicon 데스크톱 셸입니다. 저장소 루트에서 `npm start`로 서버를 먼저 실행하고, 컴퓨터가 필요하면 `npm run computer:start`로 준비합니다. 서버나 대화 데이터를 별도로 복제하지 않습니다.

```sh
npm ci --prefix apps/desktop
npm start --prefix apps/desktop
npm run package:mac --prefix apps/desktop
open output/desktop/OhMyDots-darwin-arm64/OhMyDots.app
```

커스텀 상단바에서 창을 이동하고 새로고침, 브라우저 열기, 전체 화면을 사용할 수 있습니다. macOS 기본 창 제어 버튼과 편집 단축키를 유지합니다. 앱 종료는 Command+Q입니다. 앱을 종료해도 웹 서버는 계속 실행되므로 기존 브라우저에서 테스트하면 됩니다.

웹 화면에는 Node.js나 Electron IPC를 노출하지 않습니다. 외부 링크는 기본 브라우저로 열립니다. 앱 전용 브라우저 쿠키는 Electron의 사용자 데이터 폴더에 저장됩니다. 설치 프로그램, 자동 실행, 배포용 서명은 포함하지 않는 로컬 미리보기입니다.

구현 참고: [Electron custom title bar](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar), [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).
