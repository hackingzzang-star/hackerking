// ============================================================
// IT감사 라이프사이클 플랫폼 — app.js
// v8.48 원본 단일 HTML의 메인 <script> 로직을 그대로 옮긴 파일입니다.
// 데이터 상수(도메인 정의, 인터뷰 스크립트, AI 플로우 기본값, 설문 템플릿, xlsx 템플릿)만
// ./data/*.js 로 분리되어 아래 import로 연결됩니다. 로직 자체는 수정하지 않았습니다.
// ============================================================
import DEFAULT_DOMAINS from './data/domains-data.js';
import SURVEY_TEMPLATE from './data/survey-template.js';
import TEMPLATE_XLSX_B64 from './data/template-xlsx-b64.js';
import DOMAIN_BRIEF_DESC from './data/domain-brief-desc.js';
import INTERVIEW_SCRIPTS from './data/interview-scripts.js';
import AI_FLOW_DEFAULTS from './data/ai-flow-defaults.js';
import './vendor/xlsx.full.min.js'; // window.XLSX 를 등록하는 부수효과 임포트(SheetJS, 오프라인 번들용)
import { OverrideStore } from './core/stores.js';
import {
  getKanbanViewMode, kanbanAddCard, kanbanExport, kanbanHandleImportFile,
  kanbanPopulateDomainSelect, kanbanPopulateItemSelect, kanbanSendFromFinding,
  kanbanSendFromInterview, loadKanbanArchive, loadKanbanCards, openKanbanProgressReport,
  refreshInterviewKanbanButtons, renderKanbanArchive, renderKanbanBoard,
  saveKanbanArchive, saveKanbanCards, setKanbanViewMode,
} from './features/kanban.js';
import {
  openFindingEditGuarded, scrollToFindingCard, renderFindingsList, renderFindingsTab,
} from './features/findings.js';
import {
  parseWorkbookToDomains,
  downloadChecklistTemplate,
  refreshChecklistMetaAfterBuilderEdit,
  populateBuilderDomainSelect,
  addCustomDomain,
  loadDomainTrash,
  saveDomainTrash,
  renderDomainTrash,
  restoreDomainFromTrash,
  purgeDomainTrashEntry,
  deleteCustomDomain,
  addCustomItem,
  detectStandards,
  formatStandardsLabel,
  updateRefsMeta,
  riskCounts,
  isItemExcluded,
  setItemExcluded,
  riskChipCls,
  renderDipItemHtml,
  renderDomainItemsPanelHtml,
  renderDomainList,
  searchAllItems,
  highlightDsearchTerm,
  renderDsearchItemHtml,
  renderDsearchResults,
  renderDomainAuditorAssign,
  renderDomainDeptDefaultAssign,
  getSuggestedDept,
  updateGenSummary,
  resolveItemDeptForAttach,
  itemDeptScopeBadgeHtml,
  getDomainAttachDeptLabel,
  buildGroundsSuggestions,
  appendGroundsSuggestion,
  renderGroundsSuggestions,
  domainNameSummary,
  renderItem,
  domainTone,
  renderDomain,
  applyOverrides,
  buildSurveyHtml,
  generateSurvey,
  computeSplitSurveyOutputs,
  generateSplitByDept,
  domainAuditorCandidates,
  renderAssignTable,
  getCurrentScale,
  renderScaleTable,
  buildWizardItems,
  openWizard,
  closeWizard,
  saveCurrentWizardStep,
  renderWizardStep,
  wizardGoTo,
  getWizardState,
  renderEditItemList,
  renderDistDomainChecks,
  domainListText,
  getChecklistOwnerDept,
  downloadFullChecklistXlsx,
  igEvidenceChecklistHtml,
  wireIgEvidenceChecklist,
  igFindDomain,
  igBulkExpandDomain,
  renderPendingSurveyBanner,
} from './features/generate.js';
import {
  autoFillDistAuditor,
  itemDeptAssignmentLabel,
  loadRecipients,
  saveRecipients,
  loadDistributions,
  saveDistributions,
  renderRecipientsTable,
  addRecipient,
  deleteRecipient,
  exportRecipients,
  importRecipientsFile,
  renderDistRecipientChecks,
  toggleSelectAllRecipients,
  createDistribution,
  autoMatchResponses,
  toggleReceivedManually,
  deptMatches,
  renderSubmissionTracker,
  deleteDistribution,
  exportDistribution,
  copyPendingNames,
  toggleDistPendingOnly,
  renderDistributionList,
  findAssignmentMismatches,
  renderFileChips,
  exportAssignmentPackage,
  ingestAssignmentPackage,
  buildAssignmentPacketJson,
} from './features/dist.js';
import {
  collectAuditDraftContext,
  collectAuditWideStats,
  getFilteredAggRows,
  initAggFilterUI,
  loadRoundsFromStorage,
  saveRoundsToStorage,
  saveCurrentAsRound,
  renderRoundHistory,
  loadRoundById,
  deleteRoundById,
  startNewRound,
  showRoundBanner,
  findMatchingRoundRows,
  parseCSV,
  rowKey,
  upsertAggRows,
  buildAggRowFromRecord,
  readFileAsTextP,
  showUploadPreview,
  toggleAggOwnerDetail,
  populateAggDeptReportSelect,
  collectDeptAggStats,
  buildDeptAggReviewHtml,
  buildDeptAggSummaryHtml,
  exportDeptAggSummary,
  collapseDetailRowAndScroll,
  toggleAggTargetDetail,
  itemLevelRows,
  renderAggDashboard,
  computeMaturityScore,
  maturityGrade,
  renderMaturityScore,
  crossDeptMismatches,
  renderCrossDeptTable,
  renderTrendCompareSelect,
  compareWithRound,
  renderTrendCompare,
  renderAggregation,
  buildOvDetailHtml,
  showOvDetail,
  closeOvDetail,
  collectAssignedCodesByInterviewer,
  collectAuditArchiveSummary,
} from './features/collect.js';
import {
  renderIppfFlow,
  igOwnerPersonDetailHtml,
  igTargetDetailHtml,
  igDetailCloseBarHtml,
  getAllInterviewOverrides,
  renderInterviewOverridesTable,
  downloadInterviewOverridesCSV,
  loadInterviewState,
  saveInterviewState,
  loadCustomInterviewItems,
  saveCustomInterviewItems,
  renderCustomInterviewForm,
  igEnsureEvidenceItems,
  igCustomCardHtml,
  renderCustomInterviewSection,
  openCustomInterviewWindow,
  igFindItem,
  igItemMeta,
  igGenericScript,
  loadScriptOverrides,
  saveScriptOverrides,
  loadFlowOverrides,
  saveFlowOverrides,
  exportInterviewGuideBundle,
  importInterviewGuideBundle,
  saveInterviewSchedule,
  renderInterviewScheduleTable,
  toggleInterviewCalendarView,
  renderInterviewCalendar,
  imCalShiftMonth,
  imCalGoToday,
  buildInterviewMsgText,
  refreshInterviewMsgPreview,
  exportInterviewSchedule,
  scrollToInterviewCard,
  registerFindingFromInterviewCode,
  igGetScript,
  igSanitizeScript,
  igClassifyRow,
  igComputeStats,
  igBranchClass,
  igSwitchCardDept,
  igMetaTarget,
  igOwnerDepts,
  igRecomputeMultiDeptDone,
  igRefreshCardDoneBadge,
  igOwnerPersons,
  igEvidenceList,
  igStepsHtml,
  igEditFormHtml,
  igCpOverrideKey,
  igRenderCpRowHtml,
  igResponseDetailHtml,
  igToggleDetail,
  buildNodesFromFlowSpec,
  igfGenericSpecFor,
  igfDefaultSpecFor,
  downloadFlowSpecXlsx,
  handleFlowSpecXlsxFile,
  buildInterviewAiPromptText,
  igAiPromptItemOptionsHtml,
  igOpenAiToolsWindow,
  igfTogglePanel,
  igfRenderPanel,
  igfBuildFormHtml,
  igfFailRowHtml,
  igfStepCardHtml,
  igfWirePanel,
  igwBuildGenericNodes,
  igwGetNodes,
  igwEsc,
  igwBuildFlowchartHTML,
  igwBuildInterviewHTML,
  igOpenBranchWindow,
  igToggleCardExpand,
  igToggleForkExpand,
  igRenderCard,
  renderIgSourceBanner,
  wireIgCardMetaInputs,
  wireIgCpOverrideControls,
  renderInterviewGuide,
  wireIgModeToggle,
  igReadEditForm,
  wireIgEditForms,
  igUpdateDoneCount,
  exportInterviewPacket,
  mergeInterviewPacket,
  handleInterviewPacketFile,
  downloadInterviewCSV,
  buildInterviewPackHtml,
  downloadInterviewPack,
} from './features/interview.js';
import {
  loadCommTemplates,
  saveCommTemplateOverrides,
  fillCommTemplate,
  renderCommTemplateTypeOptions,
  toggleCommTemplateEditor,
  renderCommTemplateEditor,
  renderCommDistSelect,
  generateCommMessages,
  copyCommMessage,
  buildGroupwareTableHtml,
  renderGwTemplateDeptOptions,
  buildGwNoticeText,
  refreshGwTemplatePreview,
  renderCommOverviewSummary,
} from './features/comm.js';
import {
  buildAuditLegalBasis,
  buildAuditPurpose,
  computeIppfStageStatuses,
  renderGlobalIppfBadge,
  ganaList,
  openAuditDraftDoc,
  buildAuditNameSuggestion,
  renderAuditNameSuggestion,
  saveGenDraftNow,
  saveGenDraftDebounced,
  clearGenDraft,
  restoreGenDraft,
  buildComprehensiveAuditReportHtml,
  openComprehensiveReport,
  refreshReportDeptFilterOptions,
  loadReportLog,
  saveReportLog,
  logReportGenerated,
  renderReportCenter,
  renderInterimReportPicker,
  renderReportLog,
  toggleInterimCustomInput,
  generateInterimReport,
  buildInterimReportHtml,
  buildAuditWorkingPaperHtml,
  openAuditWorkingPaper,
} from './features/report.js';
import {
  exportRoundById,
  importRoundFile,
  exportAllData,
  importAllData,
  moduleCount,
  exportModuleData,
  importModuleData,
  exportIndividualSubmission,
  loadAiNoContextCodes,
  saveAiNoContextCodes,
  getStorageItemCount,
  renderStorageStatusTable,
  handleAiJsonImportText,
  exportAssignedPacketsByAuditor,
} from './features/data.js';
import {
  renderAuditArchiveList,
  showAuditArchiveList,
  showAuditArchiveDetail,
} from './features/archive.js';
import {
  buildAuditOverviewGridHtml,
  renderAuditOverviewPanel,
  renderAuditOverviewScreen,
  renderOverview,
} from './features/auditoverview.js';
import {
  scrollToGuideSection,
  goToGuideSection,
  initGuideAccordion,
  openGuideWindowBtn_handler,
  showOnboardingWindow,
} from './features/guide.js';
import {
  circledNum,
  renderAuditDeptChips,
  renderAuditDeptDatalist,
  renderGenDeptOptions,
  addAuditDept,
  syncTabGroupDisplay,
  refreshCurrentAuditorUI,
  getZoomLevel,
  applyZoomLevel,
  stepZoom,
  deptSelectOptionsHtml,
  riskTag,
  deptTagHtml,
  downloadHtml,
  nowKST,
  kstDateStr,
  kstTimeStr,
  kstDateTimeStr,
  kstISOString,
  todayStamp,
  versionSuffix,
  deptToArray,
  multiDeptSelectHtml,
  wireMultiDeptSelect,
  fmtDateTime,
  getCurrentAuditor,
  setCurrentAuditor,
  loadKnownAuditors,
  addKnownAuditor,
  renderAuditorDatalist,
  esc,
  escFd,
  esc2,
  getCurrentAuditName,
  esc10,
  rcGoTo,
  safeAssign,
} from './features/common.js';
// findings.js가 여전히 app.js를 통해 loadRecipients를 가져오므로(직접 features/dist.js를
// import하도록 findings.js를 고치는 대신, 이미 검증된 findings.js는 그대로 두고) 재노출한다.
export { loadRecipients };



// [수정] 예전에는 DOMAINS가 DEFAULT_DOMAINS와 같은 배열을 그대로 참조하고 있어서,
// 새 감사영역을 추가(DOMAINS.push)하면 "되돌리기 기준"인 DEFAULT_DOMAINS까지 함께 오염되었다.
// 그 결과 "기본 제공 체크리스트로 되돌리기"를 눌러도 추가한 영역이 사라지지 않는 버그가 있었다.
// 깊은 복사로 완전히 분리된 작업용 사본을 만들어, DOMAINS를 아무리 수정해도 DEFAULT_DOMAINS는 항상 원본 그대로 남도록 한다.
export let DOMAINS = JSON.parse(JSON.stringify(DEFAULT_DOMAINS));
export function setDomains(v){ DOMAINS = v; }

export const CIRCLED = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩","⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"];

export const SYSTEM_VERSION = '8.48';
const SYSTEM_BUILD_DATE = '2026-09-07';
// [수정] 헤더 배지·하단 푸터·사용법 가이드의 버전 표시가 각각 따로 하드코딩되어 있어서,
// 버전을 올릴 때 한 곳이라도 빠뜨리면 화면마다 다른 버전이 찍히는 문제가 반복돼 왔다(v6.28에서 한 번 고쳤다가 다시 발생).
// 이제 이 두 상수(SYSTEM_VERSION/SYSTEM_BUILD_DATE)만 바꾸면 아래 4곳이 전부 자동으로 맞춰지도록 통일한다.
(function syncVersionDisplays(){
  const headerTag = document.getElementById('headerVersionTag');
  if(headerTag) headerTag.textContent = 'v' + SYSTEM_VERSION;
  const footerText = document.getElementById('footerVersionText');
  if(footerText) footerText.textContent = 'v' + SYSTEM_VERSION + ' · ' + SYSTEM_BUILD_DATE + ' 빌드';
  const guideVer = document.getElementById('guideVersionLabel');
  if(guideVer) guideVer.textContent = 'v' + SYSTEM_VERSION;
  const guideDate = document.getElementById('guideBuildDateLabel');
  if(guideDate) guideDate.textContent = SYSTEM_BUILD_DATE;
})();
const selectedCodes = new Set();
export { selectedCodes };
export const expandedDomainCodes = new Set(); // [v8.05] 도메인 카드를 "펼쳐서" 개별 항목 선택 UI를 보고 있는 도메인 코드들 (새로고침 시 초기화됨 — 임시 UI 상태라 저장하지 않음)
export const domainAuditorMap = {}; // {domainCode: "이름1, 이름2"} — 감사 영역별 담당 감사자 사전배정 (쉼표로 여러 명 가능)

/* ---------- Audit background (감사 배경) & related-department list — feeds dept dropdowns downstream ---------- */
export let auditDeptList = [];







document.getElementById('genDept').addEventListener('change', () => {
  const sel = document.getElementById('genDept');
  if(sel.value === '__custom__'){
    const v = (prompt('부서명을 직접 입력해 주세요.') || '').trim();
    if(v){
      if(!auditDeptList.includes(v)) auditDeptList.push(v);
      renderAuditDeptChips();
      renderGenDeptOptions();
      sel.value = v;
    } else {
      sel.value = '';
    }
  }
  renderAssignTable();
});
renderGenDeptOptions();




/* ---------- 맨 위로 가기 (상단 고정 메뉴가 생기면서 함께 추가) ---------- */
const backToTopBtn = document.getElementById('backToTopHubBtn');
if(backToTopBtn){
  window.addEventListener('scroll', () => {
    backToTopBtn.classList.toggle('show', window.scrollY > 400);
  });
  backToTopBtn.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
}

/* ---------- Tabs ---------- */

document.querySelectorAll('.tabgroup-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    // 그룹칩은 "어느 그룹의 하위탭 줄을 보여줄지"만 바꾸고, 실제 화면(콘텐츠) 전환은 하위탭을 눌러야 일어난다.
    syncTabGroupDisplay(chip.dataset.group);
  });
});
document.querySelectorAll('.tabbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabbtn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tabpanel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    // 프로그램적으로(다른 화면의 바로가기 등) 다른 그룹의 탭으로 이동한 경우에도,
    // 그 탭이 속한 그룹의 칩·하위탭 줄이 자동으로 활성 표시되도록 동기화한다.
    const parentGroupEl = btn.closest('.tabbtn-group');
    if(parentGroupEl) syncTabGroupDisplay(parentGroupEl.dataset.group);
    if(btn.dataset.tab === 'dist') autoFillDistAuditor();
    if(btn.dataset.tab === 'collect' && aggRows.length > 0) renderAggregation();
    if(btn.dataset.tab === 'data' && typeof renderStorageStatusTable === 'function') renderStorageStatusTable();
    if(btn.dataset.tab === 'findings' && typeof renderFindingsTab === 'function') renderFindingsTab();
    if(btn.dataset.tab === 'kanban' && typeof renderKanbanBoard === 'function') renderKanbanBoard();
    if(btn.dataset.tab === 'rptInterim' && typeof renderInterimReportPicker === 'function') renderInterimReportPicker();
    if(btn.dataset.tab === 'rptHistory' && typeof renderReportLog === 'function') renderReportLog();
    if(btn.dataset.tab === 'auditarchive' && typeof showAuditArchiveList === 'function') showAuditArchiveList();
    if(btn.dataset.tab === 'auditOverview' && typeof renderAuditOverviewScreen === 'function') renderAuditOverviewScreen();
    if(btn.dataset.tab === 'interview' && typeof refreshInterviewKanbanButtons === 'function') refreshInterviewKanbanButtons();
    if(btn.dataset.tab === 'commDist') {
      if(typeof renderCommDistSelect === 'function') renderCommDistSelect();
      if(typeof renderCommTemplateTypeOptions === 'function') renderCommTemplateTypeOptions();
    }
    if(btn.dataset.tab === 'commInterview') {
      try{ if(typeof aggRows !== 'undefined' && aggRows.length > 0 && typeof renderInterviewScheduleTable === 'function' && typeof getFilteredAggRows === 'function') renderInterviewScheduleTable(getFilteredAggRows()); }catch(e){}
    }
    if(btn.dataset.tab === 'commNotice') {
      if(typeof renderGwTemplateDeptOptions === 'function') renderGwTemplateDeptOptions();
      if(typeof refreshGwTemplatePreview === 'function') refreshGwTemplatePreview();
    }
    if(typeof renderPendingSurveyBanner === 'function') renderPendingSurveyBanner();
    if(typeof renderGlobalIppfBadge === 'function') renderGlobalIppfBadge();
  });
});

document.querySelectorAll('.pd-step[data-pd-tab]').forEach(stepEl => {
  stepEl.addEventListener('click', () => {
    const targetBtn = document.querySelector('.tabbtn[data-tab="' + stepEl.dataset.pdTab + '"]');
    if(targetBtn) targetBtn.click();
  });
});

// [v7.04] 사용법 가이드 탭 왼쪽 목차 — 다른 탭(예: 인터뷰 가이드)의 "📖 자세히 보기" 링크에서
// 호출되어, 사용법 가이드 탭으로 전환한 뒤 해당 섹션으로 스크롤한다.
// v7.17 — 고정 내비바(.sticky-nav-wrap) 높이만큼 보정해서 정확히 목표 섹션 제목이
// 고정바 바로 아래에 오도록 스크롤한다(사용법 가이드 목차·"자세히 보기" 링크 공용).
// [v7.35] 이 함수로 이동하는 목표 섹션은 이제 기본적으로 접혀 있을 수 있으므로, 스크롤하기 전에
// 먼저 펼쳐(gs-open 추가) 실제로 내용이 보이는 상태로 이동시킨다.


// [v7.35] 사용법 가이드 — 20개 섹션을 전부 펼쳐서 한 번에 쏟아내던 것을 아코디언으로 바꾼다.
// h2 다음에 오는 형제 노드들을 .guide-section-body로 감싸고, h2는 클릭 가능한 토글 버튼으로
// 바꿔서 기본적으로 모두 접힌 상태로 시작한다(마크업을 20곳 손으로 고치는 대신 한 함수로 처리).

