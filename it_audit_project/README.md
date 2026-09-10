# IT감사 라이프사이클 플랫폼 — 개발 소스 (v8.48 기준 분리판)

기존에 쓰시던 단일 HTML 파일(`IT감사_라이프사이클_플랫폼_v8_48_20260908.html`)에서
**대용량 데이터 상수만** 별도 파일로 분리한 버전입니다. 로직(app.js)은 원본과 동일하며,
빌드하면 다시 원본과 똑같은 "단일 HTML 파일 1개"가 나옵니다.

## 폴더 구조

```
project/
  index.html              ← 화면 UI 마크업 + CSS (원본과 동일)
  package.json
  vite.config.js           ← 빌드 시 단일 HTML로 합치는 설정 (vite-plugin-singlefile)
  src/
    app.js                 ← 나머지 탭들의 로직 (아직 하나로 뭉쳐 있음, 계속 줄어드는 중)
    core/
      stores.js            ← localStorage 편집 오버레이 캡슐화 클래스(OverrideStore)
    features/
      kanban.js            ← 🗂 칸반보드 탭 전체 (v8.49에서 최초로 물리적 분리 완료)
      findings.js          ← 📋 발견사항 관리 탭 전체 (v8.49에서 두 번째로 물리적 분리 완료)
    vendor/
      xlsx.full.min.js     ← SheetJS 라이브러리 (오프라인용, 원본에 내장돼 있던 것)
    data/
      domains-data.js       ← 25+1개 도메인 정의 (기존 id="domains-data")
      survey-template.js    ← 인터뷰용 설문지 HTML 템플릿 (기존 id="survey-template-data")
      template-xlsx-b64.js  ← xlsx 템플릿 base64 (기존 id="template-xlsx-b64")
      domain-brief-desc.js  ← 도메인별 한줄 설명 (기존 const DOMAIN_BRIEF_DESC)
      interview-scripts.js  ← 인터뷰 스크립트 202개 항목 (기존 const INTERVIEW_SCRIPTS)
      ai-flow-defaults.js   ← AI 플로우차트 기본값 (기존 const AI_FLOW_DEFAULTS)
```

## 사용법

### 1. 처음 한 번만: 패키지 설치
```bash
npm install
```

### 2. 수정할 때
- 인터뷰 스크립트를 고치고 싶다 → `src/data/interview-scripts.js` 하나만 열어서 수정
- 🗂 칸반보드 기능을 고치고 싶다 → `src/features/kanban.js` 하나만 열어서 수정
- 📋 발견사항 관리 기능을 고치고 싶다 → `src/features/findings.js` 하나만 열어서 수정
- 그 밖의 화면 기능(로직)을 고치고 싶다 → `FEATURE_MAP.md`에서 먼저 찾아본 뒤 `src/app.js`에서
  해당 구간만 수정 (아직 탭별로 다 안 나뉘어 있음)
- 화면 레이아웃/CSS를 고치고 싶다 → `index.html` 수정
- 31,000줄짜리 파일을 통째로 열 필요가 없습니다.

### 3. 배포용 단일 HTML 파일 뽑기
```bash
npm run build
```
`dist/index.html` 파일 **1개**가 생성됩니다. 이 파일이 지금까지 쓰시던 것과 동일한,
그 자체로 완결된 단일 HTML 파일입니다 (인터넷 연결 없이도 실행되고, 폴더 복사·이메일
첨부 등 지금 하시던 배포 방식 그대로 사용 가능).

### 4. 개발 중 미리보기 (선택)
```bash
npm run dev
```
브라우저에서 `http://localhost:5173` 접속 시 여러 파일을 그대로 로드해서 미리 볼 수
있습니다 (핫리로드 지원). 다만 이 상태로는 파일이 여러 개라 그냥 복사해서 배포하면
안 되고, 배포는 항상 3번(`npm run build`) 거쳐서 나온 `dist/index.html`을 사용하세요.

## 버전 관리 프로토콜 이어가기

기존에 쓰시던 프로토콜(①SYSTEM_VERSION/SYSTEM_BUILD_DATE 갱신 → ②출력 파일명에 버전·날짜
반영 → ③"사용법 가이드" 탭 변경 이력 표 갱신) 그대로 적용하시면 됩니다. `SYSTEM_VERSION`
상수는 `src/app.js` 안에 그대로 있습니다 (검색: `SYSTEM_VERSION`).

`npm run build` 후 `dist/index.html`을 원하는 파일명으로 바꿔서
(`IT감사_라이프사이클_플랫폼_v8_49_20260909.html` 등) 저장하시면 됩니다.

## 진행 현황

- ① 정적분석 — 완료
- ② 데이터부터 분리 — 완료 (`src/data/*.js`)
- ③ localStorage override 레이어 클래스화 — 완료 (`src/core/stores.js`의 `OverrideStore` 클래스.
  `scriptOverrides`/`flowOverrides`는 이제 `scriptStore.data`/`flowStore.data`와 동일한 객체를
  가리키므로, 기존에 이 변수들을 직접 수정하던 코드는 전부 그대로 동작합니다. 새 코드는
  `scriptStore.get(code)` / `.set(code, value)` / `.merge(code, partial)` / `.remove(code)` /
  `.clear()` 같은 명확한 API를 쓸 수 있습니다.)
