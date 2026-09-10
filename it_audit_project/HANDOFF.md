# 인계 문서 (HANDOFF) — IT감사 라이프사이클 플랫폼 컴포넌트 분리 작업

이 문서 하나만 읽고도 이전 대화 맥락 없이 작업을 이어갈 수 있도록 작성했습니다.
사용자(해커킹님)는 저축은행 IT 내부감사 실무자이며, 이 도구는 그가 실무에서 매일 쓰는
IT 감사 라이프사이클 관리 도구입니다. **실제로 운영 중인 도구이므로 신중하게 다뤄야 합니다.**

---

## 1. 무엇을 왜 하고 있나

원래 이 도구는 31,000줄짜리 단일 HTML 파일 하나였습니다(`IT감사_라이프사이클_플랫폼_v8_48_20260908.html`
같은 이름). 이 방식은 두 가지 문제가 있었습니다:
- Claude가 뭘 하나 고치려 해도 매번 파일 전체를 읽어야 해서 토큰 낭비
- 사람도 특정 코드를 찾기 어려움

그래서 **"개발은 여러 파일로 나누고, 배포할 때만 다시 합친다"** 구조로 전환 중입니다
(Vite + vite-plugin-singlefile 빌드 도구 사용). `npm run build`를 실행하면 최종적으로
지금까지 쓰던 것과 완전히 동일한 **단일 HTML 파일 1개**가 나옵니다. 이 부분은 이미 완성되어
있고 잘 작동합니다 — 궁금하면 `단일HTML파일_빌드가이드.txt`를 참고하세요.

## 2. 지금까지 진행 상황

원래 합의된 순서(①정적분석 → ②데이터 분리 → ③localStorage 캡슐화 → ④탭 단위 물리적 분리)
기준입니다.

- ① 정적분석 — 완료
- ② 데이터부터 분리 — 완료. `src/data/*.js` 6개 파일(domains-data, interview-scripts,
  ai-flow-defaults, domain-brief-desc, survey-template, template-xlsx-b64)
- ③ localStorage override 레이어 클래스화 — 완료. `src/core/stores.js`의 `OverrideStore` 클래스
- ④ 탭 단위(19개 탭) 물리적 분리 — **✅ 전체 완료.**
- ⑤ 공통 UI 유틸 36개 분리 — **✅ 완료.** `src/app.js`는 31,000줄에서 **2,959줄**로
  줄었고, 13개 기능 모듈로 나뉘었습니다: `kanban.js`, `findings.js`, `generate.js`,
  `dist.js`, `collect.js`, `interview.js`, `comm.js`, `report.js`, `data.js`, `archive.js`,
  `auditoverview.js`, `guide.js`, `common.js`. 남은 app.js 내용은 공유 상태(`let`) 선언·
  세터 함수 18개·import/export 배선·window 노출 등록부뿐이라, 탭/유틸 단위 분리는 여기서
  마무리하는 게 자연스럽습니다.

**다음 할 일**: 없음(구조 분리 관점에서는). 이제부터는 이 프로젝트 구조 위에서 실제 기능을
고치거나 추가하는 일반적인 개발 작업이면 됩니다 — 고칠 기능이 어느 탭/유틸 소속인지는
`src/features/` 파일명만 봐도 바로 알 수 있어서, 더 이상 이 문서나 FEATURE_MAP.md 없이도
작업 가능합니다.
`src/features/kanban.js`와 `src/features/findings.js`가 이미 완료된 실제 사례이자 참고
템플릿입니다 — 특히 findings.js는 kanban.js를 직접 import하는 모듈 간 교차 참조 사례라
"함정 6"을 이해하는 데 좋은 참고가 됩니다.

## 3. 반드시 알아야 할 위험요소 (칸반보드 작업 중 실제로 겪은 것들)

이 작업은 "코드를 잘라서 다른 파일에 붙여넣기"처럼 보이지만, 실제로는 아래 4가지 함정이
있었고 전부 실제 기능 오류로 이어졌습니다. **빌드가 성공했다고 해서 기능이 정상이라는 뜻이
아닙니다** — JS는 문법이 맞으면 빌드되지만, 정의되지 않은 변수를 참조하는 코드는 그 코드가
실제로 "실행"될 때(예: 버튼을 클릭했을 때)만 에러가 납니다.

