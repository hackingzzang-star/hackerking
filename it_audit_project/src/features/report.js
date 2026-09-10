// ============================================================
// 📝 보고서류 (착수/진행/중간/종료/이력 탭) — v8.54에서 app.js로부터 물리적으로 분리
// ------------------------------------------------------------
// 착수문서(기안문·시행문), 진행문서, 중간·종합 감사결과보고서, 생성 이력 등.
// DOMAINS/currentScale/_genDraftSaveTimer는 app.js가 소유한 공유 가변 상태(let)라서,
// 재할당은 app.js가 내보낸 세터로만 한다(원본의 직접 재할당을 세터 호출로 치환했을 뿐
// 로직·순서는 동일). setDomains는 ① 설문지 생성 분리 때 이미 추가된 것을 재사용한다.
// ============================================================
import {
  AUDIT_LEGAL_BASIS,
  DOMAINS,
  DOMAIN_LEGAL_TAGS,
  FINDING_TYPES,
  FINDING_TYPE_META,
  GANA_MARKERS,
  GEN_DRAFT_STORAGE_KEY,
  IPPF_STAGES,
  REPORT_LOG_STORAGE_KEY,
  REPORT_LOG_TYPE_LABEL,
  _genDraftSaveTimer,
  aggRows,
  auditSuggestDismissed,
  contentOverrides,
  currentScale,
  domainAuditorMap,
  findings,
  interviewState,
  itemAuditorMap,
  itemDeptMap,
  loadFindings,
  saveFindings,
  selectedCodes,
  setDomains,
  setGenDraftSaveTimer,
  setCurrentScale,
} from '../app.js';
import {
  esc, escFd, getCurrentAuditName, getCurrentAuditor, kstDateStr, kstISOString, safeAssign,
} from './common.js';
import {
  computeSplitSurveyOutputs,
  domainNameSummary,
} from './generate.js';
import {
  collectAuditDraftContext,
  collectAuditWideStats,
  loadRoundsFromStorage,
} from './collect.js';
import {
  igClassifyRow,
  igFindItem,
} from './interview.js';
import {
  KANBAN_COLUMNS,
  loadKanbanCards,
} from './kanban.js';
import {
  renderFindingsList,
} from './findings.js';

export function buildAuditLegalBasis(domains){
  const tags = new Set();
  domains.forEach(d => { (DOMAIN_LEGAL_TAGS[d.code] || []).forEach(t => tags.add(t)); });
  if(tags.size === 0) return AUDIT_LEGAL_BASIS;
  return '「' + Array.from(tags).join('」, 「') + '」 등 관계 법령·감독규정 및 정보기술(IT) 부문 내부통제체계 자체점검 의무';
}

export function buildAuditPurpose(domains, userPurpose){
  if(domains.length === 0) return userPurpose;
  const summary = domainNameSummary(domains, 3);
  const auto = domains.length + '개 영역(' + summary + ')에 대한 IT 내부통제 이행 실태를 자체점검하여 취약점을 사전에 발굴·개선하고자 함';
  if(!userPurpose) return auto;
  return userPurpose + ' (대상영역: ' + summary + ' 등 ' + domains.length + '개)';
}

export function computeIppfStageStatuses(stats){
  const s1Done = (stats.ctx.domainTitles || []).length > 0;
  const s2Done = stats.totalResp > 0;
  const s3Done = stats.interviewTotal > 0 && stats.interviewDoneCount === stats.interviewTotal;
  const s4Done = stats.findingsCount > 0 && stats.reportCount > 0;
  const s5Done = stats.kbAll.length > 0 && stats.kbPct === 100;

  const s1Started = true; // ①은 언제나 시작 가능한 단계라 안 끝났으면 항상 '진행중'
  const s2Started = s1Done;
  const s3Started = stats.interviewDoneCount > 0 || s2Done;
  const s4Started = stats.findingsCount > 0 || stats.reportCount > 0;
  const s5Started = stats.kbAll.length > 0;

  const pairs = [[s1Done, s1Started], [s2Done, s2Started], [s3Done, s3Started], [s4Done, s4Started], [s5Done, s5Started]];
  const statuses = pairs.map(([done, started]) => done ? 'done' : (started ? 'current' : 'todo'));
  const currentIndex = statuses.indexOf('current');
  return {statuses, currentIndex};
}

export function renderGlobalIppfBadge(){
  const badge = document.getElementById('ippfStageBadge');
  if(!badge) return;
  const stats = collectAuditWideStats();
  const {statuses, currentIndex} = computeIppfStageStatuses(stats);
  if(currentIndex === -1){
    badge.textContent = '✅ 전 단계 완료';
    badge.style.background = 'var(--good-bg)'; badge.style.color = 'var(--good)';
  } else {
    const s = IPPF_STAGES[currentIndex];
    badge.textContent = '현재 단계: ' + s.num + ' ' + s.title;
    badge.style.background = '#fdf8ec'; badge.style.color = '#8a6a1f';
  }
}

export function ganaList(itemsHtml){
  // 실제 공문서의 "가./나./다." 항목 표기를 재현. items는 이미 완성된 내용(문자열) 배열.
  return '<ol class="ad-gana">' + itemsHtml.map((html, i) => '<li><span class="ad-marker">' + (GANA_MARKERS[i] || (i+1) + ')') + '.</span> ' + html + '</li>').join('') + '</ol>';
}