- ④ 탭 단위(설문 빌더/인터뷰 가이드/증빙관리/배포 등)로 `app.js` 쪼개기 — **19개 UI 탭
  전체 완료.**
- ⑤ 공통 UI 유틸(부서선택/날짜/이스케이프/줌 등 36개 함수)까지 `src/features/common.js`로
  분리 완료. **`src/app.js`가 원래 31,000줄에서 2,959줄로 줄었습니다.** 이제 남은 내용은
  데이터 상수/공유 상태(`let`) 선언, 그 상태를 바꾸는 세터 함수 18개, import/export 배선,
  window 노출 등록부뿐입니다 — 이 이상 쪼개려면 각 상태 변수를 진짜 소유할 모듈을
  새로 정하는 구조적 재설계가 필요해서, 실질적으로 여기가 자연스러운 종착점입니다.
  13개 기능 모듈: `kanban.js`, `findings.js`, `generate.js`, `dist.js`, `collect.js`,
  `interview.js`, `comm.js`, `report.js`, `data.js`, `archive.js`, `auditoverview.js`,
  `guide.js`, `common.js`.

매 단계마다 Playwright로 회귀 검증 후 다음 단계로 넘어가는 방식을 유지하고 있습니다.

## ③단계에서 발견한 모듈 노출 버그 상세

②단계에서 `app.js`를 `<script type="module">`로 바꾸면서, 최상위 함수 선언이
더 이상 자동으로 `window`에 붙지 않게 되는 부작용이 있었습니다. 그 결과:
- `index.html`의 `onclick="함수명(...)"` 인라인 핸들러 9개(예: 인터뷰 일정 내보내기,
  칸반 진행보고서 열기 등)가 클릭 시 오류를 냈을 것이고,
- 인터뷰 가이드가 여는 팝업 창들이 `window.opener`를 통해 참조하는
  `scriptOverrides`/`flowOverrides`/`saveScriptOverrides`/`saveFlowOverrides`/
  `renderInterviewGuide`도 접근 불가능했을 것입니다.

이번 단계에서 `app.js` 맨 끝에 "필요한 것만 명시적으로 window에 노출하는" 블록을
추가해 고쳤고, Playwright로 각 항목이 실제로 `window`에서 조회되는지, 함수 호출과
`scriptOverrides` 저장/불러오기 왕복까지 실제로 성공하는지 확인했습니다.

## ④단계 첫 모듈(칸반보드) 분리하며 발견·수정한 버그 3건

칸반보드를 실제로 옮기고 나서 "그냥 페이지가 뜨는지"가 아니라 "버튼을 실제로 눌러보는" 검증을
했더니, 이전 단계부터 있었던 문제들이 추가로 드러났습니다. 전부 이번 단계에서 함께 고쳤습니다.

1. **`selectedCodes` export 누락** — kanban.js가 참조하는 app.js의 `Set` 변수 하나가 export 안 되어
   있어서, 칸반 카드 추가 시 도메인 선택 목록이 비어 있었을 문제. 발견 즉시 export 추가.
2. **`kanbanUpdateNote` 함수 통째로 유실** — 원본 코드에 `}function kanbanUpdateNote(...){` 처럼 이전
   함수의 닫는 중괄호와 새 함수 선언이 한 줄에 붙어 있던 부분이 있어, 자동 추출 스크립트가 이 함수의
   시작부를 못 찾고 몸통만 고아로 남겼습니다. 함수 전체를 복원해서 kanban.js에 재구성.
3. **동적으로 생성되는 onclick/onchange 핸들러 대량 누락 (가장 컸던 문제)** — ②③단계 검증은
   "정적 index.html의 onclick"만 확인했는데, 실제로는 render 함수가 `innerHTML`로 찍어내는 카드마다
   `onclick="kanbanDeleteCard(...)"` 같은 문자열이 박혀 있어서 이런 건 클릭해보기 전엔 안 드러났습니다.
   앱 전체를 `onXXX="함수명("` 패턴으로 전수 스캔해서, kanban.js 자체 함수 9개 + app.js의 기존 함수
   22개(`autoMatchResponses`, `deleteDistribution`, `igToggleDetail` 등 — **②③단계부터 있던 버그**)를
   찾아 전부 window에 노출하도록 고쳤습니다.

검증은 실제 클릭 기반으로 진행했습니다: 카드 추가 → 메모 수정 → 상태 변경 → 히스토리 토글 →
삭제 → 보관함에서 복원 → JSON 내보내기까지 전부 Playwright로 직접 클릭·입력해서 에러 없이
동작하는 것과 localStorage에 정확히 저장되는 것을 확인했고, 19개 탭 전체를 순회하며 다른 탭에
회귀가 없는 것도 함께 확인했습니다.