initGuideAccordion();
// [v7.35] 검색창 — 입력한 단어가 포함된 섹션만 남기고 나머지는 숨기며, 걸린 섹션은 자동으로 펼친다.
// "전체 펼치기" — 한 번에 다 펼쳐서 훑어보고 싶을 때, 다시 누르면 전체 접기.
(function initGuideSearchAndExpandAll(){
  const searchInput = document.getElementById('guideSearchInput');
  const expandAllBtn = document.getElementById('guideExpandAllBtn');
  const countEl = document.getElementById('guideSearchCount');
  const sections = () => Array.from(document.querySelectorAll('.guide-content .guide-section[id]'));
  if(searchInput){
    searchInput.addEventListener('input', () => {
      const term = searchInput.value.trim().toLowerCase();
      let matchCount = 0;
      sections().forEach(sec => {
        const match = !term || sec.textContent.toLowerCase().includes(term);
        sec.classList.toggle('gs-search-hidden', !match);
        if(match){
          matchCount++;
          if(term) sec.classList.add('gs-open');
        }
      });
      if(countEl) countEl.textContent = term ? (matchCount + '개 섹션에서 찾음') : '';
    });
  }
  let allExpanded = false;
  if(expandAllBtn){
    expandAllBtn.addEventListener('click', () => {
      allExpanded = !allExpanded;
      sections().forEach(sec => sec.classList.toggle('gs-open', allExpanded));
      expandAllBtn.textContent = allExpanded ? '전체 접기' : '전체 펼치기';
    });
  }
})();
// 목차 클릭 시 부드럽게 스크롤 + 현재 보고 있는 섹션 하이라이트(스크롤스파이).
(function initGuideToc(){
  const toc = document.getElementById('guideToc');
  const content = document.querySelector('.guide-content');
  const clickCatcher = document.getElementById('guideTocClickCatcher');
  const fabBtn = document.getElementById('guideTocFab');
  const closeBtn = document.getElementById('guideTocCloseBtn');
  if(!toc || !content) return;

  // v7.16 — 넓은 화면(≥1660px)에서는 목차가 "메인 프레임"(.hubwrap) 바깥 여백에 항상 고정 표시되어
  // 별도로 열고 닫을 필요가 없다(CSS만으로 처리, JS는 스크롤스파이만 담당).
  // 그보다 좁은 화면에서는 화면을 어둡게 가리지 않는 작은 버튼(#guideTocFab)으로 열고 닫는다.
  function openToc(){
    toc.classList.add('force-show');
    if(clickCatcher) clickCatcher.classList.add('show');
  }
  function closeToc(){
    toc.classList.remove('force-show');
    if(clickCatcher) clickCatcher.classList.remove('show');
  }
  if(fabBtn) fabBtn.addEventListener('click', openToc);
  if(closeBtn) closeBtn.addEventListener('click', closeToc);
  if(clickCatcher) clickCatcher.addEventListener('click', closeToc);
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && toc.classList.contains('force-show')) closeToc();
  });

  toc.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      closeToc(); // 넓은 화면에서는 force-show가 애초에 없으므로 아무 효과 없음(항상 보이는 상태 유지)
      if(el) setTimeout(() => scrollToGuideSection(el), 80);
    });
  });
  const sections = Array.from(content.querySelectorAll('.guide-section[id]'));
  if(sections.length === 0) return;
  const spy = () => {
    const scrollBox = document.getElementById('tab-guide');
    if(!scrollBox || !scrollBox.classList.contains('active')) return;
    const navWrap = document.querySelector('.sticky-nav-wrap');
    const refY = (navWrap ? navWrap.offsetHeight : 0) + 24;
    let activeId = sections[0].id;
    sections.forEach(sec => {
      if(sec.getBoundingClientRect().top - refY <= 0) activeId = sec.id;
    });
    toc.querySelectorAll('a').forEach(a => {
      a.classList.toggle('guide-toc-active', a.getAttribute('href') === '#' + activeId);
    });
  };
  window.addEventListener('scroll', spy, {passive:true});
  spy();
})();


document.getElementById('openGuideWindowBtn').addEventListener('click', openGuideWindowBtn_handler);

/* ---------- 현재 작업자(감사자) ---------- */


document.getElementById('saveCurrentAuditorBtn').addEventListener('click', () => {
  const name = (document.getElementById('currentAuditorInput').value || '').trim();
  setCurrentAuditor(name);
  refreshCurrentAuditorUI();
  if(typeof renderInterviewGuide === 'function') renderInterviewGuide();
  alert(name ? ('현재 작업자를 "' + name + '"(으)로 설정했습니다. 아직 담당 감사자가 안 적힌 항목들에 자동으로 채워집니다.') : '현재 작업자 설정을 비웠습니다.');
});
refreshCurrentAuditorUI();
renderAuditorDatalist();

/* ---------- 화면 확대/축소 ---------- */
export const ZOOM_STORAGE_KEY = 'itaudit_zoom_level_v1';
export const ZOOM_STEPS = [80, 90, 100, 110, 125, 140, 160];



document.getElementById('zoomInBtn').addEventListener('click', () => stepZoom(1));
document.getElementById('zoomOutBtn').addEventListener('click', () => stepZoom(-1));
document.getElementById('zoomResetBtn').addEventListener('click', () => applyZoomLevel(100));
applyZoomLevel(getZoomLevel());

/* ---------- Advanced settings toggle ---------- */
document.getElementById('advancedToggleBtn').addEventListener('click', () => {
  const panel = document.getElementById('advancedPanel');
  const btn = document.getElementById('advancedToggleBtn');
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  btn.textContent = open
    ? '✏ 문항 내용 직접 편집하기 (제목 · 설명 · 체크포인트 · 위험도 · 법령 · 응답척도) — 하드코딩이 아니라 여기서 수정됩니다'
    : '− 문항 편집 패널 닫기';
});

/* ---------- Custom checklist upload (.xlsx) ---------- */


/* ---------- Template (blank format) download ---------- */


document.getElementById('downloadTemplateBtn').addEventListener('click', downloadChecklistTemplate);

document.getElementById('uploadChecklistBtn').addEventListener('click', () => document.getElementById('checklistFileInput').click());
document.getElementById('checklistFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const wb = XLSX.read(ev.target.result, {type:'array'});
      const parsed = parseWorkbookToDomains(wb);
      if(parsed.length === 0){
        alert('업로드한 파일에서 인식 가능한 체크리스트 시트를 찾지 못했습니다.\n시트 이름이 "01_영역명" 형식이고, 5행부터 No/중점감사항목/세부점검내용/체크포인트/증빙자료/법령/위험도 열이 있는지 확인해 주세요.');
        return;
      }
      DOMAINS = parsed;
      selectedCodes.clear();
      Object.keys(itemDeptMap).forEach(k => delete itemDeptMap[k]);
      Object.keys(itemAuditorMap).forEach(k => delete itemAuditorMap[k]);
      Object.keys(contentOverrides).forEach(k => delete contentOverrides[k]);
      let preAssignedCount = 0;
      DOMAINS.forEach(dom => {
        dom.items.forEach(it => {
          if(it.dept){
            itemDeptMap[dom.code + '-' + it.no] = deptToArray(it.dept);
            preAssignedCount++;
          }
        });
      });
      const totalItems = DOMAINS.reduce((s,d) => s + d.items.length, 0);
      const totalCp = DOMAINS.reduce((s,d) => s + d.items.reduce((a,it) => a + it.checkpoints.length, 0), 0);
      document.getElementById('metaDomains').textContent = DOMAINS.length + '개';
      document.getElementById('metaItems').textContent = totalItems + '개';
      document.getElementById('metaCp').textContent = totalCp + '개';
      document.getElementById('checklistSourceLabel').innerHTML = '현재 사용 중: <b>' + esc(file.name) + '</b> (' + DOMAINS.length + '개 영역 · ' + totalItems + '항목'
        + (preAssignedCount ? ' · 담당부서 사전 지정 ' + preAssignedCount + '건 자동 반영됨' : '') + ')';
      document.getElementById('useDefaultChecklistBtn').classList.remove('active');
      document.getElementById('blankChecklistBtn').classList.remove('active');
      document.getElementById('uploadChecklistBtn').classList.add('active');
      renderDomainList();
      renderOverview();
      updateRefsMeta();
      updateGenSummary();
      populateBuilderDomainSelect();
      if(typeof renderInterviewGuide === 'function') renderInterviewGuide(); // [v8.44] 체크리스트 변경 시 인터뷰 가이드도 자동 새로고침
    } catch(err){
      alert('엑셀 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
});

document.getElementById('useDefaultChecklistBtn').addEventListener('click', () => {
  DOMAINS = JSON.parse(JSON.stringify(DEFAULT_DOMAINS)); // 깊은 복사: 이후 영역을 추가해도 DEFAULT_DOMAINS는 오염되지 않는다
  selectedCodes.clear();
  Object.keys(itemDeptMap).forEach(k => delete itemDeptMap[k]);
  Object.keys(itemAuditorMap).forEach(k => delete itemAuditorMap[k]);
  Object.keys(contentOverrides).forEach(k => delete contentOverrides[k]);
  const totalItems = DOMAINS.reduce((s,d) => s + d.items.length, 0);
  const totalCp = DOMAINS.reduce((s,d) => s + d.items.reduce((a,it) => a + it.checkpoints.length, 0), 0);
  document.getElementById('metaDomains').textContent = DOMAINS.length + '개';
  document.getElementById('metaItems').textContent = totalItems + '개';
  document.getElementById('metaCp').textContent = totalCp + '개';
  document.getElementById('checklistSourceLabel').innerHTML = '현재 사용 중: <b>기본 제공 체크리스트</b> (' + DOMAINS.length + '개 영역 · ' + totalItems + '항목)';
  document.getElementById('uploadChecklistBtn').classList.remove('active');
  document.getElementById('blankChecklistBtn').classList.remove('active');
  document.getElementById('useDefaultChecklistBtn').classList.add('active');
  renderDomainList();
  renderOverview();
  updateRefsMeta();
  updateGenSummary();
  populateBuilderDomainSelect();
  if(typeof renderInterviewGuide === 'function') renderInterviewGuide(); // [v8.44] 체크리스트 변경 시 인터뷰 가이드도 자동 새로고침
});

/* ---------- 🆕 빈 체크리스트로 새로 만들기 + 영역·항목 직접 추가 빌더 ---------- */
document.getElementById('blankChecklistBtn').addEventListener('click', () => {
  if(DOMAINS.length > 0 && !confirm('현재 체크리스트를 비우고 새로 시작하시겠습니까?\n선택된 영역·담당부서 지정·문항 편집 내용이 모두 초기화됩니다. (엑셀 업로드로 만든 체크리스트도 이 브라우저 안에서만 임시로 있던 것이라, 미리 필요하면 먼저 다운로드해 두세요)')) return;
  DOMAINS = [];
  selectedCodes.clear();
  Object.keys(itemDeptMap).forEach(k => delete itemDeptMap[k]);
  Object.keys(itemAuditorMap).forEach(k => delete itemAuditorMap[k]);
  Object.keys(contentOverrides).forEach(k => delete contentOverrides[k]);
  document.getElementById('metaDomains').textContent = '0개';
  document.getElementById('metaItems').textContent = '0개';
  document.getElementById('metaCp').textContent = '0개';
  document.getElementById('checklistSourceLabel').innerHTML = '현재 사용 중: <b>새로 만드는 체크리스트</b> (0개 영역) — 아래 "➕ 새 영역·항목 직접 추가하기"를 펼쳐서 만들어 주세요.';
  document.getElementById('useDefaultChecklistBtn').classList.remove('active');
  document.getElementById('uploadChecklistBtn').classList.remove('active');
  document.getElementById('blankChecklistBtn').classList.add('active');
  renderDomainList();
  renderOverview();
  updateRefsMeta();
  updateGenSummary();
  populateBuilderDomainSelect();
  if(typeof renderInterviewGuide === 'function') renderInterviewGuide(); // [v8.44] 체크리스트 변경 시 인터뷰 가이드도 자동 새로고침
});







/* ---------- 삭제한 영역 복원함 (실수로 지운 영역을 되돌리기 위한 휴지통) ---------- */
export const DOMAIN_TRASH_STORAGE_KEY = 'itaudit_domain_trash_v1';


export let domainTrash = loadDomainTrash();











document.getElementById('addCustomDomainBtn').addEventListener('click', addCustomDomain);
document.getElementById('addCustomItemBtn').addEventListener('click', addCustomItem);
populateBuilderDomainSelect();
renderDomainTrash();

/* ---------- Domain picker ---------- */
/* ---------- Reference standards detection (accurately reflects checklist content, not a fixed label) ---------- */
// Ordered by priority for a Korean financial-sector (savings bank) IT audit: core statutes first.
export const CANONICAL_STANDARDS = [
  'ISMS-P', '전자금융감독규정', '개인정보보호법', '신용정보법',
  '전자금융거래법', '개인신용정보보호모범규준', 'ISO 27001', '금융소비자보호법',
  '전자서명법', '정보통신망법', 'COBIT', 'OWASP',
  '금융분야 클라우드', '금융IT안전성강화가이드', '비상대책공통가이드라인', '전산시스템성능관리가이드',
  'AI Security',
];



// [수정] 체크리스트 항목 안에 실제로 등장하는 법령·기준명만 스캔해 보여주던 기존 방식에 더해,
// 이 체크리스트가 금감원이 분기별로 운영하는 "IT 상시협의체"에서 논의된 주요 준수사항도
// 반영해 구성되었다는 점을 항상 함께 밝혀둔다. 이는 특정 도메인의 법령란에 문자열로 박혀있는
// 항목이 아니라 체크리스트 전체 설계에 걸친 배경 근거이므로, 텍스트 탐지 결과와 무관하게
// 고정 문구로 덧붙인다(개수 카운트인 "외 N종"에는 포함하지 않음).
export const STANDING_COUNCIL_NOTE = '금감원 IT상시협의체 분기별 논의사항 반영';







// [v8.05] 도메인 항목 하나가 이번 설문에서 제외되어 있는지 여부 — contentOverrides를 그대로 재사용한다
// (✏ 문항 내용 직접 편집·마법사 모드에서 쓰는 것과 완전히 같은 값이라, 어느 화면에서 제외하든 서로 반영된다).






// [v8.05] 도메인 카드를 펼쳤을 때 그 아래(그리드 전체 폭)에 보여줄 개별 항목 선택 패널.


// [v8.08] "체크된 것과 안 된 것을 바로 구분해서 보고 싶다"는 요청에 따라, 항목 번호 순서 그대로
// 섞어서 보여주던 것을 포함/제외 두 그룹으로 나눠 렌더링한다 — 포함된 항목을 먼저, 그 아래에
// 제외된 항목을 소제목과 함께 모아서 보여주면 한눈에 "지금 몇 개가 빠져 있는지" 파악하기 쉽다.




/* ===== [v8.11] 전체 항목 검색·선택 — "감사 개요" 개선 로드맵 6단계 =====
   ③ 영역 선택 화면은 도메인 카드를 먼저 고른 뒤에야 그 안의 항목을 펼쳐볼 수 있는 구조라,
   "이 항목이 어느 영역에 있는지는 모르겠고 이름만 아는" 경우 찾기 번거로웠다. 이 패널은 그 반대
   방향 — 도메인을 거치지 않고 216개 항목 전체(제목·설명·체크포인트·법령·항목코드)를 대상으로
   키워드 하나로 바로 찾아, 그 자리에서 체크박스로 포함/제외할 수 있다. 데이터는 새로 만들지 않고
   기존 isItemExcluded/setItemExcluded(contentOverrides 재사용)를 그대로 쓰므로 ③ 도메인 카드
   쪽에서 제외하든 여기서 제외하든 항상 서로 즉시 반영된다. */

// 검색어와 매칭되는 항목을 모든 도메인에서 모아 반환. 문항 직접 편집으로 제목 등이 바뀐 경우
// contentOverrides 값을 우선 적용해, 화면에 실제로 보이는 최신 내용 기준으로 검색되게 한다.


// 검색어(term)를 이스케이프한 부분을 <mark>로 감싼다. text는 이미 esc()를 거친(HTML 이스케이프된)
// 문자열이라고 가정한다 — 한글 검색어에는 정규식 특수문자가 섞일 일이 거의 없지만 방어적으로 처리.








export const domainDeptDefaultMap = {}; // {domainCode: 부서명} — 영역 단위 기본 담당부서(선택)
export const COMMON_DEPT_LABEL = '공통(여러 부서 공동)';





// 항목별 담당부서의 "제안된 기본값" — 우선순위: 체크리스트에 박힌 값(현재는 D-25만) > 영역별 기본값 > 기본 수검부서명





export let auditSuggestDismissed = false;

/* ===== 감사 착수 문서 — 기안문(1차 결재용) · 시행문(2차 부서 통보용) =====
   그룹웨어 기안 양식이 조직마다 다르므로 정확한 필드 재현보다는, 이미 화면에서 정한 감사명·목적·
   대상영역·기간·회신기한을 그대로 옮겨 담아 "바로 복사해 다듬어 쓸 수 있는 초안"을 만드는 데 목적을 둔다. */
/* 감사 착수 문서에서 대상영역 옆에 붙일 한 줄 설명. 체크리스트 데이터 자체에는 영역별 설명이
   없어(항목 단위 설명만 존재) 여기서 별도로 정리해 둔다. */


document.getElementById('draftSubmitMethodPreset')?.addEventListener('change', (e) => {
  const presets = {
    groupware: '회신기한까지 그룹웨어 협조문에 결과 파일(JSON 또는 CSV)을 첨부하여 제출',
    email: '회신기한까지 지정 이메일 주소로 결과 파일(JSON 또는 CSV)을 첨부하여 제출',
    both: '회신기한까지 그룹웨어 협조문 첨부 또는 이메일 제출 중 편한 방법으로 결과 파일을 제출'
  };
  const el = document.getElementById('draftSubmitMethodText');
  if(el && presets[e.target.value]) el.value = presets[e.target.value];
});

/* ===== 붙임 목록 부서 표기용 — 실제 항목별 담당부서(itemDeptMap) 기준으로 판정 =====
   ④ 단계에서 실제로 배정한 담당부서를 기준으로 삼되, 아직 배정 전이라면 제안된 기본값(체크리스트
   지정값 > 영역별 기본값 > 기본 수검부서명)을 따른다. 한 영역 안에서 항목마다 배정된 부서가
   서로 다르거나(복수 부서 공동 담당), 항목 하나가 여러 부서에 동시 배정되어 있으면 "특정 한 부서"로
   단정할 수 없으므로 "공통작성"으로 표기한다. (예전에는 이 판정 없이 항상 기본 수검부서명 텍스트가
   그대로 찍혀, 실제로는 여러 부서가 함께 작성하는 설문지에도 "수검부서"라는 글자 그대로 표시되던 문제를 개선) */

// [v8.36] 응답집계·요약본에서 "이 항목을 각 부서가 따로 작성했는지, 여러 부서가 공통으로 작성하는
// 항목인지"가 안 보인다는 지적에 대응 — ①에서 실제로 배정한 담당부서(itemDeptMap, 없으면 체크리스트
// 원본값)를 그대로 재사용해 배지 하나로 표시한다. 새 데이터를 추가하지 않고 이미 있는 배정 정보를
// 그대로 노출하는 것뿐이라, ①에서 배정을 바꾸면 이 표시도 함께 바뀐다.




/* ===== 목적·근거를 선택된 점검대상영역 내용에 맞춰 자동 보강 =====
   목적·법적 근거 문구 자체는 대상영역이 바뀌어도 크게 달라지지 않지만, 어떤 영역을 점검하느냐에
   따라 실제로 근거가 되는 개별 법령은 달라진다. 아래 매핑으로 선택된 영역과 관련 있는 법령만
   추려 근거에 반영하고, 목적 문구에는 대상영역명을 자동으로 녹여 넣는다(직접 입력한 목적이 있으면
   그 문구는 그대로 살리고 뒤에 대상영역 요약만 덧붙인다). */