### 함정 1: 모듈 전환으로 인한 전역(window) 노출 소실
`app.js`가 `<script type="module">`로 되어 있어서, 최상위 `function foo(){}` 선언이
예전 classic script 때와 달리 자동으로 `window.foo`가 되지 않습니다. 그런데 이 앱은
`onclick="foo(...)"` 형태의 인라인 이벤트 핸들러를 대량으로 씁니다. 이게 두 종류로 나뉩니다:

- **정적**: `index.html`에 고정으로 박혀있는 `onclick="..."` — `grep -oE 'onclick="[a-zA-Z_]+\(' index.html`로 찾을 수 있음
- **동적**: JS 코드가 `innerHTML`로 카드/행(row)을 그릴 때마다 문자열로 `onclick="..."`을
  찍어내는 것 — **이게 훨씬 많고 찾기 어렵습니다.** 실제로 클릭해봐야 압니다.

→ 새로 분리하는 feature 모듈(`src/features/xxx.js`)이 innerHTML로 onclick 문자열을 그리는
함수를 하나라도 갖고 있다면, 그 함수가 참조하는 모든 이름을 `Object.assign(window, {...})`로
그 모듈 파일 끝에 노출해야 합니다. app.js 끝에도 비슷한 블록이 있으니 패턴을 참고하세요.

**아주 중요**: 정적 onclick만 확인하고 넘어가면 안 됩니다. 반드시 아래 명령으로 전수 스캔하세요:
```bash
grep -oE '(onclick|onchange|oninput)\s*=\s*\\?['"'"'"][a-zA-Z_$][a-zA-Z0-9_$]*\s*\(' src/app.js src/features/*.js
```
그리고 결과로 나온 함수명 각각이 (a) 진짜 메인 문서에서 쓰이는 것인지, (b) 팝업 창
(`window.open` + `document.write`)의 **독립된 스크립트 안에서만** 쓰이는 것인지 구분하세요.
(b)는 그 팝업 자신의 스크립트 안에서 정의·실행되므로 window 노출이 필요 없습니다. 구분법:
`grep -n "function 함수명("`으로 검색했을 때 최상위 선언이 있으면 (a), 없고 큰 문자열
리터럴(`+ '...function 함수명(){...}...'`) 안에서만 보이면 (b)입니다.

### 함정 2: 원본 코드에 붙어있는 함수 경계
원본 파일은 유기적으로 커온 코드라, 가끔 `}function 다음함수명(...){` 처럼 이전 함수의
닫는 중괄호와 다음 함수 선언이 **같은 줄에** 붙어 있는 경우가 있습니다. 정규식 기반 자동
추출 스크립트(`^function\s+이름\(`처럼 줄 시작 매칭)는 이런 경우 다음 함수의 시작을 못 잡고,
그 함수의 몸통만 원래 파일에 고아로 남기거나, 앞 함수 추출 시 통째로 삼켜버립니다.

→ 추출 후 반드시 `npm run build`를 실행해 문법 에러를 확인하고(에러 메시지에 정확한 줄
번호가 나옵니다), 빌드가 성공해도 옮긴 함수 개수가 예상과 맞는지 다시 세어보세요.

### 함정 3: 소문자로 시작하는 공유 상태(변수)를 놓치기 쉬움
의존성 분석을 "함수 호출 패턴"(`이름(`)으로만 하면, `selectedCodes.has(...)`처럼 **점(.)으로
프로퍼티/메서드에 접근하는 공유 변수**를 놓칩니다. 반드시 아래처럼 전체 식별자 기준으로
다시 검사하세요 (함수 호출 여부와 무관하게 모든 단어 토큰 비교):
```python
import re
kanban_ids = set(re.findall(r'\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b', kanban_module_content))
app_top_level = set(re.findall(r'^(?:export\s+)?(?:function|const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)', app_content, re.MULTILINE))
missing = kanban_ids & app_top_level  # import 목록과 대조해서 빠진 것 찾기
```

### 함정 4: feature 모듈에 "즉시 실행되는" 최상위 코드를 넣지 말 것
`app.js`와 `src/features/xxx.js`는 서로를 import하는 순환 참조 구조입니다(xxx.js가 app.js의
공용 유틸을 가져다 쓰고, app.js가 xxx.js의 렌더 함수들을 가져다 씀). **함수 선언끼리는
순환 참조가 안전합니다**(호이스팅 덕분에). 하지만 xxx.js 최상위에 `(function(){ ... })();`
같은 **즉시 실행되는 초기화 코드**를 넣으면, 그 코드가 실행되는 시점에 app.js의 `let`
변수(예: `DOMAINS`)가 아직 초기화되지 않아 `ReferenceError: Cannot access 'DOMAINS' before
initialization`가 날 수 있습니다.