## ④단계 두 번째 모듈(발견사항 관리) 분리하며 발견·수정한 버그

발견사항 관리를 분리할 때는 칸반 때 배운 교훈(HANDOFF.md 함정 1~4)을 미리 적용해서 진행했고,
실제로 함정 2(붙어있는 함수 경계), 함정 1(동적 onclick)은 사전 점검에서 걸리지 않았습니다.
다만 새로운 종류의 문제를 하나 더 발견했습니다:

- **모듈 간 교차 참조 누락** — 발견사항 목록 화면에는 "🗂 칸반 카드로 보내기" 버튼이 있는데, 이
  버튼을 누르면 `kanbanSendFromFinding`(kanban.js가 export하는 함수)을 호출합니다. 이 배선
  코드가 findings.js로 함께 옮겨지면서, findings.js가 kanban.js의 함수를 직접 import해야
  한다는 게 빠져 있었습니다. app.js만 보고 있었다면 못 잡았을 문제라, **두 feature 모듈끼리도
  서로 참조하는 경우가 있다는 것**을 이번에 확인했습니다. (`import { kanbanSendFromFinding }
  from './kanban.js';` 추가로 해결)

이번에도 정적 분석뿐 아니라 실제로 발견사항 등록 → 저장 → "칸반으로 보내기" 클릭까지 Playwright로
실행해서 이 문제를 잡았습니다. 정규식 기반 자동 추출 스크립트의 괄호 카운터도 이번에 한 단계
더 견고하게 만들었습니다 — 정규식 리터럴(`/"/g` 같은) 안의 따옴표를 문자열 시작으로 착각해서
함수 끝을 못 찾는 버그가 있었는데, 정규식 리터럴을 구분하는 로직을 추가해 해결했습니다.

## 검증 완료 사항 (이번 세션에서 확인함)

- `npm run build` → `dist/index.html` 단일 파일 산출 확인 (vendor 라이브러리도 인라인됨)
- Playwright로 실제 브라우저 로딩 검증: JS 에러 0건, 버전 배지 정상 표시, D-26 도메인
  포함 237개 도메인 카드 정상 렌더링, `window.XLSX` 정상 등록
- ③단계 이후: 인라인 onclick 핸들러 9개 + 팝업 연동용 5개 항목 모두 `window`에서 정상
  조회됨, `goToGuideSection()` 직접 호출 성공, `scriptOverrides` 저장→localStorage
  기록→삭제 왕복 테스트 성공, JS 에러 0건
- ④단계(칸반보드) 이후: 카드 추가·메모수정·상태변경·삭제·보관함복원·내보내기 전부 실제
  클릭으로 성공, localStorage 반영 확인, 19개 탭 전체 순회 시 JS 에러 0건(Google Fonts
  403 하나만 발생하는데 이는 지난 세션부터 있던 사항으로 폐쇄망에서는 폴백 폰트로 대체되어
  치명적이지 않음)
- ④단계(발견사항 관리) 이후: 발견사항 등록·저장, 칸반으로 보내기(크로스 모듈 호출) 전부
  실제 클릭으로 성공, 19개 탭 전체 순회 시 JS 에러 0건

## 함께 들어있는 가이드

- `단일HTML파일_빌드가이드.txt` — 이 소스로 최종 단일 HTML 파일을 뽑는 절차를
  Node.js를 처음 다뤄보는 분도 따라할 수 있게 단계별로 정리했습니다.
- `FEATURE_MAP.md` — **특정 기능을 고치고 싶을 때 어디를 봐야 하는지 찾는 색인**입니다.
  `src/app.js`가 아직 하나로 뭉쳐 있는 상태(730KB, 함수 385개)라, 19개 UI 탭 기준으로
  "이 탭 관련 함수들은 이런 이름이고 이 줄 번호에 있다"를 미리 분류해 정리했습니다.
  다음에 특정 기능만 고치고 싶으시면 이 문서에서 먼저 찾아본 뒤, `sed -n '시작,끝p' src/app.js`로
  필요한 부분만 뽑아서 채팅에 올리시면 파일 전체를 올릴 필요가 없습니다. (다만 함수들이 파일
  안에 물리적으로 흩어져 있어서 "그 구간만 잘라서 새 파일로" 하는 건 안 되고, 진짜 파일 분리는
  다음 단계인 ④에서 이뤄집니다 — 이 문서는 그 전까지 쓰는 임시 내비게이션입니다.)
- `HANDOFF.md` — **다른 Claude 세션/계정으로 이 작업을 이어갈 때 쓰는 인계 문서**입니다.
  지금까지 진행 상황, 컴포넌트 분리 작업 중 실제로 겪은 위험요소(모듈 전환으로 인한 전역
  노출 소실, 원본 코드의 붙어있는 함수 경계, 동적 onclick 핸들러 누락 등)와 재현 가능한
  작업 절차를 정리해뒀습니다. 새 Claude 세션을 시작하실 때 이 파일을 먼저 올려주시면, 이전
  대화 맥락 없이도 안전하게 이어서 작업할 수 있습니다.