export const DOMAIN_LEGAL_TAGS = {
  '17':['개인정보보호법'], '18':['개인정보보호법'],
  '19':['전자금융거래법','전자금융감독규정'],
  '20':['신용정보의 이용 및 보호에 관한 법률'], '24':['신용정보의 이용 및 보호에 관한 법률']
};

/* ===== 체크리스트(영역)별 "실시 사유" 추천 뱅크 =====
   "실시 사유·실증적 근거" 입력란은 원래 감사 전체 기준 자유 텍스트 하나뿐이었는데, 대상영역이
   여러 개면 영역마다 왜 지금 이 영역을 보는지 서로 다른 이유가 있을 수 있다는 요청에 따라,
   ③에서 선택한 영역별로 "일반적으로 통용되는, 타당성을 갖춘" 근거 문구를 미리 준비해두고
   클릭 한 번으로 실시사유란에 추가할 수 있게 한다.
   ⚠ 여기 담긴 문구는 "이 영역을 감사 대상으로 삼는 것이 왜 합리적인지"에 대한 일반적인 유형별
   예시(정기점검/사고이력/제도변화/후속조치)일 뿐, 이 감사 건에 실제로 있었던 구체적 사실(몇 년도
   몇 월 리스크평가 결과였는지, 어떤 사고였는지 등)을 대신 채워 넣는 것이 아니다. 감사자가 실제
   근거에 맞게 반드시 확인·수정한 뒤 사용해야 하며, 화면에도 그 경고문구를 함께 노출한다.
   태그: [정기점검]=매년 반복되는 정기감사 대상이라는 유형 / [사고이력]=동종업권 사고사례 다발 유형 /
        [제도변화]=최근 감독규정·기술환경 변화에 따른 신규 점검필요성 유형 / [후속조치]=전년도 지적사항 후속확인 유형 */
