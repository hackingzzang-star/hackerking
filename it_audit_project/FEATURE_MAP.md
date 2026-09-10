# app.js 기능 지도 (FEATURE MAP)

v8.59 기준. **모든 탭·공통 유틸 분리가 완료되어 이 문서는 이제 과거 기록용입니다.**
`src/app.js`는 원래 31,000줄이었던 것이 **2,959줄**로 줄었습니다.

**진행 상황**: 19개 UI 탭 전체 + 공통 UI 유틸 36개까지 각자의 `src/features/*.js` 모듈로
물리적 분리가 전부 완료되었습니다. 이제 남은 `app.js` 내용은 데이터 상수·공유 상태(`let`)
선언, 그 상태를 바꾸는 세터 함수 18개, import/export 배선, window 노출 등록부뿐입니다.
13개 기능 모듈: `kanban.js`, `findings.js`, `generate.js`, `dist.js`, `collect.js`,
`interview.js`, `comm.js`, `report.js`, `data.js`, `archive.js`, `auditoverview.js`,
`guide.js`, `common.js`.

**사용법**: 특정 기능을 고치고 싶으면 이제 위 파일명만 보고 바로 `src/features/파일명.js`를
열면 됩니다(더 이상 줄 번호 색인이 필요 없습니다). 아래는 각 모듈이 분리되던 시점에 기록해 둔
작업 이력입니다.



> ⚠️ **주의**: 이 함수들은 코드 안에서 물리적으로 한 곳에 모여 있지 않고 파일 여기저기 흩어져
> 있습니다(유기적으로 커온 코드라 그렇습니다). 그래서 "이 구간부터 이 구간까지만 잘라서 새 파일로
> 만들면 끝"이 아니라, 함수 단위로 하나씩 옮기는 진짜 물리적 분리(④단계)가 필요합니다.
> 지금 이 문서는 ④단계를 하기 전, **현재 상태에서도 바로 쓸 수 있는 임시 내비게이션 지도**입니다.

---

## 참고: `src/data/*.js`는 이미 100% 물리적으로 분리되어 있습니다

| 파일 | 내용 |
|---|---|
| `src/data/domains-data.js` | 도메인(감사영역) 25+1개 정의(체크리스트 항목, 근거법령 등) — D-26 포함 |
| `src/data/interview-scripts.js` | 인터뷰 스크립트 기본값 202개 (`INTERVIEW_SCRIPTS`) |
| `src/data/ai-flow-defaults.js` | AI 순서도·분기형 기본값 (`AI_FLOW_DEFAULTS`) |
| `src/data/domain-brief-desc.js` | 도메인별 한 줄 설명 |
| `src/data/survey-template.js` | 인터뷰용 설문지 HTML 템플릿 |
| `src/data/template-xlsx-b64.js` | xlsx 템플릿(base64) |
| `src/core/stores.js` | localStorage 편집 오버레이 캡슐화 클래스(`OverrideStore`) |
| `src/features/kanban.js` | 🗂 칸반보드 탭 전체 (v8.49에서 app.js로부터 물리적으로 분리 완료 — 함수 39개 + 상수 6개) |
| `src/features/findings.js` | 📋 발견사항 관리 탭 전체 (v8.49에서 물리적으로 분리 완료 — 함수 15개 + 상수 3개) |

이 파일들은 기능이 이미 파일명만 봐도 명확해서, 특정 데이터만 고칠 때는 위 표에서 바로
찾아 그 파일 하나만 올리시면 됩니다. 아래부터는 아직 하나로 뭉쳐 있는 `src/app.js`의 색인입니다.

---

## ① 설문지 생성 / 체크리스트 빌더 (generate 탭) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/generate.js` 파일 하나만 열면 됩니다.