→ **초기화/이벤트-와이어링 코드(`(function xxxInitControls(){...})();` 같은 것)는 그대로
app.js에 남겨두고, feature 모듈은 순수 함수/상수 선언만 담으세요.** 칸반보드에서는
`kanbanInitControls` IIFE를 app.js에 그대로 뒀고, 이게 정확히 이 이유 때문입니다.

### 함정 5: 정규식 리터럴이 낀 코드에서 괄호 카운터가 깨질 수 있음
함수의 시작~끝 범위를 자동으로 찾는 스크립트(중괄호 깊이 카운팅 방식)를 쓸 때, 코드 안에
`/"/g`처럼 **정규식 리터럴 안에 따옴표가 들어있는 경우**를 조심해야 합니다. 순진한 괄호
카운터는 이 `"`를 "문자열이 시작됐다"고 착각해서, 그 뒤로 나오는 진짜 중괄호들을 전부
"문자열 안의 글자"로 취급해버려 함수의 끝(`}`)을 영영 못 찾습니다(`None` 반환).

→ 괄호 카운터에 정규식 리터럴 인식 로직을 넣으세요: `/` 문자를 만났을 때 바로 직전의
"의미있는 문자"가 `( [ { , ; = : ! & | ? + - * % ^ ~ < >` 중 하나이거나 줄의 시작이면
정규식 시작으로 간주하고, 이스케이프(`\`)와 문자 클래스(`[...]`) 안에서는 `/`가 끝을
의미하지 않는다는 것까지 고려해서 다음 `/`까지 건너뛰세요. (이 세션의 findings.js 작업
때 실제로 이 버그로 `renderFindingDeptDatalist` 함수의 끝을 못 찾는 사고가 났고, 이
로직을 추가해서 해결했습니다.)

### 함정 6: feature 모듈끼리 서로 참조하는 경우가 있음
지금까지는 "feature 모듈이 app.js의 공용 유틸을 가져다 쓴다"는 그림만 그렸는데, 실제로는
**feature 모듈끼리 직접 참조하는 경우**도 있습니다. 예: 발견사항 목록 화면의 "칸반 카드로
보내기" 버튼은 `findings.js` 안에서 `kanbanSendFromFinding`(kanban.js가 export)을
호출합니다. app.js만 보고 의존성을 분석하면 이런 건 안 잡힙니다.

→ 함정 3(전체 식별자 비교)을 할 때, app.js 최상위 선언뿐 아니라 **이미 분리된 다른 feature
모듈들의 export 목록과도** 비교하세요:
```python
kanban_exports = set(re.findall(r'^export\s+(?:function|const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)', kanban_content, re.MULTILINE))
findings_ids = set(re.findall(r'\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b', findings_content))
missing_cross_module = findings_ids & kanban_exports  # findings.js가 써놓고 import 안 한 것
```

## 4. 검증 방법 (반드시 이 순서로)

1. `npm run build` — 문법 에러부터 잡기
2. Playwright로 페이지 로딩 확인 — `pageerror`/`console.error` 이벤트 리스너로 JS 에러 캐치
   (Google Fonts 403 에러 1건은 원래부터 있던 것이라 무시해도 됩니다 — 폐쇄망에서 폴백 폰트로 대체됨)
3. **옮긴 탭으로 실제 진입해서, 그 탭의 버튼/입력창을 하나하나 실제로 클릭·입력해보기.**
   페이지 로딩만 확인하고 끝내면 안 됩니다 — 함정 1~4가 전부 "버튼을 눌러야만" 드러납니다.
   탭 진입은 `.tabgroup-chip[data-group="그룹"]` 클릭 → `.tabbtn[data-tab="탭"]` 클릭 순서입니다.
   그룹명은 index.html에서 `data-group="prep|perform|comm|report|manage"` 확인.
4. localStorage에 실제로 값이 정확히 저장되는지 `page.evaluate("localStorage.getItem('키')")`로 확인
5. 마지막으로 19개 탭 전체를 순회하며 다른 탭에 회귀가 없는지 확인 (탭↔그룹 매핑은
   `grep -n 'data-tab="' index.html` 주변에서 `data-group`을 함께 확인할 것 — 잘못된 그룹으로
   클릭하면 탭이 안 보여서 "에러"처럼 보이는 거짓 실패가 납니다)

## 5. 재현 절차 (다음 탭을 옮길 때 그대로 따라할 절차)

`FEATURE_MAP.md`에서 다음 옮길 탭(예: "📋 발견사항 관리")을 고른 뒤:

1. **함수/상수 스팬 추출**: 해당 탭 이름 키워드(예: `Finding`)로 최상위 `function` 선언과
   `const`/`let` 선언을 찾고, 중괄호 깊이 카운팅으로 각 블록의 정확한 시작~끝 줄 번호를 계산
   (칸반 작업 때 쓴 python 스크립트 패턴 재사용 가능 — 이 세션의 대화 로그에 전체 스크립트가
   있으니 `conversation_search`로 "칸반 함수 블록의 정확한 라인 범위" 같은 키워드로 찾아서
   재사용하면 빠릅니다)
2. **외부 의존성 분석**: 함정 3에서 설명한 방식으로 두 종류 다 확인
   (함수 호출 패턴 + 순수 식별자 전체 비교)
3. **app.js에서 필요한 것들에 `export` 추가**
4. **`src/features/새이름.js` 파일 생성**: 상단에 import 헤더, 그 아래 추출한 블록들을
   원래 순서대로 배치하고 각각에 `export` 접두어 추가. **초기화 IIFE는 포함하지 말 것(함정 4)**
5. **app.js에서 원본 블록 제거 + 새 모듈 import 추가**
6. **정적+동적 onclick/onchange 전수 스캔 (함정 1)** → 새 모듈 자체의 window 노출 블록 작성,
   app.js 쪽에서 필요한 것도 함께 추가
7. **`npm run build`** → 문법 에러 없는지
8. **Playwright 실클릭 검증** (섹션 4) → 그 탭의 주요 기능(추가/수정/삭제/내보내기 등) 전부
9. **19개 탭 전체 회귀 순회**
10. **`FEATURE_MAP.md`에서 그 탭을 "✅ 물리적 분리 완료"로 표시, `README.md` 진행상황 갱신**
11. **재압축**: `zip -r -q project-source.zip project -x "project/node_modules/*" -x "project/dist/*"`,
    `단일HTML파일_빌드가이드.txt`와 이 `HANDOFF.md`도 항상 함께 포함

## 6. 참고 — 프로젝트 특성 (사용자 작업 스타일)

- 한국어로 소통, 간결하고 직접적인 스타일 선호
- **버전 관리 프로토콜 필수**: 코드/기능 변경 시 ① `app.js` 안의 `SYSTEM_VERSION`/
  `SYSTEM_BUILD_DATE` 갱신, ② 출력 파일명에 버전·날짜 반영, ③ "사용법 가이드" 탭 변경
  이력 표에 새 버전 행 추가. 이건 이 컴포넌트 분리 작업 자체보다는, 분리 후 실제 기능을
  고칠 때 적용되는 규칙입니다.
- 사용자는 로컬에서 `npm install`/`npm run build`를 직접 돌리는 워크플로우이며, **내부망은
  폐쇄망(인터넷 차단)이라 `npm install`은 항상 인터넷 되는 PC에서만 하고, 빌드 결과물
  (`dist/index.html`) 1개만 내부망으로 옮긴다**는 점을 전제로 안내할 것
- localStorage 휘발성 리스크 있음 — 5~8개 도메인/기능 단위로 백업 권장하는 습관 있음
- "live UI ≠ changelog" 원칙: 화면에는 기능 설명만, 추가 경위는 변경 이력 탭에만 기록

## 7. 현재 파일 구조 스냅샷 (이 문서 작성 시점 기준)

```
project/
  index.html               (604KB, UI 마크업+CSS, 19개 탭 정적 onclick 9개)
  package.json / vite.config.js
  단일HTML파일_빌드가이드.txt
  FEATURE_MAP.md            (탭별 함수 색인 — 칸반은 "완료" 표시됨)
  README.md
  HANDOFF.md                (이 문서)
  src/
    app.js                  (787KB, 18개 탭 로직이 아직 뭉쳐 있음)
    core/stores.js          (OverrideStore 클래스)
    features/
      kanban.js             (50KB, 🗂 칸반보드 — 참고 템플릿)
      findings.js           (36KB, 📋 발견사항 관리 — kanban.js를 import하는 교차참조 사례)
    vendor/xlsx.full.min.js
    data/  (6개 파일, 전부 완료)
```