export const DOMAIN_GROUNDS_BANK = {
  '01':[
    {tag:'정기점검', text:'정보보호 최고책임자(CISO) 지정 및 정보보호위원회 운영 현황은 매년 정기 IT감사 대상으로 지정되어 있어 정기점검 차원에서 포함함'},
    {tag:'제도변화', text:'금융분야 정보보호 거버넌스 관련 감독규정 개정에 따라 최고책임자 지정 요건·보고체계가 강화되어, 개정사항 반영 여부를 확인할 필요가 있음'}
  ],
  '02':[
    {tag:'정기점검', text:'연간 정보보호 위험평가 결과 및 대응계획 수립·이행 여부는 매년 정기점검 대상 영역임'},
    {tag:'후속조치', text:'전년도 감사에서 위험평가 결과가 실제 보안대책 수립에 충분히 반영되지 않은 사례가 지적되어, 후속 이행 여부를 재확인할 필요가 있음'}
  ],
  '03':[
    {tag:'정기점검', text:'정책·지침의 제·개정 관리 및 자체점검 이행실태는 매년 정기감사 대상 영역임'},
    {tag:'후속조치', text:'전년도 지적사항에 대한 부서 자체점검·후속조치 이행 여부를 확인할 필요가 있음'}
  ],
  '04':[
    {tag:'정기점검', text:'정보자산 목록화 및 중요도 분류 현황은 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'정보자산이 식별·관리되지 않아 보호대책 적용에서 누락되는 관리 사각지대에서 사고가 발생한 동종업권 사례가 있어 점검이 필요함'}
  ],
  '05':[
    {tag:'정기점검', text:'임직원 채용·퇴직 시 보안조치 이행실태는 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'퇴직자 계정·권한 미회수로 인한 정보유출 사고가 동종업권에서 다수 발생하여 점검이 필요함'}
  ],
  '06':[
    {tag:'정기점검', text:'외주업체·협력사에 대한 보안관리 및 계약상 보안조항 이행현황은 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'외주업체를 통한 정보유출·해킹 사고가 금융권에서 지속적으로 발생하고 있어 위험도가 높은 영역임'}
  ],
  '07':[
    {tag:'정기점검', text:'전산실 등 주요시설에 대한 출입통제 및 물리적 보호조치는 매년 정기점검 대상 영역임'},
    {tag:'후속조치', text:'전년도 감사에서 출입기록 관리 미흡이 지적된 바 있어, 개선 이행 여부를 확인할 필요가 있음'}
  ],
  '08':[
    {tag:'정기점검', text:'사용자 인증 및 권한 부여·회수 절차의 적정성은 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'과다 부여된 권한을 통한 내부자 정보유출 사고가 금융권에서 지속 발생하고 있어 고위험 점검영역임'}
  ],
  '09':[
    {tag:'정기점검', text:'정보시스템·데이터에 대한 접근권한 관리 및 통제현황은 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'접근통제 미흡으로 인한 개인정보 대량 조회·유출 사고가 동종업권에서 발생한 사례가 있어 점검이 필요함'}
  ],
  '10':[
    {tag:'정기점검', text:'중요정보에 대한 암호화 적용 및 키관리 현황은 매년 정기점검 대상 영역임'},
    {tag:'제도변화', text:'개인정보보호 법령상 암호화 대상·기준이 지속적으로 강화되고 있어 최신 기준 준수 여부를 확인할 필요가 있음'}
  ],
  '11':[
    {tag:'정기점검', text:'시스템 개발·변경 시 통제절차(형상관리·테스트·승인 등) 이행현황은 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'변경관리 절차 미준수로 인한 시스템 장애·오류 사고가 금융권에서 발생한 바 있어 점검이 필요함'}
  ],
  '12':[
    {tag:'정기점검', text:'정보시스템의 성능·용량·장애관리 현황은 매년 정기점검 대상 영역임'},
    {tag:'후속조치', text:'전년도 장애대응 관련 지적사항의 후속조치 이행 여부를 확인할 필요가 있음'}
  ],
  '13':[
    {tag:'정기점검', text:'방화벽 등 네트워크 보안장비의 구축·운영 현황은 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'네트워크 보안장비 설정 미흡으로 인한 침해사고가 금융권에서 발생한 바 있어 점검이 필요함'}
  ],
  '14':[
    {tag:'정기점검', text:'시스템·보안 로그의 수집·보관 및 이상징후 모니터링 체계는 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'로그 미보관·미탐지로 인해 사고 원인규명이 지연된 동종업권 사례가 있어 점검이 필요함'}
  ],
  '15':[
    {tag:'정기점검', text:'침해사고 대응체계 구축 및 대응절차 수립·훈련 현황은 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'금융권 침해사고 발생빈도가 증가 추세에 있어 대응체계의 실효성을 점검할 필요가 있음'}
  ],
  '16':[
    {tag:'정기점검', text:'재해 발생 시 정보시스템 복구 및 업무연속성 확보체계는 매년 정기점검 대상 영역임'},
    {tag:'후속조치', text:'전년도 모의훈련 결과 지적사항에 대한 개선 이행 여부를 확인할 필요가 있음'}
  ],
  '17':[
    {tag:'정기점검', text:'개인정보 수집·이용·제3자 제공 관련 법령 준수현황은 개인정보보호법상 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'동종업권 개인정보 유출사고 발생에 따른 선제적 점검이 필요함'}
  ],
  '18':[
    {tag:'정기점검', text:'개인정보 안전성 확보조치 및 파기 이행현황은 개인정보보호법상 매년 정기점검 대상 영역임'},
    {tag:'제도변화', text:'개인정보보호 법령 개정에 따른 안전조치 기준 강화사항의 반영 여부를 확인할 필요가 있음'}
  ],
  '19':[
    {tag:'정기점검', text:'전자금융거래법령에 따른 전자금융서비스 안전성 확보현황은 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'전자금융사기·해킹 사고가 지속 발생하고 있어 고위험 점검영역임'}
  ],
  '20':[
    {tag:'정기점검', text:'신용정보의 수집·처리·관리에 관한 법령 준수현황은 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'신용정보 대량유출 사고가 금융권에서 발생한 사례가 있어 점검이 필요함'}
  ],
  '21':[
    {tag:'제도변화', text:'인공지능(AI) 시스템 도입이 확대됨에 따라 관련 보안통제 체계 점검의 필요성이 새롭게 대두됨'},
    {tag:'사고이력', text:'AI 시스템의 오작동·데이터 유출 관련 사고사례가 보고되고 있어 선제적 점검이 필요함'}
  ],
  '22':[
    {tag:'제도변화', text:'클라우드컴퓨팅서비스 이용이 확대됨에 따라 관련 보안통제 체계 점검의 필요성이 대두됨'},
    {tag:'사고이력', text:'클라우드 설정 오류로 인한 정보유출 사고 사례가 있어 점검이 필요함'}
  ],
  '23':[
    {tag:'정기점검', text:'홈페이지·모바일 앱 등 대외서비스의 보안 취약점 관리현황은 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'웹·앱 취약점을 이용한 해킹 사고가 금융권에서 지속 발생하고 있어 점검이 필요함'}
  ],
  '24':[
    {tag:'정기점검', text:'개인신용정보 유출 방지를 위한 통제절차 이행현황은 매년 정기점검 대상 영역임'},
    {tag:'사고이력', text:'개인신용정보 대량유출 사고 발생에 따른 선제적 점검이 필요함'}
  ],
  '25':[
    {tag:'정기점검', text:'IT 아웃소싱 업체에 대한 관리·감독 및 계약이행현황은 매년 정기점검 대상 영역임'},
    {tag:'후속조치', text:'전년도 외주업체 계약이행 점검 결과 지적사항의 후속조치 이행 여부를 확인할 필요가 있음'}
  ]
};












/* 종합 감사결과보고서의 "감사개요·종합의견"이 발견사항 건수 정도의 얕은 내용에 그치던 것을,
   이 도구가 이미 가지고 있는 설문 응답·인터뷰·칸반 데이터까지 모아 실제로 유용한 요약이 되도록
   한곳에서 계산한다. (감사개요/종합의견 두 섹션이 공통으로 이 결과를 사용) */


/* [v8.00] 감사 개요(Objective·Scope·Resource·Schedule) 요약 패널 —
   ①설문지 생성 탭 맨 위에서, 이미 이 탭 곳곳(감사배경·영역선택·감사착수문서)에 입력한 값들을
   collectAuditWideStats()/collectAuditDraftContext()로 그러모아 한눈에 보여준다. 새 입력칸을
   추가한 것이 아니라 기존 데이터를 재사용만 하므로, 어느 단계를 먼저 채우든 실시간으로 채워진다. */




/* [v8.00 2단계] 🗄 관리·참고 → "📋 감사 개요" 전용 화면 — 위 요약 패널과 같은 데이터를 쓰되,
   설문지 생성 탭에 매여 있지 않고 언제든(다른 탭 작업 중에도) 열어 확인할 수 있고, 진행 현황
   통계(응답·인터뷰·칸반)까지 한 화면에 모아 보여준다. */
export const IPPF_STAGES = [
  {num:1, title:'설문 설계·배포', desc:'영역 선택 후 설문지를 만들어 배포'},
  {num:2, title:'응답 집계·리뷰', desc:'회수된 응답을 취합·검토'},
  {num:3, title:'인터뷰 수행', desc:'미흡·부분이행 대상자 인터뷰'},
  {num:4, title:'결과 커뮤니케이션·보고', desc:'발견사항 통보 및 보고서 작성'},
  {num:5, title:'액션플랜·후속조치', desc:'개선계획 이행을 칸반으로 추적'}
];

/* [v8.02] 이전 로직은 "앞 단계가 안 끝나면 뒤 단계는 무조건 예정"으로 순서를 강제했는데,
   실제로는 뒤 단계 조건이 이미 채워져 있으면(과거 데이터 등) 그 상태를 그대로 'done'으로
   반환해버려 ③이 진행중인데 ④가 완료로 뜨는 등 순서가 뒤엉켜 보이는 버그가 있었다.
   실제 감사도 인터뷰 중 발견사항 등록·칸반 카드 생성이 자연스럽게 겹치므로, 순서를 억지로
   맞추기보다 각 단계를 "그 단계 자체의 신호"로만 독립 판정한다(여러 단계가 동시에
   '진행중'일 수 있음 — 이게 실제 상황에 더 가깝다). */




/* [v8.00 3단계] 어느 탭에 있든 상단 "현재 작업자" 바에서 지금 이 감사가 IPPF 수행단계 중
   어디쯤인지 항상 보이도록 하는 소형 배지. 상세 흐름도(위 renderIppfFlow)와 같은 계산을 쓴다. */







export const AUDIT_LEGAL_BASIS = '「전자금융거래법」, 「신용정보의 이용 및 보호에 관한 법률」, 「개인정보보호법」 및 「전자금융감독규정」 등 관계 법령·감독규정에 따른 정보기술(IT) 부문 내부통제체계 자체점검 의무';
export const GANA_MARKERS = ['가','나','다','라','마','바','사','아','자','차','카','타','파','하'];








document.getElementById('applySuggestBtn').addEventListener('click', () => {
  const box = document.getElementById('auditNameSuggestBox');
  document.getElementById('auditNameInput').value = box.dataset.sugName || '';
  document.getElementById('auditPurposeInput').value = box.dataset.sugPurpose || '';
  document.getElementById('auditNameInput').dispatchEvent(new Event('input'));
  document.getElementById('auditPurposeInput').dispatchEvent(new Event('input'));
  box.style.display = 'none';
});
document.getElementById('dismissSuggestBtn').addEventListener('click', () => {
  auditSuggestDismissed = true;
  document.getElementById('auditNameSuggestBox').style.display = 'none';
});
document.getElementById('auditNameInput').addEventListener('input', () => {
  if(document.getElementById('auditNameInput').value.trim()) document.getElementById('auditNameSuggestBox').style.display = 'none';
});
document.getElementById('auditPurposeInput').addEventListener('input', () => {
  if(document.getElementById('auditPurposeInput').value.trim()) document.getElementById('auditNameSuggestBox').style.display = 'none';
});

let _groundsChipSyncTimer = null;
document.getElementById('auditGroundsInput').addEventListener('input', () => {
  // 사용자가 텍스트를 직접 지우거나 고치면 "추가됨" 표시가 최신 상태를 반영하도록 다시 그린다.
  clearTimeout(_groundsChipSyncTimer);
  _groundsChipSyncTimer = setTimeout(() => {
    renderGroundsSuggestions(DOMAINS.filter(d => selectedCodes.has(d.code)));
  }, 400);
});


document.getElementById('selectNoneBtn').addEventListener('click', () => {
  selectedCodes.clear();
  document.querySelectorAll('#domainList .dcard input[type=checkbox]').forEach(cb => { cb.checked = false; cb.closest('.dcard').classList.remove('checked'); });
  updateGenSummary();
  if(typeof renderDsearchResults === 'function') renderDsearchResults(); // [v8.11] "영역 자동 선택" 안내가 최신 상태를 반영하도록 갱신
});

// [v8.11] 전체 항목 검색 입력창 — 다른 화면 요소처럼 스크립트 마지막에서 한 번만 리스너를 건다.
document.getElementById('dsearchInput').addEventListener('input', () => { renderDsearchResults(); });
document.getElementById('dsearchClearBtn').addEventListener('click', () => {
  const input = document.getElementById('dsearchInput');
  input.value = '';
  renderDsearchResults();
  input.focus();
});

/* ---------- Survey generation (ports the python renderer to JS) ---------- */










/* Apply user-edited item content (title/desc/checkpoints/evidence) on top of the base checklist data. */

















/* 담당부서별 분리생성 시 실제로 몇 개의 파일이, 어떤 이름으로 나오는지 계산한다.
   generateSplitByDept()의 실제 다운로드 로직과 openAuditDraftDoc()의 붙임 목록이
   서로 다른 방식으로 계산되어 있던 것이 "붙임 목록에 실제 파일 중 일부만 들어간다"는
   문제의 원인이었다 — 이제 두 곳 모두 이 함수 하나만 사용해 항상 일치하도록 한다. */




document.getElementById('generateBtn').addEventListener('click', generateSurvey);
document.getElementById('generateSplitBtn').addEventListener('click', generateSplitByDept);

/* ---------- Item-level department assignment ---------- */
export const itemDeptMap = {}; // "domCode-itemNo" -> 담당부서 배열(예: ['IT운용팀'] 또는 ['IT운용팀','IT개발팀']). 예전 버전(단일 문자열) 데이터도 함께 지원.

/* ---------- Item-level auditor assignment (v7.03) ---------- */
// 영역별 배정(domainAuditorMap)에 감사역이 2명 이상 쉼표로 들어간 경우, 그 영역 전체 항목에 콤마로
// 뭉친 문자열이 그대로 "진행 감사자"로 채워져 인터뷰 가이드 필터·사람별 정렬이 무의미해지던 문제를
// (1)담당부서와 동일한 "영역 기본값 → 항목별 예외" 구조로, (2)자유 입력이 아닌 드롭다운 선택(영역에
// 배정된 후보 중에서만 고르기)으로 해결한다 — 오타·표기 불일치로 인한 무결성 훼손을 원천 차단.
export const itemAuditorMap = {}; // "domCode-itemNo" -> 감사역 성명(1인) 또는 빈 문자열(미배정)






// container 안의 모든 .multi-dept-select 위젯에 토글·체크박스 동작을 연결한다.
// onChange(key, selectedArray)는 값이 바뀔 때마다 호출되어 호출부가 원하는 저장소에 반영하게 한다.
// needsFullRerender는 "직접 입력"으로 새 부서를 추가했을 때 목록 전체를 다시 그려야 하므로 호출한다.

document.addEventListener('click', (e) => {
  if(!e.target.closest('.multi-dept-select')){
    document.querySelectorAll('.mds-panel').forEach(p => { p.style.display = 'none'; });
  }
});



document.getElementById('applyDeptAllBtn').addEventListener('click', () => {
  const defaultDept = document.getElementById('genDept').value.trim() || '수검부서';
  Object.keys(itemDeptMap).forEach(k => { itemDeptMap[k] = [defaultDept]; });
  renderAssignTable();
});

document.getElementById('resetDeptSuggestedBtn').addEventListener('click', () => {
  if(!confirm('현재 선택된 영역의 항목별 담당부서를 전부 "제안된 기본값"(체크리스트 지정값 > 영역별 기본값 > 기본 수검부서명 순)으로 되돌립니다. 직접 수정하신 내용은 사라집니다. 계속할까요?')) return;
  const selected = DOMAINS.filter(d => selectedCodes.has(d.code));
  selected.forEach(dom => {
    dom.items.forEach(it => {
      itemDeptMap[dom.code + '-' + it.no] = deptToArray(getSuggestedDept(dom.code, it.no));
    });
  });
  renderAssignTable();
});

/* ---------- 응답 척도 설정 ---------- */
const SCALE_PRESETS = {
  existence4: [
    {value:'예', tier:'good'},
    {value:'아니오', tier:'bad'},
    {value:'부분', tier:'neutral'},
    {value:'해당없음', tier:'na'},
  ],
  maturity5: [
    {value:'매우 잘함', tier:'good'},
    {value:'잘함', tier:'good'},
    {value:'보통', tier:'neutral'},
    {value:'미흡', tier:'bad'},
    {value:'매우 미흡', tier:'bad'},
  ],
  uncertain4: [
    {value:'예', tier:'good'},
    {value:'아니오', tier:'bad'},
    {value:'해당없음', tier:'na'},
    {value:'모르겠음', tier:'bad'},
  ],
};
export const TIER_LABELS = {good:'긍정(양호)', neutral:'중립(보통)', bad:'부정(미흡)', na:'해당없음'};
export let currentScale = SCALE_PRESETS.existence4.map(o => ({...o}));
export function setCurrentScale(v){ currentScale = v; }






document.querySelectorAll('.scale-presets button[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    currentScale = SCALE_PRESETS[btn.dataset.preset].map(o => ({...o}));
    renderScaleTable();
  });
});
document.getElementById('addScaleRowBtn').addEventListener('click', () => {
  currentScale.push({value:'새 옵션', tier:'neutral'});
  renderScaleTable();
});
renderScaleTable();

/* ---------- 설문 항목 내용 편집 ---------- */
export const contentOverrides = {}; // "domCode-itemNo" -> {title, desc, checkpoints:[...], evidence:[...]}

/* ===== 이어하기: "설문지 생성" 탭 작업 내용을 브라우저에 자동저장 (감사역 화면도 동일하게 적용) ===== */
export const GEN_DRAFT_STORAGE_KEY = 'itaudit_gen_draft_v1';
export let _genDraftSaveTimer = null;
export function setGenDraftSaveTimer(v){ _genDraftSaveTimer = v; }










export let openEditKey = null;

/* ===== 설문지 설계 마법사 ===== */
export let wizardItems = [];
export let wizardIndex = 0;
export function setWizardItems(v){ wizardItems = v; }
export function setWizardIndex(v){ wizardIndex = v; }
export function setOpenEditKey(v){ openEditKey = v; }


export const WIZARD_STEP_HINTS = [
  '1️⃣ <b>항목명·설명이 우리 조직 용어와 맞는지 확인</b> — 부서명·시스템명(예: "DBSAFER", "중앙회 계정계") 등 실제 명칭으로 다듬으세요.',
  '2️⃣ <b>위험도·법령이 실제 상황과 맞는지 검토</b> — 조직 특성상 위험도를 조정해야 할 항목이 있는지 확인하세요.',
  '3️⃣ <b>체크포인트가 실제로 확인 가능한 질문인지 확인</b> — "~을 확인할 수 있는 문서·로그가 있다"처럼 구체적으로 다듬으세요.',
  '4️⃣ <b>내용을 다 확인한 뒤, 제외할 항목인지 판단</b> — 이번 감사 범위·조직 특성상 해당되지 않으면 "이번 설문에서 제외"에 체크하세요.',
  '5️⃣ <b>마지막으로 담당부서가 맞는지 확인</b> — 내용을 다 본 뒤에 정하는 게 더 정확합니다. 기본값과 다르면 여기서 개별 지정하세요.'
];

export const WIZARD_STRUCTURE_LEGEND = '<div class="wizard-structure-legend">'
  + '<div class="wsl-title">📐 이 항목이 실제 설문지에 어떻게 보이나요? (아래 필드 ①~⑥이 응답자 화면에 표시되는 위치)</div>'
  + '<div class="wsl-mock">'
    + '<div class="wsl-mock-card">'
      + '<div class="wsl-mock-row"><span class="wsl-tag">①항목명</span><span class="wsl-mock-title">항목 제목이 여기 굵게 표시</span><span class="wsl-tag">③위험도</span></div>'
      + '<div class="wsl-mock-row"><span class="wsl-tag">②설명</span><span class="wsl-mock-desc">항목 설명이 회색 글씨로 이 자리에 표시</span></div>'
      + '<div class="wsl-mock-row"><span class="wsl-tag">④법령</span><span class="wsl-mock-law">관련 법령이 작게 표시</span></div>'
      + '<div class="wsl-mock-table"><span class="wsl-tag">⑤체크포인트</span> → 표의 각 행 = 응답자가 실제로 클릭해 답하는 질문 (한 줄 = 한 행)</div>'
      + '<div class="wsl-mock-evi"><span class="wsl-tag">⑥증빙자료</span> → 체크포인트 아래 "제출 가능 증빙" 체크박스 목록</div>'
    + '</div>'
    + '<div class="wsl-mock-note">담당부서·제외여부는 응답자 화면에는 보이지 않습니다 — 감사역이 설문을 설계·배정할 때만 쓰는 내부 관리용 정보입니다.</div>'
  + '</div>'
+ '</div>';

















/* ---------- 배포계획 저장 / 불러오기 ---------- */
document.getElementById('savePlanBtn').addEventListener('click', () => {
  const plan = {
    selectedCodes: Array.from(selectedCodes),
    itemDeptMap: itemDeptMap,
    itemAuditorMap: itemAuditorMap,
    contentOverrides: contentOverrides,
    scale: currentScale,
    defaultDept: document.getElementById('genDept').value.trim(),
    domainAuditorMap: domainAuditorMap,
    savedAt: kstISOString(),
  };
  const blob = new Blob([JSON.stringify(plan, null, 2)], {type:'application/json;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IT감사_배포계획' + versionSuffix() + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('loadPlanBtn').addEventListener('click', () => document.getElementById('planFileInput').click());
document.getElementById('planFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const plan = JSON.parse(ev.target.result);
      selectedCodes.clear();
      (plan.selectedCodes || []).forEach(c => selectedCodes.add(c));
      document.querySelectorAll('#domainList .dcard input[type=checkbox]').forEach(cb => {
        const on = selectedCodes.has(cb.dataset.code);
        cb.checked = on;
        cb.closest('.dcard').classList.toggle('checked', on);
      });
      if(plan.defaultDept){
        if(!auditDeptList.includes(plan.defaultDept)) auditDeptList.push(plan.defaultDept);
        renderAuditDeptChips();
        document.getElementById('genDept').value = plan.defaultDept;
      }
      Object.keys(itemDeptMap).forEach(k => delete itemDeptMap[k]);
      safeAssign(itemDeptMap, plan.itemDeptMap || {});
      Object.keys(itemAuditorMap).forEach(k => delete itemAuditorMap[k]);
      safeAssign(itemAuditorMap, plan.itemAuditorMap || {});
      Object.keys(contentOverrides).forEach(k => delete contentOverrides[k]);
      safeAssign(contentOverrides, plan.contentOverrides || {});
      if(plan.scale && plan.scale.length){ currentScale = plan.scale.map(o => ({...o})); renderScaleTable(); }
      Object.keys(domainAuditorMap).forEach(k => delete domainAuditorMap[k]);
      safeAssign(domainAuditorMap, plan.domainAuditorMap || {});
      renderDomainList(); // [v8.05] 불러온 contentOverrides(항목별 제외 여부)가 펼쳐진 패널에도 반영되도록 다시 그린다
      updateGenSummary();
    } catch(err){
      alert('배포계획 파일을 읽을 수 없습니다: ' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
});

/* ---------- Response collection / aggregation ---------- */
export let aggRows = [];
export function setAggRows(v){ aggRows = v; }
 // {수검부서, 작성자, 작성일, 도메인, 항목코드, 항목명, 위험도, 세부체크포인트, 응답, 비고, __file}
export let aggFilter = {dept:'', domain:'', risk:'', tier:'', search:''}; // 응답집계 화면 필터 상태 — renderAggregation()이 참조





/* ---------- Survey round history (localStorage + file export/import) ---------- */
export const ROUND_STORAGE_KEY = 'itaudit_survey_rounds_v1';
export let activeRoundLabel = null;
export function setActiveRoundLabel(v){ activeRoundLabel = v; }























/* ---------- Distribution & response tracking ---------- */
export const RECIPIENT_STORAGE_KEY = 'itaudit_recipients_v1';
export const DISTRIBUTION_STORAGE_KEY = 'itaudit_distributions_v1';
export const CURRENT_AUDITOR_STORAGE_KEY = 'itaudit_current_auditor_v1';
export const AUDITOR_LIST_STORAGE_KEY = 'itaudit_auditor_list_v1';


















































/* ===== 모듈별(부분) 백업/복원 ===== */
export const MODULE_DEFS = {
  recipients: {
    label: '수검자 명부', type: 'array', idKey: 'id',
    load: loadRecipients, save: saveRecipients,
    after: () => { renderRecipientsTable(); renderDistRecipientChecks(); }
  },
  distributions: {
    label: '배포 기록', type: 'array', idKey: 'id',
    load: loadDistributions, save: saveDistributions,
    after: () => { renderDistributionList(); renderCommDistSelect(); }
  },
  rounds: {
    label: '설문 회차 이력', type: 'array', idKey: 'id',
    load: loadRoundsFromStorage, save: saveRoundsToStorage,
    after: () => { renderRoundHistory(); }
  },
  commTemplates: {
    label: '메시지 템플릿', type: 'object',
    load: () => { try{ return JSON.parse(localStorage.getItem(COMM_TEMPLATE_STORAGE_KEY) || '{}'); }catch(e){ return {}; } },
    save: (obj) => { try{ localStorage.setItem(COMM_TEMPLATE_STORAGE_KEY, JSON.stringify(obj)); }catch(e){ alert('템플릿 저장 실패: ' + e.message); } },
    after: () => { renderCommTemplateTypeOptions(); const ed = document.getElementById('commTemplateEditor'); if(ed && ed.style.display !== 'none' && typeof renderCommTemplateEditor === 'function') renderCommTemplateEditor(); }
  },
  interviewState: {
    label: '인터뷰 기록', type: 'object',
    load: loadInterviewState,
    save: (obj) => { Object.keys(interviewState).forEach(k => delete interviewState[k]); safeAssign(interviewState, obj || {}); saveInterviewState(); },
    after: () => { renderIgSourceBanner(); if(typeof renderInterviewGuide === 'function') renderInterviewGuide(); }
  },
  interviewSchedule: {
    label: '인터뷰 일정', type: 'object',
    load: () => { try{ return JSON.parse(localStorage.getItem(INTERVIEW_SCHEDULE_KEY) || '{}'); }catch(e){ return {}; } },
    save: (obj) => { Object.keys(interviewSchedule).forEach(k => delete interviewSchedule[k]); safeAssign(interviewSchedule, obj || {}); saveInterviewSchedule(); },
    after: () => { const el = document.getElementById('interviewScheduleTable'); if(el) el.innerHTML = ''; }
  },
  findings: {
    label: '발견사항', type: 'array', idKey: 'id',
    load: loadFindings,
    save: (arr) => { findings.length = 0; findings.push(...(arr||[])); saveFindings(); },
    after: () => { if(typeof renderFindingsTab === 'function') renderFindingsTab(); }
  },
  scriptOverrides: {
    label: '인터뷰 질문 편집 내역 — ①기존형 (AI 응답 포함)', type: 'object',
    load: loadScriptOverrides,
    save: (obj) => { Object.keys(scriptOverrides).forEach(k => delete scriptOverrides[k]); safeAssign(scriptOverrides, obj || {}); saveScriptOverrides(); },
    after: () => { if(typeof renderInterviewGuide === 'function') renderInterviewGuide(); }
  },
  flowOverrides: {
    label: '인터뷰 순서도·분기형 편집 내역 — ②③ (AI 응답 포함)', type: 'object',
    load: loadFlowOverrides,
    save: (obj) => { Object.keys(flowOverrides).forEach(k => delete flowOverrides[k]); safeAssign(flowOverrides, obj || {}); saveFlowOverrides(); },
    after: () => { if(typeof renderInterviewGuide === 'function') renderInterviewGuide(); }
  },
  customInterviewItems: {
    label: '체크리스트 외 별도 확인사항', type: 'array', idKey: 'id',
    load: loadCustomInterviewItems,
    save: (arr) => { customInterviewItems.length = 0; customInterviewItems.push(...(arr||[])); saveCustomInterviewItems(); },
    after: () => { if(typeof renderCustomInterviewSection === 'function') renderCustomInterviewSection(); }
  },
  kanban: {
    label: '🗂 칸반보드', type: 'array', idKey: 'id',
    load: loadKanbanCards,
    save: (arr) => { saveKanbanCards(arr || []); },
    after: () => { if(typeof renderKanbanBoard === 'function') renderKanbanBoard(); }
  },
  kanbanArchive: {
    label: '🗄 칸반 보관함 (삭제된 카드 이력)', type: 'array', idKey: 'id',
    load: loadKanbanArchive,
    save: (arr) => { saveKanbanArchive(arr || []); },
    after: () => { if(typeof renderKanbanArchive === 'function') renderKanbanArchive(); if(typeof renderKanbanBoard === 'function') renderKanbanBoard(); }
  },
  reportLog: {
    label: '📜 보고서 생성 이력', type: 'array', idKey: 'id',
    load: loadReportLog,
    save: (arr) => { saveReportLog(arr || []); },
    after: () => { if(typeof renderReportLog === 'function') renderReportLog(); }
  }
};













/* ---------- Communication message templates ---------- */


/* Editable communication templates — text lives in localStorage so the auditor can rewrite the
   wording without touching code. Placeholders are plain {{token}} strings substituted at generate time. */
export const DEFAULT_COMM_TEMPLATES = {
  notice: {
    label: '📨 배포·회신 안내',
    body: '안녕하세요, {{이름}}님. IT감사팀입니다.\n\n{{회차명}} IT 자체감사를 위한 사전 설문을 요청드립니다.\n\n'
      + '▪ 대상 영역: {{도메인목록}}\n▪ 배포일: {{배포일}}\n▪ 회신 기한: {{회신기한}}\n▪ 근거(그룹웨어 기안번호): {{기안번호}}\n\n'
      + '첨부된 설문지 파일(HTML)을 열어 항목별로 응답하신 후, 화면 하단의 [결과 CSV 다운로드] 또는 [결과 JSON 다운로드]로 저장된 파일을 회신 부탁드립니다.\n'
      + '작성 중 어려운 점이 있으시면 언제든 감사팀으로 편하게 문의해 주시기 바랍니다.\n\n감사합니다.'
  },
  reminder: {
    label: '⏰ 미회신자 독촉',
    body: '안녕하세요, {{이름}}님. IT감사팀입니다.\n\n{{회차명}} 설문(기안번호: {{기안번호}}) 회신 기한이 {{회신기한}}으로, 아직 회신을 확인하지 못해 안내드립니다.\n\n'
      + '바쁘시겠지만 빠른 시일 내 회신 부탁드리며, 작성에 어려움이 있으시면 편하게 말씀해 주시면 도와드리겠습니다.\n\n감사합니다.'
  },
  interview: {
    label: '🗓 인터뷰 시간 조율',
    body: '안녕하세요, {{이름}}님. IT감사팀입니다.\n\n{{회차명}} 설문 응답 내용과 관련하여 간단한 인터뷰를 진행하고자 합니다. (예상 소요시간 약 20~30분)\n\n'
      + '가능하신 날짜와 시간대를 2~3개 정도 알려주시면 일정 조율 후 다시 안내드리겠습니다.\n\n감사합니다.'
  }
};
export const COMM_TEMPLATE_STORAGE_KEY = 'itaudit_comm_templates_v1';
export const COMM_TEMPLATE_TOKENS = ['{{이름}}','{{회차명}}','{{도메인목록}}','{{배포일}}','{{회신기한}}','{{기안번호}}'];

















export let loadedFiles = [];
export function setLoadedFiles(v){ loadedFiles = v; }












async function handleFiles(fileList){
  // v6.77 — "업로드하면 바로 응답집계에 반영되어 버려서, 부서별로 제대로 나뉜 파일인지 확인할 틈이
  // 없다"는 지적을 반영해, 파싱은 여기서 하되 aggRows/loadedFiles에는 바로 반영하지 않는다.
  // 대신 파일별 요약(부서·영역·항목수·체크포인트수)과, 담당부서 배정표 기준 "이 부서가 원래
  // 담당 아닌 항목까지 응답했는지" 자동 검증 결과를 먼저 보여주고, 사용자가 [반영] 버튼을 눌러야
  // 실제로 aggRows에 합쳐진다. 반영 전까지는 화면·저장 어느 것도 바뀌지 않는다.
  const files = Array.from(fileList).filter(file => !loadedFiles.some(f => f.name === file.name && f.size === file.size));
  if(files.length === 0) return;

  let candidateRowsByFile = {}; // fileName -> rows[]
  let errors = [];
  for(const file of files){
    const isJSON = /\.json$/i.test(file.name);
    const rowsForThisFile = [];
    try{
      const text = await readFileAsTextP(file);
      if(isJSON){
        const parsed = JSON.parse(text);
        const fallback = {dept: parsed['수검부서'] || '', author: parsed['작성자'] || '', date: parsed['작성일'] || '', interviewNote: parsed['인터뷰가능시간'] || '', interviewContact: parsed['인터뷰담당자'] || ''};
        const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed['문항']) ? parsed['문항'] : (Array.isArray(parsed['rows']) ? parsed['rows'] : null));
        if(!list){ errors.push(file.name + ': 인식 가능한 JSON 구조가 아닙니다.'); continue; }
        list.forEach(rec => { const row = buildAggRowFromRecord(rec, fallback, file.name); if(row) rowsForThisFile.push(row); });
      } else {
        const rows = parseCSV(text);
        if(rows.length < 2) continue;
        const header = rows[0];
        for(let r = 1; r < rows.length; r++){
          const rec = {};
          header.forEach((h,i) => rec[h] = rows[r][i]);
          const row = buildAggRowFromRecord(rec, {}, file.name);
          if(row) rowsForThisFile.push(row);
        }
      }
      candidateRowsByFile[file.name] = {rows: rowsForThisFile, size: file.size};
    }catch(err){
      errors.push(file.name + ': ' + err.message);
    }
  }

  showUploadPreview(candidateRowsByFile, errors);
}

/* 체크리스트 원본 데이터상 이 항목(domCode-itemNo)이 "원래" 어느 부서 담당으로 되어 있는지 조회.
   getSuggestedDept와 달리 사용자가 화면에서 아직 손대지 않았어도(⑥ 배정표를 열어보지 않았어도)
   체크리스트 원본값만으로 판단한다 — 업로드 검증은 화면 상태가 아니라 항상 "체크리스트 원본 기준"이어야
   일관되게 비교할 수 있기 때문. 특정 부서로 못박혀 있지 않은 항목(공통이거나 배정정보가 없음)은 null. */


/* 업로드된 파일 하나(rows)를 체크리스트 배정과 대조해, "이 부서 담당이 아닌데 응답한" 행을 찾는다. */






const dropZone = document.getElementById('dropZone');
const csvInput = document.getElementById('csvFileInput');
dropZone.addEventListener('click', () => csvInput.click());
csvInput.addEventListener('change', () => handleFiles(csvInput.files));
['dragenter','dragover'].forEach(evt => dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('drag'); }));
['dragleave','drop'].forEach(evt => dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('drag'); }));
dropZone.addEventListener('drop', (e) => { if(e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

/* ---------- 응답집계 필터 ---------- */
['aggFilterDept','aggFilterDomain','aggFilterRisk','aggFilterTier'].forEach(id => {
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('change', () => {
    aggFilter.dept = document.getElementById('aggFilterDept').value;
    aggFilter.domain = document.getElementById('aggFilterDomain').value;
    aggFilter.risk = document.getElementById('aggFilterRisk').value;
    aggFilter.tier = document.getElementById('aggFilterTier').value;
    renderAggregation();
  });
});
let _aggSearchDebounce = null;
const aggFilterSearchEl = document.getElementById('aggFilterSearch');
if(aggFilterSearchEl) aggFilterSearchEl.addEventListener('input', () => {
  clearTimeout(_aggSearchDebounce);
  _aggSearchDebounce = setTimeout(() => {
    aggFilter.search = aggFilterSearchEl.value;
    renderAggregation();
    const focusEl = document.getElementById('aggFilterSearch');
    if(focusEl) focusEl.focus();
  }, 300);
});
const aggFilterResetBtnEl = document.getElementById('aggFilterResetBtn');
if(aggFilterResetBtnEl) aggFilterResetBtnEl.addEventListener('click', () => {
  aggFilter = {dept:'', domain:'', risk:'', tier:'', search:''};
  renderAggregation();
});
const aggDeptReportBtnEl = document.getElementById('aggDeptReportBtn');
if(aggDeptReportBtnEl) aggDeptReportBtnEl.addEventListener('click', exportDeptAggSummary);

/* ---------- 배포계획 불러오기 (회수율 확인용) ---------- */
export let coveragePlan = null;
document.getElementById('loadCoverageBtn').addEventListener('click', () => document.getElementById('coverageFileInput').click());
document.getElementById('coverageFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      coveragePlan = JSON.parse(ev.target.result);
      document.getElementById('coveragePlanLabel').textContent = '불러온 배포계획: ' + file.name + ' (' + (coveragePlan.savedAt || '').slice(0,10) + ')';
      renderAggregation();
      renderInterviewGuide();
    } catch(err){
      alert('배포계획 파일을 읽을 수 없습니다: ' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
});







/* ===== 📤 부서 전달용 응답 요약본 (HTML) — ③ 응답집계 화면 =====
   설문에 응답해 준 부서에게 "당신들 응답이 이렇게 집계되었다"를 그대로 보여줄 수 있는,
   설문지 쪽 "📊 요약·전체 리뷰 보기"와 같은 인포그래픽 형식의 A4 인쇄용 HTML을 만든다.
   대상은 aggFilterDept와 동일한 기준(전체 부서 / 개별 응답부서명)으로 고른다. */












/* 펼친 상세 내용을 끝까지 읽은 뒤, 위로 스크롤해 올라가지 않고도 바로 닫을 수 있도록
   상세 패널 맨 아래에도 "닫기" 버튼을 넣어준다. 누르면 닫히면서 원래 목록 행 위치로
   자연스럽게 스크롤되어, 다음 항목을 이어서 확인하기 편하게 한다. */










/* ===== 위험가중 종합 성숙도 점수 ===== */
export const RISK_WEIGHT = {"상":3, "중":2, "하":1};
export const TIER_SCORE = {good:100, neutral:50, bad:0}; // na는 집계 제외(응답 불필요 항목이므로)







/* ===== 부서 간 응답 교차검증 ===== */




/* ===== 이전 회차 대비 추이 비교 ===== */






document.addEventListener('change', (e) => {
  if(e.target && e.target.id === 'trendCompareSelect'){
    const resultEl = document.getElementById('trendCompareResult');
    if(!e.target.value){ resultEl.innerHTML = '<div class="assign-empty">비교할 이전 회차를 선택하세요.</div>'; return; }
    const cmp = compareWithRound(e.target.value);
    if(!cmp){ resultEl.innerHTML = '<div class="assign-empty">비교 데이터를 불러올 수 없습니다.</div>'; return; }
    const TIER_LABEL2 = {good:'✅ 이행', neutral:'🟡 부분이행', bad:'🚩 미흡'};
    const delta = (cmp.curScore !== null && cmp.pastScore !== null) ? (cmp.curScore - cmp.pastScore) : null;
    const deltaText = delta === null ? '' : (delta >= 0 ? '▲ +' + delta.toFixed(1) : '▼ ' + delta.toFixed(1));
    const deltaColor = delta === null ? 'var(--ink-soft)' : (delta >= 0 ? 'var(--good)' : 'var(--risk-hi)');
    let html = '<div class="trend-score-row">'
      + '<div class="trend-score-box"><span>이전 (' + esc(cmp.pastLabel) + ')</span><b>' + (cmp.pastScore===null?'-':cmp.pastScore.toFixed(1)) + '점</b></div>'
      + '<div class="trend-arrow">→</div>'
      + '<div class="trend-score-box"><span>이번 회차</span><b>' + (cmp.curScore===null?'-':cmp.curScore.toFixed(1)) + '점</b></div>'
      + '<div class="trend-delta" style="color:' + deltaColor + ';">' + deltaText + '</div>'
    + '</div>';
    if(cmp.changes.length === 0){
      html += '<div class="assign-empty" style="margin-top:10px;">두 회차 사이에 응답이 바뀐 항목이 없습니다.</div>';
    } else {
      html += '<table class="assign-tbl" style="margin-top:12px;"><tr><th>항목코드</th><th>항목명</th><th>이전</th><th></th><th>이번</th><th>변화</th></tr>'
        + cmp.changes.map(c =>
            '<tr><td class="mono">' + esc(c.code) + '</td><td>' + esc(c.title) + '</td>'
            + '<td>' + TIER_LABEL2[c.past] + '</td><td>→</td><td>' + TIER_LABEL2[c.current] + '</td>'
            + '<td>' + (c.direction === 'improved' ? '<span style="color:var(--good);font-weight:700;">🟢 개선</span>' : '<span style="color:var(--risk-hi);font-weight:700;">🔴 악화</span>') + '</td></tr>'
          ).join('')
        + '</table>';
    }
    resultEl.innerHTML = html;
  }
});






const downloadInterviewOverridesBtnEl = document.getElementById('downloadInterviewOverridesBtn');
if(downloadInterviewOverridesBtnEl) downloadInterviewOverridesBtnEl.addEventListener('click', downloadInterviewOverridesCSV);



document.getElementById('downloadAggBtn').addEventListener('click', () => {
  const header = ['수검부서','작성자','작성일','도메인','항목코드','항목명','위험도','관련법령','담당여부','담당부서명','담당자성명','업무숙지도','세부체크포인트','응답','응답성격','비고','자체평가','자체평가근거','제출증빙','원본파일'];
  const lines = [header];
  const rowsForExport = getFilteredAggRows();
  rowsForExport.forEach(r => lines.push([r.dept, r.author, r.date, r.domain, r.code, r.title, r.risk, r.law, r.own, r.ownDept, r.ownPerson, r.fam, r.cptext, r.resp, r.tier, r.note, r.sr, r.srNote, r.evidence, r.file]));
  const csv = lines.map(row => row.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filterSuffix = (aggFilter.dept||aggFilter.domain||aggFilter.risk||aggFilter.tier||aggFilter.search) ? '_필터적용' : '';
  a.href = url; a.download = 'IT감사_응답_통합집계' + filterSuffix + versionSuffix() + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('downloadEvidenceAllBtn').addEventListener('click', () => {
  const EVID_STATUS_LABEL2 = {received_ok:'수령·확인됨(적절)', received_issue:'수령·미흡·보완필요', not_received:'미제출·미수령', '':'미확인'};
  const header = ['부서','항목코드','항목명','위험도','제출예정증빙','인터뷰시증빙확인상태'];
  const lines = [header];
  itemLevelRows(getFilteredAggRows()).filter(r => r.evidence).forEach(r => {
    const ivState = interviewState[r.code];
    lines.push([r.dept, r.code, r.title, r.risk, r.evidence, EVID_STATUS_LABEL2[(ivState && ivState.evidenceStatus) || '']]);
  });
  const csv = lines.map(row => row.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filterSuffix2 = (aggFilter.dept||aggFilter.domain||aggFilter.risk||aggFilter.tier||aggFilter.search) ? '_필터적용' : '';
  a.href = url; a.download = 'IT감사_증빙자료_제출현황' + filterSuffix2 + versionSuffix() + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

/* ---------- 그룹웨어 협조문용 요약표 ---------- */


document.getElementById('buildGroupwareTableBtn').addEventListener('click', () => {
  const html = buildGroupwareTableHtml();
  document.getElementById('groupwareTablePreview').innerHTML = html;
  document.getElementById('copyGroupwareTableBtn').disabled = false;
  document.getElementById('downloadGroupwareTableBtn').disabled = false;
});

document.getElementById('copyGroupwareTableBtn').addEventListener('click', async () => {
  const el = document.getElementById('groupwareTablePreview');
  if(!el.innerHTML.trim()){ alert('먼저 [📋 요약표 생성]을 눌러 표를 만들어 주세요.'); return; }
  try{
    if(navigator.clipboard && window.ClipboardItem){
      const blobHtml = new Blob([el.innerHTML], {type:'text/html'});
      const blobText = new Blob([el.innerText], {type:'text/plain'});
      await navigator.clipboard.write([new ClipboardItem({'text/html': blobHtml, 'text/plain': blobText})]);
      alert('표를 클립보드에 복사했습니다. 그룹웨어 협조문 본문에 [붙여넣기(Ctrl+V)] 해 주세요.');
    } else {
      const range = document.createRange();
      range.selectNode(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.execCommand('copy');
      window.getSelection().removeAllRanges();
      alert('표를 클립보드에 복사했습니다. 그룹웨어 협조문 본문에 [붙여넣기(Ctrl+V)] 해 주세요.');
    }
  }catch(e){
    alert('클립보드 복사에 실패했습니다 (' + e.message + '). 아래 표를 마우스로 드래그해 직접 복사해 주세요.');
  }
});

document.getElementById('downloadGroupwareTableBtn').addEventListener('click', () => {
  const inner = document.getElementById('groupwareTablePreview').innerHTML;
  if(!inner.trim()){ alert('먼저 [📋 요약표 생성]을 눌러 표를 만들어 주세요.'); return; }
  const fullHtml = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>IT감사 응답 요약표</title></head><body>' + inner + '</body></html>';
  const blob = new Blob([fullHtml], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IT감사_응답요약표' + versionSuffix() + '.html';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

/* ---------- Overview tab ---------- */


(function wireOverviewExpandAll(){
  const btn = document.getElementById('overviewExpandAllBtn');
  if(!btn) return;
  let expanded = false;
  btn.addEventListener('click', () => {
    expanded = !expanded;
    document.querySelectorAll('#overviewList .ov-domain').forEach(d => { d.open = expanded; });
    btn.textContent = expanded ? '전체 접기' : '전체 펼치기';
  });
})();

/* [v7.35] 항목 클릭 → 체크포인트·증빙·법령 상세 팝업. DOMAINS에 이미 다 있는 정보를 화면에
   숨겨두지 않고, 카드를 누르는 순간 그 자리에서 바로 보여준다(엑셀을 따로 받지 않아도 됨). */



(function wireOvDetailModal(){
  const list = document.getElementById('overviewList');
  const modal = document.getElementById('ovDetailModal');
  const backdrop = document.getElementById('ovDetailBackdrop');
  const closeBtn = document.getElementById('ovDetailCloseBtn');
  if(list) list.addEventListener('click', (e) => {
    const row = e.target.closest('.ov-item-row');
    if(!row) return;
    showOvDetail(row.dataset.domain, row.dataset.no);
  });
  if(backdrop) backdrop.addEventListener('click', closeOvDetail);
  if(closeBtn) closeBtn.addEventListener('click', closeOvDetail);
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && modal && modal.classList.contains('show')) closeOvDetail();
  });
})();


document.getElementById('downloadFullChecklistXlsxBtn').addEventListener('click', downloadFullChecklistXlsx);


/* ---------- Interview guide (flowchart), driven by aggRows from tab (2) ---------- */


// [v8.27] 🤖 AI 응답 반영 배지 — 2026-09-06 도메인 01~24(202개 항목) 인터뷰 백업(AI 프롬프트 제작기로 받은 응답)을
// INTERVIEW_SCRIPTS/AI_FLOW_DEFAULTS 기본값에 직접 하드코딩하면서, scriptOverrides(로컬 편집 레이어)를 거치지
// 않아 기존 "✏ 감사역 편집됨" 배지로는 구분이 안 되는 문제가 있었다. 이 배지는 그 대신 "이 항목은 AI가 생성한
// 맞춤 응답이 기본값으로 반영되어 있다"는 사실만 표시하며, scriptOverrides 유무와 무관하게 항상 뜬다.
const AI_RESPONSE_CODES = ["01-1", "01-2", "01-3", "01-4", "01-5", "01-6", "01-7", "01-8", "02-1", "02-2", "02-3", "02-4", "02-5", "02-6", "03-1", "03-2", "03-3", "03-4", "03-5", "03-6", "03-7", "04-1", "04-2", "04-3", "04-4", "04-5", "04-6", "05-1", "05-2", "05-3", "05-4", "05-5", "05-6", "05-7", "06-1", "06-2", "06-3", "06-4", "06-5", "06-6", "06-7", "06-8", "06-9", "07-1", "07-2", "07-3", "07-4", "07-5", "07-6", "07-7", "08-1", "08-10", "08-2", "08-3", "08-4", "08-5", "08-6", "08-7", "08-8", "08-9", "09-1", "09-2", "09-3", "09-4", "09-5", "09-6", "09-7", "10-1", "10-2", "10-3", "10-4", "10-5", "10-6", "10-7", "10-8", "11-1", "11-10", "11-2", "11-3", "11-4", "11-5", "11-6", "11-7", "11-8", "11-9", "12-1", "12-2", "12-3", "12-4", "12-5", "12-6", "12-7", "12-8", "13-1", "13-2", "13-3", "13-4", "13-5", "13-6", "13-7", "13-8", "13-9", "14-1", "14-2", "14-3", "14-4", "14-5", "14-6", "14-7", "15-1", "15-2", "15-3", "15-4", "15-5", "15-6", "15-7", "15-8", "16-1", "16-2", "16-3", "16-4", "16-5", "16-6", "16-7", "16-8", "17-1", "17-2", "17-3", "17-4", "17-5", "17-6", "17-7", "17-8", "18-1", "18-2", "18-3", "18-4", "18-5", "18-6", "18-7", "18-8", "19-1", "19-2", "19-3", "19-4", "19-5", "19-6", "19-7", "19-8", "19-9", "20-1", "20-2", "20-3", "20-4", "20-5", "20-6", "20-7", "21-1", "21-10", "21-11", "21-12", "21-2", "21-3", "21-4", "21-5", "21-6", "21-7", "21-8", "21-9", "22-1", "22-10", "22-2", "22-3", "22-4", "22-5", "22-6", "22-7", "22-8", "22-9", "23-1", "23-10", "23-11", "23-2", "23-3", "23-4", "23-5", "23-6", "23-7", "23-8", "23-9", "24-1", "24-10", "24-11", "24-12", "24-2", "24-3", "24-4", "24-5", "24-6", "24-7", "24-8", "24-9", "26-1", "26-10", "26-11", "26-12", "26-13", "26-14", "26-15", "26-16", "26-17", "26-18", "26-19", "26-2", "26-20", "26-3", "26-4", "26-5", "26-6", "26-7", "26-8", "26-9"];
AI_RESPONSE_CODES.forEach(function(code){ if(INTERVIEW_SCRIPTS[code]) INTERVIEW_SCRIPTS[code]._aiApplied = true; });
export const INTERVIEW_ITEM_META = {}; // code -> {title, law} filled lazily from DOMAINS
export const INTERVIEW_STATE_STORAGE_KEY = 'itaudit_interview_state_v1';


export const interviewState = loadInterviewState(); // code -> {done:boolean, note:string, interviewee, interviewedAt, location}

/* ===== 체크리스트 외 별도 인터뷰 항목 ===== */
export const CUSTOM_INTERVIEW_STORAGE_KEY = 'itaudit_custom_interview_v1';


export let customInterviewItems = loadCustomInterviewItems();
export function setCustomInterviewItems(v){ customInterviewItems = v; }
 // [{id, title, background, questions:[...], createdAt}]























export const INTERVIEW_SCRIPT_OVERRIDE_KEY = 'itaudit_interview_script_overrides_v1';
// [v8.49] scriptOverrides를 OverrideStore 클래스로 캡슐화 (src/core/stores.js).
// scriptOverrides는 scriptStore.data와 "완전히 같은 객체"를 가리키므로, 아래처럼 기존 코드가
// scriptOverrides를 직접 mutate하던 방식(scriptOverrides[code]=..., delete scriptOverrides[k] 등)은
// 전부 그대로 동작한다. loadScriptOverrides/saveScriptOverrides 함수명도 하위 호환을 위해 유지.
export const scriptStore = new OverrideStore(INTERVIEW_SCRIPT_OVERRIDE_KEY, '인터뷰 질문 편집');


export let scriptOverrides = scriptStore.data;

// [v8.12] 🗺 순서도·분기형 편집 — INTERVIEW_SCRIPTS(기본 4갈래 질문)/scriptOverrides와 같은 관계로,
// AI_FLOW_DEFAULTS(앱이 미리 갖춘 정교한 분기 시나리오, 기존 IGW_CUSTOM_NODES를 대체)가 기본값이고
// flowOverrides가 그 위에 감사역이 직접 편집한 내용을 얹는 사용자 레이어다. 항목 하나당 값의
// 형태(= "flow spec")는 { steps:[{q, label1, label2, guide, downLabel, fails:[{label,title,sub,text}],
// holdLabel}], goodText, holdEnd:{title,text}|null } — buildNodesFromFlowSpec()가 이를 실제
// 순서도 렌더러가 읽는 nodes 형태로 변환한다.
export const INTERVIEW_FLOW_OVERRIDE_KEY = 'itaudit_interview_flow_overrides_v1';
// [v8.49] flowOverrides도 scriptOverrides와 동일한 방식으로 OverrideStore 캡슐화.
export const flowStore = new OverrideStore(INTERVIEW_FLOW_OVERRIDE_KEY, '순서도·분기형 편집');


export let flowOverrides = flowStore.data;

// [v8.44] 🤖 AI 프롬프트 제작기 — "사실·우려사항 없이 일반형으로 돌린 항목" 추적.
// 감사역이 체크리스트 신설 직후에는 아직 파악한 사실·우려사항이 없어 일단 일반형 프롬프트로
// AI 응답을 받아두는 경우가 많은데, 나중에 실제 사실관계를 알게 되어 다시 돌릴 때 "이 항목은
// 아직 일반형이라 다시 돌릴 실효성이 있다"를 구분할 방법이 없었다. AI 프롬프트 제작기 팝업에서
// "가져오기"를 누른 시점에 그 팝업의 사실·우려사항 칸(contextBox)이 비어 있었는지를 항목코드별로
// 기록해 둔다 — 이후 사실·우려사항을 채워 다시 가져오면 자동으로 이 표시에서 빠진다.
export const AI_NO_CONTEXT_KEY = 'itaudit_ai_no_context_codes_v1';


export let aiNoContextCodes = loadAiNoContextCodes();

/* ===== [v8.25] 🎤 인터뷰 가이드 전체 백업/복원 — ①질문 편집(scriptOverrides) + ②순서도·분기형 편집(flowOverrides)을
   하나의 파일로 묶어 다룬다. "⚙ 데이터 관리"의 개별 모듈 백업(scriptOverrides만/flowOverrides만)과 별개로,
   AI 프롬프트 제작기로 채운 내용을 포함해 ①②를 통째로 넘기고 싶을 때(예: 다른 감사역 공유, 개발 담당에게
   "이 내용을 소스에 하드코딩해 달라"고 전달)를 위한 것이다. */




/* ===== 발견사항 관리 ===== */
const FINDINGS_STORAGE_KEY = 'itaudit_findings_v1';
export function loadFindings(){ try{ return JSON.parse(localStorage.getItem(FINDINGS_STORAGE_KEY) || '[]'); }catch(e){ return []; } }
export function saveFindings(){ try{ localStorage.setItem(FINDINGS_STORAGE_KEY, JSON.stringify(findings)); }catch(e){ alert('발견사항 저장 실패: ' + e.message); } }
export let findings = loadFindings(); // [{id, code, title, description, riskLevel, department, recommendation, status, createdAt}]
// 현재 [findingEditForm]에 열려서 편집 중인 발견사항의 id. 후보 등록/목록 수정/인터뷰 화면에서
// 발견사항 편집을 여는 모든 진입점이 이 값을 기준으로 "이미 다른 항목을 편집 중인지" 판단해,
// 저장하지 않은 내용을 조용히 덮어쓰거나 사라지게 하지 않도록 한다.

// 인터뷰 일정 관리 — (부서|||작성자) 키별로 {datetime, place, status, memo} 저장.
// 응답집계에서 식별된 인터뷰 대상자에 날짜·장소를 지정해 감사기간 중 일정을 조율하고,
// 부서 공유·감사역 지참용으로 별도 일정표(인쇄용)를 내보낼 수 있다.
export const INTERVIEW_SCHEDULE_KEY = 'itaudit_interview_schedule_v1';
export let interviewSchedule = {};
try{ interviewSchedule = JSON.parse(localStorage.getItem(INTERVIEW_SCHEDULE_KEY)) || {}; }catch(e){ interviewSchedule = {}; }




/* ===== 감사자별 배정 패키지 — 여러 감사역이 이 도구를 함께 쓸 때, 각자 몫만 내보내고 불러오는 방법 =====
   서버 없이 파일 하나로 동작하는 도구라 실시간 공동작업은 불가능하지만, "총괄 감사역이 배정 → 각자
   내보내서 전달 → 배정받은 감사역이 자신의 도구에서 불러오기 → 작업 후 발견사항/인터뷰기록을 평소처럼
   내보내 총괄에게 전달"하는 흐름으로 여러 명이 나눠 작업할 수 있다. */



const apImportFileInputEl = document.getElementById('apImportFileInput');
if(apImportFileInputEl) apImportFileInputEl.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if(!file) return;
  try{
    const text = await readFileAsTextP(file);
    const parsed = JSON.parse(text);
    if(!parsed.__assignmentPackage){ alert('배정 패키지 형식이 아닙니다. "📦 이 감사자 몫 내보내기"로 만든 파일을 선택해 주세요.'); return; }
    ingestAssignmentPackage(parsed);
  }catch(err){
    alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
  }
  e.target.value = '';
});

/* ===== 인터뷰 일정 달력 뷰 (표 대신 월별 그리드로 한눈에 보기) ===== */
export let _imCalYear = null, _imCalMonth = null;
export function setImCalMonth(v){ _imCalMonth = v; }
export function setImCalYear(v){ _imCalYear = v; }
 // null이면 오늘이 속한 달로 초기화





/* ===== 인터뷰 일정 안내 메시지 (협의/확정/예정) — 대상자별 조율 참고사항·현재 일정을 반영 ===== */


document.addEventListener('change', (e) => {
  if(e.target && (e.target.id === 'imTemplateTarget' || e.target.id === 'imTemplateKind')) refreshInterviewMsgPreview();
});
document.addEventListener('click', (e) => {
  if(e.target && e.target.id === 'imTemplateCopyBtn'){
    const preview = document.getElementById('imTemplatePreview');
    if(!preview || !preview.value.trim()){ alert('먼저 위에서 대상자를 선택해 주세요.'); return; }
    preview.select();
    try{
      navigator.clipboard.writeText(preview.value).then(() => alert('문구를 클립보드에 복사했습니다.'));
    }catch(err){
      document.execCommand('copy');
      alert('문구를 클립보드에 복사했습니다.');
    }
  }
});





// 감사결과 구분(통보용) 유형 — 실제 감사원/내부감사 실무에서 쓰이는 지적·위규·개선·권고·주의·
// 현장개선·모범사례 등 폭넓은 분류를 참고해 확장. 한 곳에서만 정의하고 select 옵션·집계·통보문구
// 등 모든 곳에서 이 값을 그대로 참조해, 유형을 추가/수정할 때 여러 곳을 따로 고치지 않아도 된다.
export const FINDING_TYPES = ['지적', '위규', '개선', '권고', '현장개선', '주의', '모범사례'];
export const FINDING_TYPE_META = {
  '지적':     {icon:'🚩', short:'지적',     full:'지적사항',            desc:'규정·지침 위반은 아니나 통제상 결함이 확인되어 시정이 필요한 사항', bg:'#f7e6e2', fg:'#a23b2e'},
  '위규':     {icon:'⛔', short:'위규',     full:'위규사항',            desc:'관련 법령·규정·지침을 위반한 것으로 확인된 사항', bg:'#f7e6e2', fg:'#a23b2e'},
  '개선':     {icon:'🛠', short:'개선',     full:'개선요청사항',         desc:'현재 심각한 결함은 아니나 효율성·안정성 제고를 위해 개선이 필요한 사항', bg:'#f7edd9', fg:'#b8863b'},
  '권고':     {icon:'💡', short:'권고',     full:'권고사항',            desc:'의무 사항은 아니며, 향후 참고할 만한 개선 방향을 제안하는 사항', bg:'#f7edd9', fg:'#b8863b'},
  '현장개선': {icon:'⚡', short:'현장개선', full:'현장개선(즉시시정) 사항', desc:'감사 중 그 자리에서 바로 시정이 이루어진 경미한 사항', bg:'#f7edd9', fg:'#b8863b'},
  '주의':     {icon:'📝', short:'주의',     full:'주의사항',            desc:'문제는 아니나 향후 유의가 필요해 참고로 남기는 사항', bg:'#f7edd9', fg:'#b8863b'},
  '모범사례': {icon:'🌟', short:'모범사례', full:'모범사례(우수사례)',    desc:'다른 부서에서도 참고할 만한 우수한 운영 사례', bg:'#e5f2ea', fg:'#2e7d5b'}
};


/* 발견사항 편집 폼이 있는 위치로 스크롤 이동시키고 잠깐 테두리를 반짝여, "지금 여기서 편집 중"임을
   눈에 띄게 알려준다. (제목만 보고는 어떤 항목을 고치는지 알기 어렵다는 지적 + 다른 항목 수정 버튼을
   눌러도 이미 열려 있던 폼이 화면 밖에 있어 "반응이 없다"고 느껴지는 문제에 대응) */

/* 발견사항 편집 폼을 여는 모든 진입점(목록 수정·후보 등록·인터뷰에서 등록·자유 등록)이
   이 함수를 거치게 해, "이미 다른 항목을 저장하지 않고 편집 중인 상태에서 또 다른 항목을 열면
   조용히 내용이 바뀌어 버리는" 문제를 막는다. */


/* ===== 발견사항 시행문(통보서) 출력 — IPPF 감사 커뮤니케이션(종료회의 등) 산출물 ===== */




/* ===== 종합 감사결과보고서 (여러 발견사항을 위험도·부서별로 묶은 A4 인쇄용 보고서) ===== */




/* ===== 그룹웨어 발송용 감사결과 통보 문구 (부서별·상황별 자동 생성) ===== */






async function copyGwTemplate(){
  const preview = document.getElementById('gwTemplatePreview');
  if(!preview || !preview.value.trim()){ alert('먼저 대상 부서를 선택해 문구를 만들어 주세요.'); return; }
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(preview.value);
    } else {
      preview.select();
      document.execCommand('copy');
    }
    alert('문구를 클립보드에 복사했습니다. 그룹웨어 문서에 붙여넣기(Ctrl+V) 해 주세요.');
  }catch(e){
    preview.select();
    alert('클립보드 복사에 실패했습니다. 텍스트가 선택되어 있으니 Ctrl+C로 직접 복사해 주세요.');
  }
}







/* 🎤 인터뷰 가이드 카드에서 "🚩 발견사항으로 등록"을 눌렀을 때 — 인터뷰 중(또는 종료 후) 확인된
   결함을 그 자리에서 바로 정식 발견사항 등록 화면으로 넘긴다. 지금까지는 이 항목이 "원인규명형(NO)"
   으로 분류되어야만 📋 발견사항 관리 탭의 후보 목록에 자동으로 뜨거나, "전체 항목 보기"를 켜서 직접
   찾아야 등록할 수 있었는데, 인터뷰 카드에서 바로 이 버튼으로 등록을 시작할 수 있게 한다. */


export let findingsStatusFilterValue = '';




/* ===== 데이터 현황 · 초기화 ===== */
export const STORAGE_ITEMS = [
  { key: RECIPIENT_STORAGE_KEY, label: '수검자 명부', group: 'audit',
    clear: () => { saveRecipients([]); renderRecipientsTable(); renderDistRecipientChecks(); } },
  { key: DISTRIBUTION_STORAGE_KEY, label: '배포 기록', group: 'audit',
    clear: () => { saveDistributions([]); renderDistributionList(); renderCommDistSelect(); } },
  { key: ROUND_STORAGE_KEY, label: '설문 회차 이력 (응답 취합본)', group: 'response',
    clear: () => { saveRoundsToStorage([]); if(typeof renderRoundHistory === 'function') renderRoundHistory(); } },
  { key: COMM_TEMPLATE_STORAGE_KEY, label: '메시지 템플릿 편집(직접 수정한 문구)', group: 'audit',
    clear: () => { try{ localStorage.removeItem(COMM_TEMPLATE_STORAGE_KEY); }catch(e){} if(typeof renderCommTemplateTypeOptions === 'function') renderCommTemplateTypeOptions(); } },
  { key: INTERVIEW_STATE_STORAGE_KEY, label: '인터뷰 기록(면담자·메모·증빙확인 등)', group: 'audit',
    clear: () => { Object.keys(interviewState).forEach(k => delete interviewState[k]); saveInterviewState(); if(typeof renderInterviewGuide === 'function') renderInterviewGuide(); } },
  { key: INTERVIEW_SCRIPT_OVERRIDE_KEY, label: '인터뷰 질문 편집(감사역이 수정한 질문)', group: 'audit',
    clear: () => { Object.keys(scriptOverrides).forEach(k => delete scriptOverrides[k]); saveScriptOverrides(); if(typeof renderInterviewGuide === 'function') renderInterviewGuide(); } },
  { key: INTERVIEW_FLOW_OVERRIDE_KEY, label: '인터뷰 순서도·분기형 편집(감사역이 짠 분기 시나리오)', group: 'audit',
    clear: () => { Object.keys(flowOverrides).forEach(k => delete flowOverrides[k]); saveFlowOverrides(); if(typeof renderInterviewGuide === 'function') renderInterviewGuide(); } },
  { key: CUSTOM_INTERVIEW_STORAGE_KEY, label: '체크리스트 외 별도 인터뷰 항목', group: 'audit',
    clear: () => { customInterviewItems.length = 0; saveCustomInterviewItems(); if(typeof renderCustomInterviewSection === 'function') renderCustomInterviewSection(); } },
  { key: FINDINGS_STORAGE_KEY, label: '발견사항 관리', group: 'audit',
    clear: () => { findings.length = 0; saveFindings(); if(typeof renderFindingsTab === 'function') renderFindingsTab(); } },
  { key: 'itaudit_kanban_v1', label: '🗂 칸반보드 (감사 항목 진행현황)', group: 'audit',
    clear: () => { saveKanbanCards([]); if(typeof renderKanbanBoard === 'function') renderKanbanBoard(); } },
  { key: 'itaudit_kanban_archive_v1', label: '🗄 칸반 보관함 (삭제된 카드 이력)', group: 'audit',
    clear: () => { saveKanbanArchive([]); if(typeof renderKanbanBoard === 'function') renderKanbanBoard(); } },
  { key: 'itaudit_report_log_v1', label: '📜 보고서 생성 이력', group: 'audit',
    clear: () => { saveReportLog([]); if(typeof renderReportLog === 'function') renderReportLog(); } },
  { key: INTERVIEW_SCHEDULE_KEY, label: '인터뷰 일정(날짜·장소·진행상태)', group: 'audit',
    clear: () => { Object.keys(interviewSchedule).forEach(k => delete interviewSchedule[k]); saveInterviewSchedule(); const el = document.getElementById('interviewScheduleTable'); if(el) el.innerHTML = ''; } },
  { key: CURRENT_AUDITOR_STORAGE_KEY, label: '현재 작업자 설정', group: 'audit',
    clear: () => { setCurrentAuditor(''); if(typeof refreshCurrentAuditorUI === 'function') refreshCurrentAuditorUI(); const el = document.getElementById('currentAuditorInput'); if(el) el.value = ''; } },
  { key: AUDITOR_LIST_STORAGE_KEY, label: '알려진 감사자 목록(자동완성용)', group: 'audit',
    clear: () => { try{ localStorage.removeItem(AUDITOR_LIST_STORAGE_KEY); }catch(e){} if(typeof renderAuditorDatalist === 'function') renderAuditorDatalist(); } },
  { key: ZOOM_STORAGE_KEY, label: '화면 확대/축소 설정', group: 'audit',
    clear: () => { if(typeof applyZoomLevel === 'function') applyZoomLevel(100); } },
];





document.getElementById('fullResetBtn').addEventListener('click', () => {
  const totalCount = STORAGE_ITEMS.reduce((s,item) => s + getStorageItemCount(item.key), 0);
  if(!confirm('⚠ 전체 초기화\n\n이 브라우저에 저장된 모든 데이터(현재 ' + totalCount + '건)를 지우고, 이 파일을 처음 열었을 때 상태로 되돌립니다.\n\n필요하면 [취소]를 누르고 먼저 위에서 백업하세요.\n\n정말 계속할까요?')) return;
  if(!confirm('다시 한 번 확인합니다 — 되돌릴 수 없습니다. 정말 전체 초기화할까요?')) return;
  STORAGE_ITEMS.forEach(item => { try{ localStorage.removeItem(item.key); }catch(e){} });
  alert('전체 초기화가 완료되었습니다. 확인을 누르면 새로고침됩니다.');
  location.reload();
});



// [v8.29] 방어적 정규화 — verify/partial/rootcause/na는 igStepsHtml()이 항상 .map()으로 순회하는
// 배열이어야 하는데, 예전에 브라우저 localStorage(scriptOverrides)에 저장된 편집 데이터 중 일부가
// 배열이 아니라 {naQ, naEnd} 같은 객체 형태로 잘못 저장되어 있으면 igGetScript()가 이를 그대로
// 병합해 넘겨서 화면 전체가 "list.map is not a function" 오류로 멈추는 문제가 있었다.
// INTERVIEW_SCRIPTS 기본값 자체는 이미 배열로 교정했지만, scriptOverrides에 남아있는 과거의
// 손상된 값까지 안전하게 흡수할 수 있도록 병합 직후 한 번 더 형태를 강제 정규화한다.








// [v8.36] 팀 선택 드롭다운을 바꿨을 때, 전체 카드 목록을 다시 그리면(스크롤 위치·펼침 상태가
// 날아가) 불편하므로 이 카드 하나만 새로 그려서 자리를 바꿔치기한다.
// [v8.39] "인터뷰 대상자별"·"담당 감사역순" 그룹에서는 같은 항목이 여러 사람 그룹에 중복으로
// 나타날 수 있어, 코드만으로 document.querySelector하면 항상 첫 번째(다른 사람 쪽) 카드를
// 바꿔치기하게 되는 버그가 있었다 — selEl.closest('.ig-card')로 "지금 이 드롭다운이 속한 바로 그
// 카드"만 찾아 바꿔치기한다.


// [v8.38] 응답 부서가 2개 이상인 항목은 인터뷰 메모·면담자·진행 감사자·일시·장소·증빙확인상태도
// 팀마다 따로 관리해야 한다 — 지금까지는 이 필드들이 항목(코드) 하나에 공용으로 저장되어 있어서,
// A팀 인터뷰를 마치고 메모를 적은 뒤 팀을 B로 바꿔도 "그 A팀 메모가 그대로" 보이는 게 문제였다.
// (완료 체크박스는 이미 v8.34에서 deptDone으로 팀별 분리를 해뒀음 — 같은 방식을 나머지 필드에도 적용)


















export const IG_TIER_ICON = {good:'✅', neutral:'🟡', bad:'🚩', na:'⬜'};
export const IG_TIER_LABEL = {good:'이행', neutral:'부분이행', bad:'미흡', na:'해당없음'};







/* v6.76 — 인터뷰 가이드 화면이 "너무 복잡하다"는 지적에 따라, 항목 카드를 기본은 접힌
   요약(제목·집계·핵심 버튼)만 보이게 하고, 실제로 그 항목을 인터뷰할 때만 펼쳐서
   질문·4분기·기록칸이 나오도록 구조를 바꿨다. 펼침 상태는 코드 단위로 메모리에 기억해 두어
   (칸반 전송·질문편집 저장처럼 화면 전체를 다시 그리는 동작 이후에도) 펼쳐둔 카드가
   갑자기 다시 접히지 않게 한다. 새로고침하면 초기화된다(늘 접힌 목록에서 시작). */
export let igExpandedCodes = new Set();
// [v8.36] 담당팀이 2개 이상인 항목(공통 항목)에서 각 팀 응답을 뭉뚱그려 보여주면, 어느 팀이 어떻게
// 답했는지 구분이 안 되고 인터뷰도 어느 팀 기준으로 진행해야 할지 헷갈린다는 지적에 대응.
// 카드마다 "이 팀 기준으로 보기" 선택을 기억해두고(항목코드 -> 부서명), 그 팀의 응답만 반영해
// 질문 분기·집계를 다시 계산한다(새로고침 전까지 세션 내에서 유지).
export let igCardDeptView = {};
/* 분기(YES/부분/NO/N-A)도 기본은 실제 응답 결과가 가리키는 분기 하나만 보여주고,
   "다른 분기도 보기"를 눌러야 4갈래 전체가 나오도록 했다 — 응답 데이터가 아직 없어
   추천할 분기가 없는 항목(rec==='unknown')은 처음부터 4갈래를 그대로 보여준다. */
export let igForkExpandedCodes = new Set();

/* ============================================================
   v7.47 — "순서도(마름모 Yes/No)"·"분기형(예/아니오/보류 체험)" 새창 기능.
   기존 ①기존형(카드) 화면은 전혀 건드리지 않고, 같은 데이터(INTERVIEW_SCRIPTS)를
   읽어 별도 창에 ②③ 보기를 추가로 제공한다. 실제 응답 집계(rec)도 그대로 반영한다.
   ============================================================ */
/* [v8.12] AI_FLOW_DEFAULTS — 예전 IGW_CUSTOM_NODES(순서도 노드를 q1/f_xxx 키로 직접 손으로 짠 형태)를
   대체한다. INTERVIEW_SCRIPTS(4갈래 텍스트 기본값)/scriptOverrides와 완전히 같은 관계로,
   여기 담긴 값은 "감사역이 편집 UI로 짠 것과 동일한 형태(flow spec)"의 기본 제공 시나리오이고,
   실제로 화면에 그려질 nodes 형태로 바꾸는 일은 buildNodesFromFlowSpec()가 전담한다. 이렇게
   분리해 둔 이유는, 새로 만드는 "🗺 순서도 편집" UI가 편집한 결과(flowOverrides)와 여기 기본값이
   정확히 같은 스키마를 쓰도록 해서 — 어느 항목이든 편집 화면에서 그대로 이어받아 고칠 수 있다.

   flow spec 스키마:
   { steps: [ { q, label1, label2, guide, downLabel,
                fails: [ {label, title, sub, text}, ... ],   // "아니오(정상 아님)"로 빠질 때 시나리오, 여러 개 가능
                holdLabel: string|null } ],                   // 이 질문에 "보류(자료 확보 — 정밀검토)" 옵션을 추가
     goodText,
     holdEnd: {title, text}|null }                            // steps 중 하나라도 holdLabel이 있으면 필요 */


/* flow spec(steps/goodText/holdEnd) → 실제 순서도·분기형 렌더러가 읽는 nodes 형태로 변환.
   각 질문(step)은 q1, q2 ... 순서로 이어지고, 마지막 질문의 "예"가 good으로 연결된다.
   실패 시나리오(fails)는 질문마다 몇 개든 둘 수 있고, 각각 별도의 결함 박스(end:'bad')가 된다.
   holdLabel이 있는 질문에서 "보류"를 고르면 — 마지막 질문이면 공용 hold_end 박스로 끝나고,
   중간 질문이면 다음 질문으로 그대로 이어지되(질문 자체는 안 끝남) 체험 화면 하단에
   "정밀검토 예정 항목" 메모로 남는다(원본 popup 스크립트의 기존 동작 그대로). */


// 아직 전용 flow spec이 없는 항목(대다수)의 편집기를 열었을 때, 빈 화면 대신 기존 검증형(verify)
// 질문들을 출발점으로 미리 채워준다 — scriptOverrides 편집 폼이 base 위에서 시작하는 것과 같은 방식.



/* ===== [v8.15] 🗺 순서도·분기형 엑셀 대량 편집 =====
   항목 하나씩 새 창을 열어 고치는 방식은 25~200개 항목에 "AI 논리가 반영된" 콘텐츠를
   한꺼번에 채워 넣어야 하는 작업(감사역이 직접 대량 저작하거나 검토하는 경우)에는 느리다.
   그래서 전 항목의 flow spec을 엑셀 두 시트(질문/결함시나리오)로 내보내고, 엑셀에서 자유롭게
   고친 뒤 다시 올리면 항목코드가 일치하는 항목만 한 번에 반영되도록 했다. 항목별 새 창 편집은
   빠른 수정을 위해 그대로 남겨둔다(둘 다 flowOverrides라는 같은 저장소를 쓰므로 서로 어긋나지 않음). */




/* ===== [v8.18] 🤖 AI 프롬프트 제작기 — 새 감사영역·체크리스트를 추가한 뒤, 그 항목들의
   인터뷰 가이드(①기존형·②순서도) 콘텐츠를 "어떤 AI에게든" 만들어 달라고 요청할 수 있는
   프롬프트를 생성한다. 체크리스트 자체의 업로드는 기존 엑셀 업로드 방식을 그대로 쓰고,
   여기서는 그 체크리스트를 바탕으로 인터뷰 콘텐츠만 채운다. 클로드는 엑셀 파일을 잘
   만들어 주지만 다른 AI는 그렇지 않은 경우가 많아, 어떤 채팅 UI의 AI라도 텍스트로
   그대로 출력할 수 있는 JSON을 주고받는 형식으로 설계했다(엑셀 왕복은 ②순서도 전용
   기능(v8.15)을 그대로 쓰면 된다). */


/* AI가 되돌려준 JSON 텍스트를 파싱해 scriptOverrides(①)·flowOverrides(②)에 병합한다.
   팝업 창(igOpenAiToolsWindow)이 window.opener.handleAiJsonImportText(text)로 직접 호출한다 —
   팝업과 메인 문서가 같은 출처(file://)라 가능한, 기존 popup notifyOpener 콜백과 같은 방식. */


// [v8.31] 🤖 AI 프롬프트 제작기 — 도메인 전체가 아니라 그 안의 항목 하나만 골라서 프롬프트를
// 만들고 싶다는 요청에 따라 신설. 도메인 선택 옆에 항목 선택 드롭다운을 두고, "전체 항목"을
// 고르면 지금까지처럼 도메인 전체가, 특정 항목을 고르면 그 항목 하나만 대상이 된다.




/* ===== [v8.12] 🗺 순서도·분기형 편집 UI =====
   ②순서도·③분기형 화면은 지금까지 코드(AI_FLOW_DEFAULTS)를 고치는 것 말고는 손볼 방법이 없었다
   ("✏ 질문 편집"은 ①기존형의 4갈래 텍스트만 건드릴 뿐, 커스텀 분기 노드는 전혀 건드리지 못했다).
   이 패널은 그 공백을 메운다 — igfEditState는 지금 편집 중인 항목의 flow spec을 담는 임시
   버퍼이고(카드가 다시 그려져도 살아있음), igfOpenCodes는 어느 카드의 패널이 열려 있는지 기록한다. */
export let igfEditState = {};
export let igfOpenCodes = new Set();























/* 팝업 안에서 실행될 buildFlowchartHTML의 몸체를 문자열로 별도 보관 — 메인 앱의
   igwBuildFlowchartHTML과 로직은 동일하되, 팝업은 독립 문서라 별도 함수로 주입해야 한다. */
export const IGW_FLOWCHART_JS_BODY = 'const chain=[];let curKey="q1";while(true){const n=nodes[curKey];if(!n)break;if(n.end){chain.push({key:curKey,node:n,isEnd:true});break;}chain.push({key:curKey,node:n,isEnd:false});const d=n.options.find(o=>o.flow==="down");if(!d)break;curKey=d.next;}const rowH=128,cx=280,sideX=520,startY=76,hw=88,hh=38;let parts=[];let maxY=startY;function lines(arr){return arr.map((l,i)=>"<tspan x=\\""+cx+"\\" dy=\\""+(i===0?0:14)+"\\">"+l+"</tspan>").join("");}function linesAt(arr,x){return arr.map((l,i)=>"<tspan x=\\""+x+"\\" dy=\\""+(i===0?0:14)+"\\">"+l+"</tspan>").join("");}function diamond(cy,label){return "<polygon points=\\""+cx+","+(cy-hh)+" "+(cx+hw)+","+cy+" "+cx+","+(cy+hh)+" "+(cx-hw)+","+cy+"\\" fill=\\"#FAFAF8\\" stroke=\\"#333\\" stroke-width=\\"1.2\\"/>"+"<text y=\\""+(cy-3)+"\\" text-anchor=\\"middle\\" font-size=\\"10.5\\" font-weight=\\"600\\">"+lines(label)+"</text>";}function box(cyy,w,h,label,kind){const colors={bad:["#FAECE7","#993C1D","#4A1B0C"],hold:["#E6F1FB","#1B5A8A","#042C53"],good:["#E1F5EE","#0F6E56","#04342C"]};const c=colors[kind]||colors.bad;return "<rect x=\\""+(sideX-w/2)+"\\" y=\\""+(cyy-h/2)+"\\" width=\\""+w+"\\" height=\\""+h+"\\" rx=\\"8\\" fill=\\""+c[0]+"\\" stroke=\\""+c[1]+"\\" stroke-width=\\"1.1\\"/>"+"<text x=\\""+sideX+"\\" y=\\""+(cyy-2)+"\\" text-anchor=\\"middle\\" font-size=\\"10.5\\" font-weight=\\"700\\" fill=\\""+c[2]+"\\">"+linesAt(label,sideX)+"</text>";}function goodbox(cyy,w,h,label,kind){const colors={bad:["#FAECE7","#993C1D","#4A1B0C"],hold:["#E6F1FB","#1B5A8A","#042C53"],good:["#E1F5EE","#0F6E56","#04342C"]};const c=colors[kind]||colors.good;return "<rect x=\\""+(cx-w/2)+"\\" y=\\""+(cyy-h/2)+"\\" width=\\""+w+"\\" height=\\""+h+"\\" rx=\\"8\\" fill=\\""+c[0]+"\\" stroke=\\""+c[1]+"\\" stroke-width=\\"1.1\\"/>"+"<text x=\\""+cx+"\\" y=\\""+(cyy-2)+"\\" text-anchor=\\"middle\\" font-size=\\"10.5\\" font-weight=\\"700\\" fill=\\""+c[2]+"\\">"+lines(label)+"</text>";}function arrowV(y1,y2){return "<line x1=\\""+cx+"\\" y1=\\""+y1+"\\" x2=\\""+cx+"\\" y2=\\""+y2+"\\" stroke=\\"#555\\" stroke-width=\\"1.5\\" marker-end=\\"url(#igwArrow)\\"/>"+"<text x=\\""+(cx+9)+"\\" y=\\""+((y1+y2)/2)+"\\" font-size=\\"10.5\\" fill=\\"#0F6E56\\" font-weight=\\"600\\">예</text>";}function arrowH(x1,y){return "<line x1=\\""+x1+"\\" y1=\\""+y+"\\" x2=\\""+(sideX-60)+"\\" y2=\\""+y+"\\" stroke=\\"#993C1D\\" stroke-width=\\"1.5\\" marker-end=\\"url(#igwArrow)\\"/>"+"<text x=\\""+((x1+sideX-60)/2-12)+"\\" y=\\""+(y-5)+"\\" font-size=\\"10\\" fill=\\"#993C1D\\" font-weight=\\"600\\">아니오</text>";}function arrowDash(x1,y1,y2){return "<line x1=\\""+x1+"\\" y1=\\""+y1+"\\" x2=\\""+(sideX-60)+"\\" y2=\\""+y2+"\\" stroke=\\"#1B5A8A\\" stroke-width=\\"1.5\\" stroke-dasharray=\\"4 3\\" marker-end=\\"url(#igwArrow)\\"/>"+"<text x=\\""+((x1+sideX-60)/2)+"\\" y=\\""+((y1+y2)/2-5)+"\\" font-size=\\"10\\" fill=\\"#1B5A8A\\" font-weight=\\"600\\">보류</text>";}chain.forEach((item,i)=>{if(item.isEnd)return;const cy=startY+i*rowH;maxY=Math.max(maxY,cy);const n=item.node;parts.push(diamond(cy,n.flowLabel));const nextCy=startY+(i+1)*rowH;parts.push(arrowV(cy+hh,nextCy-hh));const sideOpts=n.options.filter(o=>o.flow==="side");sideOpts.forEach((so,si)=>{const boxCy=cy+(si-(sideOpts.length-1)/2)*58;parts.push(arrowH(cx+hw,boxCy));parts.push(box(boxCy,134,52,nodes[so.next].flowLabel,"bad"));maxY=Math.max(maxY,boxCy+34);});const holdendOpt=n.options.find(o=>o.flow==="holdend");if(holdendOpt){const by=cy+(sideOpts.length>1?118:68);parts.push(arrowDash(cx+hw*0.55,cy+hh*0.85,by));parts.push(box(by,134,52,nodes[holdendOpt.next].flowLabel,"hold"));maxY=Math.max(maxY,by+30);}const holdnoteOpt=n.options.find(o=>o.flow==="holdnote");if(holdnoteOpt){parts.push("<text x=\\""+(cx-hw-12)+"\\" y=\\""+(cy+4)+"\\" text-anchor=\\"end\\" font-size=\\"9\\" fill=\\"#888\\">보류→기록 후 계속</text>");}});const endIdx=chain.length-1;const goodCy=startY+endIdx*rowH;parts.push(goodbox(goodCy,186,58,chain[endIdx].node.flowLabel,chain[endIdx].node.end));maxY=Math.max(maxY,goodCy+42);const svg="<svg viewBox=\\"0 0 640 "+(maxY+34)+"\\" width=\\"100%\\" xmlns=\\"http://www.w3.org/2000/svg\\">"+"<defs><marker id=\\"igwArrow\\" viewBox=\\"0 0 10 10\\" refX=\\"8\\" refY=\\"5\\" markerWidth=\\"7\\" markerHeight=\\"7\\" orient=\\"auto-start-reverse\\">"+"<path d=\\"M1 1L9 5L1 9\\" fill=\\"none\\" stroke=\\"#555\\" stroke-width=\\"1.6\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"/></marker></defs>"+parts.join("")+"</svg>";return svg+"<div style=\\"display:flex;gap:16px;font-size:11px;color:#444;margin-top:8px;flex-wrap:wrap\\"><span><span style=\\"display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;background:#E1F5EE;border:1px solid #0F6E56\\"></span>양호</span><span><span style=\\"display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;background:#FAECE7;border:1px solid #993C1D\\"></span>결함 의심/확정</span><span><span style=\\"display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;background:#E6F1FB;border:1px solid #1B5A8A\\"></span>보류(정밀검토)</span></div>";';




/* 도메인 하나에 항목이 10개 넘게 몰려 있으면 카드를 하나씩 펼치는 것도 번거로우므로,
   그 영역 전체를 한 번에 펼치거나(인터뷰를 쭉 진행할 때) 접을(다시 훑어볼 때) 수 있게 한다. */


// [v8.39] "인터뷰 대상자별"·"담당 감사역순" 그룹 화면에서는 공통 항목 하나가 여러 사람 그룹에
// 중복으로 나타날 수 있다(같은 데이터를 가리키는 카드가 화면에 두 곳 이상). 이전에는 이 두 함수가
// document.querySelector로 "코드가 같은 첫 번째 카드"만 찾아서, 아래쪽(두 번째 사람)에서 버튼을
// 눌러도 위쪽(첫 번째 사람) 카드가 대신 펼쳐지는 것처럼 보였다. 이제 클릭한 버튼 자신에서
// .closest('.ig-card')로 "지금 누른 바로 그 카드"를 찾아 그 카드만 펼친다.








export let igViewMode = 'data';
export function setIgViewMode(v){ igViewMode = v; }
 // 'data' = 응답 있는 항목만, 'all' = 전체 항목(응답 무관) 검토/편집 모드
export let igDomainFilter = '';
export function setIgDomainFilter(v){ igDomainFilter = v; }
 // '' = 전체 영역, 'XX' = 해당 도메인 코드만 표시 (인터뷰 가이드를 통째로 안 보고 영역 단위로 좁혀보기)
export let igGroupMode = 'domain';
export function setIgGroupMode(v){ igGroupMode = v; }
 // 화면에 카드를 어떻게 묶어 보여줄지: 'domain'(기본) | 'risk' | 'interviewer' | 'person'.
  // 인터뷰를 실제로 진행하며 이 화면에서 기록할 때, "한 사람을 붙잡고 그 사람 항목을 전부 물어보고 기록"하는
  // 흐름을 지원하기 위해 'person'을 추가했다 — 인터뷰 팩(다운로드용 읽기 전용 사본)의 정렬 기준과
  // 같은 선택지를 공유하되, 여기서는 실시간 입력 화면 자체의 그룹 단위를 바꾼다.
export let igGroupFilter = '';
export function setIgGroupFilter(v){ igGroupFilter = v; }
 // '' = 모든 그룹 표시, 그 외에는 해당 그룹(도메인/위험도/감사역/대상자)만 남기고 나머지는 숨김.
  // 여러 그룹을 한꺼번에 펼쳐두면 화면이 길어져 지금 보던 대상자를 놓치기 쉽다는 지적에 따라 신설.



/* 체크포인트별 인터뷰 후 재검토(응답 변경) 컨트롤 배선.
   scope에 container 전체를 넘기면 초기 전체 배선, 저장/취소 후 그 줄(li)만 다시 그렸을 때는
   그 li만 넘겨서 다시 배선한다 — container 전체를 다시 배선하면 기존 버튼에 리스너가 중복으로
   쌓이는 문제(같은 동작이 여러 번 실행됨)가 생기므로 반드시 범위를 좁혀서 호출해야 한다. */












/* ===== 협동 감사 — 인터뷰 기록 내보내기 · 동료 기록과 병합하기 ===== */
/* [v7.01] 감사역별 배정 나눠 내보내기 — 책임 감사역이 "진행 감사자" 값 기준으로 이미 배정을 마친
   상태에서, 사람별로 "이 사람이 할 항목·질문 스크립트"만 담긴 파일을 한 번에 만들어 각자에게
   보낼 수 있게 한다. 기존 "내 기록 내보내기(협업용)"·"동료 기록 불러와 합치기"와는 목적이 다르다 —
   저건 "이미 작업한 결과를 합치는" 용도이고, 이건 "작업을 시작하기 전 배정 내용을 나눠주는" 용도다.
   그래서 새 흐름을 추가할 뿐 기존 두 기능은 그대로 둔다. */








// 두 감사역의 인터뷰 기록을 "병합"이 아니라 "라벨 붙여 이어붙이기"로 안전하게 합친다.
// 이유: 이 도구는 서버 없이 각자 브라우저에서 따로 작업하는 구조라, 정말로 같은 항목을
// 두 사람이 다르게 기록했을 때 어느 쪽이 맞는지 도구가 판단할 수 없다. 대신 둘 다 남기고
// 누가 쓴 내용인지 표시해서, 감사역이 직접 눈으로 보고 정리하게 한다(데이터 유실 방지 우선).












renderDomainList();
renderOverview();
updateRefsMeta();
renderInterviewGuide();
renderStorageStatusTable();
renderCustomInterviewSection();
document.getElementById('addCustomInterviewBtn').addEventListener('click', () => {
  const formWrap = document.getElementById('customInterviewForm');
  const open = formWrap.style.display !== 'none';
  if(open){ formWrap.style.display = 'none'; return; }
  formWrap.style.display = 'block';
  renderCustomInterviewForm();
});
document.getElementById('openCustomInterviewWindowBtn').addEventListener('click', openCustomInterviewWindow);

document.getElementById('addManualFindingBtn').addEventListener('click', () => {
  openFindingEditGuarded({id:'F-'+Date.now(), code:'', title:'', description:'', riskLevel:'중', department:'', recommendation:'', status:'draft', createdAt:kstISOString(), auditName: getCurrentAuditName()});
});
document.getElementById('downloadFindingsCsvBtn').addEventListener('click', () => {
  const header = ['항목코드','제목','현황','위험도','관련부서','권고사항','감사결과구분','조치기한','조치계획','담당자','상태'];
  const rows = [header];
  const STATUS_CSV_LABEL = {draft:'초안', confirmed:'확정(통보완료)', in_progress:'조치중', remediated:'조치완료(검증대기)', closed:'종결'};
  findings.forEach(f => rows.push([f.code||'', f.title, f.description, f.riskLevel, f.department, f.recommendation, f.actionType||'', f.dueDate||'', f.actionPlan||'', f.assignee||'', STATUS_CSV_LABEL[f.status] || '초안']));
  const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IT감사_발견사항' + (typeof versionSuffix==='function'?versionSuffix():'') + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

/* ---------- 발견사항 JSON 백업 / 불러오기 (다른 감사역과 공유·PC 이동용) ---------- */
document.getElementById('exportFindingsJsonBtn').addEventListener('click', () => {
  if(findings.length === 0){ alert('내보낼 발견사항이 없습니다.'); return; }
  const payload = {exportedAt: kstISOString(), count: findings.length, findings: findings};
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IT감사_발견사항_백업' + (typeof versionSuffix==='function'?versionSuffix():'') + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
document.getElementById('importFindingsJsonBtn').addEventListener('click', () => document.getElementById('findingsJsonFileInput').click());
document.getElementById('findingsJsonFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    let payload;
    try{ payload = JSON.parse(ev.target.result); }
    catch(err){ alert('발견사항 JSON 파일을 읽을 수 없습니다: ' + err.message); return; }
    const incoming = Array.isArray(payload) ? payload : (payload.findings || []);
    if(!Array.isArray(incoming) || incoming.length === 0){ alert('이 파일에서 발견사항 데이터를 찾을 수 없습니다.'); return; }
    let added = 0, updated = 0;
    incoming.forEach(item => {
      if(!item || !item.id) return;
      const idx = findings.findIndex(f => f.id === item.id);
      if(idx >= 0){ findings[idx] = item; updated++; }
      else { findings.push(item); added++; }
    });
    saveFindings();
    renderFindingsTab();
    const banner = document.getElementById('findingsImportBanner');
    if(banner){
      banner.style.display = 'block';
      banner.textContent = '불러오기 완료 — 신규 ' + added + '건, 갱신 ' + updated + '건 (파일: ' + file.name + ')';
    }
  };
  reader.readAsText(file, 'UTF-8');
  e.target.value = '';
});
const findingsStatusFilterEl = document.getElementById('findingsStatusFilter');
if(findingsStatusFilterEl) findingsStatusFilterEl.addEventListener('change', (e) => {
  findingsStatusFilterValue = e.target.value;
  renderFindingsList();
});
const genComprehensiveReportBtnEl = document.getElementById('genComprehensiveReportBtn');
if(genComprehensiveReportBtnEl) genComprehensiveReportBtnEl.addEventListener('click', openComprehensiveReport);

/* ===== 종합 보고서 — "피감사부서 통보용" 범위 좁히기 =====
   범용 "보고서 빌더"까지는 만들지 않되, 데이터 범위가 실제로 달라지는 "특정 부서 발견사항만
   포함"만 별도 체크박스로 제공한다(그 외 보고 대상 — 감사팀장·감사위원회·IT임원·대표이사 —
   는 체크박스 구성 차이만 있을 뿐이라 아래 Ⅰ~Ⅵ 체크박스로 자유롭게 켜고 끄면 된다). */

const reportDeptOnlyToggleEl = document.getElementById('reportDeptOnlyToggle');
if(reportDeptOnlyToggleEl) reportDeptOnlyToggleEl.addEventListener('change', () => {
  const deptRow = document.getElementById('reportDeptFilterRow');
  if(deptRow) deptRow.style.display = reportDeptOnlyToggleEl.checked ? 'block' : 'none';
  if(reportDeptOnlyToggleEl.checked) refreshReportDeptFilterOptions();
});
const gwTemplateDeptEl = document.getElementById('gwTemplateDept');
if(gwTemplateDeptEl) gwTemplateDeptEl.addEventListener('change', refreshGwTemplatePreview);
const gwTemplateToneEl = document.getElementById('gwTemplateTone');
if(gwTemplateToneEl) gwTemplateToneEl.addEventListener('change', refreshGwTemplatePreview);
const gwTemplateCopyBtnEl = document.getElementById('gwTemplateCopyBtn');
if(gwTemplateCopyBtnEl) gwTemplateCopyBtnEl.addEventListener('click', copyGwTemplate);
renderFindingsTab();

/* ---------- Round history event wiring ---------- */
document.getElementById('saveRoundBtn').addEventListener('click', saveCurrentAsRound);
document.getElementById('newRoundBtn').addEventListener('click', startNewRound);
document.getElementById('importRoundBtn').addEventListener('click', () => document.getElementById('roundFileInput').click());
document.getElementById('roundFileInput').addEventListener('change', (e) => {
  Array.from(e.target.files).forEach(importRoundFile);
  e.target.value = '';
});
renderRoundHistory();
showRoundBanner();

/* ---------- Distribution & response tracking: event wiring ---------- */
document.getElementById('addRecipientBtn').addEventListener('click', addRecipient);

document.getElementById('startWizardBtn').addEventListener('click', openWizard);
document.getElementById('wizardCloseBtn').addEventListener('click', closeWizard);
// 안전장치: 화면 배율(확대) 등으로 모달이 화면보다 커져 하단 버튼이 안 보이는 상황에서도
// 항상 닫을 수 있도록 Esc 키와 반투명 배경 클릭으로도 닫히게 한다 (F5 새로고침으로 작업내용을
// 통째로 날리는 사고를 막기 위한 이중 안전장치 — 닫기 전에 saveCurrentWizardStep()으로 저장됨).
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    const overlay = document.getElementById('wizardOverlay');
    if(overlay && overlay.style.display !== 'none') closeWizard();
  }
});
document.getElementById('wizardOverlay').addEventListener('click', (e) => {
  if(e.target.id === 'wizardOverlay') closeWizard();
});
document.getElementById('wizardPrevBtn').addEventListener('click', () => wizardGoTo(wizardIndex - 1));
document.getElementById('wizardNextBtn').addEventListener('click', () => wizardGoTo(wizardIndex + 1));
document.getElementById('wizardSkipDomainBtn').addEventListener('click', () => {
  const cur = wizardItems[wizardIndex];
  if(!cur) return;
  const nextIdx = wizardItems.findIndex((x, i) => i > wizardIndex && x.domCode !== cur.domCode);
  if(nextIdx !== -1) wizardGoTo(nextIdx);
});
document.getElementById('wizardFinishBtn').addEventListener('click', () => {
  saveCurrentWizardStep();
  alert('검토를 완료했습니다. 총 ' + wizardItems.length + '개 항목을 확인했습니다.');
  closeWizard();
});
document.getElementById('exportRecipientsBtn').addEventListener('click', exportRecipients);
document.getElementById('importRecipientsBtn').addEventListener('click', () => document.getElementById('recipientsFileInput').click());
document.getElementById('recipientsFileInput').addEventListener('change', (e) => {
  Array.from(e.target.files).forEach(importRecipientsFile);
  e.target.value = '';
});
document.getElementById('distSelectAllBtn').addEventListener('click', toggleSelectAllRecipients);
document.getElementById('addAuditDeptBtn').addEventListener('click', addAuditDept);
document.getElementById('auditDeptInput').addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); addAuditDept(); } });
document.getElementById('auditNameInput').addEventListener('input', () => {
  const distInput = document.getElementById('distRoundLabelInput');
  if(distInput && !distInput.dataset.userEdited && !distInput.value){ distInput.value = document.getElementById('auditNameInput').value; }
});
document.getElementById('distRoundLabelInput').addEventListener('input', function(){ this.dataset.userEdited = '1'; });
renderAuditDeptChips();
document.getElementById('createDistBtn').addEventListener('click', createDistribution);
document.getElementById('genCommBtn').addEventListener('click', generateCommMessages);
document.getElementById('editCommTemplatesBtn').addEventListener('click', toggleCommTemplateEditor);
renderCommTemplateTypeOptions();
document.getElementById('exportAllDataBtn').addEventListener('click', exportAllData);
document.getElementById('importAllDataBtn').addEventListener('click', () => document.getElementById('allDataFileInput').click());
document.getElementById('allDataFileInput').addEventListener('change', (e) => {
  if(e.target.files[0]) importAllData(e.target.files[0]);
  e.target.value = '';
});
document.getElementById('exportModuleBtn').addEventListener('click', exportModuleData);
document.getElementById('importModuleBtn').addEventListener('click', () => document.getElementById('moduleFileInput').click());
document.getElementById('moduleFileInput').addEventListener('change', (e) => {
  if(e.target.files[0]) importModuleData(e.target.files[0]);
  e.target.value = '';
});
document.getElementById('distDateInput').value = kstDateStr();
autoFillDistAuditor();
renderRecipientsTable();
renderDistDomainChecks();
renderDistRecipientChecks();
renderDistributionList();
  renderCommDistSelect();

/* ---------- 설문지 생성 탭 이어하기: 자동저장 이벤트 위임 + 복원 ---------- */
(function(){
  const genTab = document.getElementById('tab-generate');
  if(!genTab) return;
  let _t = null;
  const trigger = () => { clearTimeout(_t); _t = setTimeout(saveGenDraftNow, 600); };
  genTab.addEventListener('change', trigger);
  genTab.addEventListener('input', trigger);
  genTab.addEventListener('change', renderAuditOverviewPanel);
  genTab.addEventListener('input', renderAuditOverviewPanel);
  genTab.addEventListener('click', (e) => {
    if(e.target.closest('button, .dcard, .scale-remove-btn, .assign-dept-reset-btn')) { trigger(); setTimeout(renderAuditOverviewPanel, 0); }
  });

  const savedAt = restoreGenDraft();
  if(savedAt){
    if(typeof renderDomainList === 'function') renderDomainList();
    if(typeof renderScaleTable === 'function') renderScaleTable();
    if(typeof renderAssignTable === 'function') renderAssignTable();
    if(typeof refreshChecklistMetaAfterBuilderEdit === 'function') refreshChecklistMetaAfterBuilderEdit();
    if(typeof updateGenSummary === 'function') updateGenSummary();
    const banner = document.getElementById('genDraftRestoreBanner');
    if(banner){
      banner.style.display = 'flex';
      const timeEl = document.getElementById('genDraftRestoreTime');
      if(timeEl && typeof savedAt === 'string'){
        try{ timeEl.textContent = new Date(savedAt).toLocaleString('ko-KR'); }catch(e){ timeEl.textContent = ''; }
      }
      const discardBtn = document.getElementById('discardGenDraftBtn');
      if(discardBtn) discardBtn.addEventListener('click', () => {
        if(!confirm('설문지 생성 작업 임시저장본을 지우고 새로 시작할까요? 현재 화면의 영역 선택·편집 내용도 함께 초기화됩니다.')) return;
        clearGenDraft();
        location.reload();
      });
    }
  }
  renderAuditOverviewPanel();
})();

/* ---------- 📮 커뮤니케이션 문서함 — 감사 개요 요약 ---------- */


/* ---------- 칸반보드 (여러 감사역 협업용) ---------- */
// 칸반 카드를 삭제해도 완전히 사라지지 않고 이곳으로 옮겨 이력을 보존한다. 나중에 감사 진척도를
// 되짚어보거나(예: "이 감사 기간 동안 총 몇 건을 다뤘는가") 감사 수행 방식을 평가할 때 참고자료로 쓴다.

/* ===== 📜 보고서 생성 이력 — "언제 어떤 리포트를 뽑았는지"만 기록한다 (실제 발송·전달 여부는
   그룹웨어 메시지 쪽에서 별도로 확인하는 것이므로 이 로그의 범위가 아니다). 특히 🚨 중간보고서는
   "보고를 하긴 했는지"가 중요해, 로그에서 바로 확인할 수 있게 한다. ===== */
export const REPORT_LOG_STORAGE_KEY = 'itaudit_report_log_v1';


/* 지금 ①설문지 생성 탭에 입력되어 있는 감사명을 가져온다 — 발견사항·칸반카드·보고서 이력이
   "어느 감사 건" 소속인지 자동으로 태깅하는 데 쓰인다. 감사명을 아직 안 정했으면 "(감사명 미지정)"으로
   묶어, 나중에라도 "감사 건별로 보기"에서 찾아 재분류할 수 있게 한다. */

















/* ---------- 🕓 칸반보드 불러오기 이력 (중복·누락 예방) ---------- */


(function kanbanInitControls(){
  const domSel = document.getElementById('kanbanDomainSelect');
  if(!domSel) return;
  kanbanPopulateDomainSelect();
  domSel.addEventListener('change', kanbanPopulateItemSelect);
  document.getElementById('kanbanAddCardBtn').addEventListener('click', kanbanAddCard);
  document.getElementById('kanbanAssigneeFilter').addEventListener('change', renderKanbanBoard);
  const domainFilterEl = document.getElementById('kanbanDomainFilter');
  if(domainFilterEl) domainFilterEl.addEventListener('change', renderKanbanBoard);
  const riskFilterEl = document.getElementById('kanbanRiskFilter');
  if(riskFilterEl) riskFilterEl.addEventListener('change', renderKanbanBoard);
  const viewToggleBtn = document.getElementById('kanbanViewToggleBtn');
  if(viewToggleBtn) viewToggleBtn.addEventListener('click', () => {
    setKanbanViewMode(getKanbanViewMode() === 'list' ? 'board' : 'list');
    renderKanbanBoard();
  });
  document.getElementById('kanbanExportBtn').addEventListener('click', kanbanExport);
  const archiveToggleBtn = document.getElementById('kanbanArchiveToggleBtn');
  if(archiveToggleBtn) archiveToggleBtn.addEventListener('click', () => {
    const panel = document.getElementById('kanbanArchivePanel');
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    archiveToggleBtn.textContent = open ? '펼쳐보기' : '접기';
    if(!open) renderKanbanArchive();
  });
  const progressReportBtn = document.getElementById('kanbanProgressReportBtn');
  if(progressReportBtn) progressReportBtn.addEventListener('click', openKanbanProgressReport);
  document.getElementById('kanbanImportPickBtn').addEventListener('click', () => document.getElementById('kanbanImportFileInput').click());
  document.getElementById('kanbanImportFileInput').addEventListener('change', (e) => {
    if(e.target.files[0]) kanbanHandleImportFile(e.target.files[0]);
  });
  renderKanbanBoard();
})();

/* ---------- 🎤 인터뷰 가이드 → 🗂 칸반 카드 전송 ---------- */
/* 📋 발견사항 관리 → 🗂 칸반보드로 카드 전송. 발견사항은 이미 등록이 끝난 뒤에도 추가 확인·조치
   진행상황을 계속 추적해야 하는 경우가 많아(예: 조치계획 이행 여부 재확인), 인터뷰 항목과 마찬가지로
   칸반 카드로 넘겨 진행 단계를 관리할 수 있게 한다. 체크리스트 항목과 연결된 발견사항(f.code 있음)은
   그 항목 기준으로 중복을 판정하고, 자유 등록 발견사항(f.code 없음)은 findingId로 판정한다. */


/* 인터뷰 카드의 "칸반 카드로 보내기" 버튼들을, 실제 칸반보드 현재 상태와 항상 일치하도록 다시 그린다.
   — 칸반 탭에서 카드를 지운 뒤 인터뷰 탭으로 돌아와도(탭 전환 시 인터뷰 카드 자체는 다시 그리지 않으므로)
     버튼이 "이미 보냄" 상태로 굳어 다시 보낼 수 없게 되는 문제를 막기 위함. */

/* ---------- 📊 감사 진척도 리포트 (칸반보드 활성+보관 카드 취합, 인포그래픽 · A4 인쇄용) ----------
   목적: 개별 발견사항의 내용이 아니라 "지금까지 얼마나 다뤘고 앞으로 얼마나 남았는지"에 집중한
   진행률 요약. 감사 기간 연장/조기 종료를 검토하는 데 참고할 수 있도록, 단계별 분포·정체 항목·
   완료 속도(추세)를 함께 보여준다. */




/* ---------- 📑 보고서 센터 — 다른 탭에 있는 리포트 작성 화면으로 이동 ---------- */




(function wireReportLogToggle(){
  const btn = document.getElementById('reportLogToggleBtn');
  if(!btn) return;
  btn.addEventListener('click', () => {
    const panel = document.getElementById('reportLogPanel');
    if(!panel) return;
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    btn.textContent = open ? '펼쳐보기' : '접기';
    if(!open) renderReportLog();
  });
})();



export const REPORT_LOG_TYPE_LABEL = {
  draft: '📝 착수문서', schedule: '🗓 인터뷰 일정표', progress: '📊 진척도 리포트',
  interim: '🚨 중간보고', notice: '🖨 통보서', comprehensive: '📑 종합 감사결과보고서', workingpaper: '📄 감사조서'
};


/* ---------- 📚 감사 건별로 보기 (감사명 태그 기준 조회 전용 화면) ---------- */
export const AUDIT_UNTAGGED_LABEL = '(감사명 미지정)';













/* 📋 발견사항 관리 탭 카드에서 "🚨 이 건만 중간보고서 생성" 버튼을 눌렀을 때 — 여러 건을 묶어
   고르는 📑 보고서 센터 화면을 거치지 않고, 이 발견사항 하나만으로 즉시 중간보고서를 만든다.
   판단유형·경위·요청사항은 모두 이 발견사항 자체에 저장된 값(📋 편집 폼에서 입력)을 그대로 쓴다. */

/* 🚨 중간보고서(Interim Report) — IPPF 기준 감사 수행 중 확인된 중대한 사항을,
   최종 감사결과보고를 기다리지 않고 경영진·감사위원회 등에 즉시 별도로 알리는 문서.
   지금까지 이 시스템에는 "수행 중 리포팅" 수단이 없었다는 지적에 따라 신설했다. */


/* ---------- 📄 감사조서(워킹페이퍼) 생성 — 감사 개요 + 칸반 진행현황 + 발견사항 통합 ---------- */




(function wireWorkingPaperBtn(){
  const btn = document.getElementById('openWorkingPaperBtn');
  if(btn) btn.addEventListener('click', openAuditWorkingPaper);
})();

/* ---------- 📜 변경 이력 표 — 최근 10개만 기본 표시, 나머지는 "더 보기"로 ---------- */
(function initVersionHistoryCollapse(){
  const table = document.getElementById('versionHistoryTable');
  const moreBtn = document.getElementById('versionHistoryMoreBtn');
  if(!table || !moreBtn) return;
  const rows = Array.from(table.querySelectorAll('tr')).slice(1); // 첫 번째는 헤더 행
  const VISIBLE_COUNT = 10;
  if(rows.length <= VISIBLE_COUNT) return; // 더 보기가 필요 없을 만큼 적으면 그대로 둠
  rows.slice(VISIBLE_COUNT).forEach(tr => { tr.style.display = 'none'; });
  moreBtn.style.display = 'inline-block';
  moreBtn.textContent = '🔽 이전 버전 더 보기 (' + (rows.length - VISIBLE_COUNT) + '개)';
  moreBtn.addEventListener('click', () => {
    rows.slice(VISIBLE_COUNT).forEach(tr => { tr.style.display = ''; });
    moreBtn.style.display = 'none';
  });
})();

/* ---------- 미제출 설문(미회신) 즉시 확인 배너 ---------- */

renderPendingSurveyBanner();
renderGlobalIppfBadge();
(function(){
  const banner = document.getElementById('pendingSurveyBadge');
  if(banner) banner.addEventListener('click', () => {
    const btn = document.querySelector('.tabbtn[data-tab="dist"]');
    if(btn) btn.click();
    // 탭 전환·렌더링이 끝난 뒤, 실제 미회신 행이 있는 위치까지 스크롤하고 눈에 띄게 깜빡여
    // "2건이 정확히 어떤 것인지" 바로 알 수 있게 한다.
    setTimeout(() => {
      const pendingRows = document.querySelectorAll('[data-pending-row="1"]');
      if(pendingRows.length === 0) return;
      const firstCard = pendingRows[0].closest('.dist-card');
      if(firstCard) firstCard.scrollIntoView({behavior:'smooth', block:'center'});
      document.querySelectorAll('.dist-card.has-pending').forEach(c => c.classList.add('pending-jump-flash'));
      pendingRows.forEach(r => r.classList.add('pending-jump-flash'));
      setTimeout(() => {
        document.querySelectorAll('.pending-jump-flash').forEach(el => el.classList.remove('pending-jump-flash'));
      }, 2800);
    }, 150);
  });
})();

/* ---------- 처음 사용자 온보딩 ---------- */
// v8.14 — 큰 배너가 화면 중간에 매번(특히 파일을 새 버전으로 열 때마다 — file:// 문서는
// 버전마다 출처(origin)가 달라 "다시 보지 않기" 로컬 저장이 이어지지 않는다) 나타나 거슬린다는
// 지적에 따라, 자동으로 펼쳐지는 배너 자체를 없앴다. 안내는 화면 맨 위 한 줄짜리 링크로만
// 남기고, 누르면 페이지 흐름을 밀어내지 않도록 별도 새 창으로 띄운다.

(function(){
  const reopenLink = document.getElementById('obReopenLink');
  if(reopenLink) reopenLink.addEventListener('click', (e) => {
    e.preventDefault();
    showOnboardingWindow();
  });
})();

// ============================================================
// [v8.49] 모듈 전환에 따른 명시적 전역(window) 노출
// ------------------------------------------------------------
// 예전에는 이 파일이 classic <script>(비-모듈)였기 때문에, 최상위 function 선언이
// 브라우저에 의해 자동으로 window.함수명 이 되었다. ES 모듈(type="module")로 바뀌면서
// 이제 최상위 선언은 이 모듈 안에서만 보인다. 그런데 아래 경로들은 여전히 "전역"에서
// 이름을 찾는다:
//   ① index.html의 정적 inline onclick="함수명(...)" 핸들러
//   ② render 함수가 innerHTML로 "동적으로" 찍어내는 onclick/onchange 문자열이 참조하는 함수
//      (버튼을 실제로 클릭해보기 전에는 안 드러나는 부류라 ①보다 찾기 어려웠다 — v8.49에서
//      app.js 전체를 onXXX="..." 패턴으로 훑어서 전수 확인함)
//   ③ 인터뷰 가이드가 여는 팝업 창들이 window.opener(별칭 op)를 통해 접근하는 항목들
// 그래서 필요한 이름만 여기서 명시적으로 골라 window에 붙인다. (예전처럼 전부 암묵적으로
// 새는 것과 달리, "무엇이 외부와 연결되는 접점인지"가 이 블록만 보면 한눈에 드러난다.)
//
// [주의] 아래 목록에 없는, 별도로 열리는 팝업 창(document.write로 그려지는 인터뷰 분기형
// 시연 창, 순서도 편집 창 등) 내부의 onclick(zoomSet/switchTab/resetBranch 등)은 그 팝업
// 자신의 <script> 안에서 정의·실행되는 독립된 문서라 여기 노출 대상이 아니다. 착각하고
// 이 목록에 추가하지 않도록 주의.
Object.assign(window, {
  // index.html 정적 inline onclick 핸들러가 참조
  exportAssignmentPackage,
  exportInterviewSchedule,
  generateInterimReport,
  goToGuideSection,
  openAuditDraftDoc,
  openKanbanProgressReport,
  rcGoTo,
  showAuditArchiveDetail,
  showAuditArchiveList,
  toggleInterviewCalendarView,
  // app.js가 동적으로 그리는 HTML의 onclick/onchange가 참조 (②)
  autoMatchResponses,
  collapseDetailRowAndScroll,
  copyCommMessage,
  copyPendingNames,
  deleteDistribution,
  deleteRecipient,
  deleteRoundById,
  exportDistribution,
  exportIndividualSubmission,
  exportRoundById,
  igBulkExpandDomain,
  igOpenBranchWindow,
  igToggleCardExpand,
  igToggleDetail,
  igToggleForkExpand,
  imCalGoToday,
  imCalShiftMonth,
  loadRoundById,
  toggleAggOwnerDetail,
  toggleAggTargetDetail,
  toggleInterimCustomInput,
  toggleReceivedManually,
  // 인터뷰 가이드 팝업 창(window.opener)이 참조 (③)
  scriptOverrides,
  flowOverrides,
  saveScriptOverrides,
  saveFlowOverrides,
  renderInterviewGuide,
});