**분리 시 발견·수정한 사항**: `DOMAINS`(도메인 배열)와 `wizardItems`/`wizardIndex`/`openEditKey`는
app.js가 소유한 공유 가변 상태(`let`)인데, 원본 코드에서 `deleteCustomDomain`이 `DOMAINS = ...`,
`openWizard`/`wizardGoTo`가 `wizardIndex = ...`, `renderEditItemList`가 `openEditKey = ...` 식으로
직접 재할당하고 있었습니다. ES 모듈 import 바인딩은 읽기 전용이라 다른 모듈에서 그대로 재할당하면
빌드 단계에서 막힙니다(`npm run build` 실행 시 rollup이 "Illegal reassignment of import" 로 즉시
잡아줌). app.js에 `setDomains`/`setWizardItems`/`setWizardIndex`/`setOpenEditKey` 세터 함수를
추가하고, generate.js 쪽 4곳의 직접 재할당을 그 세터 호출로 치환해 해결했습니다(로직·순서는 원본과
동일). 이 탭은 정적/동적 onclick 문자열을 거의 안 쓰고 `addEventListener` 위주라 window 노출
관련 버그는 없었습니다.

## ② 배포·회신 관리 (dist 탭) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/dist.js` 파일 하나만 열면 됩니다.

**분리 시 발견·수정한 사항**: `aggRows`(취합 응답 배열)도 generate 탭의 `DOMAINS`와 같은 패턴 —
app.js가 소유한 공유 가변 상태(`let`, 이미 `export`되어 있었음)인데 `renderFileChips`가
`aggRows = aggRows.filter(...)`로 직접 재할당하고 있었습니다. `setAggRows` 세터를 추가해 해결.
`itemDeptAssignmentLabel`/`loadDistributions`는 원래 generate.js가 app.js를 거쳐 가져오던
이름인데 이번에 dist.js 소속으로 확정되어, generate.js의 import 출처를 app.js → dist.js로
옮겼습니다(app.js↔generate.js↔dist.js 순환 참조지만 전부 함수 선언이라 안전— 실제 함수 실행은
모듈 로딩이 끝난 뒤에만 일어남). `loadRecipients`는 findings.js가 여전히 app.js 경유로 가져오고
있어서, app.js에 `export { loadRecipients };` 재노출 한 줄만 추가(가장 손 적게 가는 방식 선택).
동적 onclick 6개(`autoMatchResponses`, `copyPendingNames`, `deleteDistribution`,
`deleteRecipient`, `exportDistribution`, `toggleReceivedManually`)는 v8.49 버그 수정 때 이미
window 노출 블록에 등록돼 있어서 추가 조치가 필요 없었습니다.

## ③ 응답 집계 (collect 탭) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/collect.js` 파일 하나만 열면 됩니다.

**분리 시 발견·수정한 사항**: `activeRoundLabel`/`loadedFiles`/`aggRows` 3개가 공유 가변 상태(let)로,
`saveCurrentAsRound`(4곳) · `loadRoundById` · `startNewRound`에서 직접 재할당하고 있었습니다.
`setActiveRoundLabel`/`setLoadedFiles` 세터를 새로 추가하고(`setAggRows`는 ② 배포·회신 관리
분리 때 이미 추가한 것을 재사용), 정규식으로 재할당 지점 전체(총 7곳)를 세터 호출로 일괄 치환했습니다.
`startNewRound`/`renderAggregation`/`findMatchingRoundRows`/`itemLevelRows`(→dist.js가 참조),
`collectAuditWideStats`(→kanban.js가 참조)는 다른 먼저-분리된 모듈이 app.js 경유로 가져오고
있던 함수라서, 각각 dist.js·kanban.js의 import 출처를 collect.js로 재배선했습니다. 동적 onclick
4개(`loadRoundById`, `deleteRoundById`, `toggleAggOwnerDetail`, `toggleAggTargetDetail`)는
v8.49 버그 수정 때 이미 window 노출 블록에 있어 추가 조치 불필요. 실제 JSON 응답 파일을 업로드해
반영→회차저장→불러오기→삭제까지 전체 왕복을 Playwright로 검증했습니다.

## 🎤 인터뷰 가이드 (interview 탭) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/interview.js` 파일 하나만 열면 됩니다.
(93개 함수 중 `kanbanSendFromInterview`·`refreshInterviewKanbanButtons` 2개는 이미 v8.49
칸반보드 분리 때 kanban.js로 옮겨져 있었음을 재확인 — 나머지 91개를 이번에 분리)