export function openAuditDraftDoc(kind){
  const ctx = collectAuditDraftContext();
  if(ctx.domainTitles.length === 0){ alert('먼저 위 ③ 단계에서 감사 대상 영역을 하나 이상 선택해 주세요.'); return; }
  const today = kstDateStr();
  const domainListHtml = '<ul>' + ctx.domainTitles.map(d =>
    '<li><b>D-' + escFd(d.code) + ' ' + escFd(d.title) + '</b>' + (d.desc ? ' — ' + escFd(d.desc) : '') + '</li>'
  ).join('') + '</ul>';
  // 붙임 목록은 "담당부서별로 분리하여 각각 생성" 버튼을 눌렀을 때 실제로 만들어지는 파일 목록
  // (computeSplitSurveyOutputs)과 반드시 같은 로직으로 계산한다 — 예전에는 이 계산이 서로 달라서,
  // 실제로는 부서 수 × 공통여부에 따라 여러 개(예: 4개) 파일이 나오는데도 붙임 목록에는
  // 도메인당 1줄만(그마저도 "공통작성"으로 뭉뚱그려져) 표시되는 문제가 있었다.
  const splitOutputs = (typeof computeSplitSurveyOutputs === 'function') ? computeSplitSurveyOutputs() : [];
  const attachmentListHtml = splitOutputs.length > 0
    ? splitOutputs.map(out => '<li>' + escFd(out.filename) + '</li>').join('')
    : ctx.domainTitles.map(d => '<li>' + escFd(d.title) + '_설문지_' + escFd(d.dept) + '</li>').join('');
  const attachmentCount = splitOutputs.length > 0 ? splitOutputs.length : ctx.domainTitles.length;
  const zipEvidenceNote = '회신 시 제출 가능하다고 표시한 증빙자료는 <b>압축(zip)</b>하여 설문 응답 파일(JSON)과 함께 제출하여 주시기 바랍니다.';
  // "설문지 작성 요청"이 감사 실무상 흔히 쓰는 "사전자료 요청"과 같은 성격·같은 절차임을 명시하고,
  // 설문 회신 이후 실제로 감사가 어떤 순서로 진행되는지(회신자료 검토→인터뷰→발견사항 통보→결과보고)를
  // 기안문·시행문에 공통으로 담아, 피감사부서가 "설문만 내면 끝"이 아니라 전체 흐름 속 첫 단계임을
  // 미리 알 수 있게 한다.
  const preRequestNote = '본 자가진단 설문은 감사 실시에 앞서 이루어지는 <b>사전자료 요청</b>과 동일한 절차로 진행되는 것으로, 회신된 내용을 기초로 이후 현장점검·인터뷰 등 후속 감사 절차가 진행됩니다.';
  const processStepsData = [
    {title:'사전자료(설문) 요청·회신', desc:'대상부서가 자가진단 설문에 응답하고, 제출 가능한 증빙자료를 함께 회신', when: (ctx.surveyStart || '(미정)') + ' 배포 ~ ' + (ctx.dueDate || '(미정)') + ' 회신'},
    {title:'회신자료 검토·증빙 확인', desc:'감사팀이 응답 내용과 증빙자료를 검토하여 1차 위험 영역을 선별', when: '회신 마감 후'},
    {title:'현장점검·인터뷰 실시', desc:'위험이 확인되거나 추가 확인이 필요한 영역을 우선하여 담당자 인터뷰 및 증빙 실물 확인', when: ctx.fieldPeriodText || '(미정)'},
    {title:'발견사항 확인·통보', desc:'인터뷰·증빙 확인 결과 최종 확정된 지적사항을 관련 부서에 통보', when: '현장점검 종료 후'},
    {title:'시정조치 요구·이행 확인', desc:'통보된 사항에 대한 조치계획·조치기한을 확인하고, 이행 여부를 사후 점검', when: '통보 후 협의된 기한까지'},
    {title:'감사결과 보고', desc:'전체 결과를 종합하여 경영진·감사위원회 등에 보고', when: ctx.reportDate || '(미정)'}
  ];
  // v6.73 — "프로세스"와 "추진 일정"이 사실상 같은 정보(단계별 날짜)를 두 번 보여주고 있다는 지적에 따라,
  // 별도의 2열 일정표(구분/일정)는 없애고 이 표 하나(순서·단계·내용·일정)로 통합한다.
  // "금번 요청 단계" 강조 표시도 불필요하다는 의견에 따라 제거했다.
  const processStepsTableHtml = '<table class="ad-flow-tbl">'
    + '<tr><th style="width:34px;">순서</th><th style="width:150px;">단계</th><th>내용</th><th style="width:150px;">일정</th></tr>'
    + processStepsData.map((s, i) =>
        '<tr>'
          + '<td class="ad-flow-tbl-num">' + (i+1) + '</td>'
          + '<td class="ad-flow-tbl-title">' + escFd(s.title) + '</td>'
          + '<td class="ad-flow-tbl-desc">' + escFd(s.desc) + '</td>'
          + '<td class="ad-flow-tbl-when">' + escFd(s.when) + '</td>'
        + '</tr>'
      ).join('')
  + '</table>';
  const processStepsHtml = processStepsTableHtml;
  const participantsLine = ctx.participants || '(감사역을 위에서 입력하거나, ⑤ 단계에서 영역별 담당 감사자를 배정해 주세요)';

  let bodyHtml;
  let docTitle;
  if(kind === 'proposal'){
    docTitle = '기안문';
    bodyHtml = '<div class="ad-meta">'
        + '<div><b>기안부서</b> ' + escFd(ctx.deptName) + '</div>'
        + '<div><b>기안자</b> ' + escFd(ctx.drafterName) + '</div>'
        + '<div><b>기안일자</b> ' + today + '</div>'
      + '</div>'
      + '<h2 class="ad-title">' + escFd(ctx.auditName) + ' 실시 계획(안)</h2>'
      + '<p class="ad-intro">' + escFd(ctx.legalBasis) + ' 등에 의거하여 아래와 같이 <b>' + escFd(ctx.auditKind) + '</b>를 실시하고자 합니다.</p>'
      + '<p class="ad-arae">- 아 래 -</p>'
      + '<div class="ad-section"><h3>1. 목적 및 근거</h3>' + ganaList([
          '목적: ' + escFd(ctx.purpose),
          '법령상 근거: ' + escFd(ctx.legalBasis),
          '실시 사유(실증적 근거): ' + escFd(ctx.grounds || '(①설문지 생성 탭에서 실시 사유·근거를 입력하면 이 자리에 반영됩니다 — 예: 리스크평가 결과, 유사 사고 발생 이력, 전년도 지적사항 후속조치 확인 등)')
        ]) + '</div>'
      + '<div class="ad-section"><h3>2. 감사 개요</h3>' + ganaList([
          '감사명: ' + escFd(ctx.auditName),
          '감사종류: ' + escFd(ctx.auditKind),
          '대상영역(' + ctx.domainTitles.length + '개)' + domainListHtml,
          '감사방법: 사전 자가진단 설문(대상부서 전체) → 현장점검·인터뷰·증빙 확인(위험 확인 영역 우선)',
          '감사역: ' + escFd(participantsLine),
          '설문 회신방법: ' + escFd(ctx.submitMethod)
        ]) + '</div>'
      + '<div class="ad-section"><h3>3. 사전자료 요청 및 감사 진행 프로세스·추진 일정</h3>'
        + '<p style="font-size:12.5px;line-height:1.8;margin:0 0 8px;">' + preRequestNote + '</p>'
        + processStepsHtml
      + '</div>'
      + '<p class="ad-closing">위와 같이 ' + escFd(ctx.auditKind) + '를 실시하고자 하니 재가하여 주시기 바랍니다.</p>'
      + '<div class="ad-attach"><b>붙임</b> 자체점검 설문지 ' + attachmentCount + '부.<ul>' + attachmentListHtml + '</ul><div style="margin-top:8px;font-size:12.5px;color:#1b2330;">' + zipEvidenceNote + '</div>끝.</div>';
  } else {
    docTitle = '시행문';
    const noticeItems = [
      '감사명: ' + escFd(ctx.auditName) + ganaList([
        '목적: ' + escFd(ctx.purpose),
        '법령상 근거: ' + escFd(ctx.legalBasis),
        '실시 사유(실증적 근거): ' + escFd(ctx.grounds || '(①설문지 생성 탭에서 실시 사유·근거를 입력하면 이 자리에 반영됩니다)'),
        '대상영역(' + ctx.domainTitles.length + '개)' + domainListHtml,
        '감사방법: 자가진단 설문 → 현장점검·인터뷰·증빙 확인',
        '감사역: ' + escFd(participantsLine)
      ]),
      preRequestNote + ' 세부 진행 절차 및 일정은 다음과 같습니다.' + processStepsHtml,
      '협조 요청사항' + ganaList([
        '첨부된 자체점검 설문지(사전자료 요청)를 회신기한 내 작성하여 회신하여 주시기 바랍니다.',
        '설문은 실제 해당 업무를 수행하는 담당자가 작성하도록 하여 주시기 바라며, 담당 여부가 명확하지 않은 항목은 "타 부서 담당"으로 표시하여 주시기 바랍니다. 이는 감사팀이 인터뷰 대상을 정확히 파악하기 위한 것입니다.',
        '자체평가란에는 실제 이행 수준에 대한 담당자 의견을 구체적으로 기재하여 주시기 바랍니다.',
        '회신방법: ' + escFd(ctx.submitMethod),
        '감사기간 중 관련 자료 제출 및 현장 인터뷰에 협조하여 주시기 바랍니다.'
      ]),
      '금번 자가진단 설문 결과는 1차 스크리닝 자료로 활용되며, 지적사항 여부는 현장 인터뷰 및 증빙 확인을 거쳐 최종 확정됨을 알려드립니다.'
    ];
    bodyHtml = '<div class="ad-meta">'
        + '<div><b>수신</b> 대상부서 부서장</div>'
        + '<div><b>발신</b> ' + escFd(ctx.deptName) + '</div>'
        + '<div><b>시행일자</b> ' + today + '</div>'
      + '</div>'
      + '<h2 class="ad-title">' + escFd(ctx.auditName) + ' 실시 통보</h2>'
      + '<p class="ad-intro">' + escFd(ctx.legalBasis) + ' 등에 의거하여 아래와 같이 <b>' + escFd(ctx.auditKind) + '</b>를 실시하오니, 관련 부서에서는 적극 협조하여 주시기 바랍니다.</p>'
      + '<p class="ad-arae">- 아 래 -</p>'
      + '<ol class="ad-toplevel">' + noticeItems.map(html => '<li>' + html + '</li>').join('') + '</ol>'
      + '<div class="ad-attach"><b>붙임</b> 자체점검 설문지 ' + attachmentCount + '부.<ul>' + attachmentListHtml + '</ul><div style="margin-top:8px;font-size:12.5px;color:#1b2330;">' + zipEvidenceNote + '</div>끝.</div>';
  }

  const wordFileName = (docTitle + '_' + ctx.auditName).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') + '.doc';
  const html = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>' + docTitle + ' — ' + escFd(ctx.auditName) + '</title><style>'
    + 'body{font-family:"Pretendard","Noto Sans KR",sans-serif;color:#1b2330;max-width:760px;margin:24px auto;padding:0 20px;}'
    + '.ad-hero{background:#132845;color:#f4efe2;padding:20px 26px;border-radius:6px 6px 0 0;}'
    + '.ad-hero .eyebrow{font-family:monospace;letter-spacing:.15em;font-size:11px;color:#e4c78a;text-transform:uppercase;margin-bottom:6px;}'
    + '.ad-hero h1{margin:0;font-size:19px;}'
    + '.ad-body{border:1px solid #dcd6c8;border-top:none;padding:24px 30px;}'
    + '.ad-meta{display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;color:#5a6472;border-bottom:1px solid #dcd6c8;padding-bottom:12px;margin-bottom:18px;}'
    + '.ad-title{font-size:16.5px;color:#132845;text-align:center;margin:0 0 20px;padding-bottom:10px;border-bottom:2px solid #132845;}'
    + '.ad-intro{font-size:13.5px;line-height:1.9;margin:0 0 6px;}'
    + '.ad-arae{text-align:center;font-size:13px;font-weight:700;letter-spacing:.3em;color:#132845;margin:4px 0 20px;}'
    + '.ad-section{margin-bottom:16px;}'
    + '.ad-section h3{font-size:13.5px;color:#132845;margin:0 0 8px;}'
    + '.ad-section ul{margin:4px 0 0;padding-left:20px;font-size:12.5px;line-height:1.8;}'
    + '.ad-toplevel{margin:0;padding-left:20px;font-size:13px;line-height:2;}'
    + '.ad-toplevel > li{margin-bottom:10px;}'
    + '.ad-gana{margin:6px 0 0;padding-left:4px;font-size:12.8px;line-height:1.9;list-style:none;}'
    + '.ad-gana > li{margin-bottom:5px;}'
    + '.ad-marker{font-weight:700;color:#132845;margin-right:2px;}'
    + '.ad-flow-tbl{border-collapse:collapse;width:100%;font-size:12px;margin:10px 0 4px;}'
    + '.ad-flow-tbl th,.ad-flow-tbl td{border:1px solid #dcd6c8;padding:8px 10px;text-align:left;vertical-align:top;}'
    + '.ad-flow-tbl th{background:#f1ede1;text-align:center;}'
    + '.ad-flow-tbl-num{text-align:center;font-weight:700;color:#132845;font-family:monospace;}'
    + '.ad-flow-tbl-title{font-weight:700;color:#132845;}'
    + '.ad-flow-tbl-desc{color:#5a6472;font-size:11.5px;line-height:1.6;}'
    + '.ad-flow-tbl-when{font-size:11.5px;color:#1b2330;white-space:nowrap;}'
    + '@media print{ .ad-flow-tbl{page-break-inside:avoid;} }'
    + '.ad-closing{text-align:center;font-size:13.5px;font-weight:700;margin:22px 0 20px;}'
    + '.ad-attach{font-size:13px;line-height:1.9;border-top:1px solid #dcd6c8;padding-top:14px;margin-top:10px;}'
    + '.ad-attach ul{margin:4px 0 0;padding-left:24px;font-size:12.5px;line-height:1.8;}'
    + '.ad-print-btn{margin:14px 0;font-family:monospace;font-size:12px;background:#132845;color:#f4efe2;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;}'
    + '.ad-word-btn{background:#2b579a;margin-left:8px;}'
    + '@media print{ .ad-print-btn{display:none;} body{margin:0;max-width:none;} @page{size:A4;margin:16mm 16mm;} }'
    + '</style></head><body>'
    + '<button class="ad-print-btn" onclick="window.print()">🖨 인쇄 / PDF 저장</button>'
    + '<button class="ad-print-btn ad-word-btn" onclick="downloadAsWord()">📄 워드 파일(.doc)로 저장</button>'
    + '<div class="ad-hero"><div class="eyebrow">IT AUDIT · ' + docTitle + '</div><h1>' + escFd(ctx.auditName) + '</h1></div>'
    + '<div class="ad-body">' + bodyHtml + '</div>'
    // v6.74 — 기안문·시행문을 워드(.doc)로도 받을 수 있게, 문서 자체 안에 다운로드 함수를 심어둔다.
    // 실제 .docx 바이너리를 만드는 대신, 워드가 그대로 열어 편집할 수 있는 "MS-Word 호환 HTML"(mso 네임스페이스 +
    // 화면에 쓰인 스타일 그대로)을 .doc 확장자로 내려받는 방식 — 네트워크·외부 라이브러리 없이 오프라인에서도 동작한다.
    + '<script>'
    + 'function downloadAsWord(){'
    + '  var content = document.querySelector(".ad-hero").outerHTML + document.querySelector(".ad-body").outerHTML;'
    + '  var styleEl = document.querySelector("style");'
    + '  var styleHtml = styleEl ? styleEl.outerHTML : "";'
    + '  var pre = "<html xmlns:o=\\"urn:schemas-microsoft-com:office:office\\" xmlns:w=\\"urn:schemas-microsoft-com:office:word\\" xmlns=\\"http://www.w3.org/TR/REC-html40\\"><head><meta charset=\\"utf-8\\">"'
    + '    + "<title>' + escFd(docTitle) + '</title>"'
    + '    + "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->"'
    + '    + styleHtml + "</head><body>" + content + "</body></html>";'
    + '  var blob = new Blob(["\ufeff", pre], {type: "application/msword"});'
    + '  var url = URL.createObjectURL(blob);'
    + '  var a = document.createElement("a");'
    + '  a.href = url; a.download = "' + wordFileName + '";'
    + '  document.body.appendChild(a); a.click(); document.body.removeChild(a);'
    + '  URL.revokeObjectURL(url);'
    + '}'
    + '<\/script>'
    + '</body></html>';
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=860,height=1000');
  logReportGenerated('draft', (kind === 'proposal' ? '📝 기안문' : '📨 시행문'), ctx.auditName);
}

