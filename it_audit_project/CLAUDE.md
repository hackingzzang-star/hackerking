# IT감사 라이프사이클 플랫폼 (it_audit_project)

저축은행 IT 내부감사 실무 도구. 실제로 운영 중이므로 신중하게 수정한다.
결과물은 단일 HTML 1개(dist/index.html)이고 인터넷이 막힌 내부망에서 연다.

## 구조
- index.html : UI 마크업과 CSS
- src/app.js : 공유 상태, 세터 함수, import/export 배선, window 노출 등록
- src/features/*.js : 탭별 기능 모듈 13개
- src/core/stores.js : localStorage 편집 오버레이(OverrideStore)
- src/data/*.js : 대용량 데이터 상수, src/vendor/ : 외부 라이브러리
- 빌드: Vite + vite-plugin-singlefile. `npm run build` 는 dist/index.html 1개를 만든다.
- 코드가 정답이다. README·HANDOFF·FEATURE_MAP은 과거 기록이라 현재와 어긋날 수 있다. 기능 위치는 src/features/ 파일명으로 찾는다.

## 절대 규칙
- 수정은 src/ 와 루트 index.html 에서만 한다. dist/ 는 빌드 결과물이므로 읽지도 수정하지도 않는다.
- 대용량 파일을 통째로 열지 않는다.
  - src/data/interview-scripts.js, domains-data.js, survey-template.js, template-xlsx-b64.js 는 몇 줄뿐인데 수백 KB다. 일부만 볼 때는 `head -c 300` 이나 grep -o 로 필요한 조각만 본다.
  - src/data/ai-flow-defaults.js(약 15,000줄), src/vendor/ 도 같은 원칙.
  - interview.js(약 3,300줄), collect.js(약 2,000줄), index.html(약 3,500줄)은 검색으로 위치를 찾은 뒤 그 구간만 읽는다.
- 실제 감사 자료·개인정보는 코드, 예시, 프롬프트에 넣지 않는다. 더미 데이터만 쓴다.
- git commit 과 git push 는 사용자가 요청할 때만 한다. push 는 하지 않는다.
- 외부 네트워크 호출, CDN, 새 npm 패키지를 추가하지 않는다(폐쇄망 배포). 필요하면 먼저 묻는다.
- 백업 폴더나 복사본(백업_*, zip)을 소스 안에 만들지 않는다. 필요하면 G:\backup_it_audit\ 아래에 둔다(앱 데이터 JSON 백업은 G:\backup_it_audit\data\).

## 코드 규칙 (과거 사고에서 나온 것)
- HTML 문자열의 onclick=, onchange=, oninput= 에서 부르는 함수는 모듈 스코프라 자동으로 window 에 붙지 않는다. 이런 핸들러에 새 함수를 쓰면 그 모듈 끝의 `Object.assign(window, {...})` 에 등록한다. index.html 의 정적 핸들러와 innerHTML 로 그리는 동적 핸들러 모두 해당한다.
- feature 모듈 최상위에 즉시 실행 코드(IIFE, 초기화)를 넣지 않는다. 모듈끼리 서로 import 하는 순환 구조라 `Cannot access 'X' before initialization` 오류가 난다. 초기화와 이벤트 연결은 app.js 에 두고, 모듈에는 함수와 상수 선언만 둔다.
- feature 모듈이 다른 feature 모듈의 함수를 쓸 수 있다(예: findings.js 가 kanban.js 의 함수를 호출). 새로 참조하면 export 와 import 를 함께 맞춘다.

## 검증 (이 순서로, 빌드만으로 끝내지 않는다)
1. `npm run build` 가 성공한다. 빌드가 성공해도 기능이 정상이라는 뜻은 아니다.
2. 브라우저(Playwright)로 페이지를 열고 pageerror 와 console.error 를 확인한다. Google Fonts 403 1건은 원래 있던 것이라 무시한다.
3. 고친 탭에 들어가 버튼과 입력창을 실제로 누른다. 정의되지 않은 이름 오류는 클릭해야 나온다.
   탭 이동: `.tabgroup-chip[data-group="prep|perform|comm|report|manage"]` 를 누른 뒤 `.tabbtn[data-tab="탭"]` 을 누른다. 탭이 속한 그룹은 index.html 에서 확인한다(그룹이 틀리면 탭이 안 보여 거짓 실패가 난다).
4. 저장 동작은 `localStorage.getItem('키')` 로 값이 정확히 들어갔는지 확인한다.
5. 다른 탭에 회귀가 없는지 전체 탭을 훑는다.
결과는 통과/실패와 실제로 본 오류를 그대로 보고한다.

## 버전·기록 규칙 (코드나 기능을 바꿀 때)
1. app.js 의 SYSTEM_VERSION 과 SYSTEM_BUILD_DATE 를 갱신한다.
2. 출력 파일명에 버전과 날짜를 반영한다.
3. '사용법 가이드' 탭의 변경 이력 표에 새 행을 추가한다.
화면 본문에는 기능 설명만 쓰고, 추가 경위는 변경 이력에만 쓴다.

## 작업 방식
- 큰 변경은 구현 전에 계획을 보여 주고 승인받는다. 한 번에 한 기능만 다룬다.
- 응답은 한국어로, 간결하고 직접적으로 쓴다.