**분리 시 발견·수정한 사항**: 공유 가변 상태(let) 7개(`igDomainFilter`/`igGroupFilter`/
`igGroupMode`/`igViewMode`/`customInterviewItems`/`_imCalMonth`/`_imCalYear`) 재할당을 세터로
치환. 특히 `_imCalMonth`/`_imCalYear`(인터뷰 일정 달력의 월 이동)는 `+=`, `--`, `++` 같은
복합대입까지 섞여 있어 단순 정규식 치환이 아니라 구간별로 손으로 맞춰 치환했습니다. 또한
이번 탭이 규모가 커서(91개), **먼저 분리해둔 5개 모듈(generate/dist/collect/kanban/findings)이
전부 app.js를 거쳐 인터뷰 관련 함수(`igFindItem`, `igItemMeta`, `renderInterviewGuide`,
`scrollToInterviewCard` 등)를 가져다 쓰고 있던 것**을 전부 찾아 해당 모듈들의 import 출처를
interview.js로 재배선했습니다(5개 파일 모두 수정). 동적 onclick으로 쓰이는
`igOpenBranchWindow`/`igToggleCardExpand`/`igToggleForkExpand`/`igToggleDetail`/
`imCalGoToday`/`imCalShiftMonth`/`toggleInterviewCalendarView`/`renderInterviewGuide`는
v8.49 버그 수정 때 이미 window 노출 블록에 있어 추가 조치 불필요 — 빌드 후 window 노출 블록
37개 항목 전부가 실제로 정상 로드되는지 Playwright로 직접 검증했습니다. 빌드 결과물 크기가
약 600KB 줄었는데, 코드 유실이 아니라 모듈 경계가 명확해지면서 minifier가 내부 전용 함수
이름을 더 적극적으로 압축한 결과임을 함수 존재 여부·window 노출 확인·19개 탭 전체 회귀
테스트로 확인했습니다.

## 📋 발견사항 관리 (findings 탭) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/findings.js` 파일 하나만 열면 됩니다.

## 🗂 칸반보드 (kanban 탭) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/kanban.js` 파일 하나만 열면 됩니다.
칸반보드를 고치고 싶으면 이 파일 하나만 채팅에 올리시면 됩니다(다른 파일 필요 없음).

## 📨 커뮤니케이션 문구 (commDist/commInterview/commNotice 탭) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/comm.js` 파일 하나만 열면 됩니다.

**분리 시 발견·수정한 사항**: 재할당되는 공유 가변 상태가 없어(전부 읽기 전용 참조) 세터 없이
깔끔하게 분리됐습니다. dist.js가 쓰던 `renderCommDistSelect`, findings.js가 쓰던
`refreshGwTemplatePreview`/`renderGwTemplateDeptOptions`는 app.js 경유 대신 comm.js에서
바로 가져오도록 두 파일의 import 출처를 재배선했습니다. 동적 onclick 1개(`copyCommMessage`)는
v8.49 버그 수정 때 이미 window 노출 블록에 있어 추가 조치 불필요.

## 📝 보고서류 (착수/진행/중간/종료/이력 탭) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/report.js` 파일 하나만 열면 됩니다.

**분리 시 발견·수정한 사항**: 공유 가변 상태 3개(`DOMAINS`/`currentScale`/`_genDraftSaveTimer`)
재할당을 세터로 치환(`setDomains`는 ① 설문지 생성 분리 때 만든 것 재사용, `setCurrentScale`·
`setGenDraftSaveTimer`는 신규). 이 탭이 여러 탭에서 공용으로 쓰이는 유틸(감사명·법적근거 문구,
IPPF 단계 계산, 로그 등)을 담고 있어서 **먼저 분리된 5개 모듈(generate/collect/interview/
kanban/findings) 전부**가 app.js 경유로 가져다 쓰던 함수를 report.js로 재배선해야 했습니다.
동적 onclick 3개(`generateInterimReport`, `openAuditDraftDoc`, `toggleInterimCustomInput`)는
v8.49 버그 수정 때 이미 window 노출 블록에 있어 추가 조치 불필요.