export function buildAuditNameSuggestion(selectedDoms){
  const year = new Date().getFullYear();
  const titles = selectedDoms.map(d => d.title);
  let nameSummary, purposeSummary;
  if(titles.length === 1){
    nameSummary = titles[0];
    purposeSummary = titles[0] + ' 관련 통제 현황 점검 및 개선사항 도출';
  } else if(titles.length <= 3){
    nameSummary = titles.join('·');
    purposeSummary = titles.join(', ') + ' 등 ' + titles.length + '개 영역에 대한 통제 현황 점검 및 개선사항 도출';
  } else {
    nameSummary = titles[0] + ' 외 ' + (titles.length - 1) + '개 영역';
    purposeSummary = titles.length + '개 영역(' + titles.slice(0,2).join(', ') + ' 등)에 대한 IT 통제 현황 종합 점검';
  }
  return {
    auditName: year + '년 IT감사 — ' + nameSummary,
    purpose: purposeSummary
  };
}

export function renderAuditNameSuggestion(selectedDoms){
  const box = document.getElementById('auditNameSuggestBox');
  if(!box) return;
  const nameInput = document.getElementById('auditNameInput');
  const purposeInput = document.getElementById('auditPurposeInput');
  const bothEmpty = !nameInput.value.trim() && !purposeInput.value.trim();
  if(selectedDoms.length === 0 || !bothEmpty || auditSuggestDismissed){
    box.style.display = 'none';
    return;
  }
  const sug = buildAuditNameSuggestion(selectedDoms);
  document.getElementById('asbNameText').textContent = sug.auditName;
  document.getElementById('asbPurposeText').textContent = sug.purpose;
  box.dataset.sugName = sug.auditName;
  box.dataset.sugPurpose = sug.purpose;
  box.style.display = 'block';
}