## ⚙ 데이터 관리(백업/복원/초기화, data 탭) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/data.js` 파일 하나만 열면 됩니다.

**분리 시 발견·수정한 사항**: 재할당되는 공유 가변 상태가 없어 세터 없이 분리됐습니다. 다만 이
탭은 "전체 백업/복원"이 목적이라 사실상 **8개 기능 모듈 전부**(generate/dist/collect/interview/
comm/report/kanban/findings)의 load*/save*/render* 함수를 가져다 쓰는 허브라서 import가 여러
갈래로 나뉩니다. 작업 중 `exportAssignedPacketsByAuditor`(data 탭 소속 함수인데 interview.js가
app.js 경유로 가져다 쓰고 있었음)를 data.js 자신의 export 목록과 import 목록에 동시에 넣는
실수로 "이미 선언됨" 파싱 에러가 한 번 났는데, interview.js 쪽 import 출처를 app.js에서
data.js로 바로잡아 해결했습니다. 정적/동적 onclick 노출 문제는 없었습니다(전부
addEventListener 사용).

## 📚 감사 건별 보기 (auditarchive 탭) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/archive.js` 파일 하나만 열면 됩니다.
3개 함수뿐인 작은 탭이라 재할당·onclick 노출 문제 모두 없이 깔끔하게 분리됐습니다.

## 📊 감사 개요·진행현황 (auditOverview 탭) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/auditoverview.js` 파일 하나만 열면 됩니다.
`renderOverview`를 generate.js가 가져다 쓰고 있어서 import 출처를 재배선했습니다
(auditoverview.js가 generate.js의 `riskCounts`를 가져다 쓰는 것과 맞물려 두 모듈이
서로를 참조하는 순환 구조지만, 전부 함수 선언이라 안전합니다). 재할당·onclick 노출
문제는 없었습니다.

## 사용법 가이드/온보딩 (guide 탭) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/guide.js` 파일 하나만 열면 됩니다. 5개
함수 전부 외부 앱 상태 의존이 없는 완전히 독립적인 모듈이라(브라우저 전역 API만 사용) 가장
간단하게 분리됐습니다. 동적 onclick 1개(`goToGuideSection`)는 v8.49 버그 수정 때 이미
window 노출 블록에 있어 추가 조치 불필요.

## 🧩 공통 UI 유틸(부서선택/날짜/이스케이프/줌 등 여러 탭에서 공용) — ✅ 물리적 분리 완료

더 이상 이 지도에서 찾을 필요 없이, `src/features/common.js` 파일 하나만 열면 됩니다.

**분리 시 발견·수정한 사항**: 재할당되는 공유 가변 상태가 전혀 없어(전부 localStorage
백엔드 또는 순수 함수) 세터 없이 분리됐습니다. 다만 **이 36개는 거의 모든 다른 모듈이
가져다 쓰는 것들**이라(`esc`, `kstDateStr`, `getCurrentAuditor` 등), 이미 완성돼 있던
11개 모듈(kanban/findings/generate/dist/collect/interview/comm/report/data/archive/
auditoverview) 전부의 `../app.js` import에서 겹치는 이름을 빼고 `./common.js` import로
옮기는 작업이 필요했습니다. `renderAssignTable`/`renderDomainDeptDefaultAssign`은
generate.js 소속이라 common.js가 거꾸로 generate.js에서 가져오는 순환 참조가 하나
생겼는데, 전부 함수 선언(호이스팅)이라 안전합니다. 정적 onclick 1개(`rcGoTo`)는 v8.49
버그 수정 때 이미 window 노출 블록에 있어 추가 조치 불필요.

**이걸로 탭·공통유틸 분리 작업 전체가 끝났습니다.** `src/app.js`는 2,959줄까지 줄었고,
남은 건 공유 상태 선언·세터·import 배선·window 노출 등록부뿐이라 더 쪼갤 필요가
없습니다.