export function saveGenDraftNow(){
  try{
    const payload = {
      savedAt: kstISOString(),
      // [수정] 예전에는 기본 체크리스트가 아니면(엑셀 업로드·빈 체크리스트+직접추가) 통째로 복원을 건너뛰어서,
      // "새 감사영역 추가"로 만든 영역이 새로고침·재접속 시 사라지는 문제가 있었다.
      // 이제는 DOMAINS 자체(직접 추가한 영역·항목 포함)를 그대로 저장해, 다음에 열었을 때 그대로 이어서 쓸 수 있다.
      domains: DOMAINS,
      checklistSourceHtml: (document.getElementById('checklistSourceLabel') || {}).innerHTML || '',
      checklistActiveBtnId: (document.querySelector('.source-btn.active') || {}).id || 'useDefaultChecklistBtn',
      selectedCodes: Array.from(selectedCodes),
      contentOverrides: contentOverrides,
      domainAuditorMap: domainAuditorMap,
      itemDeptMap: itemDeptMap,
      itemAuditorMap: itemAuditorMap,
      currentScale: currentScale,
      auditName: (document.getElementById('auditNameInput') || {}).value || '',
      auditPurpose: (document.getElementById('auditPurposeInput') || {}).value || '',
      auditGrounds: (document.getElementById('auditGroundsInput') || {}).value || '',
    };
    localStorage.setItem(GEN_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  }catch(e){ /* 저장공간 부족 등은 조용히 무시 — 설문지 생성·다운로드 기능 자체는 항상 정상 작동 */ }
}

export function saveGenDraftDebounced(){
  clearTimeout(_genDraftSaveTimer);
  setGenDraftSaveTimer(setTimeout(saveGenDraftNow, 600));
}

export function clearGenDraft(){
  try{ localStorage.removeItem(GEN_DRAFT_STORAGE_KEY); }catch(e){ /* non-fatal */ }
}

export function restoreGenDraft(){
  let saved;
  try{ saved = JSON.parse(localStorage.getItem(GEN_DRAFT_STORAGE_KEY)); }catch(e){ return null; }
  if(!saved) return null;
  // [수정] 저장된 체크리스트(DOMAINS)가 있으면 그대로 복원한다 — 기본/엑셀업로드/빈 체크리스트+직접추가 모두 포함.
  // 이제 DOMAINS는 DEFAULT_DOMAINS와 완전히 분리된 사본이라, 그대로 되살려도 원본은 오염되지 않는다.
  if(Array.isArray(saved.domains)) setDomains(saved.domains);
  if(Array.isArray(saved.selectedCodes)) saved.selectedCodes.forEach(c => selectedCodes.add(c));
  if(saved.contentOverrides) safeAssign(contentOverrides, saved.contentOverrides);
  if(saved.domainAuditorMap) safeAssign(domainAuditorMap, saved.domainAuditorMap);
  if(saved.itemDeptMap) safeAssign(itemDeptMap, saved.itemDeptMap);
  if(saved.itemAuditorMap) safeAssign(itemAuditorMap, saved.itemAuditorMap);
  if(Array.isArray(saved.currentScale) && saved.currentScale.length) setCurrentScale(saved.currentScale);
  const nameEl = document.getElementById('auditNameInput');
  const purposeEl = document.getElementById('auditPurposeInput');
  const groundsEl = document.getElementById('auditGroundsInput');
  if(nameEl && saved.auditName) nameEl.value = saved.auditName;
  if(purposeEl && saved.auditPurpose) purposeEl.value = saved.auditPurpose;
  if(groundsEl && saved.auditGrounds) groundsEl.value = saved.auditGrounds;
  if(saved.checklistSourceHtml){
    const labelEl = document.getElementById('checklistSourceLabel');
    if(labelEl) labelEl.innerHTML = saved.checklistSourceHtml;
  }
  if(saved.checklistActiveBtnId){
    ['useDefaultChecklistBtn','uploadChecklistBtn','blankChecklistBtn'].forEach(id => {
      const btn = document.getElementById(id);
      if(btn) btn.classList.toggle('active', id === saved.checklistActiveBtnId);
    });
  }
  return saved.savedAt || true;
}

export function buildComprehensiveAuditReportHtml(scopeFindings, reportTitle, sections){
  // sections: {overview, opinion, riskSummary, deptDetail, dueDateTable, signoff} — 지정하지 않으면 전체 포함(기존 동작과 동일).
  sections = Object.assign({overview:true, opinion:true, riskSummary:true, deptCompare:true, deptDetail:true, dueDateTable:true, signoff:false}, sections || {});
  const today = kstDateStr();
  const wide = collectAuditWideStats();
  const riskOrder = {상:0, 중:1, 하:2};
  const sorted = scopeFindings.slice().sort((a,b) => (riskOrder[a.riskLevel]??1) - (riskOrder[b.riskLevel]??1));
  const byDept = {};
  sorted.forEach(f => { const d = f.department || '(부서 미지정)'; if(!byDept[d]) byDept[d] = []; byDept[d].push(f); });
  const depts = Object.keys(byDept).sort();

  const riskCounts = {상:0, 중:0, 하:0};
  const actionCounts = Object.fromEntries(FINDING_TYPES.map(t => [t, 0]));
  const statusCounts = {};
  sorted.forEach(f => {
    if(riskCounts[f.riskLevel] !== undefined) riskCounts[f.riskLevel]++;
    if(f.actionType && actionCounts[f.actionType] !== undefined) actionCounts[f.actionType]++;
    const st = f.status || 'draft';
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  });

  // 정량 지표 ① — 조치기한 초과 건수 (기한이 지났는데 아직 조치완료·종결되지 않은 것)
  const todayStr = kstDateStr();
  const overdueFindings = sorted.filter(f => f.dueDate && f.dueDate < todayStr && f.status !== 'remediated' && f.status !== 'closed');

  // 정량 지표 ② — 평균 조치소요기간 (등록일→완료(closedAt) 처리일까지, 실제로 완료 기록이 남은 건만 계산)
  const closedWithDuration = sorted.filter(f => f.closedAt && f.createdAt);
  let avgRemediationDays = null;
  if(closedWithDuration.length > 0){
    const totalDays = closedWithDuration.reduce((sum, f) => {
      const d = (new Date(f.closedAt) - new Date(f.createdAt)) / 86400000;
      return sum + Math.max(0, d);
    }, 0);
    avgRemediationDays = Math.round(totalDays / closedWithDuration.length);
  }

  // 정량 지표 ③ — 반복 지적사항 (같은 항목코드가 과거 저장된 회차에서도 "미흡" 응답이었던 경우)
  // 📚 감사 건별 태깅과는 별개로, ③응답 집계에서 "회차로 저장"해둔 과거 회차 스냅샷을 기준으로 비교한다.
  const pastRounds = (typeof loadRoundsFromStorage === 'function') ? loadRoundsFromStorage() : [];
  const pastBadCodes = new Set();
  pastRounds.forEach(r => (r.rows || []).forEach(row => { if(row.tier === 'bad' && row.code) pastBadCodes.add(row.code); }));
  const recurringFindings = sorted.filter(f => f.code && pastBadCodes.has(f.code));

  // 정량 지표 ④ — 부서별 이행률·발견사항 비교표 (자가진단 체크포인트 이행률 vs 실제 등록된 발견사항 건수를 나란히)
  const deptStatMap = {};
  (typeof aggRows !== 'undefined' ? aggRows : []).forEach(r => {
    const d = r.dept || '(부서 미상)';
    if(!deptStatMap[d]) deptStatMap[d] = {good:0, neutral:0, bad:0, na:0, total:0};
    const c = (typeof igClassifyRow === 'function') ? igClassifyRow(r) : 'na';
    if(c === 'yes') deptStatMap[d].good++; else if(c === 'partial') deptStatMap[d].neutral++; else if(c === 'no') deptStatMap[d].bad++; else deptStatMap[d].na++;
    deptStatMap[d].total++;
  });
  const deptCompareRows = Object.keys(deptStatMap).sort((a,b) => {
    const rateA = deptStatMap[a].total - deptStatMap[a].na > 0 ? deptStatMap[a].good / (deptStatMap[a].total - deptStatMap[a].na) : 1;
    const rateB = deptStatMap[b].total - deptStatMap[b].na > 0 ? deptStatMap[b].good / (deptStatMap[b].total - deptStatMap[b].na) : 1;
    return rateA - rateB; // 이행률 낮은(취약한) 부서가 위로
  }).map(d => {
    const s = deptStatMap[d];
    const applicable = s.total - s.na;
    const rate = applicable > 0 ? Math.round(s.good / applicable * 100) : null;
    const fCount = (byDept[d] || []).length;
    const hiRiskCount = (byDept[d] || []).filter(f => f.riskLevel === '상').length;
    return '<tr><td style="padding:6px 10px;border:1px solid #ccc;">' + escFd(d) + '</td>'
      + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;' + (rate !== null && rate < 70 ? 'color:#a23b2e;font-weight:700;' : '') + '">' + (rate !== null ? (rate + '%') : '-') + '</td>'
      + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + fCount + '건</td>'
      + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;' + (hiRiskCount > 0 ? 'color:#a23b2e;font-weight:700;' : '') + '">' + hiRiskCount + '건</td></tr>';
  }).join('');
  const deptCompareHtml = deptCompareRows
    ? ('<table style="border-collapse:collapse;width:100%;font-size:12.5px;"><tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;text-align:left;">부서</th><th style="padding:6px 10px;border:1px solid #ccc;">자가진단 이행률</th><th style="padding:6px 10px;border:1px solid #ccc;">발견사항</th><th style="padding:6px 10px;border:1px solid #ccc;">이 중 위험도 상</th></tr>' + deptCompareRows + '</table>'
      + '<div style="font-size:11px;color:#5a6472;margin-top:6px;">💡 이행률이 낮은 부서 순으로 정렬했습니다. 자가진단 이행률과 실제 발견사항 건수가 상반되는 부서(예: 자가진단은 높은데 발견사항도 많음)는 자체평가 신뢰도를 별도로 점검해 볼 필요가 있습니다.</div>')
    : '<p style="font-size:12.5px;color:#777;">집계된 설문 응답이 없어 부서별 비교표를 생성할 수 없습니다.</p>';

  // ① 감사개요 — 감사 기본정보 + 지금까지 실제로 쌓인 활동량(응답·인터뷰·진척도)을 표로 보여준다.
  const ov = wide;
  const ovCtx = ov.ctx;
  const overviewTableRows = [
    ['대상 영역', ovCtx && ovCtx.domainTitles.length > 0 ? (ovCtx.domainTitles.length + '개 (' + ovCtx.domainTitles.map(d=>d.title).join(', ') + ')') : '(① 설문지 생성 탭에서 대상 영역을 선택해 주세요)'],
    ['총 점검항목', ov.totalItems + '개'],
    ['감사 기간', (ovCtx && (ovCtx.surveyStart || ovCtx.reportDate)) ? ((ovCtx.surveyStart || '(미정)') + ' ~ ' + (ovCtx.reportDate || '(미정)')) : '(① 설문지 생성 탭에서 일정을 입력해 주세요)'],
    ['참여 감사역', (ovCtx && ovCtx.participants) ? ovCtx.participants : '(미입력)'],
    ['응답 현황', ov.totalResp > 0 ? (ov.respDepts.size + '개 부서 · 체크포인트 응답 ' + ov.totalResp + '건') : '(아직 취합된 응답이 없습니다)'],
    ['인터뷰 수행', ov.interviewTotal > 0 ? (ov.interviewDoneCount + ' / ' + ov.interviewTotal + '건 완료') : '(아직 진행된 인터뷰가 없습니다)'],
    ['칸반 진행률', ov.kbPct !== null ? (ov.kbPct + '% (' + ov.kbDone + ' / ' + ov.kbAll.length + '건 완료)') : '(칸반보드에 등록된 카드가 없습니다)'],
    ['발견사항', sorted.length + '건 (위험도 상 ' + riskCounts['상'] + ' · 중 ' + riskCounts['중'] + ' · 하 ' + riskCounts['하'] + ')']
  ];
  const overviewHtml = '<p style="font-size:13px;line-height:1.8;">본 보고서는 IT 자체감사 수행 결과, 설문 응답·인터뷰 결과·발견사항을 종합해 정리한 것입니다.</p>'
    + '<table style="border-collapse:collapse;width:100%;font-size:12.5px;">'
    + overviewTableRows.map(([label, val]) => '<tr><td style="padding:6px 10px;border:1px solid #ccc;background:#f1ede1;font-weight:700;width:130px;">' + escFd(label) + '</td><td style="padding:6px 10px;border:1px solid #ccc;">' + escFd(val) + '</td></tr>').join('')
    + '</table>';

  // ② 종합의견 — 발견사항 통계뿐 아니라 설문 자가진단 결과(이행률)·인터뷰 커버리지·우선조치 필요영역까지 반영.
  const respPct = (tier) => ov.totalResp > 0 ? Math.round((ov.tierCounts[tier] / ov.totalResp) * 100) : null;
  const selfAssessSentence = ov.totalResp > 0
    ? ('설문 자가진단 결과, 전체 체크포인트 ' + ov.totalResp + '건 중 이행 ' + ov.tierCounts.good + '건(' + respPct('good') + '%), 부분이행 ' + ov.tierCounts.neutral + '건(' + respPct('neutral') + '%), 미흡 ' + ov.tierCounts.bad + '건(' + respPct('bad') + '%)으로 응답되었습니다.')
    : '';
  const interviewSentence = ov.interviewTotal > 0
    ? (' 인터뷰는 대상 ' + ov.interviewTotal + '건 중 ' + ov.interviewDoneCount + '건(' + Math.round((ov.interviewDoneCount/ov.interviewTotal)*100) + '%)이 완료되었습니다.')
    : '';
  const topBadSentence = ov.topBadDomains.length > 0
    ? (' 자가진단상 미흡 응답이 가장 많이 나온 영역은 ' + ov.topBadDomains.map(d => 'D-' + d.code + ' ' + d.title + '(' + d.count + '건)').join(', ') + '으로, 우선적인 확인이 필요합니다.')
    : '';

  const overdueSentence = overdueFindings.length > 0
    ? (' 이 중 조치기한이 이미 지났는데도 아직 조치완료되지 않은 사항이 ' + overdueFindings.length + '건 있어 확인이 필요합니다.')
    : '';
  const recurringSentence = recurringFindings.length > 0
    ? (' 과거 회차에서도 동일 항목이 미흡으로 확인된 반복 지적사항이 ' + recurringFindings.length + '건 포함되어 있어, 근본적인 원인 해소 여부를 재점검할 필요가 있습니다.')
    : '';
  const avgRemediationSentence = avgRemediationDays !== null
    ? (' 조치가 완료된 항목의 평균 소요기간은 ' + avgRemediationDays + '일입니다.')
    : '';
  const overallOpinion = sorted.length === 0
    ? ('금번 감사 결과, 등록된 지적·개선사항이 없어 전반적으로 적정하게 운영되고 있는 것으로 판단됩니다.' + (selfAssessSentence ? (' ' + selfAssessSentence) : '') + interviewSentence)
    : ('금번 감사 결과 총 ' + sorted.length + '건의 발견사항이 확인되었으며, 이 중 위험도 "상" ' + riskCounts['상'] + '건'
      + (riskCounts['상'] > 0 ? '에 대해서는 우선적인 조치가 필요합니다.' : '입니다.')
      + ' 감사결과 구분별로는 ' + FINDING_TYPES.map(t => FINDING_TYPE_META[t].short + ' ' + actionCounts[t] + '건').join(', ') + '입니다.'
      + (selfAssessSentence ? (' ' + selfAssessSentence) : '') + interviewSentence + topBadSentence + overdueSentence + recurringSentence + avgRemediationSentence);

  const riskTableRows = ['상','중','하'].map(r =>
    '<tr><td style="padding:6px 10px;border:1px solid #ccc;">위험도 ' + r + '</td><td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + riskCounts[r] + '건</td></tr>'
  ).join('');

  const deptSections = depts.length === 0
    ? '<p style="font-size:13px;color:#777;">등록된 발견사항이 없습니다.</p>'
    : depts.map(d => {
        const items = byDept[d];
        const ACTION_LABEL = Object.fromEntries(FINDING_TYPES.map(t => [t, FINDING_TYPE_META[t].icon + ' ' + FINDING_TYPE_META[t].short]));
        // 종합보고서는 "한눈에 훑어보는 표"가 기본이고, 개별 건의 현황·권고·조치계획 같은 상세 서술은
        // 통보서(개별 문서)의 몫이므로 여기서는 <details>로 접어둬 필요할 때만 펼쳐보게 한다.
        // 이렇게 하면 종합보고서를 쭉 읽을 때는 "표 → 표 → 표"로 흐르고, 개별 통보서를 열었을 때만
        // "현황/권고사항/조치계획" 서술형 문단을 보게 되어 두 문서의 성격이 분명히 구분된다.
        const tableRows = items.map((f,i) => {
          const isRecurring = f.code && pastBadCodes.has(f.code);
          const isOverdue = f.dueDate && f.dueDate < todayStr && f.status !== 'remediated' && f.status !== 'closed';
          return '<tr>'
            + '<td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">' + (i+1) + '</td>'
            + '<td style="padding:6px 8px;border:1px solid #ccc;">' + escFd(f.title) + (isRecurring ? ' <span style="font-size:10px;color:#a23b2e;font-weight:700;">[반복]</span>' : '') + '</td>'
            + '<td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">' + escFd(f.riskLevel||'-') + '</td>'
            + '<td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">' + (f.actionType ? escFd(ACTION_LABEL[f.actionType]) : '-') + '</td>'
            + '<td style="padding:6px 8px;border:1px solid #ccc;text-align:center;' + (isOverdue ? 'color:#a23b2e;font-weight:700;' : '') + '">' + escFd(f.dueDate || '-') + (isOverdue ? ' ⚠' : '') + '</td>'
          + '</tr>';
        }).join('');
        const detailBlocks = items.map((f,i) =>
          '<details style="border:1px solid #dcd6c8;border-left:4px solid ' + (f.riskLevel==='상'?'#a23b2e':(f.riskLevel==='중'?'#b8863b':'#2e7d5b')) + ';margin-bottom:8px;padding:8px 14px;">'
            + '<summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:#132845;">' + (i+1) + '. ' + escFd(f.title) + ' — 상세 펼치기</summary>'
            + '<div style="font-size:12.5px;line-height:1.7;color:#1b2330;margin-top:8px;"><b>현황:</b> ' + escFd(f.description || '(작성 필요)') + '</div>'
            + '<div style="font-size:12.5px;line-height:1.7;color:#1b2330;margin-top:4px;"><b>권고사항:</b> ' + escFd(f.recommendation || '(작성 필요)') + '</div>'
            + (f.actionPlan ? ('<div style="font-size:12.5px;line-height:1.7;color:#1b2330;margin-top:4px;"><b>조치계획:</b> ' + escFd(f.actionPlan) + '</div>') : '')
          + '</details>'
        ).join('');
        return '<div style="margin-bottom:22px;">'
          + '<h4 style="font-size:14px;color:#132845;border-bottom:2px solid #132845;padding-bottom:6px;margin-bottom:10px;">📁 ' + escFd(d) + ' (' + items.length + '건)</h4>'
          + '<table style="border-collapse:collapse;width:100%;font-size:12px;margin-bottom:10px;"><tr style="background:#f1ede1;"><th style="padding:6px 8px;border:1px solid #ccc;width:28px;">#</th><th style="padding:6px 8px;border:1px solid #ccc;text-align:left;">제목</th><th style="padding:6px 8px;border:1px solid #ccc;width:60px;">위험도</th><th style="padding:6px 8px;border:1px solid #ccc;width:70px;">구분</th><th style="padding:6px 8px;border:1px solid #ccc;width:90px;">조치기한</th></tr>' + tableRows + '</table>'
          + detailBlocks
        + '</div>';
      }).join('');

  const dueDateRows = sorted.filter(f => f.dueDate).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  const dueDateTable = dueDateRows.length === 0
    ? '<tr><td colspan="4" style="padding:8px 10px;border:1px solid #ccc;text-align:center;color:#777;">조치기한이 설정된 발견사항이 없습니다.</td></tr>'
    : dueDateRows.map(f =>
        '<tr><td style="padding:6px 10px;border:1px solid #ccc;">' + escFd(f.dueDate) + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #ccc;">' + escFd(f.department||'-') + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #ccc;">' + escFd(f.title) + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + escFd(f.riskLevel) + '</td></tr>'
      ).join('');

  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>' + escFd(reportTitle) + '</title><style>'
    + 'body{font-family:"Pretendard","Noto Sans KR",sans-serif;color:#1b2330;max-width:840px;margin:24px auto;padding:0 20px;}'
    + '.car-hero{background:#132845;color:#f4efe2;padding:28px 32px;border-radius:6px 6px 0 0;}'
    + '.car-hero .eyebrow{font-family:monospace;letter-spacing:.15em;font-size:11px;color:#e4c78a;text-transform:uppercase;margin-bottom:8px;}'
    + '.car-hero h1{margin:0;font-size:23px;}'
    + '.car-hero .sub{font-size:12.5px;color:#c9d2e2;margin-top:8px;}'
    + '.car-body{border:1px solid #dcd6c8;border-top:none;padding:28px 32px;}'
    + '.car-section h3{font-size:14.5px;color:#132845;border-bottom:2px solid #132845;padding-bottom:6px;margin:26px 0 12px;}'
    + '.car-section:first-of-type h3{margin-top:0;}'
    + '.car-opinion{font-size:13.5px;line-height:1.85;background:#f5f1e6;border-radius:6px;padding:14px 18px;}'
    + '.car-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}'
    + '.car-print-btn{margin:16px 0;font-family:monospace;font-size:12px;background:#132845;color:#f4efe2;border:none;padding:9px 18px;border-radius:6px;cursor:pointer;}'
    + '@media print{ .car-print-btn{display:none;} body{margin:0;max-width:none;} @page{size:A4;margin:16mm 14mm;} .car-section{page-break-inside:avoid;} }'
    + '</style></head><body>'
    + '<button class="car-print-btn" onclick="window.print()">🖨 인쇄 / PDF 저장</button>'
    + '<div class="car-hero"><div class="eyebrow">IT AUDIT · 종합 감사결과보고서</div><h1>' + escFd(reportTitle) + '</h1>'
      + '<div class="sub">작성일: ' + today + ' (KST) &nbsp;·&nbsp; 총 발견사항: ' + sorted.length + '건 &nbsp;·&nbsp; 대상 부서: ' + depts.length + '개</div></div>'
    + '<div class="car-body">'
      + (() => {
          const ROMAN = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ'];
          const blocks = [];
          if(sections.overview) blocks.push({title:'감사개요', body: overviewHtml});
          if(sections.opinion) blocks.push({title:'종합의견', body: '<div class="car-opinion">' + overallOpinion + '</div>'});
          if(sections.riskSummary) blocks.push({title:'위험도별 요약', body:
            '<div class="car-summary-grid">'
            + '<table style="border-collapse:collapse;width:100%;font-size:12.5px;"><tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;">위험도</th><th style="padding:6px 10px;border:1px solid #ccc;">건수</th></tr>' + riskTableRows + '</table>'
            + '<table style="border-collapse:collapse;width:100%;font-size:12.5px;"><tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;">감사결과 구분</th><th style="padding:6px 10px;border:1px solid #ccc;">건수</th></tr>'
              + FINDING_TYPES.map(t => '<tr><td style="padding:6px 10px;border:1px solid #ccc;">' + FINDING_TYPE_META[t].icon + ' ' + FINDING_TYPE_META[t].short + '</td><td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + actionCounts[t] + '건</td></tr>').join('')
            + '</table></div>'
            + '<table style="border-collapse:collapse;width:100%;font-size:12.5px;margin-top:14px;"><tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;">⚠ 조치기한 초과</th><th style="padding:6px 10px;border:1px solid #ccc;">🔁 반복 지적사항</th><th style="padding:6px 10px;border:1px solid #ccc;">⏱ 평균 조치소요기간</th></tr>'
              + '<tr><td style="padding:6px 10px;border:1px solid #ccc;text-align:center;' + (overdueFindings.length>0?'color:#a23b2e;font-weight:700;':'') + '">' + overdueFindings.length + '건</td>'
              + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;' + (recurringFindings.length>0?'color:#a23b2e;font-weight:700;':'') + '">' + recurringFindings.length + '건</td>'
              + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + (avgRemediationDays !== null ? (avgRemediationDays + '일') : '(완료 기록 없음)') + '</td></tr>'
            + '</table>'});
          if(sections.deptCompare) blocks.push({title:'부서별 이행률·발견사항 비교', body: deptCompareHtml});
          if(sections.deptDetail) blocks.push({title:'부서별 상세 발견사항', body: deptSections});
          if(sections.dueDateTable) blocks.push({title:'조치기한 총괄표', body:
            '<table style="border-collapse:collapse;width:100%;font-size:12.5px;"><tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;">조치기한</th><th style="padding:6px 10px;border:1px solid #ccc;">부서</th><th style="padding:6px 10px;border:1px solid #ccc;">발견사항</th><th style="padding:6px 10px;border:1px solid #ccc;">위험도</th></tr>' + dueDateTable + '</table>'});
          if(sections.signoff) blocks.push({title:'확인', body:
            '<table style="border-collapse:collapse;width:100%;font-size:12.5px;">'
              + '<tr><td style="padding:16px 10px;border:1px solid #ccc;width:33%;text-align:center;">작성 감사역&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(인)</td>'
              + '<td style="padding:16px 10px;border:1px solid #ccc;width:33%;text-align:center;">감사팀장&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(인)</td>'
              + '<td style="padding:16px 10px;border:1px solid #ccc;width:33%;text-align:center;">대표이사(감사위원회 위원장)&nbsp;&nbsp;&nbsp;&nbsp;(인)</td></tr>'
            + '</table>', noBreak:true});
          return blocks.map((b,i) => '<div class="car-section"' + (b.noBreak ? ' style="page-break-inside:avoid;"' : '') + '><h3>' + (ROMAN[i]||(i+1)) + '. ' + b.title + '</h3>' + b.body + '</div>').join('');
        })()
    + '</div>'
    + '</body></html>';
}

export function openComprehensiveReport(){
  const scope = document.getElementById('reportStatusScope').value;
  const title = document.getElementById('reportAuditName').value.trim() || 'IT감사 종합 감사결과보고서';
  let scopeFindings = findings;
  if(scope === 'confirmed_plus') scopeFindings = findings.filter(f => f.status && f.status !== 'draft');

  const deptRow = document.getElementById('reportDeptFilterRow');
  if(deptRow && deptRow.style.display !== 'none'){
    const deptVal = document.getElementById('reportDeptFilter').value;
    if(!deptVal){ alert('피감사부서 통보용은 대상 부서를 선택해야 합니다.'); return; }
    scopeFindings = scopeFindings.filter(f => f.department === deptVal);
  }

  if(scopeFindings.length === 0){
    document.getElementById('reportEmptyHint').style.display = 'block';
    return;
  }
  document.getElementById('reportEmptyHint').style.display = 'none';
  const sections = {
    overview: document.getElementById('rptSec-overview').checked,
    opinion: document.getElementById('rptSec-opinion').checked,
    riskSummary: document.getElementById('rptSec-riskSummary').checked,
    deptCompare: document.getElementById('rptSec-deptCompare').checked,
    deptDetail: document.getElementById('rptSec-deptDetail').checked,
    dueDateTable: document.getElementById('rptSec-dueDateTable').checked,
    signoff: document.getElementById('rptSec-signoff').checked
  };
  const html = buildComprehensiveAuditReportHtml(scopeFindings, title, sections);
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=900,height=1000');
  logReportGenerated('comprehensive', '📑 종합 감사결과보고서', title + ' · ' + scopeFindings.length + '건');
}

export function refreshReportDeptFilterOptions(){
  const sel = document.getElementById('reportDeptFilter');
  if(!sel) return;
  const depts = Array.from(new Set(findings.map(f => f.department).filter(Boolean))).sort();
  sel.innerHTML = depts.length === 0
    ? '<option value="">(등록된 발견사항에 부서 정보가 없습니다)</option>'
    : depts.map(d => '<option value="' + esc(d) + '">' + esc(d) + '</option>').join('');
}

export function loadReportLog(){ try{ return JSON.parse(localStorage.getItem(REPORT_LOG_STORAGE_KEY) || '[]'); }catch(e){ return []; } }

export function saveReportLog(list){ try{ localStorage.setItem(REPORT_LOG_STORAGE_KEY, JSON.stringify(list)); }catch(e){} }

export function logReportGenerated(type, label, extra){
  const log = loadReportLog();
  log.push({
    id: 'rl' + Date.now() + Math.random().toString(36).slice(2,6),
    type, label: label || '', extra: extra || '', auditName: getCurrentAuditName(),
    generatedAt: kstISOString(), generatedBy: (typeof getCurrentAuditor === 'function' ? getCurrentAuditor() : '') || ''
  });
  saveReportLog(log);
  if(typeof renderReportLog === 'function') renderReportLog();
}

export function renderReportCenter(){
  renderInterimReportPicker();
  renderReportLog();
}

export function renderInterimReportPicker(){
  const box = document.getElementById('interimReportPicker');
  if(!box) return;
  const noteBox = document.getElementById('interimReportHistoryNote');
  if(noteBox){
    const log = loadReportLog();
    const interimEntries = log.filter(e => e.type === 'interim').sort((a,b) => (b.generatedAt||'').localeCompare(a.generatedAt||''));
    if(interimEntries.length === 0){
      noteBox.style.cssText = 'font-size:11px;margin-bottom:10px;padding:7px 10px;border-radius:5px;background:#f5f1e6;border:1px solid var(--line);color:var(--ink-soft);';
      noteBox.textContent = '🕐 아직 이 브라우저에서 중간보고를 생성한 적이 없습니다.';
    } else {
      const last = interimEntries[0];
      noteBox.style.cssText = 'font-size:11px;margin-bottom:10px;padding:7px 10px;border-radius:5px;background:var(--risk-hi-bg);border:1px solid var(--risk-hi);color:var(--risk-hi);font-weight:700;';
      noteBox.textContent = '🕐 최근 중간보고: ' + String(last.generatedAt||'').replace('T',' ').slice(0,16) + ' (' + (last.generatedBy || '작성자 미상') + ') — 지금까지 총 ' + interimEntries.length + '회 생성됨';
    }
  }
  if(findings.length === 0){
    box.innerHTML = '<div class="assign-empty">등록된 발견사항이 없습니다. 먼저 📋 발견사항 관리 탭에서 발견사항을 등록해 주세요.</div>';
    return;
  }
  const flaggedIdx = findings.map((f, idx) => ({f, idx})).filter(x => x.f.interimFlagged);
  if(flaggedIdx.length === 0){
    box.innerHTML = '<div class="assign-empty">🚨 중간보고 대상으로 표시된 발견사항이 아직 없습니다 — 기능이 사라진 게 아니라, 표시한 건만 여기 모입니다. 📋 발견사항 관리 탭에서 해당 건을 열어 "🚨 이 건은 중간보고(Interim Report) 대상입니다"를 체크해 주세요. 표시해 두면 이 화면에 자동으로 나타나고, 발견사항 목록에서도 그 건 하나만 바로 중간보고서로 만들 수 있는 버튼이 생깁니다.</div>';
    return;
  }
  const STATUS_LABEL_PLAIN = {draft:'📝 초안', confirmed:'✅ 확정', in_progress:'🔧 조치중', remediated:'🛠 조치완료', closed:'🔒 종결'};
  box.innerHTML = flaggedIdx.map(({f, idx}) => {
    // 원래 이 항목이 확인하려던 목적(체크리스트 항목의 취지)을 함께 보여줘, "그 활동이 안 됐다/오히려
    // 위험을 키웠다"는 판단을 감사역이 이 화면에서 바로 내릴 수 있도록 돕는다.
    const item = f.code ? igFindItem(f.code) : null;
    const purposeHint = item && item.desc ? (' — 원래 확인 목적: ' + esc(item.desc)) : '';
    const reportedHint = f.interimReportedAt ? (' · <span style="color:var(--risk-hi);">🕐 마지막 보고 ' + esc(String(f.interimReportedAt).slice(0,10)) + '</span>') : ' · <span style="color:var(--good);">아직 미보고</span>';
    const cls = f.interimClass || 'notdone';
    return '<div class="rc-interim-row" style="flex-direction:column;align-items:stretch;gap:6px;border-bottom:1px solid var(--line);padding:9px 0;">'
      + '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">'
        + '<input type="checkbox" class="rc-interim-chk" data-idx="' + idx + '" checked style="margin-top:3px;">'
        + '<span><b>' + esc(f.title) + '</b> — 위험도 ' + esc(f.riskLevel||'-') + ' · ' + esc(f.department||'-') + ' · ' + esc(STATUS_LABEL_PLAIN[f.status] || '📝 초안') + reportedHint + '<br><span style="font-size:10.5px;color:var(--ink-soft);">' + (f.code ? esc(f.code) : '자유등록') + purposeHint + '</span></span>'
      + '</label>'
      + '<div style="margin-left:24px;display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--ink-soft);">'
        + '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="radio" name="rc-interim-class-' + idx + '" class="rc-interim-class" data-idx="' + idx + '" value="notdone"' + (cls==='notdone' ? ' checked' : '') + ' onchange="toggleInterimCustomInput(' + idx + ')"> 🔴 확인하려던 통제활동 자체가 이루어지지 않음</label>'
        + '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="radio" name="rc-interim-class-' + idx + '" class="rc-interim-class" data-idx="' + idx + '" value="worsens"' + (cls==='worsens' ? ' checked' : '') + ' onchange="toggleInterimCustomInput(' + idx + ')"> ⚠ 통제는 있으나 오히려 위험을 키우는 것으로 판단됨</label>'
        + '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--risk-hi);font-weight:700;"><input type="radio" name="rc-interim-class-' + idx + '" class="rc-interim-class" data-idx="' + idx + '" value="fraud"' + (cls==='fraud' ? ' checked' : '') + ' onchange="toggleInterimCustomInput(' + idx + ')"> 🚨 부정(Fraud) 행위로 판단되거나 확인됨</label>'
        + '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="radio" name="rc-interim-class-' + idx + '" class="rc-interim-class" data-idx="' + idx + '" value="custom"' + (cls==='custom' ? ' checked' : '') + ' onchange="toggleInterimCustomInput(' + idx + ')"> ✍ 감사자가 직접 작성</label>'
      + '</div>'
      + '<div class="rc-interim-custom-wrap" data-idx="' + idx + '" style="display:' + (cls==='custom' ? 'block' : 'none') + ';margin-left:24px;margin-top:2px;">'
        + '<input type="text" class="rc-interim-custom-text" data-idx="' + idx + '" value="' + esc(f.interimCustomText||'') + '" placeholder="이 항목을 중간보고 대상으로 보는 이유를 직접 적어주세요 (보고서의 \'중간보고 판단 근거\'란에 그대로 사용됩니다)" style="width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:11.5px;">'
      + '</div>'
      + (f.interimBackground ? ('<div style="margin-left:24px;font-size:10.8px;color:var(--ink-soft);">📝 이 건의 경위·배경(발견사항 관리에서 입력됨): ' + esc(f.interimBackground) + '</div>') : '')
      + (f.interimRequest ? ('<div style="margin-left:24px;font-size:10.8px;color:var(--ink-soft);">🙋 이 건의 요청사항(발견사항 관리에서 입력됨): ' + esc(f.interimRequest) + '</div>') : '')
    + '</div>';
  }).join('');
}

export function renderReportLog(){
  const box = document.getElementById('reportLogPanel');
  if(!box || box.style.display === 'none') return;
  const log = loadReportLog().slice().sort((a,b) => (b.generatedAt||'').localeCompare(a.generatedAt||''));
  if(log.length === 0){
    box.innerHTML = '<div class="assign-empty" style="text-align:left;color:var(--ink-soft);">아직 생성한 리포트가 없습니다. 위에서 리포트를 생성하면 여기 이력이 쌓입니다.</div>';
    return;
  }
  box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11.5px;">'
    + '<tr style="background:#f1ede1;"><th style="padding:6px 8px;border:1px solid var(--line);text-align:left;">유형</th><th style="padding:6px 8px;border:1px solid var(--line);text-align:left;">제목 / 범위</th><th style="padding:6px 8px;border:1px solid var(--line);">생성일시</th><th style="padding:6px 8px;border:1px solid var(--line);">생성자</th></tr>'
    + log.map(e => {
        const isInterim = e.type === 'interim';
        return '<tr' + (isInterim ? ' style="background:var(--risk-hi-bg);"' : '') + '>'
          + '<td style="padding:6px 8px;border:1px solid var(--line);' + (isInterim ? 'color:var(--risk-hi);font-weight:700;' : '') + '">' + esc(REPORT_LOG_TYPE_LABEL[e.type] || e.type) + '</td>'
          + '<td style="padding:6px 8px;border:1px solid var(--line);">' + esc(e.label) + (e.extra ? (' — ' + esc(e.extra)) : '') + '</td>'
          + '<td style="padding:6px 8px;border:1px solid var(--line);text-align:center;white-space:nowrap;">' + esc(String(e.generatedAt||'').replace('T',' ').slice(0,16)) + '</td>'
          + '<td style="padding:6px 8px;border:1px solid var(--line);text-align:center;">' + esc(e.generatedBy || '-') + '</td>'
        + '</tr>';
      }).join('')
  + '</table>';
}

export function toggleInterimCustomInput(idx){
  const wrap = document.querySelector('.rc-interim-custom-wrap[data-idx="' + idx + '"]');
  if(!wrap) return;
  const selected = document.querySelector('.rc-interim-class[data-idx="' + idx + '"]:checked');
  wrap.style.display = (selected && selected.value === 'custom') ? 'block' : 'none';
}

export function generateInterimReport(){
  const checks = Array.from(document.querySelectorAll('.rc-interim-chk:checked'));
  if(checks.length === 0){ alert('중간보고에 포함할 발견사항을 최소 1건 선택해 주세요.'); return; }
  const selected = checks.map(chk => {
    const idx = Number(chk.dataset.idx);
    const finding = findings[idx];
    const classEl = document.querySelector('.rc-interim-class[data-idx="' + idx + '"]:checked');
    const classification = classEl ? classEl.value : 'notdone';
    let customText = '';
    if(classification === 'custom'){
      const textEl = document.querySelector('.rc-interim-custom-text[data-idx="' + idx + '"]');
      customText = (textEl && textEl.value.trim()) || '';
      if(!customText){ alert('"' + finding.title + '" 항목은 "감사자가 직접 작성"을 선택했는데, 판단 근거를 입력하지 않았습니다. 입력 후 다시 시도해 주세요.'); return null; }
    }
    return finding ? {finding, classification, customText} : null;
  });
  if(selected.includes(null)) return; // 직접 작성 항목에 텍스트 미입력 — 위에서 이미 안내함
  const validSelected = selected.filter(Boolean);
  const background = (document.getElementById('interimReportBackground') || {}).value || '';
  const request = (document.getElementById('interimReportRequest') || {}).value || '';
  const html = buildInterimReportHtml(validSelected, background.trim(), request.trim());
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=900,height=1000');
  logReportGenerated('interim', '🚨 중간보고서', validSelected.length + '건: ' + validSelected.map(s => s.finding.title).join(', '));
  // 이번에 보고서에 포함된 건은 "보고 완료 시각"을 남겨, 발견사항 목록·이 피커에서 "아직 미보고"와
  // 구분되어 보이게 한다. 이 화면에서 고른 판단유형·직접작성 텍스트도 발견사항 쪽에 그대로 반영한다.
  const nowIso = kstISOString();
  validSelected.forEach(s => {
    s.finding.interimReportedAt = nowIso;
    s.finding.interimClass = s.classification;
    if(s.classification === 'custom') s.finding.interimCustomText = s.customText;
  });
  saveFindings();
  renderInterimReportPicker();
  if(typeof renderFindingsList === 'function') renderFindingsList();
}

export function buildInterimReportHtml(selected, background, request){
  // selected: [{finding, classification: 'notdone'|'worsens'|'fraud'|'custom', customText}, ...]
  const auditName = (document.getElementById('auditNameInput') || {}).value || '(감사명 미입력)';
  const preparedBy = getCurrentAuditor() || '(작성자 미입력)';
  const today = kstDateStr();
  const CLASS_META = {
    notdone: {badge: '🔴 통제활동 미실시', desc: '설문·인터뷰로 확인하고자 했던 통제활동 자체가 수행되지 않고 있는 것으로 확인되었습니다.'},
    worsens: {badge: '⚠ 위험 증가 요인', desc: '관련 통제는 존재하나, 운영 방식·현황이 오히려 위험을 키우는 것으로 판단됩니다.'},
    fraud: {badge: '🚨 부정(Fraud) 행위', desc: '통제 미비를 넘어, 고의적인 부정행위(Fraud)로 판단되거나 그 정황이 확인되었습니다. 관련 법령·내부규정에 따른 즉각적인 조사·조치가 필요합니다.'}
  };
  const notDoneCount = selected.filter(s => s.classification === 'notdone').length;
  const worsensCount = selected.filter(s => s.classification === 'worsens').length;
  const fraudCount = selected.filter(s => s.classification === 'fraud').length;
  const customCount = selected.filter(s => s.classification === 'custom').length;
  const judgmentParts = [];
  if(notDoneCount) judgmentParts.push('확인하려던 통제활동 자체가 이루어지지 않은 사항이 ' + notDoneCount + '건');
  if(worsensCount) judgmentParts.push('기존 통제가 오히려 위험을 증가시키는 것으로 판단되는 사항이 ' + worsensCount + '건');
  if(fraudCount) judgmentParts.push('부정(Fraud) 행위로 판단·확인된 사항이 ' + fraudCount + '건');
  if(customCount) judgmentParts.push('감사자가 별도 사유를 직접 작성한 사항이 ' + customCount + '건');
  const judgmentSentence = '금번 보고 대상 ' + selected.length + '건 중, ' + judgmentParts.join(', ') + '입니다. 어느 유형이든 최종 감사결과보고를 기다리지 않고 즉시 알려야 할 만큼 위험도가 높다고 판단해 별도로 보고합니다.'
    + (fraudCount > 0 ? ' 특히 부정(Fraud)으로 판단·확인된 사항은 통상적인 통제 개선 절차와 별개로 즉각적인 조사 착수 여부를 결정해 주시기 바랍니다.' : '');

  const itemBlocks = selected.map((s, i) => {
    const f = s.finding;
    let cls;
    if(s.classification === 'custom'){
      cls = {badge: '✍ 감사자 직접 작성', desc: s.customText || '(작성된 내용 없음)'};
    } else {
      cls = CLASS_META[s.classification] || CLASS_META.notdone;
    }
    const isFraud = s.classification === 'fraud';
    const item = f.code ? igFindItem(f.code) : null;
    const purpose = item && item.desc ? item.desc : '(체크리스트와 연결되지 않은 자유 등록 항목입니다)';
    return '<div style="border:1px solid #dcd6c8;border-left:4px solid ' + (isFraud ? '#7a291f' : '#a23b2e') + ';margin-bottom:14px;padding:14px 16px;' + (isFraud ? 'background:#fdf2f0;' : '') + '">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:8px;">'
        + '<div style="font-size:13.5px;font-weight:700;color:#132845;">' + (i+1) + '. ' + esc(f.title) + ' <span style="font-size:11px;font-weight:400;color:#5a6472;">(' + esc(f.code || '자유등록') + ' · 위험도 ' + esc(f.riskLevel||'-') + ' · ' + esc(f.department||'-') + ')</span></div>'
        + '<span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:4px;background:' + (isFraud ? '#7a291f' : '#f7e6e2') + ';color:' + (isFraud ? '#fff' : '#a23b2e') + ';white-space:nowrap;">' + cls.badge + '</span>'
      + '</div>'
      + '<div style="font-size:12px;color:#5a6472;background:#f5f1e6;border-radius:5px;padding:8px 10px;margin-bottom:8px;line-height:1.6;">🎯 원래 확인 목적: ' + escFd(purpose) + '</div>'
      + '<div style="font-size:12.5px;line-height:1.7;color:#1b2330;"><b>확인된 현황:</b> ' + escFd(f.description || '(작성 필요)') + '</div>'
      + '<div style="font-size:12.5px;line-height:1.7;color:#1b2330;margin-top:4px;"><b>중간보고 판단 근거:</b> ' + escFd(cls.desc) + '</div>'
      + '<div style="font-size:12.5px;line-height:1.7;color:#1b2330;margin-top:4px;"><b>권고사항:</b> ' + escFd(f.recommendation || '(작성 필요)') + '</div>'
      + (f.interimBackground ? ('<div style="font-size:12.5px;line-height:1.7;color:#1b2330;margin-top:4px;"><b>이 건의 경위·배경:</b> ' + escFd(f.interimBackground) + '</div>') : '')
      + (f.interimRequest ? ('<div style="font-size:12.5px;line-height:1.7;color:#1b2330;margin-top:4px;"><b>이 건의 요청사항:</b> ' + escFd(f.interimRequest) + '</div>') : '')
      + (f.dueDate ? ('<div style="font-size:11.5px;color:#a23b2e;margin-top:6px;font-weight:700;">조치기한: ' + escFd(f.dueDate) + '</div>') : '')
    + '</div>';
  }).join('');

  let secNum = 1;
  const sections = [];
  sections.push({title: secNum++ + '. 판단 근거 요약', body: '<div class="ir-note" style="background:#fdf4f2;border:1px solid #f0c9c1;border-radius:6px;padding:10px 14px;color:#8a2f24;">' + escFd(judgmentSentence) + '</div>'});
  if(background) sections.push({title: secNum++ + '. 종합 개요' + (selected.length > 1 ? ' (전체 건 공통 경위)' : ''), body: '<div class="ir-note">' + escFd(background) + '</div>'});
  sections.push({title: secNum++ + '. 보고 대상 사항 (' + selected.length + '건)', body: itemBlocks});
  if(request) sections.push({title: secNum++ + '. 종합 요청사항 (감사팀장 결재·승인 요청)' + (selected.length > 1 ? ' (전체 건 공통)' : ''), body: '<div class="ir-note" style="background:#eef0f6;border:1px solid #c9d0e0;border-radius:6px;padding:10px 14px;">' + escFd(request) + '</div>'});

  const bodyHtml = sections.map(s => '<div class="ir-section"><h3>' + s.title + '</h3>' + s.body + '</div>').join('');

  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>중간보고서 — ' + esc(auditName) + '</title><style>'
    + 'body{font-family:"Pretendard","Noto Sans KR",sans-serif;color:#1b2330;max-width:800px;margin:24px auto;padding:0 20px;}'
    + '.ir-hero{background:linear-gradient(155deg,#a23b2e 0%,#8a2f24 62%,#6f2519 100%);color:#fdf1ee;padding:22px 28px;border-radius:6px 6px 0 0;}'
    + '.ir-hero .eyebrow{font-family:monospace;letter-spacing:.15em;font-size:11px;color:#f3cec7;text-transform:uppercase;margin-bottom:6px;}'
    + '.ir-hero h1{margin:0 0 4px;font-size:21px;}'
    + '.ir-hero .sub{font-size:12px;color:#f3d9d4;}'
    + '.ir-body{border:1px solid #dcd6c8;border-top:none;padding:22px 26px;}'
    + '.ir-section{margin-top:18px;}'
    + '.ir-section:first-of-type{margin-top:0;}'
    + '.ir-section h3{font-size:13.5px;color:#a23b2e;border-bottom:2px solid #a23b2e;padding-bottom:6px;margin-bottom:10px;}'
    + '.ir-note{white-space:pre-wrap;font-size:12.5px;line-height:1.75;}'
    + '.ir-sign{margin-top:26px;border:1px solid #dcd6c8;}'
    + '.ir-sign-head{background:#efe8d4;padding:8px 16px;font-size:12px;font-weight:700;color:#132845;}'
    + '.ir-sign-grid{display:grid;grid-template-columns:1fr 1fr;}'
    + '.ir-sign-cell{padding:16px;border-right:1px solid #dcd6c8;}'
    + '.ir-sign-cell:last-child{border-right:none;}'
    + '.ir-sign-cell label{display:block;font-size:11px;color:#5a6472;font-family:monospace;margin-bottom:6px;}'
    + '.ir-sign-space{height:44px;border-bottom:1px solid #9aa3b0;margin-top:26px;}'
    + '.ir-print-btn{margin:16px 0;font-family:monospace;font-size:12px;background:#a23b2e;color:#fdf1ee;border:none;padding:9px 18px;border-radius:6px;cursor:pointer;}'
    + '@media print{ .ir-print-btn{display:none;} body{margin:0;max-width:none;} @page{size:A4;margin:16mm 14mm;} }'
    + '</style></head><body>'
    + '<button class="ir-print-btn" onclick="window.print()">🖨 인쇄 / PDF 저장</button>'
    + '<div class="ir-hero"><div class="eyebrow">IT AUDIT · INTERIM REPORT (중간보고)</div><h1>🚨 중간보고서</h1><div class="sub">' + esc(auditName) + ' · 작성일 ' + today + ' (KST) · 작성자 ' + esc(preparedBy) + '</div></div>'
    + '<div class="ir-body">'
      + bodyHtml
      + '<div class="ir-sign">'
        + '<div class="ir-sign-head">보고 · 접수 확인</div>'
        + '<div class="ir-sign-grid">'
          + '<div class="ir-sign-cell"><label>작성(보고) 감사역</label><div class="ir-sign-space"></div></div>'
          + '<div class="ir-sign-cell"><label>접수(경영진 · 감사팀장)</label><div class="ir-sign-space"></div></div>'
        + '</div>'
      + '</div>'
      + '<div class="ir-note" style="font-size:11px;color:#5a6472;background:#f5f1e6;border-radius:6px;padding:10px 14px;margin-top:16px;">💡 이 보고서로 통지한 사항은 이후 📋 발견사항 관리에서 계속 추적되며, 최종 📑 종합 감사결과보고서에도 포함됩니다. 이 문서는 그 사이 시점에 별도로 알리기 위한 것입니다.</div>'
    + '</div>'
    + '</body></html>';
}

export function buildAuditWorkingPaperHtml(){
  const ctx = (typeof collectAuditDraftContext === 'function') ? collectAuditDraftContext() : null;
  const wide = collectAuditWideStats();
  const auditName = (document.getElementById('auditNameInput') || {}).value || '(감사명 미입력)';
  const auditPurpose = (document.getElementById('auditPurposeInput') || {}).value || '(목적 미입력)';
  const preparedBy = getCurrentAuditor() || '(작성자 미입력)';
  const preparedAt = kstDateStr();

  const STATUS_LABEL_WP = {draft:'초안', confirmed:'확정(통보완료)', in_progress:'조치중', remediated:'조치완료(검증대기)', closed:'종결'};
  const findingsList = loadFindings();
  // 감사조서는 "무엇을 확인했는지 과정"이 핵심이라, 발견사항은 현황·권고사항 전문(全文)까지 다시
  // 싣지 않고 코드·제목·위험도·부서·상태만 압축해서 보여준다. 발견사항의 상세 서술(현황/권고사항/
  // 조치계획)은 📑종합감사결과보고서에 이미 있으므로, 조서에서 또 반복하면 두 문서가 똑같아 보인다는
  // 지적이 있었다. 조서 쪽엔 대신 "확인 방법·이행률"(아래 2·3번)을 더 채워 성격을 분명히 구분한다.
  const findingsRows = findingsList.length === 0
    ? '<tr><td colspan="5" style="padding:10px;text-align:center;color:#888;">등록된 발견사항이 없습니다.</td></tr>'
    : findingsList.map(f => (
        '<tr>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;font-family:monospace;font-size:11px;">' + esc(f.code||'-') + '</td>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;">' + esc(f.title||'') + '</td>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">' + esc(f.riskLevel||'-') + '</td>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;">' + esc(f.department||'-') + '</td>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">' + esc(STATUS_LABEL_WP[f.status] || '초안') + '</td>'
        + '</tr>'
      )).join('');

  // 확인한 항목과 방법 — 영역별로 "몇 개 항목을, 어떤 방법(설문 자가진단·인터뷰 실사)으로" 확인했는지.
  // 감사조서의 핵심은 결과가 아니라 "어떻게 확인했는지" 과정 자체를 남기는 것이므로 별도 섹션으로 뗀다.
  const domainMethodRows = (ctx && ctx.domainTitles.length > 0 ? ctx.domainTitles : DOMAINS.map(d => ({code:d.code, title:d.title})))
    .map(d => {
      const dom = DOMAINS.find(x => x.code === d.code);
      const itemCount = dom ? dom.items.length : 0;
      const domainResp = (typeof aggRows !== 'undefined' ? aggRows : []).filter(r => r.domain === d.code);
      const domainRespDepts = new Set(domainResp.map(r => r.dept));
      const domainInterviewCodes = Object.keys((typeof interviewState !== 'undefined') ? interviewState : {}).filter(c => c.split('-')[0] === d.code);
      const domainInterviewDone = domainInterviewCodes.filter(c => interviewState[c] && interviewState[c].done).length;
      const methodParts = [];
      methodParts.push('📋 체크리스트 자가진단 설문' + (domainResp.length > 0 ? (' (' + domainRespDepts.size + '개 부서 응답)') : ' (응답 없음)'));
      if(domainInterviewCodes.length > 0) methodParts.push('🎤 인터뷰 실사 확인 (' + domainInterviewDone + '/' + domainInterviewCodes.length + '건 완료)');
      return '<tr><td style="padding:6px 8px;border:1px solid #ccc;font-family:monospace;font-size:11px;">D-' + esc(d.code) + '</td>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;">' + esc(d.title) + '</td>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">' + itemCount + '개</td>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;">' + methodParts.join('<br>') + '</td></tr>';
    }).join('');

  const kbCards = (typeof loadKanbanCards === 'function') ? loadKanbanCards() : [];
  const kbByStatus = {};
  KANBAN_COLUMNS.forEach(c => kbByStatus[c.key] = kbCards.filter(x => x.status === c.key).length);
  const kbSummaryRow = KANBAN_COLUMNS.map(c =>
    '<td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">' + kbByStatus[c.key] + '</td>'
  ).join('');
  const kbDetailRows = kbCards.length === 0
    ? '<tr><td colspan="5" style="padding:10px;text-align:center;color:#888;">칸반보드에 카드가 없습니다.</td></tr>'
    : kbCards.map(c => (
        '<tr>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;font-family:monospace;font-size:11px;">' + (c.domCode ? ('D-'+esc(c.domCode)+'-'+esc(String(c.itemNo))) : '별도항목') + '</td>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;">' + esc(c.title||'') + '</td>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">' + esc((KANBAN_COLUMNS.find(k=>k.key===c.status)||{}).label || c.status) + '</td>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;">' + esc(c.assignee||'-') + '</td>'
        + '<td style="padding:6px 8px;border:1px solid #ccc;">' + esc(c.notes||'') + '</td>'
        + '</tr>'
      )).join('');

  const riskCount = {상:0, 중:0, 하:0};
  findingsList.forEach(f => { if(riskCount[f.riskLevel] !== undefined) riskCount[f.riskLevel]++; });

  // 설문 응답(체크포인트 단위) 이행현황 — 감사조서에 "얼마나 확인했는지" 숫자 근거를 남기기 위함
  let respGood = 0, respPartial = 0, respBad = 0, respNa = 0;
  const respDeptSet = new Set();
  (typeof aggRows !== 'undefined' ? aggRows : []).forEach(r => {
    respDeptSet.add(r.dept);
    const c = (typeof igClassifyRow === 'function') ? igClassifyRow(r) : 'na';
    if(c === 'yes') respGood++; else if(c === 'partial') respPartial++; else if(c === 'no') respBad++; else respNa++;
  });
  const respTotal = respGood + respPartial + respBad + respNa;
  const respApplicable = respTotal - respNa;
  const respRate = respApplicable > 0 ? Math.round(respGood / respApplicable * 100) : 0;

  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>감사조서 — ' + esc(auditName) + '</title>'
    + '<style>'
      + 'body{font-family:"Malgun Gothic","Pretendard",sans-serif;background:#dcd5c4;margin:0;padding:0;color:#1b2330;}'
      + '.wp-shell{max-width:960px;margin:24px auto;background:#fff;box-shadow:0 10px 30px rgba(19,40,69,.2);padding:0 0 40px;}'
      + '.wp-hero{background:linear-gradient(155deg,#132845 0%,#1d3a63 62%,#24406b 100%);color:#f4efe2;padding:28px 40px;}'
      + '.wp-hero .eyebrow{font-family:monospace;letter-spacing:.2em;font-size:11px;color:#e4c78a;text-transform:uppercase;margin-bottom:10px;}'
      + '.wp-hero h1{margin:0 0 6px;font-size:24px;}'
      + '.wp-meta{padding:18px 40px;background:#f5f1e6;border-bottom:1px solid #dcd6c8;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;font-size:12px;}'
      + '.wp-meta div b{display:block;color:#5a6472;font-size:10.5px;font-weight:400;margin-bottom:3px;}'
      + '.wp-section{padding:24px 40px 4px;}'
      + '.wp-section h2{font-size:15px;color:#132845;border-bottom:2px solid #132845;padding-bottom:6px;margin:0 0 12px;}'
      + 'table{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:18px;}'
      + 'th{background:#f1ede1;padding:6px 8px;border:1px solid #ccc;font-size:11px;}'
      + '.wp-risk-pills{display:flex;gap:10px;margin-bottom:16px;}'
      + '.wp-risk-pills .pill{flex:1;padding:10px;border:1px solid #ccc;text-align:center;}'
      + '.wp-risk-pills .pill b{display:block;font-size:20px;}'
      + '.wp-sign{padding:24px 40px 0;}'
      + '.wp-sign table td{padding:20px 12px 8px;border:1px solid #ccc;text-align:center;font-size:11.5px;color:#5a6472;}'
      + '.no-print{}'
      + '@media print{ .no-print{display:none !important;} body{background:#fff;} .wp-shell{box-shadow:none;margin:0;max-width:none;} @page{size:A4;margin:14mm 12mm;} }'
    + '</style></head><body>'
    + '<div class="wp-shell">'
      + '<div class="wp-hero"><div class="eyebrow">IT AUDIT · WORKING PAPER (監査調書)</div><h1>감사조서 — ' + esc(auditName) + '</h1><div style="font-size:12.5px;color:#c9d2e2;">' + esc(auditPurpose) + '</div></div>'
      + '<div class="wp-meta">'
        + '<div><b>작성자</b>' + esc(preparedBy) + '</div>'
        + '<div><b>작성일</b>' + esc(preparedAt) + '</div>'
        + '<div><b>발견사항 건수</b>' + findingsList.length + '건</div>'
        + '<div><b>칸반 카드 건수</b>' + kbCards.length + '건</div>'
      + '</div>'
      + '<div class="wp-section no-print" style="background:#eef0f6;border:1px solid #c9d0e0;border-radius:6px;margin:16px 40px;padding:10px 14px;font-size:11.5px;color:#333;line-height:1.7;">'
        + '💡 <b>감사조서(監査調書, Audit Working Paper)</b>는 감사자가 감사를 수행하면서 <b>무엇을 어떻게 확인했고, 그 결과가 무엇이었는지</b> 기록해두는 공식 문서입니다. 감사 결과보고서의 "증빙" 역할을 하며, 나중에 "왜 그렇게 판단했는지"를 추적하거나 외부 감독기관·내부 감사위원회가 감사 품질을 검증할 때 근거가 됩니다. 이 문서는 현재 이 브라우저에 저장된 데이터로 자동 조합한 초안이므로, 상단 [🖨 인쇄/PDF]로 저장하거나 실제 조서 양식에 맞게 다듬어 쓰십시오.'
        + '<div><button onclick="window.print()" style="margin-top:8px;font-family:monospace;font-size:11px;background:#132845;color:#f4efe2;border:none;padding:6px 12px;cursor:pointer;border-radius:4px;">🖨 인쇄 / PDF 저장</button></div>'
      + '</div>'
      + '<div class="wp-section"><h2>1. 감사 개요 (목적·범위·대상)</h2>'
        + '<table><tr><th style="width:120px;">감사 목적</th><td style="padding:6px 8px;border:1px solid #ccc;" colspan="3">' + esc(auditPurpose) + '</td></tr>'
          + '<tr><th>대상 영역</th><td style="padding:6px 8px;border:1px solid #ccc;" colspan="3">' + (ctx && ctx.domainTitles.length > 0 ? (ctx.domainTitles.length + '개 (' + ctx.domainTitles.map(d=>d.title).join(', ') + ')') : '(① 설문지 생성 탭에서 대상 영역을 선택해 주세요)') + '</td></tr>'
          + '<tr><th>감사 기간</th><td style="padding:6px 8px;border:1px solid #ccc;">' + ((ctx && (ctx.surveyStart || ctx.reportDate)) ? ((ctx.surveyStart||'(미정)') + ' ~ ' + (ctx.reportDate||'(미정)')) : '(미입력)') + '</td>'
          + '<th style="width:100px;">참여 감사역</th><td style="padding:6px 8px;border:1px solid #ccc;">' + esc((ctx && ctx.participants) || '(미입력)') + '</td></tr>'
        + '</table>'
      + '</div>'
      + '<div class="wp-section"><h2>2. 확인한 항목과 방법</h2>'
        + '<div style="font-size:11px;color:#5a6472;margin-bottom:8px;">감사조서의 핵심은 "무엇을, 어떤 방법으로" 확인했는지 남기는 것입니다. 영역별로 점검항목 수와 실제 확인 방법(설문 자가진단 · 인터뷰 실사 확인)을 정리합니다.</div>'
        + '<table><tr><th>영역</th><th>영역명</th><th>점검항목 수</th><th>확인 방법</th></tr>' + domainMethodRows + '</table>'
      + '</div>'
      + '<div class="wp-section"><h2>3. 실제 확인한 결과 (증적 · 인터뷰 내용)</h2>'
        + '<div style="font-size:11.5px;color:#5a6472;margin-bottom:10px;">참여 부서 ' + respDeptSet.size + '개 · 전체 체크포인트 ' + respTotal + '건 · <b style="color:#132845;">이행률 ' + respRate + '%</b> (해당없음 제외) · 인터뷰 ' + wide.interviewDoneCount + '/' + wide.interviewTotal + '건 완료</div>'
        + '<table><tr><th>이행</th><th>부분이행</th><th>미흡</th><th>해당없음</th></tr>'
          + '<tr><td style="text-align:center;">' + respGood + '</td><td style="text-align:center;">' + respPartial + '</td><td style="text-align:center;">' + respBad + '</td><td style="text-align:center;">' + respNa + '</td></tr>'
        + '</table>'
      + '</div>'
      + '<div class="wp-section"><h2>4. 발견된 문제점 — 요약 목록</h2>'
        + '<div style="font-size:11px;color:#5a6472;margin-bottom:10px;">각 발견사항의 현황·권고사항·조치계획 전문(全文)은 <b>📑 종합감사결과보고서</b> 또는 건별 <b>🖨 발견사항 통보서</b>에 있습니다. 이 조서에는 "몇 건이 있었고 어떤 상태인지"만 확인용으로 요약합니다.</div>'
        + '<div class="wp-risk-pills">'
          + '<div class="pill" style="background:#f7e6e2;"><b>' + riskCount['상'] + '</b>위험도 상</div>'
          + '<div class="pill" style="background:#f7edd9;"><b>' + riskCount['중'] + '</b>위험도 중</div>'
          + '<div class="pill" style="background:#eceae4;"><b>' + riskCount['하'] + '</b>위험도 하</div>'
        + '</div>'
        + '<table><tr><th>항목코드</th><th>제목</th><th>위험도</th><th>담당부서</th><th>상태</th></tr>' + findingsRows + '</table>'
      + '</div>'
      + '<div class="wp-section"><h2>5. 🗂 칸반보드 진행현황 (수행 활동 근거)</h2>'
        + '<table><tr>' + KANBAN_COLUMNS.map(c => '<th>'+c.label+'</th>').join('') + '</tr><tr>' + kbSummaryRow + '</tr></table>'
        + '<table><tr><th>항목</th><th>제목</th><th>단계</th><th>담당자</th><th>메모</th></tr>' + kbDetailRows + '</table>'
      + '</div>'
      + '<div class="wp-sign"><h2 style="font-size:15px;color:#132845;border-bottom:2px solid #132845;padding-bottom:6px;">6. 작성자 · 검토자 · 승인자 서명</h2>'
        + '<table><tr><td style="width:33%;">작성 (감사역)</td><td style="width:33%;">검토</td><td style="width:34%;">승인</td></tr></table>'
      + '</div>'
    + '</div>'
  + '</body></html>';
}

export function openAuditWorkingPaper(){
  const html = buildAuditWorkingPaperHtml();
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=980,height=1000');
  logReportGenerated('workingpaper', '📄 감사조서', findings.length + '건');
}
