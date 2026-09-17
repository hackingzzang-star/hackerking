// ============================================================
// ③ 응답 집계 (collect 탭) — v8.51에서 app.js로부터 물리적으로 분리
// ------------------------------------------------------------
// 응답 파일 업로드·집계, 회차(라운드) 관리, 성숙도 점수, 부서 간 교차검증·추이 비교 등.
// activeRoundLabel/loadedFiles/aggRows는 app.js가 소유한 공유 가변 상태(let)라서, 재할당은
// app.js가 내보낸 setActiveRoundLabel/setLoadedFiles/setAggRows 세터로만 한다(원본의 직접
// 재할당을 세터 호출로 치환했을 뿐 로직·순서는 동일). setAggRows는 ② 배포·회신 관리 분리
// 때 이미 추가된 것을 재사용한다.
// ============================================================
import {
  COMMON_DEPT_LABEL,
  DOMAINS,
  activeRoundLabel,
  aggFilter,
  aggRows,
  domainAuditorMap,
  findings,
  interviewState,
  loadedFiles,
  selectedCodes,
  coveragePlan,
  AUDIT_LEGAL_BASIS,
  AUDIT_UNTAGGED_LABEL,
  RISK_WEIGHT,
  ROUND_STORAGE_KEY,
  TIER_SCORE,
  setActiveRoundLabel,
  setLoadedFiles,
  setAggRows,
} from '../app.js';
import {
  deptToArray, esc, fmtDateTime, getCurrentAuditName, getCurrentAuditor, kstISOString,
} from './common.js';
import {
  getDomainAttachDeptLabel,
  igFindDomain,
  itemDeptScopeBadgeHtml,
} from './generate.js';
import {
  findAssignmentMismatches,
  renderFileChips,
  renderSubmissionTracker,
} from './dist.js';
import {
  igClassifyRow,
  igFindItem,
  igOwnerPersonDetailHtml,
  igTargetDetailHtml,
  renderInterviewGuide,
  renderInterviewOverridesTable,
  renderInterviewScheduleTable,
  saveInterviewState,
} from './interview.js';
import {
  buildAuditLegalBasis,
  buildAuditPurpose,
  loadReportLog,
} from './report.js';
import {
  loadKanbanArchive,
  loadKanbanCards,
} from './kanban.js';
import DOMAIN_BRIEF_DESC from '../data/domain-brief-desc.js';

export function collectAuditDraftContext(){
  const auditName = (document.getElementById('auditNameInput').value || '').trim() || '(감사명 미입력)';
  const domains = DOMAINS.filter(d => selectedCodes.has(d.code));
  const purposeRaw = (document.getElementById('auditPurposeInput').value || '').trim();
  const purpose = domains.length > 0 ? buildAuditPurpose(domains, purposeRaw) : (purposeRaw || '(감사 목적을 위 1️⃣ 단계에서 입력해 주세요)');
  const legalBasis = domains.length > 0 ? buildAuditLegalBasis(domains) : AUDIT_LEGAL_BASIS;
  const groundsEl = document.getElementById('auditGroundsInput');
  const grounds = groundsEl ? (groundsEl.value || '').trim() : '';
  const dueDate = (document.getElementById('genDueDate').value || '').trim() || '(미지정)';
  const deptName = (document.getElementById('draftDeptName').value || '').trim() || 'IT감사팀';
  const drafterName = (document.getElementById('draftDrafterName').value || '').trim() || '(기안자 미입력)';
  const auditKindEl = document.getElementById('draftAuditKind');
  const auditKind = (auditKindEl && auditKindEl.value) || '정기감사';
  let participants = (document.getElementById('draftParticipants').value || '').trim();
  if(!participants){
    // 비워두면 ⑤ 단계에서 영역별로 배정한 담당 감사자를 자동으로 모아 채워준다. 총괄/참여를
    // 구분하지 않고 하나의 명단으로만 합쳐 보여준다.
    const names = new Set();
    Object.keys(domainAuditorMap).forEach(code => {
      if(!selectedCodes.has(code)) return;
      String(domainAuditorMap[code] || '').split(',').map(s => s.trim()).filter(Boolean).forEach(n => names.add(n));
    });
    participants = Array.from(names).join(', ');
  }
  const surveyStart = (document.getElementById('draftSurveyStart').value || '').trim();
  const fieldStart = (document.getElementById('draftFieldStart').value || '').trim();
  const fieldEnd = (document.getElementById('draftFieldEnd').value || '').trim();
  const reportDate = (document.getElementById('draftReportDate').value || '').trim();
  const submitMethod = (document.getElementById('draftSubmitMethodText').value || '').trim()
    || '회신기한까지 그룹웨어 협조문에 결과 파일(JSON 또는 CSV)을 첨부하여 제출';
  const genDeptVal = (document.getElementById('genDept').value || '').trim();
  const domainTitles = domains.map(d => ({
    code: d.code, title: d.title, desc: DOMAIN_BRIEF_DESC[d.code] || '',
    dept: getDomainAttachDeptLabel(d, genDeptVal)
  }));
  const fieldPeriodText = (fieldStart || fieldEnd) ? ((fieldStart||'(미정)') + ' ~ ' + (fieldEnd||'(미정)')) : '(위에서 현장점검 기간을 입력해 주세요)';
  return {
    auditName, purpose, legalBasis, grounds, auditKind, dueDate, deptName, drafterName, participants,
    surveyStart, fieldStart, fieldEnd, fieldPeriodText, reportDate, submitMethod, domainTitles
  };
}

export function collectAuditWideStats(){
  const ctx = (typeof collectAuditDraftContext === 'function') ? collectAuditDraftContext() : null;
  const totalItems = (ctx && ctx.domainTitles.length > 0)
    ? ctx.domainTitles.reduce((sum, d) => {
        const dom = DOMAINS.find(x => x.code === d.code);
        return sum + (dom ? dom.items.length : 0);
      }, 0)
    : DOMAINS.reduce((sum, d) => sum + d.items.length, 0);

  const respDepts = new Set((typeof aggRows !== 'undefined' ? aggRows : []).map(r => r.dept || '(부서명 미입력)'));
  const tierCounts = {good:0, neutral:0, bad:0, na:0};
  (typeof aggRows !== 'undefined' ? aggRows : []).forEach(r => { if(tierCounts[r.tier] !== undefined) tierCounts[r.tier]++; });
  const totalResp = tierCounts.good + tierCounts.neutral + tierCounts.bad + tierCounts.na;

  const domainBadCounts = {};
  (typeof aggRows !== 'undefined' ? aggRows : []).forEach(r => {
    if(r.tier !== 'bad') return;
    const key = r.domain || '(미상)';
    domainBadCounts[key] = (domainBadCounts[key] || 0) + 1;
  });
  const topBadDomains = Object.entries(domainBadCounts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([code,cnt]) => {
    const dom = DOMAINS.find(d => d.code === code);
    return {code, title: dom ? dom.title : code, count: cnt};
  });

  /* [v8.03] 이전 로직은 칸반카드·발견사항·보고서·인터뷰 완료 여부를 "이 브라우저에 쌓인 전체 이력"
     기준으로 집계했다. 칸반카드·발견사항·보고서는 이미 auditName으로 태깅되고 있었는데도 그 태그를
     쓰지 않고 있었고, 인터뷰 완료 상태(interviewState)는 항목코드로만 저장돼 감사 건 구분 자체가
     없다 — 그래서 지난 테스트·데모에서 쌓인 카드·항목이 전부 분모에 섞여 "카드 하나 완료해도
     100%가 안 되는" 문제가 생겼다. 칸반·발견사항·보고서는 현재 감사명으로 필터링하고, 인터뷰는
     "현재 응답 데이터(aggRows)에 실제로 존재하는 항목코드"만 분모로 삼아 우회한다. */
  const currentAuditName = (typeof getCurrentAuditName === 'function') ? getCurrentAuditName() : '(감사명 미지정)';
  const matchCurrentAudit = (n) => (n || '(감사명 미지정)') === currentAuditName;

  const relevantCodes = new Set((typeof aggRows !== 'undefined' ? aggRows : []).map(r => r.code).filter(Boolean));
  const interviewStateObj = (typeof interviewState !== 'undefined') ? interviewState : {};
  const interviewTotal = relevantCodes.size;
  const interviewDoneCount = Array.from(relevantCodes).filter(code => interviewStateObj[code] && interviewStateObj[code].done).length;

  const kbActiveAll = (typeof loadKanbanCards === 'function') ? loadKanbanCards() : [];
  const kbArchivedAll = (typeof loadKanbanArchive === 'function') ? loadKanbanArchive() : [];
  const kbActive = kbActiveAll.filter(c => matchCurrentAudit(c.auditName));
  const kbArchived = kbArchivedAll.filter(c => matchCurrentAudit(c.auditName));
  const kbAll = kbActive.concat(kbArchived);
  const kbDone = kbActive.filter(c => c.status === 'done').length + kbArchived.filter(c => c.status === 'done').length;
  const kbPct = kbAll.length ? Math.round((kbDone / kbAll.length) * 100) : null;

  const findingsAll = (typeof findings !== 'undefined') ? findings : [];
  const findingsCount = findingsAll.filter(f => matchCurrentAudit(f.auditName)).length;
  const reportCount = (typeof loadReportLog === 'function') ? loadReportLog().filter(e => matchCurrentAudit(e.auditName)).length : 0;

  return {ctx, totalItems, respDepts, totalResp, tierCounts, topBadDomains, interviewDoneCount, interviewTotal, kbAll, kbDone, kbPct, findingsCount, reportCount};
}

export function getFilteredAggRows(){
  if(!aggFilter.dept && !aggFilter.domain && !aggFilter.risk && !aggFilter.tier && !aggFilter.search) return aggRows;
  const term = (aggFilter.search || '').trim().toLowerCase();
  return aggRows.filter(r =>
    (!aggFilter.dept || (r.dept || '(부서명 미입력)') === aggFilter.dept)
    && (!aggFilter.domain || r.domain === aggFilter.domain)
    && (!aggFilter.risk || r.risk === aggFilter.risk)
    && (!aggFilter.tier || r.tier === aggFilter.tier)
    && (!term || [r.dept, r.code, r.title, r.cptext, r.note, r.srNote].some(v => v && String(v).toLowerCase().includes(term)))
  );
}

export function initAggFilterUI(){
  const deptSel = document.getElementById('aggFilterDept');
  const domSel = document.getElementById('aggFilterDomain');
  if(!deptSel || !domSel) return;
  const depts = Array.from(new Set(aggRows.map(r => r.dept || '(부서명 미입력)'))).sort();
  const doms = Array.from(new Set(aggRows.map(r => r.domain).filter(Boolean))).sort();
  deptSel.innerHTML = '<option value="">전체 부서</option>' + depts.map(d => '<option value="' + esc(d) + '"' + (aggFilter.dept===d?' selected':'') + '>' + esc(d) + '</option>').join('');
  domSel.innerHTML = '<option value="">전체 영역</option>' + doms.map(d => '<option value="' + esc(d) + '"' + (aggFilter.domain===d?' selected':'') + '>D-' + esc(d) + '</option>').join('');
  document.getElementById('aggFilterRisk').value = aggFilter.risk;
  document.getElementById('aggFilterTier').value = aggFilter.tier;
  const searchEl = document.getElementById('aggFilterSearch');
  if(searchEl && searchEl.value !== aggFilter.search) searchEl.value = aggFilter.search;
  const cnt = getFilteredAggRows().length;
  document.getElementById('aggFilterCount').textContent = (aggFilter.dept||aggFilter.domain||aggFilter.risk||aggFilter.tier||aggFilter.search) ? ('전체 ' + aggRows.length + '행 중 ' + cnt + '행 표시 중') : '';
  const filterActive = !!(aggFilter.dept||aggFilter.domain||aggFilter.risk||aggFilter.tier||aggFilter.search);
  const aggHint = document.getElementById('downloadAggFilterHint');
  const eviHint = document.getElementById('downloadEvidenceAllFilterHint');
  if(aggHint) aggHint.style.display = filterActive ? 'inline' : 'none';
  if(eviHint) eviHint.style.display = filterActive ? 'inline' : 'none';
  populateAggDeptReportSelect();
}

export function loadRoundsFromStorage(){
  try{
    const raw = localStorage.getItem(ROUND_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}

export function saveRoundsToStorage(list){
  try{
    localStorage.setItem(ROUND_STORAGE_KEY, JSON.stringify(list));
  }catch(e){
    alert('이 브라우저의 저장 공간에 기록하지 못했습니다 (' + e.message + '). 대신 [내보내기]로 파일 백업을 이용해 주세요.');
  }
}

export function saveCurrentAsRound(){
  const input = document.getElementById('roundLabelInput');
  const label = (input.value || '').trim();
  if(!label){ alert('회차명을 입력해 주세요. (예: 2026년 상반기)'); return; }
  if(aggRows.length === 0){ alert('저장할 데이터가 없습니다. 먼저 CSV/JSON을 업로드해 주세요.'); return; }
  const rounds = loadRoundsFromStorage();
  const existingIdx = rounds.findIndex(r => r.label === label);
  const newRowsSnapshot = JSON.parse(JSON.stringify(aggRows));

  if(existingIdx === -1){
    rounds.push({id: 'r' + Date.now(), label: label, savedAt: kstISOString(), rows: newRowsSnapshot, auditName: getCurrentAuditName()});
    saveRoundsToStorage(rounds);
    setActiveRoundLabel(label);
    renderRoundHistory();
    showRoundBanner();
    alert('"' + label + '" 회차로 저장했습니다. (이 브라우저에 보관됨 — 다른 PC·팀원과 공유하려면 목록의 [내보내기]를 이용하세요)');
    return;
  }

  // A round with this exact label already exists — 수검자가 여러 명이라 나눠서 회신이 들어오는 경우가 많으므로
  // 병합(Upsert) / 완전 덮어쓰기 / 별도 항목으로 추가 저장, 세 가지 중 고를 수 있게 한다.
  const existing = rounds[existingIdx];
  const mergedRows = JSON.parse(JSON.stringify(existing.rows || []));
  const {added, updated} = upsertAggRows(mergedRows, newRowsSnapshot);

  const wantMerge = confirm(
    '"' + label + '" 회차가 이미 저장되어 있습니다 (저장일 ' + fmtDateTime(existing.savedAt) + ', ' + (existing.rows||[]).length + '행).\n\n' +
    '현재 데이터를 병합(Upsert)하면: 신규 응답 ' + added + '건 추가, 기존과 겹치는 문항(동일 도메인·항목·체크포인트·부서) ' + updated + '건은 최신 값으로 갱신됩니다. (기존의 다른 응답은 그대로 유지)\n\n' +
    '[확인] = 병합해서 저장\n[취소] = 다른 저장 방식 선택'
  );

  if(wantMerge){
    rounds[existingIdx] = {id: existing.id, label: label, savedAt: kstISOString(), rows: mergedRows};
    saveRoundsToStorage(rounds);
    setActiveRoundLabel(label);
    renderRoundHistory();
    showRoundBanner();
    alert('병합 저장 완료: 신규 ' + added + '건, 갱신 ' + updated + '건. (총 ' + mergedRows.length + '행)');
    return;
  }

  const wantOverwrite = confirm(
    '병합 대신 완전히 덮어쓸까요?\n\n' +
    '[확인] = 기존 "' + label + '" 회차를 현재 데이터(총 ' + newRowsSnapshot.length + '행)로 완전히 교체합니다. 기존 회차의 다른 응답은 사라집니다.\n' +
    '[취소] = 같은 이름으로 별도의 새 회차 항목을 추가로 저장합니다 (목록에 동일 이름이 두 개 이상 남을 수 있습니다).'
  );

  if(wantOverwrite){
    rounds[existingIdx] = {id: existing.id, label: label, savedAt: kstISOString(), rows: newRowsSnapshot, auditName: getCurrentAuditName()};
    saveRoundsToStorage(rounds);
    setActiveRoundLabel(label);
    renderRoundHistory();
    showRoundBanner();
    alert('덮어쓰기 완료. (총 ' + newRowsSnapshot.length + '행)');
  } else {
    rounds.push({id: 'r' + Date.now(), label: label, savedAt: kstISOString(), rows: newRowsSnapshot, auditName: getCurrentAuditName()});
    saveRoundsToStorage(rounds);
    setActiveRoundLabel(label);
    renderRoundHistory();
    showRoundBanner();
    alert('별도의 새 회차 항목으로 저장했습니다. 나중에 필요 없는 항목은 목록에서 [삭제]해 주세요.');
  }
}

export function renderRoundHistory(){
  const rounds = loadRoundsFromStorage();
  const tbl = document.getElementById('roundHistoryTable');
  if(!tbl) return;
  if(rounds.length === 0){
    tbl.innerHTML = '<tr><td style="padding:10px;color:var(--ink-soft);font-size:11.5px;border:none;">저장된 회차가 없습니다. 회차명을 입력하고 [현재 데이터를 이 회차로 저장]을 누르거나, 회차 파일을 불러오세요.</td></tr>';
    return;
  }
  let html = '<tr><th>회차명</th><th>저장일시</th><th>응답 수</th><th>동작</th></tr>';
  rounds.slice().reverse().forEach(r => {
    html += '<tr>'
      + '<td>' + esc(r.label) + '</td>'
      + '<td class="mono" style="font-size:10.5px;">' + fmtDateTime(r.savedAt) + '</td>'
      + '<td class="mono">' + (r.rows ? r.rows.length : 0) + '</td>'
      + '<td>'
        + '<button class="gen-small-btn" style="margin:2px 4px 2px 0;" onclick="loadRoundById(\'' + r.id + '\')">불러오기</button>'
        + '<button class="gen-small-btn" style="margin:2px 4px 2px 0;" onclick="exportRoundById(\'' + r.id + '\')">내보내기</button>'
        + '<button class="gen-small-btn" style="margin:2px 0;color:#b3261e;border-color:#e0a29c;" onclick="deleteRoundById(\'' + r.id + '\')">삭제</button>'
      + '</td>'
      + '</tr>';
  });
  tbl.innerHTML = html;
}

export function loadRoundById(id){
  const rounds = loadRoundsFromStorage();
  const r = rounds.find(x => x.id === id);
  if(!r) return;
  if(aggRows.length > 0 && !confirm('현재 작업 중인 데이터(' + aggRows.length + '행)를 "' + r.label + '" 회차 데이터로 교체합니다. 저장하지 않은 현재 데이터는 사라집니다. 계속할까요?')) return;
  setAggRows(JSON.parse(JSON.stringify(r.rows || [])));
  setLoadedFiles([{name: '[저장된 회차] ' + r.label, size: 0}]);
  setActiveRoundLabel(r.label);
  document.getElementById('roundLabelInput').value = r.label;
  renderFileChips();
  renderAggregation();
  renderInterviewGuide();
  showRoundBanner();
}

export function deleteRoundById(id){
  const rounds = loadRoundsFromStorage();
  const r = rounds.find(x => x.id === id);
  if(!r) return;
  if(!confirm('"' + r.label + '" 회차를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
  saveRoundsToStorage(rounds.filter(x => x.id !== id));
  renderRoundHistory();
}

export function startNewRound(){
  if(aggRows.length > 0 && !confirm('현재 작업 중인 데이터(' + aggRows.length + '행)가 저장되지 않았습니다. 초기화하고 새 회차를 시작할까요? (저장하려면 취소 후 먼저 [현재 데이터를 이 회차로 저장]을 눌러 주세요)')) return;
  setAggRows([]);
  setLoadedFiles([]);
  setActiveRoundLabel(null);
  const input = document.getElementById('roundLabelInput');
  if(input) input.value = '';
  renderFileChips();
  renderAggregation();
  renderInterviewGuide();
  showRoundBanner();
}

export function showRoundBanner(){
  const el = document.getElementById('roundBanner');
  if(!el) return;
  if(activeRoundLabel){
    el.style.display = 'block';
    el.innerHTML = '📌 현재 화면은 저장된 회차 <b>"' + String(activeRoundLabel).replace(/</g,'&lt;') + '"</b> 데이터입니다. 새 CSV/JSON을 추가로 업로드하면 이 데이터에 이어서 누적되며, 변경사항은 다시 [저장]을 눌러야 반영됩니다.';
  } else {
    el.style.display = 'none';
  }
}

export function findMatchingRoundRows(roundLabel){
  // Combine rows from saved round-history matching this label, plus the current working set if its
  // active label matches — this is how we auto-detect who has responded.
  const rows = [];
  loadRoundsFromStorage().filter(r => r.label === roundLabel).forEach(r => rows.push(...(r.rows||[])));
  if(activeRoundLabel === roundLabel) rows.push(...aggRows);
  return rows;
}

export function parseCSV(text){
  // Handles RFC4180-ish quoted CSV as produced by the survey's own CSV export.
  const rows = [];
  let row = [], field = '', inQuotes = false;
  // strip BOM
  if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else { inQuotes = false; }
      } else field += c;
    } else {
      if(c === '"') inQuotes = true;
      else if(c === ','){ row.push(field); field = ''; }
      else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
      else if(c === '\r'){ /* skip */ }
      else field += c;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

export function rowKey(r){
  // [수정] 예전에는 domain+code+cptext+dept만으로 "같은 응답"을 판정했다. 이러면 같은 부서를
  // 여러 담당자가 나눠(또는 겹쳐) 응답해 JSON 파일이 여러 개로 회신되는 경우, 같은 체크포인트에
  // 서로 다른 담당자가 각자 답변했더라도 "같은 문항"으로 오인되어, 나중에 업로드한 파일의 값이
  // 먼저 온 담당자의 응답을 흔적도 없이 덮어써 버리는 문제가 있었다("병합이 안 되고 사라진다"는
  // 지적의 근본 원인). author(작성자)를 키에 포함시켜, 같은 담당자가 같은 부서·같은 체크포인트에
  // 다시 제출한 경우(진짜 수정본)만 갱신되고, 담당자가 다르면 별도 응답으로 함께 보존(병합)된다.
  return [r.domain, r.code, r.cptext, r.dept, r.author].map(x => String(x||'').trim()).join('||');
}

export function upsertAggRows(currentArr, incomingArr){
  let added = 0, updated = 0;
  incomingArr.forEach(inc => {
    const key = rowKey(inc);
    const idx = currentArr.findIndex(e => rowKey(e) === key);
    if(idx >= 0){ currentArr[idx] = inc; updated++; }
    else { currentArr.push(inc); added++; }
  });
  return {added, updated};
}

export function buildAggRowFromRecord(rec, fallback, fileName){
  // rec: object keyed by Korean column names (from a CSV row-as-object, or a JSON row object).
  // fallback: {dept, author, date, interviewNote, interviewContact} used when a row doesn't carry its own values (JSON meta-wrapper case).
  const get = (k) => (rec[k] !== undefined && rec[k] !== null) ? rec[k] : '';
  if(!get('항목코드')) return null;
  const resp = get('응답');
  const own = get('담당여부');
  // [수정] 응답하지 않은 체크포인트(resp가 빈 값)를 그대로 aggRows에 넣으면, igClassifyRow()가
  // "미응답"을 기본값으로 "미흡(부정 응답)"으로 잘못 분류해 통계가 왜곡됐다("작성 안 한 항목이
  // 미흡으로 집계될 가능성은 없는지" 지적에 대한 실제 버그였음). "타 부서 담당"으로 정당하게
  // 건너뛴 항목은 응답이 비어 있어도 "책임소재 확인 필요" 표에 필요하므로 그대로 남기고,
  // 그 외에 진짜 미응답인 체크포인트만 응답집계에서 제외한다 — 부분 제출된 설문에서도
  // 실제로 답한 항목만 정확히 집계되고, 안 답한 항목은 "미흡"이 아니라 그냥 "무응답(집계 제외)"이 된다.
  if(!resp && own !== '타 부서 담당') return null;
  return {
    dept: get('수검부서') || fallback.dept || '',
    author: get('작성자') || fallback.author || '',
    date: get('작성일') || fallback.date || '',
    interviewNote: get('인터뷰가능시간') || fallback.interviewNote || '',
    interviewContact: get('인터뷰담당자') || fallback.interviewContact || '',
    domain: get('도메인'),
    code: get('항목코드'),
    title: get('항목명'),
    risk: get('위험도'),
    law: get('관련법령'),
    own: own,
    ownDept: get('담당부서명'),
    ownPerson: get('담당자성명'),
    fam: get('업무숙지도'),
    cptext: get('세부체크포인트'),
    resp: resp,
    tier: get('응답성격') || (resp === '아니오' ? 'bad' : (resp === '부분' ? 'neutral' : (resp === '해당없음' ? 'na' : ''))),
    note: get('비고'),
    sr: get('자체평가'),
    srNote: get('자체평가근거'),
    evidence: get('제출증빙'),
    file: fileName,
  };
}

export function readFileAsTextP(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다'));
    reader.readAsText(file, 'UTF-8');
  });
}

export function showUploadPreview(candidateRowsByFile, errors){
  const panel = document.getElementById('uploadPreviewPanel');
  if(!panel) return;
  const fileNames = Object.keys(candidateRowsByFile);
  if(fileNames.length === 0 && errors.length === 0) return;

  const errorHtml = errors.length
    ? ('<div class="upv-error-box">⚠ 다음 파일은 읽지 못해 미리보기에서 제외했습니다:<br>' + errors.map(esc).join('<br>') + '</div>')
    : '';

  let anyMismatch = false;
  const cardsHtml = fileNames.map(fname => {
    const {rows} = candidateRowsByFile[fname];
    const depts = Array.from(new Set(rows.map(r => r.dept).filter(Boolean)));
    const authors = Array.from(new Set(rows.map(r => r.author).filter(Boolean)));
    const domains = Array.from(new Set(rows.map(r => r.domain).filter(Boolean))).sort();
    const codes = Array.from(new Set(rows.map(r => r.code).filter(Boolean)));
    const mismatches = findAssignmentMismatches(rows);
    if(mismatches.length > 0) anyMismatch = true;
    const mismatchCodes = Array.from(new Set(mismatches.map(m => m.code + '(원담당:' + m.owner + ')')));

    // 이 파일이 담고 있는 영역(도메인)의 "체크리스트 원본 전체 항목수"와 비교해, 통합본(분리 안 된 설문)을
    // 그대로 받아 다 채운 것으로 보이는지 판단한다.
    const domainTotalHint = domains.map(dc => {
      const dom = DOMAINS.find(d => d.code === dc);
      if(!dom) return null;
      const totalItemsInDomain = dom.items.length;
      const codesInThisDomain = codes.filter(c => c.startsWith(dc + '-')).length;
      return {dc, title: dom.title, totalItemsInDomain, codesInThisDomain};
    }).filter(Boolean);
    const looksUnsplit = domainTotalHint.some(h => h.codesInThisDomain === h.totalItemsInDomain && h.totalItemsInDomain > 1 && depts.length === 1 && depts[0] !== COMMON_DEPT_LABEL && depts[0] !== '공통');

    let warnBlock = '';
    if(mismatches.length > 0){
      warnBlock += '<div class="upv-warn-box">🚩 <b>담당부서 배정과 다른 응답이 ' + mismatches.length + '건 있습니다:</b> ' + mismatchCodes.slice(0,8).map(esc).join(', ') + (mismatchCodes.length > 8 ? ' 외 ' + (mismatchCodes.length-8) + '건' : '') + '<br>이 파일의 수검부서(' + esc(depts.join(', ') || '(미상)') + ')가 체크리스트상 다른 부서 담당으로 배정된 항목에도 응답을 남겼습니다. 부서별로 분리되지 않은 설문지를 통째로 받아 채우신 경우 흔히 나타나는 패턴입니다.</div>';
    }
    if(looksUnsplit){
      warnBlock += '<div class="upv-warn-box">📋 <b>이 파일은 D-' + domainTotalHint.map(h=>h.dc).join(',') + ' 영역 전체 항목을 포함합니다</b> — "부서별로 분리하여 각각 생성"한 파일이 아니라, 통합 설문지를 그대로 받아 응답하신 것으로 보입니다.</div>';
    }
    if(authors.length === 0){
      warnBlock += '<div class="upv-warn-box">✍ <b>작성자(담당자 성명)가 비어 있습니다.</b> 같은 부서에서 다른 담당자가 이름 없이 또 다른 파일을 보내면, 이 도구가 두 사람을 구분하지 못해 겹치는 체크포인트가 서로 덮어써질 수 있습니다. 아래 "작성자" 칸에 실제로 작성한 사람 이름을 직접 적어주세요 — [반영하기]를 누를 때 이 이름이 모든 응답에 적용됩니다.</div>';
    }

    // [신설] "제출은 됐는데 일부 항목만 응답되어 있는지"를 업로드 전에 알려준다. 미응답 체크포인트는
    // 더 이상 "미흡"으로 잘못 집계되지 않고 아예 빠지므로(위 buildAggRowFromRecord 수정), 이 파일이
    // 부분 제출인지 여부를 별도로 확인할 방법이 필요해 추가했다.
    const expectedTotalCp = domains.reduce((sum, dc) => {
      const dom = DOMAINS.find(d => d.code === dc);
      if(!dom) return sum;
      return sum + dom.items.filter(it => codes.includes(dc + '-' + it.no)).reduce((a,it) => a + it.checkpoints.length, 0);
    }, 0);
    if(expectedTotalCp > 0 && rows.length < expectedTotalCp){
      warnBlock += '<div class="upv-warn-box">✂ <b>일부 항목만 응답되어 있는 것으로 보입니다</b> — 이 파일이 다루는 항목들의 전체 체크포인트는 ' + expectedTotalCp + '개인데, 실제 응답은 ' + rows.length + '개뿐입니다("타 부서 담당"으로 정당하게 건너뛴 항목은 제외하고 계산). 마감이 급해 일부만 우선 제출된 파일일 수 있으니, 나머지는 나중에 이어서 받아 같은 담당자 이름으로 다시 업로드하면 자동으로 병합됩니다.</div>';
    }
    if(!warnBlock){
      warnBlock = '<div class="upv-ok-box">✅ 담당부서 배정과 특별한 불일치가 발견되지 않았습니다.</div>';
    }

    // [신설] "이 부서에 이미 다른/같은 담당자의 응답이 있는지" 미리 알려준다 — 담당자가 다르면
    // 병합(둘 다 보존)되고, 같은 담당자면 겹치는 체크포인트만 이번 파일 값으로 갱신(수정)된다는
    // 것을 업로드 전에 명확히 보여줘, "덮어써지는 건지 병합되는 건지" 헷갈리지 않게 한다.
    let mergeInfoBlock = '';
    depts.forEach(d => {
      const existingAuthorsForDept = new Set(aggRows.filter(r => r.dept === d).map(r => r.author || '(작성자 미상)'));
      const theseAuthors = authors.length ? authors : ['(작성자 미상)'];
      const overlapAuthors = theseAuthors.filter(a => existingAuthorsForDept.has(a));
      const newAuthors = theseAuthors.filter(a => !existingAuthorsForDept.has(a));
      if(overlapAuthors.length > 0){
        mergeInfoBlock += '<div class="upv-info-box">🔁 <b>"' + esc(d) + '"</b> 부서의 <b>' + overlapAuthors.map(esc).join(', ') + '</b> 응답은 이미 반영되어 있습니다 — 겹치는 체크포인트는 이번 파일 값으로 <b>갱신(수정본으로 대체)</b>됩니다.</div>';
      }
      if(newAuthors.length > 0 && existingAuthorsForDept.size > 0){
        mergeInfoBlock += '<div class="upv-info-box">🧑‍🤝‍🧑 <b>"' + esc(d) + '"</b> 부서는 이미 <b>' + Array.from(existingAuthorsForDept).map(esc).join(', ') + '</b>의 응답이 있고, 이번 파일(<b>' + newAuthors.map(esc).join(', ') + '</b>)은 <b>서로 다른 담당자</b>이므로 기존 응답을 지우지 않고 <b>함께 병합</b>됩니다(같은 항목에 여러 명 응답이 남아 응답 상세에서 모두 확인 가능).</div>';
      }
    });

    return '<div class="upv-file-card' + (mismatches.length > 0 || looksUnsplit ? ' upv-warn' : '') + '" data-upv-fname="' + esc(fname) + '">'
      + '<div class="upv-file-name">📄 ' + esc(fname) + '</div>'
      + '<div class="upv-meta-row">'
        + '<span>수검부서: <b>' + esc(depts.join(', ') || '(미상)') + '</b></span>'
        + '<span>대상영역: <b>' + (domains.length ? domains.map(d=>'D-'+d).join(', ') : '(미상)') + '</b></span>'
        + '<span>응답 항목: <b>' + codes.length + '개</b></span>'
        + '<span>체크포인트 응답: <b>' + rows.length + '개</b></span>'
      + '</div>'
      + '<div class="upv-author-row">'
        + '<label>작성자(담당자 성명) — 확인/수정: <span style="color:var(--ink-soft);font-weight:400;">한 부서에 여러 담당자가 있으면 실제로 이 파일을 작성한 사람 이름을 정확히 적어주세요. 병합 시 이 이름으로 다른 담당자와 구분됩니다.</span></label>'
        + '<input type="text" class="upv-author-input" data-fname="' + esc(fname) + '" value="' + esc(authors.join(', ')) + '" placeholder="예) 홍길동 과장">'
      + '</div>'
      + warnBlock + mergeInfoBlock
    + '</div>';
  }).join('');

  panel.innerHTML = '<div class="upv-head"><span class="upv-title">📋 업로드 파일 검증 — 아직 응답집계에 반영되지 않았습니다</span></div>'
    + '<div class="upv-sub">아래 내용을 확인한 뒤 [반영하기]를 눌러야 실제로 ③ 응답집계·🎤 인터뷰 가이드에 데이터가 들어갑니다. 이상하면 [취소]로 되돌리고 올바른 파일을 다시 올려 주세요.</div>'
    + errorHtml + cardsHtml
    + '<div class="upv-actions">'
      + (fileNames.length > 0 ? ('<button type="button" class="upv-confirm-btn" id="upvConfirmBtn">' + (anyMismatch ? '⚠ 그래도 반영하기' : '✅ 반영하기') + '</button>') : '')
      + '<button type="button" class="upv-cancel-btn" id="upvCancelBtn">✕ ' + (fileNames.length > 0 ? '취소 (반영하지 않음)' : '닫기') + '</button>'
    + '</div>';
  panel.style.display = 'block';
  panel.scrollIntoView({behavior:'smooth', block:'start'});

  const confirmBtn = document.getElementById('upvConfirmBtn');
  if(confirmBtn) confirmBtn.addEventListener('click', () => {
    let candidateRows = [];
    fileNames.forEach(fname => {
      // 파일 카드에서 감사자가 확인/수정한 작성자명을 모든 행에 그대로 스탬프한다.
      // 응답자가 "작성자" 칸을 비워뒀거나 오탈자를 냈어도, 여기서 바로잡으면
      // 병합(upsertAggRows)이 정확한 담당자 기준으로 동작한다.
      const authorInput = panel.querySelector('.upv-author-input[data-fname="' + CSS.escape(fname) + '"]');
      const overrideAuthor = authorInput ? authorInput.value.trim() : '';
      const fileRows = candidateRowsByFile[fname].rows.map(r => overrideAuthor ? Object.assign({}, r, {author: overrideAuthor}) : r);
      candidateRows = candidateRows.concat(fileRows);
      loadedFiles.push({name: fname, size: candidateRowsByFile[fname].size});
    });
    const {added, updated} = upsertAggRows(aggRows, candidateRows);
    panel.style.display = 'none';
    panel.innerHTML = '';
    renderFileChips();
    renderAggregation();
    renderInterviewGuide();
    let msg = '반영 완료 — 신규 응답 ' + added + '건';
    if(updated) msg += ', 기존과 겹치는 문항(동일 도메인·항목·체크포인트·부서·작성자) ' + updated + '건은 방금 올린 파일 값으로 갱신했습니다.';
    msg += '\n\n※ 부서는 같지만 작성자(담당자 성명)가 다른 응답은 덮어쓰지 않고 모두 함께 병합·보존됩니다.';
    alert(msg);
  });
  document.getElementById('upvCancelBtn').addEventListener('click', () => {
    panel.style.display = 'none';
    panel.innerHTML = '';
    document.getElementById('csvFileInput').value = '';
  });
}

export function toggleAggOwnerDetail(btn){
  const rowId = btn.dataset.ownerRow;
  const row = document.getElementById(rowId);
  if(!row) return;
  const show = row.style.display === 'none';
  row.style.display = show ? 'table-row' : 'none';
  btn.textContent = show ? '🔼 닫기' : '🔍 상세';
  btn.classList.toggle('active', show);
}

export function populateAggDeptReportSelect(){
  const sel = document.getElementById('aggDeptReportSelect');
  if(!sel) return;
  const prev = sel.value;
  const depts = Array.from(new Set(aggRows.map(r => r.dept || '(부서명 미입력)'))).sort();
  sel.innerHTML = '<option value="">전체 (응답한 모든 부서 취합)</option>'
    + depts.map(d => '<option value="' + d.replace(/"/g,'&quot;') + '"' + (prev===d?' selected':'') + '>' + esc(d) + '</option>').join('');
  if(depts.includes(prev)) sel.value = prev;
}

export function collectDeptAggStats(deptValue){
  const rows = deptValue ? aggRows.filter(r => (r.dept || '(부서명 미입력)') === deptValue) : aggRows;
  const tierCounts = {good:0, neutral:0, bad:0, na:0};
  const byDomain = {};
  const domainOrder = [];
  const byDept = {};
  const deptOrder = [];
  const badItems = [];
  let ownerOtherCount = 0;

  rows.forEach(r => {
    const dept = r.dept || '(부서명 미입력)';
    if(!byDept[dept]){ byDept[dept] = {}; deptOrder.push(dept); }
    if(!byDomain[r.domain]){
      const dom = igFindDomain(r.domain);
      byDomain[r.domain] = {code:r.domain, title: dom ? dom.title : r.domain, total:0, good:0, neutral:0, bad:0, na:0};
      domainOrder.push(r.domain);
    }
    if(Object.prototype.hasOwnProperty.call(tierCounts, r.tier)){
      tierCounts[r.tier]++;
      byDomain[r.domain][r.tier]++;
      byDomain[r.domain].total++;
    }
    if(r.own === '타 부서 담당' || r.own === '공동 담당') ownerOtherCount++;
    if(r.tier === 'bad') badItems.push({code:r.code, title:r.title, risk:r.risk, dept, cptext:r.cptext});
  });

  // 항목(부서×항목코드) 단위로 묶어 체크포인트 목록·비고·자체평가·증빙을 함께 담는다 —
  // 설문지 쪽 buildItemReviewHtml()과 같은 목적, 데이터 출처만 DOM이 아니라 aggRows.
  const itemMap = {};
  const itemOrder = [];
  rows.forEach(r => {
    const dept = r.dept || '(부서명 미입력)';
    const key = dept + '|||' + r.code;
    if(!itemMap[key]){
      itemMap[key] = {dept, domain:r.domain, code:r.code, title:r.title, risk:r.risk,
        own:r.own||'', ownDept:r.ownDept||'', ownPerson:r.ownPerson||'', fam:r.fam||'',
        sr:r.sr||'', srNote:r.srNote||'', evidence:r.evidence||'', note:r.note||'',
        checkpoints:[], hasBad:false};
      itemOrder.push(key);
    }
    const g = itemMap[key];
    if(r.sr) g.sr = r.sr;
    if(r.srNote) g.srNote = r.srNote;
    if(r.evidence) g.evidence = r.evidence;
    if(r.note) g.note = r.note;
    if(r.tier === 'bad') g.hasBad = true;
    g.checkpoints.push({cptext:r.cptext, tier:r.tier, resp:r.resp});
  });
  itemOrder.forEach(key => { const g = itemMap[key]; byDept[g.dept][key] = g; });

  const checkpoints = rows.map(r => ({code:r.code, domain:r.domain, dept:r.dept||'(부서명 미입력)', tier:r.tier, risk:r.risk}));
  return {tierCounts, byDomain, domainOrder, byDept, deptOrder, badItems, ownerOtherCount, totalCp: rows.length, itemMap, itemOrder, checkpoints};
}

export function buildDeptAggReviewHtml(stats, esc4){
  // 부서별로 <details> 묶음을 만들고(전체 선택 시 여러 부서, 개별 선택 시 1개), 그 안에서
  // 도메인 → 항목 순으로 체크포인트 응답을 펼쳐 보여준다.
  const RV_BADGE = {good:'✅ 이행', neutral:'🟡 부분이행', bad:'🚩 미흡', na:'⬜ 해당없음', blank:'— 미응답'};
  return stats.deptOrder.map(dept => {
    const keys = stats.itemOrder.filter(k => stats.itemMap[k].dept === dept);
    if(keys.length === 0) return '';
    const byDomainInDept = {};
    const domOrderInDept = [];
    keys.forEach(k => {
      const it = stats.itemMap[k];
      if(!byDomainInDept[it.domain]){ byDomainInDept[it.domain] = []; domOrderInDept.push(it.domain); }
      byDomainInDept[it.domain].push(it);
    });
    const domainBlocks = domOrderInDept.map(dcode => {
      const dom = igFindDomain(dcode);
      const domTitle = dom ? dom.title : dcode;
      const itemsHtml = byDomainInDept[dcode].map(it => {
        const isOtherDept = it.own === '타 부서 담당';
        const cpHtml = isOtherDept
          ? ('<div class="rv-skip">↪ 타 부서 담당으로 표시됨' + (it.ownDept ? (' — 담당부서: ' + esc4(it.ownDept)) : '') + '</div>')
          : '<ul class="rv-cp-list">' + it.checkpoints.map(cp => {
              const t = cp.tier || 'blank';
              return '<li><span class="rv-cp-badge ' + t + '">' + (RV_BADGE[t] || RV_BADGE.blank) + '</span><span>' + esc4(cp.cptext) + '</span></li>';
            }).join('') + '</ul>';
        const metaBits = [];
        if(it.own && !isOtherDept) metaBits.push('담당여부: <b>' + esc4(it.own) + '</b>');
        if(it.fam) metaBits.push('숙지도: <b>' + esc4(it.fam) + '</b>');
        if(it.sr) metaBits.push('자체평가: <b>' + esc4(it.sr) + '</b>');
        if(it.ownPerson) metaBits.push('관련 담당자: <b>' + esc4(it.ownPerson) + '</b>');
        return '<div class="rv-item' + (it.hasBad ? ' rv-bad' : '') + '">'
          + '<div class="rv-item-head"><span class="rv-item-code">' + esc4(it.code) + '</span><span class="rv-item-title' + (it.hasBad ? ' has-bad' : '') + '">' + esc4(it.title) + '</span><span class="rv-badge">위험도 ' + esc4(it.risk) + '</span></div>'
          + (metaBits.length ? ('<div class="rv-meta-row">' + metaBits.join(' · ') + '</div>') : '')
          + cpHtml
          + (it.note ? ('<div class="rv-note-block">📝 비고: ' + esc4(it.note) + '</div>') : '')
          + (it.srNote ? ('<div class="rv-note-block">🗒 자체평가 근거: ' + esc4(it.srNote) + '</div>') : '')
          + (it.evidence ? ('<div class="rv-note-block">📎 제출 예정 증빙: ' + esc4(it.evidence) + '</div>') : '')
        + '</div>';
      }).join('');
      return '<div class="rv-domain-head">D-' + esc4(dcode) + ' ' + esc4(domTitle) + '</div>' + itemsHtml;
    }).join('');
    // 전체(여러 부서) 취합본일 때만 부서 이름을 굵은 구획 제목으로 한 번 더 감싼다 — 부서 단위로
    // 인쇄 페이지를 나눠, 나중에 이 부서분만 추려 그 부서에 인쇄물로 나눠줄 수도 있게 한다.
    return (stats.deptOrder.length > 1
      ? '<h2 class="sec dept-sec">🏢 ' + esc4(dept) + '</h2>'
      : '') + domainBlocks;
  }).join('');
}

// [v8.63] buildDeptAggSummaryHtml() - 부서전달용 HTML 필터 기능 완전 개편
// 기능: 필터(부서/위험도/영역/상태), 검색, 정렬, 통계 갱신, 부서 요약 카드, 응답자 표시, 공통약점 강조

export function buildDeptAggSummaryHtml(deptValue){
  const stats = collectDeptAggStats(deptValue);
  const esc4 = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const deptLabel = deptValue || ('전체 취합 (' + stats.deptOrder.length + '개 부서)');
  const T = stats.tierCounts;
  const total = stats.totalCp || 0;
  const implRate = total > 0 ? Math.round((T.good + T.neutral) / total * 100) : 0;
  const hiBadCount = stats.badItems.filter(b => b.risk === '상').length;
  const nowStr = new Date(Date.now() + 9*3600000).toISOString().slice(0,16).replace('T',' ') + ' (KST)';

  // [v8.63] 공통 약점 영역 계산 — 2개 이상 부서가 미흡한 항목
  const commonWeaknesses = new Set();
  const itemDeptMap = {};
  stats.badItems.forEach(b => {
    if(!itemDeptMap[b.code]) itemDeptMap[b.code] = new Set();
    itemDeptMap[b.code].add(b.dept);
  });
  Object.keys(itemDeptMap).forEach(code => {
    if(itemDeptMap[code].size >= 2) commonWeaknesses.add(code);
  });

  const order = [['good','#2e7d5b'], ['neutral','#b8863b'], ['bad','#a23b2e'], ['na','#9aa3b0']];
  let acc = 0;
  const stops = order.map(([k,color]) => {
    const pct = total > 0 ? (T[k]/total*100) : 0;
    const start = acc; acc += pct;
    return color + ' ' + start.toFixed(2) + '% ' + acc.toFixed(2) + '%';
  }).join(', ');
  const donutStyle = total > 0 ? ('background: conic-gradient(' + stops + ');') : 'background:#e5e1d4;';

  const TIER_LABEL_KR = {good:'양호(이행)', neutral:'보통(부분이행)', bad:'개선필요(미흡)', na:'해당없음'};
  const legendHtml = order.map(([k,color]) =>
    '<div class="legend-row"><span class="legend-dot" style="background:' + color + ';"></span>'
    + '<span class="legend-label">' + TIER_LABEL_KR[k] + '</span>'
    + '<span class="legend-val">' + T[k] + '건 (' + (total > 0 ? Math.round(T[k]/total*100) : 0) + '%)</span></div>'
  ).join('');

  const domainRows = stats.domainOrder
    .map(k => stats.byDomain[k])
    .filter(d => d.total > 0)
    .sort((a,b) => (b.bad/b.total) - (a.bad/a.total))
    .map(d => {
      const segs = order.map(([k,color]) => {
        const pct = d.total > 0 ? (d[k]/d.total*100) : 0;
        return pct > 0 ? ('<span style="display:inline-block;height:100%;width:' + pct.toFixed(2) + '%;background:' + color + ';"></span>') : '';
      }).join('');
      return '<div class="dom-row">'
        + '<div class="dom-label">D-' + esc4(d.code) + ' ' + esc4(d.title) + '</div>'
        + '<div class="dom-bar-track">' + segs + '</div>'
        + '<div class="dom-count">' + d.total + '건 · 미흡 ' + d.bad + '건</div>'
      + '</div>';
    }).join('');

  // [v8.63] 부서별 요약 카드 — stats.byDept[dept]의 각 항목 checkpoints 순회하여 tier 집계
  const deptSummaryCards = stats.deptOrder.length > 1 ? (
    '<h2 class="sec">🏢 부서별 응답 현황</h2>'
    + '<div class="dept-cards-grid">'
    + stats.deptOrder.map(dept => {
      const deptItemsMap = stats.byDept[dept] || {};
      let deptGoodCp = 0, deptBadCp = 0, deptNeutralCp = 0, deptTotalCp = 0;
      Object.values(deptItemsMap).forEach(item => {
        if(item.checkpoints && Array.isArray(item.checkpoints)){
          item.checkpoints.forEach(cp => {
            deptTotalCp++;
            if(cp.tier === 'good') deptGoodCp++;
            else if(cp.tier === 'bad') deptBadCp++;
            else if(cp.tier === 'neutral') deptNeutralCp++;
          });
        }
      });
      const deptImplRate = deptTotalCp > 0 ? Math.round((deptGoodCp + deptNeutralCp) / deptTotalCp * 100) : 0;
      return '<div class="dept-card">'
        + '<div class="dept-name">' + esc4(dept) + '</div>'
        + '<div class="dept-stats"><span class="rate">' + deptImplRate + '%</span><span class="label">이행률</span></div>'
        + '<div class="dept-bad"><span class="num">' + deptBadCp + '</span><span class="label">미흡</span></div>'
        + '</div>';
    }).join('')
    + '</div>'
  ) : '';

  const badTableRows = stats.badItems.length === 0
    ? '<tr><td colspan="5" style="padding:14px;color:#5a6472;text-align:center;">개선 필요(미흡) 응답이 없습니다.</td></tr>'
    : stats.badItems.slice().sort((a,b) => (a.risk==='상'?0:a.risk==='중'?1:2) - (b.risk==='상'?0:b.risk==='중'?1:2)).map(b => {
      const isCommon = commonWeaknesses.has(b.code) ? ' class="common-weakness"' : '';
      const commonBadge = commonWeaknesses.has(b.code) ? ' <span class="common-badge">🔴 공통약점</span>' : '';
      return '<tr' + isCommon + ' data-code="' + esc4(b.code) + '" data-risk="' + esc4(b.risk) + '" data-dept="' + esc4(b.dept) + '" data-domain="' + esc4(b.code.split('-')[0]) + '">'
        + '<td class="mono" style="white-space:nowrap;">' + esc4(b.code) + ' <span class="risk-chip risk-' + esc4(b.risk) + '">' + esc4(b.risk) + '</span>' + commonBadge + '</td>'
        + (stats.deptOrder.length > 1 ? ('<td style="white-space:nowrap;">' + esc4(b.dept) + '</td>') : '')
        + '<td style="font-weight:700;background:#fff5f3;">' + esc4(b.title) + '</td><td>' + esc4(b.cptext) + '</td></tr>';
    }).join('');

  const evidenceItems = stats.itemOrder.map(k => stats.itemMap[k]).filter(it => it.evidence);
  const evidenceListRows = evidenceItems.length === 0
    ? '<tr><td colspan="4" style="padding:14px;color:#5a6472;text-align:center;">제출 예정으로 체크된 증빙자료가 없습니다.</td></tr>'
    : evidenceItems.map(it =>
        '<tr data-code="' + esc4(it.code) + '" data-dept="' + esc4(it.dept) + '" data-domain="' + esc4(it.code.split('-')[0]) + '">'
        + '<td class="mono" style="white-space:nowrap;">' + esc4(it.code) + '</td>'
        + (stats.deptOrder.length > 1 ? ('<td style="white-space:nowrap;">' + esc4(it.dept) + '</td>') : '')
        + '<td>' + esc4(it.title) + '</td><td>' + esc4(it.evidence) + '</td></tr>'
      ).join('');

  // [v8.63] 부서 목록 (필터용)
  const deptOptions = '<option value="">전체</option>' + stats.deptOrder.map(d => '<option value="' + esc4(d) + '">' + esc4(d) + '</option>').join('');
  
  // [v8.63] 영역 목록 (필터용)
  const domainOptions = '<option value="">전체</option>' + stats.domainOrder.map(d => {
    const dom = stats.byDomain[d];
    return '<option value="' + esc4(d) + '">D-' + esc4(d) + ' ' + esc4(dom.title) + '</option>';
  }).join('');

  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>설문 응답 요약 — ' + esc4(deptLabel) + '</title><style>'
    + '@page{size:A4;margin:16mm;}'
    + '*{box-sizing:border-box;}'
    + 'body{font-family:\'Malgun Gothic\',\'맑은 고딕\',\'Noto Sans KR\',sans-serif;margin:0;background:#f7f5f0;color:#2a2a2a;line-height:1.6;font-size:13px;}'
    + '.wrap{max-width:1080px;margin:16px auto;background:#fff;border-radius:2px;box-shadow:0 2px 8px rgba(0,0,0,.06);overflow:hidden;}'
    + '.zoom-controls{position:fixed;top:16px;left:16px;display:flex;gap:8px;z-index:1000;background:#fff;border:1px solid #ddd;border-radius:3px;padding:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);}'
    + '.zoom-btn{padding:6px 12px;background:#1f4e6f;color:#fff;border:none;border-radius:2px;cursor:pointer;font-size:12px;font-weight:600;transition:all .2s;}'
    + '.zoom-btn:hover{background:#2a5f7f;}'
    + '.zoom-display{padding:6px 12px;font-size:12px;font-family:\'Courier New\',monospace;color:#666;min-width:50px;text-align:center;border:1px solid #e8dfd0;border-radius:2px;background:#f5f3ed;}'
    + '.hero{background:linear-gradient(135deg,#1f4e6f 0%,#2a5f7f 100%);color:#f8f6f1;padding:32px 40px;}'
    + '.hero .eyebrow{font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:.12em;color:#d4af37;text-transform:uppercase;margin:0 0 6px;font-weight:600;}'
    + '.hero h1{margin:0 0 12px;font-size:28px;font-weight:600;line-height:1.3;}'
    + '.hero .meta{font-size:13px;color:#d8e0eb;line-height:1.7;margin:0;}'
    + '.body{padding:32px 40px;}'
    + '.filter-panel{position:sticky;top:0;z-index:999;background:#faf9f5;border:1px solid #e8dfd0;border-radius:4px;padding:18px;margin:0 0 28px;display:block;box-shadow:0 2px 8px rgba(0,0,0,.05);}'
    + '.filter-panel.hide{display:none;}'
    + '.filter-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;align-items:end;}'
    + '.filter-group{display:flex;flex-direction:column;gap:5px;}'
    + '.filter-group label{font-size:10px;color:#666;text-transform:uppercase;font-weight:700;letter-spacing:.08em;}'
    + '.filter-group select,.filter-group input{padding:9px 11px;border:1px solid #ddd;border-radius:3px;font-size:12px;font-family:inherit;background:#fff;color:#2a2a2a;}'
    + '.filter-group input::placeholder{color:#aaa;}'
    + '.filter-btn{padding:9px 16px;background:#1f4e6f;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600;transition:background .2s;}'
    + '.filter-btn:hover{background:#2a5f7f;}'
    + '.common-weakness{background:#fffaf8;border-left:3px solid #d9534f;}'
    + '.common-badge{background:#f5e6e3;color:#c85a4a;padding:3px 8px;border-radius:2px;font-size:10px;font-weight:700;margin-left:6px;}'
    + '.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:0 0 32px;}'
    + '.stat-card{border:1px solid #e8dfd0;border-radius:4px;padding:16px;text-align:center;background:#faf9f5;}'
    + '.stat-card .num{font-family:\'Courier New\',monospace;font-size:32px;font-weight:700;color:#1f4e6f;line-height:1.1;margin-bottom:6px;}'
    + '.stat-card .lbl{font-size:12px;color:#666;line-height:1.5;}'
    + '.stat-card.warn .num{color:#c85a4a;}'
    + 'h2.sec{font-size:16px;color:#1f4e6f;border-bottom:2px solid #e8dfd0;padding:0 0 10px;margin:32px 0 18px;font-weight:600;letter-spacing:.02em;}'
    + 'h2.sec.dept-sec{font-size:17px;border-bottom:none;border-left:4px solid #1f4e6f;background:#f5f3ed;padding:12px 16px;margin:36px 0 18px;border-radius:2px;page-break-before:always;}'
    + '.donut-row{display:flex;align-items:center;gap:40px;margin:20px 0 28px;padding:20px 0;border-top:1px solid #f0eae0;border-bottom:1px solid #f0eae0;}'
    + '.donut{width:150px;height:150px;border-radius:50%;flex:none;position:relative;' + donutStyle + '}'
    + '.donut::after{content:"";position:absolute;inset:30px;background:#fff;border-radius:50%;}'
    + '.donut-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}'
    + '.donut-center b{font-family:\'Courier New\',monospace;font-size:26px;color:#1f4e6f;font-weight:700;}'
    + '.donut-center span{font-size:12px;color:#666;margin-top:2px;font-weight:500;}'
    + '.legend{flex:1;}'
    + '.legend-row{display:flex;align-items:center;gap:10px;padding:10px 0;font-size:13px;border-bottom:1px solid #f5f3ed;}'
    + '.legend-row:last-child{border:none;}'
    + '.legend-dot{width:14px;height:14px;border-radius:50%;flex:none;}'
    + '.legend-label{flex:1;color:#2a2a2a;font-weight:500;}'
    + '.legend-val{font-family:\'Courier New\',monospace;color:#666;font-size:12px;font-weight:600;}'
    + '.dept-cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:14px;margin:0 0 32px;}'
    + '.dept-card{background:#faf9f5;border:1px solid #e8dfd0;border-radius:4px;padding:16px;text-align:center;transition:all .2s;}'
    + '.dept-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.08);transform:translateY(-2px);}'
    + '.dept-name{font-size:12px;font-weight:600;color:#1f4e6f;margin-bottom:12px;word-break:break-word;line-height:1.4;}'
    + '.dept-stats{display:flex;justify-content:center;align-items:baseline;gap:6px;margin-bottom:12px;}'
    + '.dept-stats .rate{font-size:22px;font-weight:700;color:#2a7a4a;font-family:\'Courier New\',monospace;}'
    + '.dept-stats .label{font-size:10px;color:#666;}'
    + '.dept-bad{display:flex;flex-direction:column;align-items:center;gap:3px;}'
    + '.dept-bad .num{font-size:20px;font-weight:700;font-family:\'Courier New\',monospace;color:#c85a4a;}'
    + '.dept-bad .label{font-size:10px;color:#666;}'
    + '.dom-row{display:grid;grid-template-columns:130px 1fr 100px;align-items:center;gap:14px;padding:12px 0;font-size:13px;border-bottom:1px solid #f5f3ed;}'
    + '.dom-row:last-child{border:none;}'
    + '.dom-label{color:#2a2a2a;font-weight:500;}'
    + '.dom-bar-track{height:20px;background:#f0eae0;border-radius:2px;overflow:hidden;white-space:nowrap;}'
    + '.dom-count{font-family:\'Courier New\',monospace;font-size:12px;color:#666;text-align:right;font-weight:600;}'
    + 'table{width:100%;border-collapse:collapse;font-size:13px;margin:0 0 28px;background:#fff;border:1px solid #e8dfd0;border-radius:2px;overflow:hidden;}'
    + 'th,td{padding:12px 14px;border-bottom:1px solid #e8dfd0;text-align:left;color:#2a2a2a;line-height:1.6;}'
    + 'th{background:#f0ebe1;font-size:11px;color:#666;text-transform:uppercase;font-weight:700;letter-spacing:.08em;border-bottom:2px solid #dcd4c5;}'
    + 'tr:hover{background:#fffaf8;}'
    + '.risk-chip{font-family:\'Courier New\',monospace;font-size:11px;padding:3px 7px;border-radius:2px;font-weight:700;white-space:nowrap;margin-right:4px;}'
    + '.risk-상{background:#f5d9d5;color:#c85a4a;} .risk-중{background:#fef5e8;color:#b8863b;} .risk-하{background:#e5f0ec;color:#2a7a4a;}'
    + '.mono{font-family:\'Courier New\',monospace;font-size:12px;font-weight:600;}'
    + '.rv-item{border-bottom:2px solid #e8dfd0;padding-bottom:18px;margin-bottom:18px;}'
    + '.rv-item:last-child{border-bottom:none;margin-bottom:0;}'
    + '.rv-item-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;}'
    + '.rv-item-code{font-family:\'Courier New\',monospace;font-size:11px;color:#666;font-weight:600;}'
    + '.rv-item-title{font-weight:700;font-size:13px;color:#2a2a2a;flex:1;}'
    + '.rv-item-title.has-bad{background:#fff5f3;color:#c85a4a;padding:4px 8px;border-radius:3px;font-weight:800;}'
    + '.rv-badge{font-size:10px;font-family:\'Courier New\',monospace;padding:2px 7px;border-radius:2px;background:#f5f3ed;color:#666;white-space:nowrap;}'
    + '.rv-skip{font-size:12px;color:#c85a4a;background:#fdecea;border-radius:4px;padding:7px 10px;line-height:1.5;}'
    + '.rv-cp-list{margin:6px 0 0;padding:0 0 0 16px;list-style:none;}'
    + '.rv-cp-list li{display:flex;gap:8px;align-items:flex-start;font-size:12px;padding:4px 0;line-height:1.5;}'
    + '.rv-cp-badge{flex:none;font-family:\'Courier New\',monospace;font-size:10px;font-weight:700;padding:1px 6px;border-radius:2px;white-space:nowrap;}'
    + '.rv-cp-badge.good{background:#e5f2ea;color:#2a7a4a;} .rv-cp-badge.neutral{background:#f7edd9;color:#b8863b;} .rv-cp-badge.bad{background:#f5d9d5;color:#c85a4a;} .rv-cp-badge.na{background:#f0eae0;color:#666;}'
    + '.rv-meta-row{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;color:#666;margin:7px 0;line-height:1.5;}'
    + '.rv-meta-row b{color:#2a2a2a;font-weight:600;}'
    + '.rv-note-block{font-size:11px;color:#2a2a2a;background:#faf9f5;border-radius:3px;padding:9px 10px;margin-top:7px;line-height:1.6;border-left:3px solid #e8dfd0;}'
    + '.rv-domain-head{font-size:13px;font-weight:700;color:#1f4e6f;background:#f5f3ed;padding:10px 12px;margin:20px 0 12px;border-radius:2px;}'
    + '.footer{padding:18px 40px;font-size:11px;color:#999;border-top:1px solid #e8dfd0;background:#faf9f5;line-height:1.6;}'
    + '.print-btn{position:fixed;top:16px;right:16px;background:#1f4e6f;color:#fff;border:none;border-radius:3px;padding:9px 14px;font-size:11px;cursor:pointer;z-index:1000;transition:background .2s;font-weight:600;}'
    + '.print-btn:hover{background:#2a5f7f;}'
    + '.print-btn.save-btn{right:134px;background:#5a6472;}'
    + '.print-btn.filter-toggle-btn{right:252px;background:#5a4a7a;}'
    + '.print-btn.export-btn{right:370px;background:#6a7a8a;}'
    + 'p{margin:0 0 14px;line-height:1.7;color:#2a2a2a;}'
    + '@media print{.print-btn{display:none;}.zoom-controls{display:none;}.filter-panel{display:none;}.wrap{box-shadow:none;margin:0;max-width:none;border-radius:0;}.body{padding:16px 24px;}.hero{padding:20px 24px;}}'
    + '</style></head><body>'
    + '<div class="zoom-controls">'
      + '<button class="zoom-btn" onclick="zoomOut()">−</button>'
      + '<div class="zoom-display" id="zoomDisplay">100%</div>'
      + '<button class="zoom-btn" onclick="zoomReset()">초기화</button>'
      + '<button class="zoom-btn" onclick="zoomIn()">+</button>'
    + '</div>'
    + '<button class="print-btn filter-toggle-btn" onclick="toggleFilterPanel()">🔍 필터</button>'
    + '<button class="print-btn export-btn" onclick="exportToCSV()">💾 CSV</button>'
    + '<button class="print-btn save-btn" onclick="itAuditSaveHtml()">HTML로 저장</button>'
    + '<button class="print-btn" onclick="window.print()">인쇄 / PDF</button>'
    + '<div class="wrap">'
      + '<div class="hero"><div class="eyebrow">IT AUDIT · AGGREGATED RESPONSE SUMMARY</div><h1>📊 설문 응답 요약</h1>'
        + '<div class="meta">수검부서: <b>' + esc4(deptLabel) + '</b> · 생성일시: ' + nowStr + '</div></div>'
      + '<div class="body">'
        + '<div class="filter-panel" id="filterPanel">'
          + '<div class="filter-row">'
            + '<div class="filter-group"><label>검색</label><input type="text" id="searchInput" placeholder="항목명, 체크포인트 검색" onkeyup="applyFilters()"></div>'
            + '<div class="filter-group"><label>부서</label><select id="deptFilter" onchange="applyFilters()">' + deptOptions + '</select></div>'
            + '<div class="filter-group"><label>위험도</label><select id="riskFilter" onchange="applyFilters()"><option value="">전체</option><option value="상">상</option><option value="중">중</option><option value="하">하</option></select></div>'
            + '<div class="filter-group"><label>영역</label><select id="domainFilter" onchange="applyFilters()">' + domainOptions + '</select></div>'
            + '<div class="filter-group"><label>상태</label><select id="statusFilter" onchange="applyFilters()"><option value="">전체</option><option value="bad">미흡만</option><option value="good">양호만</option></select></div>'
            + '<div class="filter-group"><button class="filter-btn" onclick="resetFilters()">초기화</button></div>'
          + '</div>'
        + '</div>'
        + '<div class="stat-grid">'
          + '<div class="stat-card"><div class="num" id="totalCpStat">' + total + '</div><div class="lbl">전체 응답<br>체크포인트</div></div>'
          + '<div class="stat-card" style="background:#e5f2ea;"><div class="num" id="goodCpStat" style="color:#2a7a4a;">' + T.good + '</div><div class="lbl">양호(이행)<br>' + (total > 0 ? Math.round(T.good/total*100) : 0) + '%</div></div>'
          + '<div class="stat-card" style="background:#f7edd9;"><div class="num" id="neutralCpStat" style="color:#b8863b;">' + T.neutral + '</div><div class="lbl">보통(부분이행)<br>' + (total > 0 ? Math.round(T.neutral/total*100) : 0) + '%</div></div>'
          + '<div class="stat-card warn" style="background:#f5d9d5;"><div class="num" id="badCpStat" style="color:#c85a4a;">' + T.bad + '</div><div class="lbl">미흡(개선필요)<br>' + (total > 0 ? Math.round(T.bad/total*100) : 0) + '%</div></div>'
          + '<div class="stat-card"><div class="num" id="implRateStat">' + implRate + '%</div><div class="lbl">이행률<br>(양호+보통)</div></div>'
          + '<div class="stat-card" style="background:#f0eae0;"><div class="num" id="naCpStat" style="color:#666;">' + T.na + '</div><div class="lbl">해당없음<br>' + (total > 0 ? Math.round(T.na/total*100) : 0) + '%</div></div>'
          + '<div class="stat-card warn" style="background:#fff5f3;"><div class="num" id="hiBadStat" style="color:#c85a4a;">' + hiBadCount + '</div><div class="lbl">위험도 "상"중<br>미흡 응답</div></div>'
          + '<div class="stat-card"><div class="num" id="badItemStat">' + stats.badItems.length + '</div><div class="lbl">미흡 항목<br>수</div></div>'
          + '<div class="stat-card"><div class="num" id="ownerOtherStat">' + stats.ownerOtherCount + '</div><div class="lbl">타 부서 담당 ·<br>공동 담당</div></div>'
        + '</div>'
        + '<h2 class="sec">전체 응답 분포</h2>'
        + '<div class="donut-row"><div class="donut"><div class="donut-center"><b id="implRateDonut">' + implRate + '%</b><span>이행률</span></div></div>'
          + '<div class="legend">' + legendHtml + '</div></div>'
        + (stats.domainOrder.length > 1 ? ('<h2 class="sec">영역별 이행 현황 (미흡 비율 높은 순)</h2><div class="dom-list">' + domainRows + '</div>') : '')
        + deptSummaryCards
        + '<h2 class="sec">🚩 개선 필요(미흡) 응답 — <span id="badCountSpan">' + stats.badItems.length + '</span>건</h2>'
        + '<table><tr><th>항목코드/위험도</th>' + (stats.deptOrder.length > 1 ? '<th>응답부서</th>' : '') + '<th>항목명</th><th>체크포인트</th></tr><tbody id="badTableBody">' + badTableRows + '</tbody></table>'
        + '<h2 class="sec">📎 제출 예정 증빙자료 목록 — <span id="evidenceCountSpan">' + evidenceItems.length + '</span>건</h2>'
        + '<table><tr><th>항목코드</th>' + (stats.deptOrder.length > 1 ? '<th>응답부서</th>' : '') + '<th>항목명</th><th>제출 예정 증빙자료</th></tr><tbody id="evidenceTableBody">' + evidenceListRows + '</tbody></table>'
        + '<h2 class="sec" style="page-break-before:always;">📋 전체 항목 리뷰</h2>'
        + '<p style="font-size:11.5px;color:#5a6472;margin:0 0 14px;line-height:1.6;">아래는 이 요약에 포함된 모든 항목의 담당여부·체크포인트 응답·비고·자체평가·증빙을 그대로 모은 목록입니다.</p>'
        + buildDeptAggReviewHtml(stats, esc4)
      + '</div>'
      + '<div class="footer">생성일시: ' + nowStr + ' · A4 인쇄에 최적화 · [v8.63] 필터/검색/정렬 기능 추가</div>'
    + '</div>'
    + '<script>'
      + 'const statsData = ' + JSON.stringify({
        tierCounts: stats.tierCounts,
        totalCp: stats.totalCp,
        badItems: stats.badItems,
        checkpoints: stats.checkpoints,
        deptOrder: stats.deptOrder
      }) + ';'
      + 'const allBadRows = document.querySelectorAll("#badTableBody tr");'
      + 'const allEvidenceRows = document.querySelectorAll("#evidenceTableBody tr");'
      + 'function toggleFilterPanel(){document.getElementById("filterPanel").classList.toggle("hide");}'
      + 'function resetFilters(){document.getElementById("searchInput").value="";document.getElementById("deptFilter").value="";document.getElementById("riskFilter").value="";document.getElementById("domainFilter").value="";document.getElementById("statusFilter").value="";applyFilters();}'
      + 'function applyFilters(){'
        + 'const search=document.getElementById("searchInput").value.toLowerCase();'
        + 'const dept=document.getElementById("deptFilter").value;'
        + 'const risk=document.getElementById("riskFilter").value;'
        + 'const domain=document.getElementById("domainFilter").value;'
        + 'const status=document.getElementById("statusFilter").value;'
        + 'let visibleBad=0,visibleEvidence=0;'
        + 'allBadRows.forEach(row=>{'
          + 'const code=row.dataset.code||"";const rowDept=row.dataset.dept||"";const rowRisk=row.dataset.risk||"";const rowDomain=row.dataset.domain||"";'
          + 'const text=row.innerText.toLowerCase();'
          + 'const matchSearch=!search||text.includes(search);const matchDept=!dept||rowDept===dept;const matchRisk=!risk||rowRisk===risk;const matchDomain=!domain||rowDomain===domain;'
          + 'const match=matchSearch&&matchDept&&matchRisk&&matchDomain&&(!status||status==="bad");'
          + 'row.style.display=match?"":"none";if(match)visibleBad++;'
        + '});'
        + 'allEvidenceRows.forEach(row=>{'
          + 'const rowDept=row.dataset.dept||"";const rowDomain=row.dataset.domain||"";'
          + 'const text=row.innerText.toLowerCase();'
          + 'const matchSearch=!search||text.includes(search);const matchDept=!dept||rowDept===dept;const matchDomain=!domain||rowDomain===domain;'
          + 'const match=matchSearch&&matchDept&&matchDomain;'
          + 'row.style.display=match?"":"none";if(match)visibleEvidence++;'
        + '});'
        + 'const filteredCps=statsData.checkpoints.filter(cp=>{'
          + 'const deptMatch=!dept||cp.dept===dept;const riskMatch=!risk||cp.risk===risk;const domainMatch=!domain||cp.domain===domain;'
          + 'return deptMatch&&riskMatch&&domainMatch;'
        + '});'
        + 'let filteredGood=0,filteredNeutral=0,filteredBad=0,filteredNa=0;'
        + 'filteredCps.forEach(cp=>{if(cp.tier==="good")filteredGood++;else if(cp.tier==="neutral")filteredNeutral++;else if(cp.tier==="bad")filteredBad++;else if(cp.tier==="na")filteredNa++;});'
        + 'const filteredTotal=filteredCps.length;'
        + 'const filteredImplRate=filteredTotal>0?Math.round((filteredGood+filteredNeutral)/filteredTotal*100):0;'
        + 'const filteredHiBad=statsData.badItems.filter(b=>{'
          + 'const deptMatch=!dept||b.dept===dept;const riskMatch=!risk||b.risk===risk;const domainMatch=!domain||b.code.split("-")[0]===domain;'
          + 'return deptMatch&&riskMatch&&domainMatch&&b.risk==="상";'
        + '}).length;'
        + 'const filteredBadItems=visibleBad;'
        + 'document.getElementById("totalCpStat").innerText=filteredTotal;'
        + 'document.getElementById("goodCpStat").innerText=filteredGood;'
        + 'document.getElementById("neutralCpStat").innerText=filteredNeutral;'
        + 'document.getElementById("badCpStat").innerText=filteredBad;'
        + 'document.getElementById("naCpStat").innerText=filteredNa;'
        + 'document.getElementById("implRateStat").innerText=filteredImplRate+"%";'
        + 'document.getElementById("hiBadStat").innerText=filteredHiBad;'
        + 'document.getElementById("badItemStat").innerText=filteredBadItems;'
        + 'document.getElementById("badCountSpan").innerText=visibleBad;document.getElementById("evidenceCountSpan").innerText=visibleEvidence;'
      + '}'
      + 'function exportToCSV(){'
        + 'let csv="\\ufeff항목코드,위험도,부서,항목명,체크포인트\\n";'
        + 'allBadRows.forEach(row=>{if(row.style.display!=="none"){const cells=row.querySelectorAll("td");let line="";for(let i=0;i<cells.length;i++){let text=cells[i].innerText.replace(/"/g,"\\\"");line+=(i>0?",":"")+"\\""+text+"\\"";} csv+=line+"\\n";}});'
        + 'const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="응답요약_"+(new Date().toISOString().split("T")[0])+".csv";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);'
      + '}'
      + 'function itAuditSaveHtml(){var c=document.documentElement.cloneNode(true);var bs=c.querySelectorAll(".no-print");for(var i=0;i<bs.length;i++){bs[i].remove();}var html="<!DOCTYPE html>"+c.outerHTML;var blob=new Blob([html],{type:"text/html;charset=utf-8;"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download=(document.title||"summary").replace(/[\\/:*?"<>|]/g,"")+".html";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}'
      + 'let currentZoom=100;'
      + 'function zoomIn(){currentZoom=Math.min(currentZoom+10,200);updateZoom();}'
      + 'function zoomOut(){currentZoom=Math.max(currentZoom-10,50);updateZoom();}'
      + 'function zoomReset(){currentZoom=100;updateZoom();}'
      + 'function updateZoom(){document.body.style.zoom=currentZoom+"%";document.getElementById("zoomDisplay").innerText=currentZoom+"%";localStorage.setItem("itaudit_zoom",currentZoom);}'
      + 'document.addEventListener("DOMContentLoaded",function(){var saved=localStorage.getItem("itaudit_zoom");if(saved){currentZoom=parseInt(saved);updateZoom();}});'
    + '</script>'
    + '</body></html>';
}

export function exportDeptAggSummary(){
  if(aggRows.length === 0){ alert('취합된 응답 데이터가 없습니다. 먼저 CSV/JSON을 업로드해 주세요.'); return; }
  const sel = document.getElementById('aggDeptReportSelect');
  const deptValue = sel ? sel.value : '';
  if(deptValue && !aggRows.some(r => (r.dept||'(부서명 미입력)') === deptValue)){
    alert('선택한 부서의 응답 데이터를 찾을 수 없습니다.');
    return;
  }
  const html = buildDeptAggSummaryHtml(deptValue);
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=1180,height=1000');
}

// ============================================================
// 📄 미흡사항 조치계획 요청서 (부서 배포용) — v8.6x 추가
// 응답집계에서 tier==='bad'(미흡)로 판정된 항목만 부서별로 모아, 원인분석·개선계획·
// 완료예정일·담당자를 기재해 회신받는 A4 인쇄용 문서. collectDeptAggStats()가 이미
// 부서×항목 단위로 묶어둔 itemMap(hasBad 플래그 포함)을 그대로 재사용한다.
// buildDeptAggSummaryHtml()과 같은 팔레트·레이아웃 관례를 따른다.
// ============================================================

export function buildActionPlanRequestHtml(deptValue){
  const stats = collectDeptAggStats(deptValue);
  const esc5 = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const nowStr = new Date(Date.now() + 9*3600000).toISOString().slice(0,10);
  const auditName = (typeof getCurrentAuditName === 'function') ? (getCurrentAuditName() || '') : '';

  // 부서 × 항목 단위로 미흡(hasBad) 항목만 추린다.
  const badItemsByDept = {};
  stats.deptOrder.forEach(d => { badItemsByDept[d] = []; });
  stats.itemOrder.forEach(k => {
    const it = stats.itemMap[k];
    if(it.hasBad) (badItemsByDept[it.dept] || (badItemsByDept[it.dept] = [])).push(it);
  });
  const deptOrderWithBad = stats.deptOrder.filter(d => (badItemsByDept[d]||[]).length > 0);
  const allBadItems = deptOrderWithBad.reduce((acc,d) => acc.concat(badItemsByDept[d]), []);
  const totalBad = allBadItems.length;
  const deptLabel = deptValue || ('전체 (' + stats.deptOrder.length + '개 부서)');

  if(totalBad === 0){
    return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>조치계획 요청서</title></head>'
      + '<body style="font-family:\'Malgun Gothic\',sans-serif;padding:60px;text-align:center;color:#5a6472;">'
      + '<h2>' + (deptValue ? esc5(deptValue) + ' 부서에는' : '취합된 범위 내에') + ' 미흡(개선필요) 판정 항목이 없습니다.</h2>'
      + '<p>조치계획을 요청할 대상이 없어 문서를 생성하지 않았습니다.</p></body></html>';
  }

  const riskCount = {'상':0, '중':0, '하':0};
  allBadItems.forEach(it => { if(riskCount[it.risk] !== undefined) riskCount[it.risk]++; });
  const riskColor = {'상':'#c85a4a', '중':'#b8863b', '하':'#2a7a4a'};
  let accR = 0;
  const riskStops = ['상','중','하'].map(k => {
    const pct = totalBad > 0 ? (riskCount[k]/totalBad*100) : 0;
    const start = accR; accR += pct;
    return riskCount[k] > 0 ? (riskColor[k] + ' ' + start.toFixed(2) + '% ' + accR.toFixed(2) + '%') : '';
  }).filter(Boolean).join(', ');

  const maxDeptCount = Math.max.apply(null, deptOrderWithBad.map(d => badItemsByDept[d].length));
  const deptBarsHtml = deptOrderWithBad.map(d => {
    const c = badItemsByDept[d].length;
    return '<div class="dom-row"><div class="dom-label">' + esc5(d) + '</div>'
      + '<div class="dom-bar-track"><span style="display:inline-block;height:100%;width:' + (c/maxDeptCount*100).toFixed(1) + '%;background:#c85a4a;"></span></div>'
      + '<div class="dom-count">' + c + '건</div></div>';
  }).join('');

  const RV_BADGE = {good:'✅ 이행', neutral:'🟡 부분이행', bad:'🚩 미흡', na:'⬜ 해당없음', blank:'— 미응답'};

  function itemCardHtml(it){
    const cpHtml = '<ul class="rv-cp-list">' + it.checkpoints.map(cp => {
      const t = cp.tier || 'blank';
      return '<li><span class="rv-cp-badge ' + t + '">' + (RV_BADGE[t] || RV_BADGE.blank) + '</span><span>' + esc5(cp.cptext) + '</span></li>';
    }).join('') + '</ul>';
    return '<div class="item-card">'
      + '<div class="item-head"><span class="item-code">' + esc5(it.code) + '</span>'
      + '<span class="item-name">' + esc5(it.title) + '</span>'
      + '<span class="risk-chip risk-' + esc5(it.risk) + '">위험도 ' + esc5(it.risk) + '</span></div>'
      + '<div class="item-body">'
        + (it.srNote ? ('<div class="field"><div class="flab">자체점검 결과(자체평가 근거)</div><div class="fval">' + esc5(it.srNote) + '</div></div>') : '')
        + (it.note ? ('<div class="field"><div class="flab">비고</div><div class="fval">' + esc5(it.note) + '</div></div>') : '')
        + (it.evidence ? ('<div class="field"><div class="flab">제출 예정 증빙자료(자체 제출안)</div><div class="fval">' + esc5(it.evidence) + '</div></div>') : '')
        + '<div class="field full"><div class="flab">체크포인트별 판정</div>' + cpHtml + '</div>'
      + '</div>'
      + '<div class="req-block">'
        + '<div class="req-title">조치계획 기재란 (부서 작성)</div>'
        + '<div class="req-grid">'
          + '<div class="full"><div class="req-lab">원인분석</div><textarea class="fill-textarea" placeholder="발생 원인을 구체적으로 기재"></textarea></div>'
          + '<div class="full"><div class="req-lab">개선(조치)계획</div><textarea class="fill-textarea" placeholder="구체적인 개선 조치 내용을 기재"></textarea></div>'
          + '<div><div class="req-lab">완료예정일</div><input class="fill-input" type="text" placeholder="YYYY-MM-DD"></div>'
          + '<div><div class="req-lab">담당자 / 연락처</div><input class="fill-input" type="text" placeholder="성명 / 내선"></div>'
        + '</div>'
        + '<div class="signrow"><div class="sign">작성자<div class="sign-box"></div></div><div class="sign">부서장 확인<div class="sign-box"></div></div></div>'
      + '</div>'
    + '</div>';
  }

  const deptPagesHtml = deptOrderWithBad.map(d => {
    return '<h2 class="sec dept-sec">🏢 ' + esc5(d) + ' — 미흡 ' + badItemsByDept[d].length + '건</h2>'
      + badItemsByDept[d].map(itemCardHtml).join('');
  }).join('');

  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>미흡사항 조치계획 요청서 — ' + esc5(deptLabel) + '</title><style>'
    + '@page{size:A4;margin:16mm;}'
    + '*{box-sizing:border-box;}'
    + 'body{font-family:\'Malgun Gothic\',\'맑은 고딕\',\'Noto Sans KR\',sans-serif;margin:0;background:#f7f5f0;color:#2a2a2a;line-height:1.6;font-size:13px;}'
    + '.wrap{max-width:1080px;margin:16px auto;background:#fff;border-radius:2px;box-shadow:0 2px 8px rgba(0,0,0,.06);overflow:hidden;}'
    + '.hero{background:linear-gradient(135deg,#1f4e6f 0%,#2a5f7f 100%);color:#f8f6f1;padding:32px 40px;}'
    + '.hero .eyebrow{font-family:\'Courier New\',monospace;font-size:10px;letter-spacing:.12em;color:#d4af37;text-transform:uppercase;margin:0 0 6px;font-weight:600;}'
    + '.hero h1{margin:0 0 12px;font-size:26px;font-weight:600;line-height:1.3;}'
    + '.hero .meta{font-size:13px;color:#d8e0eb;line-height:1.7;margin:0;}'
    + '.body{padding:32px 40px;}'
    + '.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:0 0 32px;}'
    + '.stat-card{border:1px solid #e8dfd0;border-radius:4px;padding:16px;text-align:center;background:#faf9f5;}'
    + '.stat-card .num{font-family:\'Courier New\',monospace;font-size:32px;font-weight:700;color:#1f4e6f;line-height:1.1;margin-bottom:6px;}'
    + '.stat-card .lbl{font-size:12px;color:#666;line-height:1.5;}'
    + '.stat-card.warn .num{color:#c85a4a;}'
    + 'h2.sec{font-size:16px;color:#1f4e6f;border-bottom:2px solid #e8dfd0;padding:0 0 10px;margin:32px 0 18px;font-weight:600;letter-spacing:.02em;}'
    + 'h2.sec.dept-sec{font-size:17px;border-bottom:none;border-left:4px solid #1f4e6f;background:#f5f3ed;padding:12px 16px;margin:36px 0 18px;border-radius:2px;page-break-before:always;}'
    + '.donut-row{display:flex;align-items:center;gap:40px;margin:20px 0 28px;padding:20px 0;border-top:1px solid #f0eae0;border-bottom:1px solid #f0eae0;}'
    + '.donut{width:130px;height:130px;border-radius:50%;flex:none;position:relative;background:conic-gradient(' + (riskStops || '#e5e1d4 0% 100%') + ');}'
    + '.donut::after{content:"";position:absolute;inset:26px;background:#fff;border-radius:50%;}'
    + '.legend{flex:1;}'
    + '.legend-row{display:flex;align-items:center;gap:10px;padding:10px 0;font-size:13px;border-bottom:1px solid #f5f3ed;}'
    + '.legend-row:last-child{border:none;}'
    + '.legend-dot{width:14px;height:14px;border-radius:50%;flex:none;}'
    + '.legend-label{flex:1;color:#2a2a2a;font-weight:500;}'
    + '.legend-val{font-family:\'Courier New\',monospace;color:#666;font-size:12px;font-weight:600;}'
    + '.dom-row{display:grid;grid-template-columns:160px 1fr 70px;align-items:center;gap:14px;padding:10px 0;font-size:13px;border-bottom:1px solid #f5f3ed;}'
    + '.dom-row:last-child{border:none;}'
    + '.dom-label{color:#2a2a2a;font-weight:500;}'
    + '.dom-bar-track{height:18px;background:#f0eae0;border-radius:2px;overflow:hidden;white-space:nowrap;}'
    + '.dom-count{font-family:\'Courier New\',monospace;font-size:12px;color:#666;text-align:right;font-weight:600;}'
    + '.notice{background:#eeecf7;border:1px solid #d8d4ee;border-radius:4px;padding:14px 16px;font-size:12px;color:#2a2a2a;line-height:1.8;margin:24px 0 8px;}'
    + '.notice b{color:#463b8a;}'
    + '.item-card{border:1px solid #e8dfd0;border-radius:5px;margin-bottom:16px;overflow:hidden;page-break-inside:avoid;}'
    + '.item-head{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#faf9f5;border-bottom:1px solid #e8dfd0;}'
    + '.item-code{font-family:\'Courier New\',monospace;font-size:11px;font-weight:700;color:#fff;background:#1f4e6f;border-radius:3px;padding:3px 8px;white-space:nowrap;}'
    + '.item-name{font-size:13.5px;font-weight:700;color:#2a2a2a;flex:1;}'
    + '.risk-chip{font-family:\'Courier New\',monospace;font-size:11px;padding:3px 8px;border-radius:2px;font-weight:700;white-space:nowrap;}'
    + '.risk-상{background:#f5d9d5;color:#c85a4a;} .risk-중{background:#fef5e8;color:#b8863b;} .risk-하{background:#e5f0ec;color:#2a7a4a;}'
    + '.item-body{padding:12px 14px 4px;}'
    + '.field{margin-bottom:10px;}'
    + '.field .flab{font-size:10.5px;color:#666;font-weight:700;margin-bottom:3px;}'
    + '.field .fval{font-size:12.5px;line-height:1.6;color:#2a2a2a;background:#faf9f5;border-radius:3px;padding:7px 9px;border-left:3px solid #e8dfd0;}'
    + '.rv-cp-list{margin:4px 0 0;padding:0;list-style:none;}'
    + '.rv-cp-list li{display:flex;gap:8px;align-items:flex-start;font-size:12px;padding:4px 0;line-height:1.5;}'
    + '.rv-cp-badge{flex:none;font-family:\'Courier New\',monospace;font-size:10px;font-weight:700;padding:1px 6px;border-radius:2px;white-space:nowrap;}'
    + '.rv-cp-badge.good{background:#e5f2ea;color:#2a7a4a;} .rv-cp-badge.neutral{background:#f7edd9;color:#b8863b;} .rv-cp-badge.bad{background:#f5d9d5;color:#c85a4a;} .rv-cp-badge.na{background:#f0eae0;color:#666;}'
    + '.req-block{background:#eef5f3;border-top:1px dashed #b9d6d0;padding:12px 14px 14px;}'
    + '.req-title{font-size:11px;font-weight:800;color:#1f6f66;margin-bottom:8px;}'
    + '.req-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px 14px;}'
    + '.req-grid .full{grid-column:1 / -1;}'
    + '.req-lab{font-size:10.5px;color:#666;margin-bottom:3px;}'
    + '.fill-input,.fill-textarea{width:100%;border:1px solid #b9d6d0;border-radius:3px;background:#fff;font-family:inherit;font-size:12.5px;color:#2a2a2a;padding:6px 8px;}'
    + '.fill-textarea{resize:vertical;min-height:40px;}'
    + '.signrow{display:flex;justify-content:flex-end;gap:26px;margin-top:12px;font-size:11.5px;color:#666;}'
    + '.sign{display:flex;align-items:center;gap:8px;}'
    + '.sign-box{width:70px;height:32px;border:1px solid #e8dfd0;border-radius:3px;background:#fff;}'
    + '.print-btn{position:fixed;top:16px;right:16px;padding:9px 18px;background:#1f4e6f;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:13px;font-weight:700;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,.15);}'
    + '@media print{.print-btn{display:none;} body{background:#fff;} .wrap{box-shadow:none;margin:0;max-width:none;}}'
    + '</style></head><body>'
    + '<button class="print-btn" onclick="window.print()">인쇄 / PDF</button>'
    + '<div class="wrap">'
      + '<div class="hero">'
        + '<p class="eyebrow">IT 내부감사 · 응답집계 결과</p>'
        + '<h1>미흡사항 조치계획 요청서</h1>'
        + '<p class="meta">' + (auditName ? esc5(auditName) + ' · ' : '') + '대상: ' + esc5(deptLabel) + ' · 생성일: ' + nowStr + '</p>'
      + '</div>'
      + '<div class="body">'
        + '<div class="stat-grid">'
          + '<div class="stat-card warn"><div class="num">' + totalBad + '</div><div class="lbl">미흡 항목 수</div></div>'
          + '<div class="stat-card"><div class="num">' + deptOrderWithBad.length + '</div><div class="lbl">대상 부서 수</div></div>'
          + '<div class="stat-card warn"><div class="num">' + riskCount['상'] + '</div><div class="lbl">위험도 "상"</div></div>'
        + '</div>'
        + '<h2 class="sec">위험수준별 분포</h2>'
        + '<div class="donut-row"><div class="donut"></div><div class="legend">'
          + ['상','중','하'].map(k => '<div class="legend-row"><span class="legend-dot" style="background:' + riskColor[k] + ';"></span>'
            + '<span class="legend-label">위험 ' + k + '</span><span class="legend-val">' + riskCount[k] + '건 (' + (totalBad>0?Math.round(riskCount[k]/totalBad*100):0) + '%)</span></div>').join('')
        + '</div></div>'
        + (deptOrderWithBad.length > 1 ? ('<h2 class="sec">부서별 미흡 건수</h2>' + deptBarsHtml) : '')
        + '<div class="notice"><b>회신 안내</b> — 각 항목의 <b>원인분석 · 개선(조치)계획 · 완료예정일 · 담당자</b>를 작성한 뒤 인쇄하거나 PDF로 저장하여 감사팀으로 제출해 주시기 바랍니다.</div>'
        + deptPagesHtml
      + '</div>'
      + '<div class="footer" style="padding:14px 40px;font-size:11px;color:#999;border-top:1px solid #f0eae0;">생성일시: ' + nowStr + ' · A4 인쇄에 최적화</div>'
    + '</div>'
    + '</body></html>';
}

export function exportActionPlanRequest(){
  if(aggRows.length === 0){ alert('취합된 응답 데이터가 없습니다. 먼저 CSV/JSON을 업로드해 주세요.'); return; }
  const sel = document.getElementById('aggDeptReportSelect');
  const deptValue = sel ? sel.value : '';
  if(deptValue && !aggRows.some(r => (r.dept||'(부서명 미입력)') === deptValue)){
    alert('선택한 부서의 응답 데이터를 찾을 수 없습니다.');
    return;
  }
  const html = buildActionPlanRequestHtml(deptValue);
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=1180,height=1000');
}


// ============================================================
// 📄 미흡사항 조치계획 요청서 — MS Word용 (.doc) 내보내기
// 내부망(폐쇄망)에서 외부 라이브러리 없이 동작해야 하므로, docx 포맷 대신
// "MS Word가 직접 여는 HTML"(mso 워드프로세싱 문서) 방식을 쓴다. 표(<table>) 기반으로만
// 구성해야 워드 렌더러가 레이아웃을 안정적으로 재현한다(flex/grid/box-shadow 등은
// 워드 HTML 렌더러가 지원하지 않으므로 화면용 buildActionPlanRequestHtml()과는
// 완전히 별도의 마크업을 쓴다). 항목별 "원인분석/개선계획/완료예정일/담당자/서명"
// 칸은 빈 표 셀로 두어, 받는 부서가 워드에서 셀 안을 바로 타이핑해 채울 수 있게 한다.
// ============================================================

export function buildActionPlanRequestDocHtml(deptValue){
  const stats = collectDeptAggStats(deptValue);
  const esc6 = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const nowStr = new Date(Date.now() + 9*3600000).toISOString().slice(0,10);
  const auditName = (typeof getCurrentAuditName === 'function') ? (getCurrentAuditName() || '') : '';
  const dueDateEl = document.getElementById('genDueDate');
  const dueDate = (dueDateEl && (dueDateEl.value || '').trim()) || '(미지정)';

  const badItemsByDept = {};
  stats.deptOrder.forEach(d => { badItemsByDept[d] = []; });
  stats.itemOrder.forEach(k => {
    const it = stats.itemMap[k];
    if(it.hasBad) (badItemsByDept[it.dept] || (badItemsByDept[it.dept] = [])).push(it);
  });
  const deptOrderWithBad = stats.deptOrder.filter(d => (badItemsByDept[d]||[]).length > 0);
  const totalBad = deptOrderWithBad.reduce((n,d) => n + badItemsByDept[d].length, 0);
  const deptLabel = deptValue || ('전체 (' + stats.deptOrder.length + '개 부서)');

  const TIER_LABEL = {good:'[양호] 이행', neutral:'[부분이행]', bad:'[미흡]', na:'[해당없음]', blank:'[미응답]'};

  const cellStyle = "border:1px solid #999999;padding:6px 8px;font-size:10pt;vertical-align:top;";
  const labelCellStyle = cellStyle + "background:#f0efe9;font-weight:bold;white-space:nowrap;width:110px;";
  const blankCellStyle = cellStyle + "height:56px;";
  const halfBlankCellStyle = cellStyle + "height:46px;width:50%;";

  function itemTableHtml(it){
    const cpText = it.checkpoints.map(cp => (TIER_LABEL[cp.tier || 'blank'] || TIER_LABEL.blank) + ' ' + esc6(cp.cptext)).join('<br>');
    return '<table style="width:100%;border-collapse:collapse;margin:0 0 4pt;" cellspacing="0" cellpadding="0">'
      + '<tr>'
        + '<td style="' + labelCellStyle + '">항목코드</td>'
        + '<td style="' + cellStyle + '" colspan="2"><b>' + esc6(it.code) + '</b> &nbsp; ' + esc6(it.title) + '</td>'
        + '<td style="' + labelCellStyle + 'width:70px;">위험도</td>'
        + '<td style="' + cellStyle + 'width:60px;text-align:center;"><b>' + esc6(it.risk) + '</b></td>'
      + '</tr>'
      + '<tr><td style="' + labelCellStyle + '">체크포인트별<br>판정</td><td style="' + cellStyle + '" colspan="4">' + cpText + '</td></tr>'
      + (it.srNote ? ('<tr><td style="' + labelCellStyle + '">자체점검 결과<br>(자체평가 근거)</td><td style="' + cellStyle + '" colspan="4">' + esc6(it.srNote) + '</td></tr>') : '')
      + (it.note ? ('<tr><td style="' + labelCellStyle + '">비고</td><td style="' + cellStyle + '" colspan="4">' + esc6(it.note) + '</td></tr>') : '')
      + (it.evidence ? ('<tr><td style="' + labelCellStyle + '">제출 예정<br>증빙자료</td><td style="' + cellStyle + '" colspan="4">' + esc6(it.evidence) + '</td></tr>') : '')
      + '<tr><td style="' + labelCellStyle + 'background:#eef5f3;">원인분석</td><td style="' + blankCellStyle + '" colspan="4">&nbsp;</td></tr>'
      + '<tr><td style="' + labelCellStyle + 'background:#eef5f3;">개선(조치)계획</td><td style="' + blankCellStyle + '" colspan="4">&nbsp;</td></tr>'
      + '<tr>'
        + '<td style="' + labelCellStyle + 'background:#eef5f3;">완료예정일</td><td style="' + halfBlankCellStyle + '" colspan="2">&nbsp;</td>'
        + '<td style="' + labelCellStyle + 'background:#eef5f3;width:90px;">담당자/연락처</td><td style="' + halfBlankCellStyle + '">&nbsp;</td>'
      + '</tr>'
      + '<tr>'
        + '<td style="' + labelCellStyle + 'background:#eef5f3;">작성자</td><td style="' + halfBlankCellStyle + '" colspan="2">&nbsp;</td>'
        + '<td style="' + labelCellStyle + 'background:#eef5f3;width:90px;">부서장 확인</td><td style="' + halfBlankCellStyle + '">&nbsp;</td>'
      + '</tr>'
    + '</table>';
  }

  const deptSectionsHtml = deptOrderWithBad.map((d, di) => {
    const pageBreak = di > 0 ? 'page-break-before:always;' : '';
    return '<div style="' + pageBreak + '">'
      + '<h2 style="font-size:13pt;color:#1f4e6f;border-left:4pt solid #1f4e6f;background:#f5f3ed;padding:6pt 10pt;margin:0 0 10pt;">'
        + esc6(d) + ' — 미흡 ' + badItemsByDept[d].length + '건</h2>'
      + badItemsByDept[d].map(it => itemTableHtml(it) + '<div style="height:14pt;">&nbsp;</div>').join('')
    + '</div>';
  }).join('');

  return "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>"
    + "<head><meta charset='utf-8'><title>미흡사항 조치계획 요청서</title>"
    + "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom>"
    + "<w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->"
    + "<style>"
      + "@page Section1 {size:210mm 297mm; margin:20mm 18mm 20mm 18mm; mso-page-orientation:portrait;}"
      + "div.Section1 {page:Section1;}"
      + "body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:10pt;color:#222222;}"
      + "table{border-collapse:collapse;}"
    + "</style></head>"
    + "<body><div class='Section1'>"
      + "<h1 style=\"font-size:18pt;color:#1f4e6f;text-align:center;margin:0 0 4pt;\">미흡사항 조치계획 요청서</h1>"
      + "<p style=\"text-align:center;font-size:9.5pt;color:#666666;margin:0 0 18pt;\">IT 내부감사 · 응답집계 결과 기반</p>"
      + "<table style=\"width:100%;border-collapse:collapse;margin:0 0 18pt;\">"
        + "<tr><td style=\"" + labelCellStyle + "\">감사명</td><td style=\"" + cellStyle + "\">" + esc6(auditName || '(감사명 미입력)') + "</td>"
          + "<td style=\"" + labelCellStyle + "\">생성일</td><td style=\"" + cellStyle + "\">" + nowStr + "</td></tr>"
        + "<tr><td style=\"" + labelCellStyle + "\">대상부서</td><td style=\"" + cellStyle + "\">" + esc6(deptLabel) + "</td>"
          + "<td style=\"" + labelCellStyle + "\">회신기한</td><td style=\"" + cellStyle + "color:#a23b2e;font-weight:bold;\">" + esc6(dueDate) + "</td></tr>"
        + "<tr><td style=\"" + labelCellStyle + "\">미흡 건수</td><td style=\"" + cellStyle + "\" colspan=\"3\">총 " + totalBad + "건 (" + deptOrderWithBad.length + "개 부서)</td></tr>"
      + "</table>"
      + "<p style=\"font-size:9.5pt;color:#555555;background:#eeecf7;padding:8pt 10pt;line-height:1.6;\">"
        + "각 항목의 <b>원인분석·개선(조치)계획·완료예정일·담당자</b>란을 워드 표 안에 직접 입력하신 뒤 결재·제출해 주시기 바랍니다."
      + "</p>"
      + deptSectionsHtml
    + "</div></body></html>";
}

export function exportActionPlanRequestDoc(){
  if(aggRows.length === 0){ alert('취합된 응답 데이터가 없습니다. 먼저 CSV/JSON을 업로드해 주세요.'); return; }
  const sel = document.getElementById('aggDeptReportSelect');
  const deptValue = sel ? sel.value : '';
  if(deptValue && !aggRows.some(r => (r.dept||'(부서명 미입력)') === deptValue)){
    alert('선택한 부서의 응답 데이터를 찾을 수 없습니다.');
    return;
  }
  const stats = collectDeptAggStats(deptValue);
  const hasBad = stats.itemOrder.some(k => stats.itemMap[k].hasBad);
  if(!hasBad){ alert((deptValue ? deptValue + ' 부서에는' : '취합된 범위 내에') + ' 미흡(개선필요) 판정 항목이 없어 문서를 생성하지 않았습니다.'); return; }
  const html = buildActionPlanRequestDocHtml(deptValue);
  const blob = new Blob(['\ufeff', html], {type:'application/msword;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fname = '미흡사항_조치계획_요청서_' + (deptValue || '전체') + '_' + new Date(Date.now()+9*3600000).toISOString().slice(0,10) + '.doc';
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


export function collapseDetailRowAndScroll(rowId){
  const row = document.getElementById(rowId);
  if(!row) return;
  row.style.display = 'none';
  const toggleBtn = document.querySelector('[data-target-row="' + rowId + '"], [data-owner-row="' + rowId + '"]');
  if(toggleBtn){
    toggleBtn.textContent = '🔍 상세';
    toggleBtn.classList.remove('active');
    const summaryRow = toggleBtn.closest('tr');
    if(summaryRow) summaryRow.scrollIntoView({behavior:'smooth', block:'center'});
  }
}

export function toggleAggTargetDetail(btn){
  const rowId = btn.dataset.targetRow;
  const row = document.getElementById(rowId);
  if(!row) return;
  const show = row.style.display === 'none';
  row.style.display = show ? 'table-row' : 'none';
  btn.textContent = show ? '🔼 닫기' : '🔍 상세';
  btn.classList.toggle('active', show);
}

export function itemLevelRows(rows){
  // Collapse per-checkpoint CSV rows into one record per (department, item code), since
  // 자체평가/제출증빙/담당여부/숙지도/법령 are item-level fields repeated across each checkpoint row.
  // NOTE: this used to key on (file, code) — but a corrected/partial re-upload can carry a
  // DIFFERENT filename for only some of an item's checkpoints, which fragmented one department's
  // single item into two separate item-level records (double-counted in KPIs, sr/evidence read
  // from whichever fragment happened to have it). (dept, code) is the stable identity instead —
  // same idea as the natural key used for row-level Upsert.
  // rows: optional source array (defaults to the full unfiltered aggRows) — the 응답집계 화면
  // filter passes getFilteredAggRows() explicitly where the filter should apply; other callers
  // (interview guide, exports) keep reading the complete dataset regardless of that filter.
  const src = rows || aggRows;
  const map = {};
  src.forEach(r => {
    const key = (r.dept || '') + '|||' + r.code;
    if(!map[key]) map[key] = {
      dept:r.dept, domain:r.domain, code:r.code, title:r.title, risk:r.risk, file:r.file,
      sr:r.sr, srNote:r.srNote, evidence:r.evidence, law:r.law, own:r.own, ownDept:r.ownDept, ownPerson:r.ownPerson, fam:r.fam, author:r.author,
      hasIssue:false,
    };
    if(r.tier === 'bad') map[key].hasIssue = true;
    if(r.sr) map[key].sr = r.sr;
    if(r.srNote) map[key].srNote = r.srNote;
    if(r.evidence) map[key].evidence = r.evidence;
    if(r.law) map[key].law = r.law;
    if(r.own) map[key].own = r.own;
    if(r.ownDept) map[key].ownDept = r.ownDept;
    if(r.ownPerson) map[key].ownPerson = r.ownPerson;
    if(r.fam) map[key].fam = r.fam;
    if(r.author) map[key].author = r.author;
    map[key].file = r.file; // last-seen file, informational only — not part of identity
  });
  return Object.values(map);
}

export function renderAggDashboard(){
  const fRows = getFilteredAggRows();
  let good=0, partial=0, bad=0, na=0;
  fRows.forEach(r => {
    const c = igClassifyRow(r);
    if(c==='yes') good++; else if(c==='partial') partial++; else if(c==='no') bad++; else na++;
  });
  const total = fRows.length;
  const applicable = total - na;
  const pct = applicable > 0 ? Math.round(good/applicable*100) : 0;
  document.getElementById('aggHealthPct').textContent = pct + '%';
  document.getElementById('aggHealthLegend').innerHTML =
    '<span class="li"><span class="sw" style="background:var(--good);"></span>이행 ' + good + '</span>'
    + '<span class="li"><span class="sw" style="background:var(--risk-mid);"></span>부분이행 ' + partial + '</span>'
    + '<span class="li"><span class="sw" style="background:var(--risk-hi);"></span>미흡 ' + bad + '</span>'
    + '<span class="li"><span class="sw" style="background:#c7c1b1;"></span>해당없음 ' + na + '</span>';
  const bar = document.getElementById('aggHealthBar');
  const pctOf = (n) => total > 0 ? (n/total*100) : 0;
  bar.innerHTML = ['good','partial','bad','na'].map((cls,i) => {
    const n = [good,partial,bad,na][i];
    return n > 0 ? '<div class="seg ' + cls + '" style="width:' + pctOf(n) + '%;"></div>' : '';
  }).join('');

  const tierGoodEl = document.getElementById('aggTierGood');
  if(tierGoodEl){
    tierGoodEl.textContent = good;
    document.getElementById('aggTierPartial').textContent = partial;
    document.getElementById('aggTierBad').textContent = bad;
    document.getElementById('aggTierNa').textContent = na;
  }

  // 위험도별(상/중/하) × 이행/부분이행/미흡/해당없음 상세 표
  const riskBreakdownTable = document.getElementById('riskBreakdownTable');
  if(riskBreakdownTable){
    const riskKeys = ['상','중','하'];
    const rb = {'상':{good:0,partial:0,bad:0,na:0}, '중':{good:0,partial:0,bad:0,na:0}, '하':{good:0,partial:0,bad:0,na:0}};
    fRows.forEach(r => {
      const rk = riskKeys.includes(r.risk) ? r.risk : '중';
      const c = igClassifyRow(r);
      if(c==='yes') rb[rk].good++; else if(c==='partial') rb[rk].partial++; else if(c==='no') rb[rk].bad++; else rb[rk].na++;
    });
    riskBreakdownTable.innerHTML = '<tr><th>위험도</th><th>✅ 이행</th><th>🟡 부분이행</th><th>🚩 미흡</th><th>⬜ 해당없음</th><th>합계</th><th>이행률(해당없음 제외)</th></tr>'
      + riskKeys.map(rk => {
        const d = rb[rk];
        const sum = d.good + d.partial + d.bad + d.na;
        const applicableN = sum - d.na;
        const rate = applicableN > 0 ? Math.round(d.good/applicableN*100) : 0;
        return '<tr' + (rk==='상' ? ' class="risk-row-상"' : '') + '><td>위험도 ' + rk + '</td>'
          + '<td class="num-cell">' + d.good + '</td><td class="num-cell">' + d.partial + '</td>'
          + '<td class="num-cell">' + d.bad + '</td><td class="num-cell">' + d.na + '</td>'
          + '<td class="num-cell">' + sum + '</td><td class="num-cell">' + rate + '%</td></tr>';
      }).join('');
  }

  // 인터뷰 대상자 현황: 부서·작성자별로 응답 결과를 모아 인터뷰 일정 조율에 활용
  const targetsTable = document.getElementById('interviewTargetsTable');
  if(targetsTable){
    const byTarget = {};
    fRows.forEach(r => {
      const key = (r.dept||'(부서 미입력)') + '|||' + (r.author||'(작성자 미입력)');
      if(!byTarget[key]) byTarget[key] = {dept: r.dept||'(부서 미입력)', author: r.author||'(작성자 미입력)', good:0, partial:0, bad:0, na:0, hiBad:0, ownPersons: new Set()};
      const t = byTarget[key];
      const c = igClassifyRow(r);
      if(c==='yes') t.good++;
      else if(c==='partial') t.partial++;
      else if(c==='no'){ t.bad++; if(r.risk==='상') t.hiBad++; }
      else t.na++;
      if(r.ownPerson) String(r.ownPerson).split(',').map(s => s.trim()).filter(Boolean).forEach(p => t.ownPersons.add(p));
    });
    const targets = Object.values(byTarget).sort((a,b) => b.hiBad - a.hiBad || b.bad - a.bad);
    const targetsBadge = document.getElementById('cnt-interviewTargetsTable');
    if(targetsBadge) targetsBadge.textContent = targets.length > 0 ? (targets.length + '명') : '';
    targetsTable.innerHTML = '<tr><th>부서</th><th>작성자</th><th class="agg-wrap-cell" style="max-width:160px;">관련 담당자</th><th>✅ 이행</th><th>🟡 부분</th><th>🚩 미흡</th><th>⬜ 해당없음</th><th>위험상 미흡</th><th>인터뷰 우선순위</th><th>상세</th><th>개별 인쇄</th></tr>'
      + (targets.length === 0
        ? '<tr><td colspan="11" style="padding:16px;text-align:center;color:#777;">취합된 응답이 없습니다.</td></tr>'
        : targets.map((t,ti) => {
            const priority = t.hiBad > 0 ? '🔴 최우선' : (t.bad > 0 ? '🟡 필요' : '⚪ 낮음');
            const rowId = 'agg-target-detail-' + ti;
            return '<tr' + (t.hiBad > 0 ? ' class="risk-row-상"' : '') + '>'
              + '<td>' + esc(t.dept) + '</td><td>' + esc(t.author) + '</td>'
              + '<td class="agg-wrap-cell" style="max-width:160px;">' + esc(Array.from(t.ownPersons).join(', ') || '-') + '</td>'
              + '<td class="num-cell">' + t.good + '</td><td class="num-cell">' + t.partial + '</td>'
              + '<td class="num-cell">' + t.bad + '</td><td class="num-cell">' + t.na + '</td>'
              + '<td class="num-cell" style="font-weight:700;color:var(--risk-hi);">' + t.hiBad + '</td>'
              + '<td>' + priority + '</td>'
              + '<td><button type="button" class="ig-detail-toggle-btn" data-target-row="' + rowId + '" onclick="toggleAggTargetDetail(this)">🔍 상세</button></td>'
              + '<td><button type="button" class="ig-detail-toggle-btn" data-print-dept="' + esc(t.dept) + '" data-print-author="' + esc(t.author) + '" onclick="exportIndividualSubmission(this.dataset.printDept, this.dataset.printAuthor)">🖨 출력</button></td></tr>'
              + '<tr class="agg-target-detail-row" id="' + rowId + '" style="display:none;"><td class="agg-detail-cell" colspan="10" style="padding:0;">'
                + igTargetDetailHtml(t.dept, t.author, rowId)
              + '</td></tr>';
          }).join(''));
  }

  // 항목별 지목된 관련 담당자(ownPerson) 현황: 콤마로 구분해 적힌 여러 이름을 각각 별도 인원으로
  // 분리 집계 — 설문 작성자와 실제 실무자가 다를 때, 실무자 단위로 인터뷰 대상·미흡 건수를 파악.
  const ownerPersonsTable = document.getElementById('ownerPersonsTable');
  if(ownerPersonsTable){
    const byPerson = {};
    fRows.forEach(r => {
      if(!r.ownPerson) return;
      String(r.ownPerson).split(',').map(s => s.trim()).filter(Boolean).forEach(person => {
        if(!byPerson[person]) byPerson[person] = {person, depts: new Set(), codes: new Set(), good:0, partial:0, bad:0, na:0, hiBad:0};
        const p = byPerson[person];
        if(r.dept) p.depts.add(r.dept);
        if(r.code) p.codes.add(r.code);
        const c = igClassifyRow(r);
        if(c==='yes') p.good++;
        else if(c==='partial') p.partial++;
        else if(c==='no'){ p.bad++; if(r.risk==='상') p.hiBad++; }
        else p.na++;
      });
    });
    const persons = Object.values(byPerson).sort((a,b) => b.hiBad - a.hiBad || b.bad - a.bad);
    const ownerBadge = document.getElementById('cnt-ownerPersonsTable');
    if(ownerBadge) ownerBadge.textContent = persons.length > 0 ? (persons.length + '명') : '';
    ownerPersonsTable.innerHTML = '<tr><th>지목된 담당자</th><th class="agg-wrap-cell" style="max-width:160px;">소속(추정) 부서</th><th>관련 항목 수</th><th>✅ 이행</th><th>🟡 부분</th><th>🚩 미흡</th><th>위험상 미흡</th><th>인터뷰 우선순위</th><th>상세</th></tr>'
      + (persons.length === 0
        ? '<tr><td colspan="9" style="padding:16px;text-align:center;color:#777;">"관련 담당자" 칸에 이름이 입력된 응답이 없습니다.</td></tr>'
        : persons.map((p,pi) => {
            const priority = p.hiBad > 0 ? '🔴 최우선' : (p.bad > 0 ? '🟡 필요' : '⚪ 낮음');
            const rowId = 'agg-owner-detail-' + pi;
            return '<tr' + (p.hiBad > 0 ? ' class="risk-row-상"' : '') + '>'
              + '<td>' + esc(p.person) + '</td><td class="agg-wrap-cell" style="max-width:160px;">' + esc(Array.from(p.depts).join(', ') || '-') + '</td>'
              + '<td class="num-cell">' + p.codes.size + '</td>'
              + '<td class="num-cell">' + p.good + '</td><td class="num-cell">' + p.partial + '</td>'
              + '<td class="num-cell">' + p.bad + '</td>'
              + '<td class="num-cell" style="font-weight:700;color:var(--risk-hi);">' + p.hiBad + '</td>'
              + '<td>' + priority + '</td>'
              + '<td><button type="button" class="ig-detail-toggle-btn" data-owner-row="' + rowId + '" onclick="toggleAggOwnerDetail(this)">🔍 상세</button></td></tr>'
              + '<tr class="agg-target-detail-row" id="' + rowId + '" style="display:none;"><td class="agg-detail-cell" colspan="9" style="padding:0;">'
                + igOwnerPersonDetailHtml(p.person, fRows, rowId)
              + '</td></tr>';
          }).join(''));
  }

  // Priority list: worst items first (item-level, deduped across checkpoints), risk 상 then 중/하.
  const items = itemLevelRows(fRows).filter(r => r.hasIssue);
  const riskOrder = {"상":0, "중":1, "하":2};
  items.sort((a,b) => (riskOrder[a.risk] ?? 1) - (riskOrder[b.risk] ?? 1));
  const top = items.slice(0, 8);
  const priBox = document.getElementById('aggPriorityList');
  if(top.length === 0){
    priBox.innerHTML = '<div class="agg-priority-none">현재 미흡·부분이행으로 확인된 항목이 없습니다.</div>';
  } else {
    priBox.innerHTML = top.map((r,i) =>
      '<div class="agg-priority-item">'
      + '<div class="agg-priority-rank' + (r.risk!=='상'?' mid':'') + '">' + (i+1) + '</div>'
      + '<div class="agg-priority-body"><div class="agg-priority-title">' + esc(r.title) + '</div>'
      + '<div class="agg-priority-meta">' + esc(r.dept) + ' · ' + esc(r.code) + ' · 위험도 ' + esc(r.risk) + '</div></div>'
      + '</div>'
    ).join('') + (items.length > 8 ? '<div class="agg-priority-meta" style="padding-top:6px;">외 ' + (items.length-8) + '건 더 있음 — 아래 "전체 미흡 응답 취합 목록"에서 전체 확인</div>' : '');
  }

  // Domain strip: issue counts per domain, worst first.
  const domCounts = {};
  fRows.forEach(r => { if(igClassifyRow(r)==='no'){ domCounts[r.domain] = (domCounts[r.domain]||0) + 1; } });
  const domArr = Object.keys(domCounts).map(dc => ({code:dc, count:domCounts[dc], dom:igFindDomain(dc)})).sort((a,b)=>b.count-a.count);
  const maxCount = domArr.length ? domArr[0].count : 1;
  const domBox = document.getElementById('aggDomainStrip');
  if(domArr.length === 0){
    domBox.innerHTML = '<div class="agg-priority-none">미흡 응답이 있는 영역이 없습니다.</div>';
  } else {
    domBox.innerHTML = domArr.slice(0,10).map(d =>
      '<div class="agg-domain-chip">'
      + '<span class="dcode">D-' + d.code + '</span>'
      + '<span class="dname">' + esc(d.dom ? d.dom.title : '') + '</span>'
      + '<span class="dbar"><div style="width:' + (d.count/maxCount*100) + '%;"></div></span>'
      + '<span class="dcount">' + d.count + '</span>'
      + '</div>'
    ).join('');
  }

  // Collapsible section count badges.
  const setBadge = (id, n) => { const el = document.getElementById(id); if(el) el.textContent = n + '건'; };
  setBadge('cnt-deptTable', new Set(fRows.map(r => (r.dept||'') + '|' + r.domain)).size);
  setBadge('cnt-evidenceReviewTable', itemLevelRows(fRows).filter(r => r.sr === '잘함' && r.evidence).length);
  setBadge('cnt-evidenceAllTable', itemLevelRows(fRows).filter(r => r.evidence).length);
  const mismatchCount = itemLevelRows(fRows).filter(r => r.sr && ((r.sr === '잘함' && r.hasIssue) || (r.sr === '미흡' && !r.hasIssue))).length;
  setBadge('cnt-mismatchTable', mismatchCount);
  setBadge('cnt-ownerTable', itemLevelRows(fRows).filter(r => r.own === '타 부서 담당' || r.own === '공동 담당').length);
  setBadge('cnt-famTable', itemLevelRows(fRows).filter(r => r.fam === '잘 모름').length);
  setBadge('cnt-issueTable', bad + partial);
}

export function computeMaturityScore(rows){
  let weightedSum = 0, weightTotal = 0;
  rows.forEach(r => {
    if(!r.tier || r.tier === 'na') return;
    const s = TIER_SCORE[r.tier];
    if(s === undefined) return;
    const w = RISK_WEIGHT[r.risk] || 1;
    weightedSum += s * w;
    weightTotal += w;
  });
  return weightTotal > 0 ? (weightedSum / weightTotal) : null;
}

export function maturityGrade(score){
  if(score === null) return {label:'-', bg:'#ece7d9', color:'var(--ink-soft)'};
  if(score >= 90) return {label:'우수', bg:'var(--good-bg)', color:'var(--good)'};
  if(score >= 75) return {label:'양호', bg:'var(--good-bg)', color:'var(--good)'};
  if(score >= 60) return {label:'보통', bg:'var(--risk-mid-bg)', color:'var(--risk-mid)'};
  if(score >= 40) return {label:'미흡', bg:'var(--risk-hi-bg)', color:'var(--risk-hi)'};
  return {label:'취약', bg:'var(--risk-hi-bg)', color:'var(--risk-hi)'};
}

export function renderMaturityScore(){
  const scoreEl = document.getElementById('aggMaturityScore');
  const gradeEl = document.getElementById('aggMaturityGrade');
  if(!scoreEl || !gradeEl) return;
  const score = computeMaturityScore(aggRows);
  scoreEl.textContent = score === null ? '- 점' : score.toFixed(1) + '점';
  const grade = maturityGrade(score);
  gradeEl.textContent = grade.label;
  gradeEl.style.background = grade.bg;
  gradeEl.style.color = grade.color;
}

export function crossDeptMismatches(){
  const map = {}; // code|||cptext -> {dept: {tier, resp}}
  const titleMap = {};
  aggRows.forEach(r => {
    if(!r.cptext || !r.tier || !r.dept) return;
    const key = r.code + '|||' + r.cptext;
    if(!map[key]) map[key] = {};
    map[key][r.dept] = {tier:r.tier, resp:r.resp};
    titleMap[r.code] = r.title;
  });
  const mismatches = [];
  Object.keys(map).forEach(key => {
    const deptAnswers = map[key];
    const distinctTiers = new Set(Object.values(deptAnswers).map(a => a.tier));
    if(distinctTiers.size > 1 && Object.keys(deptAnswers).length > 1){
      const [code, cptext] = key.split('|||');
      mismatches.push({code, title: titleMap[code], cptext, deptAnswers});
    }
  });
  return mismatches;
}

export function renderCrossDeptTable(){
  const tbl = document.getElementById('crossDeptTable');
  if(!tbl) return;
  const mismatches = crossDeptMismatches();
  const cntEl = document.getElementById('cnt-crossDeptTable');
  if(cntEl) cntEl.textContent = mismatches.length + '건';
  if(mismatches.length === 0){
    tbl.innerHTML = '<tr><td style="padding:16px;color:var(--ink-soft);">부서 간 응답이 서로 다른 체크포인트가 없습니다.</td></tr>';
    return;
  }
  tbl.innerHTML = '<tr><th>항목코드</th><th class="agg-wrap-cell">항목명</th><th class="agg-wrap-cell">체크포인트</th><th class="agg-wrap-cell">부서별 응답</th></tr>'
    + mismatches.map(m =>
        '<tr><td class="mono">' + esc(m.code) + '</td><td class="agg-wrap-cell">' + esc(m.title||'') + '</td><td class="agg-wrap-cell">' + esc(m.cptext) + '</td>'
        + '<td class="agg-wrap-cell">' + Object.entries(m.deptAnswers).map(([dept, a]) => '<div><b>' + esc(dept) + '</b>: ' + esc(a.resp) + '</div>').join('') + '</td></tr>'
      ).join('');
}

export function renderTrendCompareSelect(){
  const sel = document.getElementById('trendCompareSelect');
  if(!sel) return;
  const rounds = loadRoundsFromStorage().filter(r => r.label !== activeRoundLabel);
  if(rounds.length === 0){
    sel.innerHTML = '<option value="">비교할 저장된 회차가 없습니다</option>';
    return;
  }
  sel.innerHTML = '<option value="">비교할 회차 선택…</option>'
    + rounds.map(r => '<option value="' + r.id + '">' + esc(r.label) + ' (' + new Date(r.savedAt).toLocaleDateString('ko-KR') + ')</option>').join('');
}

export function compareWithRound(pastRoundId){
  const rounds = loadRoundsFromStorage();
  const pastRound = rounds.find(r => r.id === pastRoundId);
  if(!pastRound) return null;

  const pastScore = computeMaturityScore(pastRound.rows);
  const curScore = computeMaturityScore(aggRows);

  const tierRank = {bad:0, neutral:1, good:2}; // 낮을수록 나쁨(비교용, na는 제외)
  function worstTierByCode(rows){
    const map = {};
    rows.forEach(r => {
      if(!r.tier || r.tier === 'na') return;
      if(!(r.code in map) || tierRank[r.tier] < tierRank[map[r.code].tier]) map[r.code] = {tier:r.tier, title:r.title};
    });
    return map;
  }
  const pastTiers = worstTierByCode(pastRound.rows);
  const curTiers = worstTierByCode(aggRows);

  const changes = [];
  const allCodes = new Set([...Object.keys(pastTiers), ...Object.keys(curTiers)]);
  allCodes.forEach(code => {
    const p = pastTiers[code], c = curTiers[code];
    if(p && c && p.tier !== c.tier){
      changes.push({
        code, title: (c && c.title) || (p && p.title) || '',
        past: p.tier, current: c.tier,
        direction: tierRank[c.tier] > tierRank[p.tier] ? 'improved' : 'worsened'
      });
    }
  });
  changes.sort((a,b) => (a.direction === 'worsened' ? 0 : 1) - (b.direction === 'worsened' ? 0 : 1));

  return {pastScore, curScore, pastLabel: pastRound.label, changes};
}

export function renderTrendCompare(){
  renderTrendCompareSelect();
  const resultEl = document.getElementById('trendCompareResult');
  if(!resultEl) return;
  resultEl.innerHTML = '<div class="assign-empty">비교할 이전 회차를 선택하세요.</div>';
}

export function renderAggregation(){
  const hasData = aggRows.length > 0;
  renderSubmissionTracker();
  document.getElementById('aggDashboard').style.display = hasData ? 'block' : 'none';
  document.getElementById('aggSummary').style.display = hasData ? 'grid' : 'none';
  document.getElementById('aggTierSummary').style.display = hasData ? 'grid' : 'none';
  document.getElementById('riskBreakdownTableWrap').style.display = hasData ? 'block' : 'none';
  document.getElementById('interviewTargetsTableWrap').style.display = hasData ? 'block' : 'none';
  document.getElementById('ownerPersonsTableWrap').style.display = hasData ? 'block' : 'none';
  document.getElementById('interviewScheduleWrap').style.display = hasData ? 'block' : 'none';
  if(hasData){ try{ renderInterviewScheduleTable(getFilteredAggRows()); }catch(e){ console.error('인터뷰 일정 표 렌더링 오류(다른 응답집계 표에는 영향 없음):', e); } }
  document.getElementById('aggSrSummary').style.display = hasData ? 'grid' : 'none';
  document.getElementById('aggOwnSummary').style.display = hasData ? 'grid' : 'none';
  document.getElementById('deptOnlyTableWrap').style.display = hasData ? 'block' : 'none';
  document.querySelectorAll('.agg-section-label').forEach(el => { el.style.display = hasData ? 'block' : 'none'; });
  document.getElementById('deptTableWrap').style.display = hasData ? 'block' : 'none';
  document.getElementById('issueTableWrap').style.display = hasData ? 'block' : 'none';
  document.getElementById('evidenceReviewTableWrap').style.display = hasData ? 'block' : 'none';
  document.getElementById('evidenceAllTableWrap').style.display = hasData ? 'block' : 'none';
  document.getElementById('evidenceCoverageTableWrap').style.display = hasData ? 'block' : 'none';
  document.getElementById('mismatchTableWrap').style.display = hasData ? 'block' : 'none';
  document.getElementById('ownerTableWrap').style.display = hasData ? 'block' : 'none';
  document.getElementById('famTableWrap').style.display = hasData ? 'block' : 'none';
  document.getElementById('aggEmptyMsg').style.display = hasData ? 'none' : 'block';
  document.getElementById('groupwarePanel').style.display = hasData ? 'block' : 'none';
  document.getElementById('coverageTableWrap').style.display = (hasData && coveragePlan) ? 'block' : 'none';
  document.getElementById('crossDeptTableWrap').style.display = hasData ? 'block' : 'none';
  document.getElementById('trendTableWrap').style.display = hasData ? 'block' : 'none';
  if(!hasData) return;
  initAggFilterUI();
  renderAggDashboard();
  renderMaturityScore();
  renderCrossDeptTable();
  renderTrendCompare();

  const riskOrder = {"상":0, "중":1, "하":2};
  const riskSort = (a,b) => {
    const ra = riskOrder[a.risk] !== undefined ? riskOrder[a.risk] : 1;
    const rb = riskOrder[b.risk] !== undefined ? riskOrder[b.risk] : 1;
    if(ra !== rb) return ra - rb;
    return a.code.localeCompare(b.code);
  };

  const fRows = getFilteredAggRows();
  const depts = new Set(fRows.map(r => r.dept || '(부서명 미입력)'));
  const issues = fRows.filter(r => r.tier === 'bad');
  const hiIssues = issues.filter(r => r.risk === '상');

  document.getElementById('aggDeptCount').textContent = depts.size;
  document.getElementById('aggRowCount').textContent = fRows.length;
  document.getElementById('aggHiIssueCount').textContent = hiIssues.length;
  const HI_ISSUE_THRESHOLD = 5;
  const hiIssueCard = document.getElementById('aggHiIssueCard');
  const hiIssueWarning = document.getElementById('aggHiIssueWarning');
  const overThreshold = hiIssues.length > HI_ISSUE_THRESHOLD;
  if(hiIssueCard) hiIssueCard.style.cssText = overThreshold ? 'border:2px solid var(--risk-hi);background:#fbeceb;' : '';
  if(hiIssueWarning) hiIssueWarning.style.display = overThreshold ? 'block' : 'none';

  const itemRows = itemLevelRows(fRows);
  const srGood = itemRows.filter(r => r.sr === '잘함');
  const srMid = itemRows.filter(r => r.sr === '보통');
  const srPoor = itemRows.filter(r => r.sr === '미흡');
  const mismatches = itemRows.filter(r => r.sr && ((r.sr === '잘함' && r.hasIssue) || (r.sr === '미흡' && !r.hasIssue)));

  document.getElementById('aggSrGood').textContent = srGood.length;
  document.getElementById('aggSrMid').textContent = srMid.length;
  document.getElementById('aggSrPoor').textContent = srPoor.length;
  document.getElementById('aggMismatch').textContent = mismatches.length;

  const ownOther = itemRows.filter(r => r.own === '타 부서 담당' || r.own === '공동 담당');
  const famLow = itemRows.filter(r => r.fam === '잘 모름');
  document.getElementById('aggOwnOther').textContent = ownOther.length;
  document.getElementById('aggFamLow').textContent = famLow.length;
  document.getElementById('aggOwnTotal').textContent = itemRows.length;

  // Dept x Domain breakdown — response columns are built dynamically since the scale is configurable.
  const respValues = Array.from(new Set(fRows.map(r => r.resp).filter(Boolean)));
  const key = (d,dom) => d + '|||' + dom;
  const groups = {};
  fRows.forEach(r => {
    const d = r.dept || '(부서명 미입력)';
    const k = key(d, r.domain);
    if(!groups[k]) groups[k] = {dept:d, domain:r.domain, total:0, counts:{}};
    groups[k].total++;
    groups[k].counts[r.resp] = (groups[k].counts[r.resp]||0) + 1;
  });
  const groupArr = Object.values(groups).sort((a,b) => a.dept.localeCompare(b.dept) || a.domain.localeCompare(b.domain));
  const deptTable = document.getElementById('deptTable');
  deptTable.innerHTML = '<tr><th>수검부서</th><th>도메인</th><th>응답 수</th>' + respValues.map(v => '<th>'+esc(v)+'</th>').join('') + '</tr>'
    + groupArr.map(g =>
      '<tr><td>' + esc(g.dept) + '</td><td class="mono">D-' + esc(g.domain) + '</td><td class="num-cell">' + g.total + '</td>'
      + respValues.map(v => '<td class="num-cell">' + (g.counts[v]||0) + '</td>').join('') + '</tr>'
    ).join('');

  // 수검부서별 종합 (영역 구분 없이) — 부서 단위 총괄 지표
  const deptOnly = {};
  itemRows.forEach(r => {
    const d = r.dept || '(부서명 미입력)';
    if(!deptOnly[d]) deptOnly[d] = {dept:d, domains:new Set(), items:0, issues:0, hiIssues:0, srPoor:0, ownOther:0, famLow:0};
    const g = deptOnly[d];
    g.domains.add(r.domain);
    g.items++;
    if(r.hasIssue) g.issues++;
    if(r.hasIssue && r.risk === '상') g.hiIssues++;
    if(r.sr === '미흡') g.srPoor++;
    if(r.own === '타 부서 담당' || r.own === '공동 담당') g.ownOther++;
    if(r.fam === '잘 모름') g.famLow++;
  });
  const deptOnlyArr = Object.values(deptOnly).sort((a,b) => a.dept.localeCompare(b.dept));
  const deptOnlyTable = document.getElementById('deptOnlyTable');
  deptOnlyTable.innerHTML = '<tr><th>수검부서</th><th>참여 영역 수</th><th>응답 항목 수</th><th>이슈 항목</th><th>위험상 이슈</th><th>자체평가 미흡</th><th>타/공동담당 응답</th><th>숙지도 낮음</th></tr>'
    + deptOnlyArr.map(g =>
      '<tr><td>' + esc(g.dept) + '</td><td class="num-cell">' + g.domains.size + '</td><td class="num-cell">' + g.items + '</td>'
      + '<td class="num-cell">' + g.issues + '</td><td class="num-cell">' + g.hiIssues + '</td>'
      + '<td class="num-cell">' + g.srPoor + '</td><td class="num-cell">' + g.ownOther + '</td><td class="num-cell">' + g.famLow + '</td></tr>'
    ).join('');

  // Evidence review queue (self-rated 잘함 + evidence listed)
  // "증빙 검토 대상"은 "증빙자료 제출 현황"의 부분집합(잘함 자체평가 + 증빙 있음)이므로, 상태를 여기서
  // 또 따로 관리하지 않고 같은 interviewState 값을 그대로 보여주기만 한다 — 실제 상태 변경은 아래
  // "증빙자료 제출 현황" 표(전체 목록)에서 하도록 안내해, 상태가 두 곳에서 따로 놀지 않게 한다.
  const eviRows = itemRows.filter(r => r.sr === '잘함' && r.evidence);
  const eviSorted = eviRows.slice().sort(riskSort);
  const eviTable = document.getElementById('evidenceReviewTable');
  const EVID_STATUS_LABEL_PRE = {received_ok:'✅ 수령·확인됨', received_issue:'⚠ 수령·미흡', not_received:'🚫 미제출', '':'⏳ 미확인'};
  if(eviSorted.length === 0){
    eviTable.innerHTML = '<tr><td style="padding:16px;color:var(--ink-soft);">"잘함" 자체평가와 함께 제출 증빙이 기재된 항목이 없습니다.</td></tr>';
  } else {
    eviTable.innerHTML = '<tr><th>부서</th><th>항목코드</th><th class="agg-wrap-cell">항목명</th><th>위험도</th><th class="agg-wrap-cell">제출 예정 증빙</th><th class="agg-wrap-cell">담당자 코멘트</th><th>증빙 확인 상태</th></tr>'
      + eviSorted.map(r => {
          const ivState = interviewState[r.code] || {};
          const statusLabel = EVID_STATUS_LABEL_PRE[ivState.evidenceStatus || ''];
          return '<tr><td>' + esc(r.dept) + '</td><td class="mono">' + esc(r.code) + '</td><td class="agg-wrap-cell">' + esc(r.title) + '</td>'
          + '<td>' + esc(r.risk) + '</td><td class="agg-wrap-cell">' + esc(r.evidence) + '</td><td class="agg-wrap-cell">' + esc(r.srNote) + '</td>'
          + '<td style="font-size:11px;">' + statusLabel + '<div style="color:var(--ink-soft);">↓ 아래 "증빙자료 제출 현황"에서 변경</div></td></tr>';
        }).join('');
  }

  // Evidence submission tracker (전체 — 자체평가와 무관하게 증빙이 체크된 모든 항목)
  // "증빙 확인 상태"는 예전엔 🎤인터뷰 가이드에서만 바꿀 수 있어, 실제로는 인터뷰 전에 이미
  // 파일서버로 증빙이 도착해도 인터뷰 때까지 기다려야 반영되는 문제가 있었다. 이제 이 표에서
  // 바로 상태를 바꿀 수 있고(같은 interviewState 저장소를 공유하므로 인터뷰 가이드에도 즉시 반영),
  // 누가 언제 확인했는지도 함께 남겨 다른 감사역도 확인할 수 있게 한다.
  const EVID_STATUS_LABEL = {received_ok:'✅ 수령·확인됨', received_issue:'⚠ 수령·미흡', not_received:'🚫 미제출', '':'⏳ 미확인'};
  const eviAllRows = itemRows.filter(r => r.evidence).slice().sort(riskSort);
  const eviAllTable = document.getElementById('evidenceAllTable');
  if(eviAllRows.length === 0){
    eviAllTable.innerHTML = '<tr><td style="padding:16px;color:var(--ink-soft);">제출 증빙이 체크된 항목이 없습니다.</td></tr>';
  } else {
    eviAllTable.innerHTML = '<tr><th>부서</th><th>항목코드</th><th class="agg-wrap-cell">항목명</th><th>위험도</th><th class="agg-wrap-cell">제출 예정 증빙</th><th style="width:150px;">증빙 확인 상태 <span style="font-weight:400;text-transform:none;">(언제든 변경 가능)</span></th><th>확인자·확인일시</th></tr>'
      + eviAllRows.map(r => {
          const ivState = interviewState[r.code] || {};
          const curStatus = ivState.evidenceStatus || '';
          const optionsHtml = Object.keys(EVID_STATUS_LABEL).map(k => '<option value="' + k + '"' + (k === curStatus ? ' selected' : '') + '>' + EVID_STATUS_LABEL[k] + '</option>').join('');
          const whoWhen = (ivState.evidenceCheckedBy || ivState.evidenceCheckedAt)
            ? (esc(ivState.evidenceCheckedBy || '-') + (ivState.evidenceCheckedAt ? (' · ' + esc(String(ivState.evidenceCheckedAt).replace('T',' ').slice(0,16))) : ''))
            : '<span style="color:var(--ink-soft);">-</span>';
          return '<tr><td>' + esc(r.dept) + '</td><td class="mono">' + esc(r.code) + '</td><td class="agg-wrap-cell">' + esc(r.title) + '</td>'
            + '<td>' + esc(r.risk) + '</td><td class="agg-wrap-cell">' + esc(r.evidence) + '</td>'
            + '<td><select class="evi-status-select" data-code="' + esc(r.code) + '" style="font-size:11px;border:1px solid var(--line);border-radius:4px;padding:3px 5px;width:100%;">' + optionsHtml + '</select></td>'
            + '<td class="evi-whowhen-' + esc(r.code) + '" style="font-size:11px;">' + whoWhen + '</td></tr>';
        }).join('');
    eviAllTable.querySelectorAll('.evi-status-select').forEach(sel => sel.addEventListener('change', (e) => {
      const code = e.target.dataset.code;
      if(!interviewState[code]) interviewState[code] = {done:false, note:'', interviewee:'', interviewer:'', interviewedAt:'', location:''};
      interviewState[code].evidenceStatus = e.target.value;
      interviewState[code].evidenceCheckedBy = getCurrentAuditor() || '';
      interviewState[code].evidenceCheckedAt = kstISOString();
      saveInterviewState();
      // "증빙 검토 대상" 표는 이 값을 그대로 보여주기만 하므로 함께 다시 그려 최신 상태를 유지한다.
      if(typeof renderAggregation === 'function') renderAggregation();
      if(typeof renderInterviewGuide === 'function') renderInterviewGuide();
    }));
  }

  // 📎 증빙 커버리지 점검 — "체크된 것"만 보여주는 위 두 표와 달리, 체크리스트에 원래 정의된
  // 증빙 목록(igFindItem(code).evidence)을 기준선으로 놓고 응답자가 실제 체크한 증빙과 대조해
  // 누락 후보를 자동으로 짚어준다. "타 부서 담당"으로 넘긴 항목과, 애초에 정의된 증빙이 없는
  // 항목은 비교 대상이 아니므로 제외한다. 실제 파일 첨부 여부까지 검증하는 것은 아니며,
  // 최종 확인은 여전히 위 "증빙자료 제출 현황" 표의 증빙 확인 상태로 감사역이 직접 기록해야 한다.
  const evidenceCoverageTable = document.getElementById('evidenceCoverageTable');
  if(evidenceCoverageTable){
    const missingOnlyToggle = document.getElementById('evidenceCoverageMissingOnlyToggle');
    if(missingOnlyToggle && !missingOnlyToggle.dataset.wired){
      missingOnlyToggle.dataset.wired = '1';
      missingOnlyToggle.addEventListener('change', () => { if(typeof renderAggregation === 'function') renderAggregation(); });
    }
    const missingOnly = !missingOnlyToggle || missingOnlyToggle.checked;
    const coverageRows = [];
    itemRows.forEach(r => {
      if(r.own === '타 부서 담당') return;
      const def = igFindItem(r.code);
      const definedEvi = (def && Array.isArray(def.evidence)) ? def.evidence : [];
      if(definedEvi.length === 0) return;
      const checkedNames = (r.evidence || '').split(' / ').map(s => s.trim()).filter(Boolean);
      const submitted = definedEvi.filter(name => checkedNames.includes(name));
      const missing = definedEvi.filter(name => !checkedNames.includes(name));
      const customNote = checkedNames.filter(name => !definedEvi.includes(name)).join(', ');
      coverageRows.push({dept:r.dept, code:r.code, title:r.title, risk:r.risk, totalDefined: definedEvi.length, submitted, missing, customNote});
    });
    const filteredCoverage = missingOnly ? coverageRows.filter(c => c.missing.length > 0) : coverageRows;
    filteredCoverage.sort((a,b) => (b.missing.length - a.missing.length) || riskSort(a,b));
    const evidenceCoverageMissingCount = coverageRows.filter(c => c.missing.length > 0).length;
    const evidenceCoverageBadgeEl = document.getElementById('cnt-evidenceCoverageTable');
    if(evidenceCoverageBadgeEl) evidenceCoverageBadgeEl.textContent = evidenceCoverageMissingCount + '건';
    if(filteredCoverage.length === 0){
      evidenceCoverageTable.innerHTML = '<tr><td style="padding:16px;color:var(--ink-soft);">' + (missingOnly ? '누락된 증빙이 없습니다.' : '비교 대상 항목이 없습니다.') + '</td></tr>';
    } else {
      evidenceCoverageTable.innerHTML = '<tr><th>부서</th><th>항목코드</th><th class="agg-wrap-cell">항목명</th><th>위험도</th><th>정의된 증빙</th><th class="agg-wrap-cell">✅ 제출함</th><th class="agg-wrap-cell">🚩 누락 후보</th><th class="agg-wrap-cell">자유입력 사유</th></tr>'
        + filteredCoverage.map(c => {
            const rowStyle = c.missing.length > 0 ? ' style="border-left:4px solid var(--risk-hi);"' : '';
            return '<tr' + rowStyle + '><td>' + esc(c.dept) + '</td><td class="mono">' + esc(c.code) + '</td><td class="agg-wrap-cell">' + esc(c.title) + '</td>'
            + '<td>' + esc(c.risk) + '</td><td class="mono">' + c.totalDefined + '</td>'
            + '<td class="agg-wrap-cell">' + esc(c.submitted.join(', ') || '-') + '</td>'
            + '<td class="agg-wrap-cell" style="color:var(--risk-hi);font-weight:700;">' + esc(c.missing.join(', ') || '-') + '</td>'
            + '<td class="agg-wrap-cell">' + esc(c.customNote || '-') + '</td></tr>';
          }).join('');
    }
  }

  // Mismatch table
  const mismatchTable = document.getElementById('mismatchTable');
  if(mismatches.length === 0){
    mismatchTable.innerHTML = '<tr><td style="padding:16px;color:var(--ink-soft);">자체평가와 체크포인트 응답이 어긋난 항목이 없습니다.</td></tr>';
  } else {
    mismatchTable.innerHTML = '<tr><th>부서</th><th>항목코드</th><th class="agg-wrap-cell">항목명</th><th>위험도</th><th>자체평가</th><th>실제 체크포인트</th><th class="agg-wrap-cell">코멘트</th></tr>'
      + mismatches.sort(riskSort).map(r =>
        '<tr><td>' + esc(r.dept) + '</td><td class="mono">' + esc(r.code) + '</td><td class="agg-wrap-cell">' + esc(r.title) + '</td>'
        + '<td>' + esc(r.risk) + '</td><td><span class="badge-resp ' + (r.sr==='잘함'?'예':'아니오') + '">' + esc(r.sr) + '</span></td>'
        + '<td>' + (r.hasIssue ? '부정 응답 있음' : '부정 응답 없음') + '</td><td class="agg-wrap-cell">' + esc(r.srNote) + '</td></tr>'
      ).join('');
  }

  // 책임소재 확인 필요 (owner != 우리 부서)
  const ownerTable = document.getElementById('ownerTable');
  if(ownOther.length === 0){
    ownerTable.innerHTML = '<tr><td style="padding:16px;color:var(--ink-soft);">"타 부서 담당"/"공동 담당" 응답이 없습니다.</td></tr>';
  } else {
    ownerTable.innerHTML = '<tr><th>응답 부서</th><th>항목코드</th><th class="agg-wrap-cell">항목명</th><th>위험도</th><th>담당여부 응답</th><th>지목된 담당부서</th><th>관련 담당자</th></tr>'
      + ownOther.sort(riskSort).map(r =>
        '<tr><td>' + esc(r.dept) + '</td><td class="mono">' + esc(r.code) + '</td><td class="agg-wrap-cell">' + esc(r.title) + '</td>'
        + '<td>' + esc(r.risk) + '</td><td><span class="badge-resp 아니오">' + esc(r.own) + '</span></td><td>' + esc(r.ownDept || '-') + '</td><td>' + esc(r.ownPerson || '-') + '</td></tr>'
      ).join('');
  }

  // 숙지도 낮음
  const famTable = document.getElementById('famTable');
  if(famLow.length === 0){
    famTable.innerHTML = '<tr><td style="padding:16px;color:var(--ink-soft);">"잘 모름" 응답이 없습니다.</td></tr>';
  } else {
    famTable.innerHTML = '<tr><th>부서</th><th>항목코드</th><th class="agg-wrap-cell">항목명</th><th>위험도</th></tr>'
      + famLow.sort(riskSort).map(r =>
        '<tr><td>' + esc(r.dept) + '</td><td class="mono">' + esc(r.code) + '</td><td class="agg-wrap-cell">' + esc(r.title) + '</td><td>' + esc(r.risk) + '</td></tr>'
      ).join('');
  }

  // Issue list (with law-based remediation hint)
  const issuesSorted = issues.slice().sort(riskSort);
  const issueTable = document.getElementById('issueTable');
  if(issuesSorted.length === 0){
    issueTable.innerHTML = '<tr><td style="padding:16px;color:var(--ink-soft);">부정 응답이 없습니다.</td></tr>';
  } else {
    issueTable.innerHTML = '<tr><th>부서</th><th>항목코드</th><th class="agg-wrap-cell">항목명</th><th>구분</th><th>위험도</th><th class="agg-wrap-cell">체크포인트</th><th>응답</th><th class="agg-wrap-cell">비고</th><th class="agg-wrap-cell">관련 법령·기준</th></tr>'
      + issuesSorted.map(r =>
        '<tr class="risk-row-' + esc(r.risk) + '"><td>' + esc(r.dept) + '</td><td class="mono">' + esc(r.code) + '</td>'
        + '<td class="agg-wrap-cell">' + esc(r.title) + '</td><td>' + itemDeptScopeBadgeHtml(r.code) + '</td><td style="text-align:center;">' + esc(r.risk) + '</td><td class="agg-wrap-cell">' + esc(r.cptext) + '</td>'
        + '<td><span class="badge-resp 아니오">' + esc(r.resp) + '</span></td><td class="agg-wrap-cell">' + esc(r.note) + '</td><td class="agg-wrap-cell">' + esc(r.law || '-') + '</td></tr>'
      ).join('');
  }

  // Coverage vs distribution plan
  if(coveragePlan){
    const planned = {}; // dept -> Set(codes)
    Object.entries(coveragePlan.itemDeptMap || {}).forEach(([code, deptVal]) => {
      const depts = deptToArray(deptVal);
      const targets = depts.length > 0 ? depts : [coveragePlan.defaultDept || '(미지정)'];
      targets.forEach(d => {
        if(!planned[d]) planned[d] = new Set();
        planned[d].add(code);
      });
    });
    const receivedByDept = {}; // dept -> Set(codes)
    itemRows.forEach(r => {
      const d = r.dept || '(부서명 미입력)';
      if(!receivedByDept[d]) receivedByDept[d] = new Set();
      receivedByDept[d].add(r.code);
    });
    const allDepts = new Set([...Object.keys(planned), ...Object.keys(receivedByDept)]);
    const covTable = document.getElementById('coverageTable');
    let rows = '<tr><th>부서</th><th>배정 항목수</th><th>회수 항목수</th><th>회수율</th></tr>';
    Array.from(allDepts).sort().forEach(d => {
      const plannedCount = planned[d] ? planned[d].size : 0;
      const receivedSet = receivedByDept[d] || new Set();
      let matched = 0;
      receivedSet.forEach(c => { if(planned[d] && planned[d].has(c)) matched++; });
      const pct = plannedCount ? Math.round(matched/plannedCount*100) : (receivedSet.size ? 100 : 0);
      rows += '<tr><td>' + esc(d) + '</td><td class="num-cell">' + plannedCount + '</td>'
        + '<td class="num-cell">' + matched + '</td><td class="num-cell">' + pct + '%</td></tr>';
    });
    covTable.innerHTML = rows;
  }

  renderInterviewOverridesTable();
}

export function buildOvDetailHtml(dom, it){
  const RISK_LABEL = {상:'위험도 상', 중:'위험도 중', 하:'위험도 하'};
  const riskStyle = {상:'background:var(--risk-hi-bg);color:var(--risk-hi);', 중:'background:var(--risk-mid-bg);color:var(--risk-mid);', 하:'background:#eceae4;color:var(--ink-soft);'}[it.risk] || '';
  const cpList = (it.checkpoints||[]).map(cp => '<li>' + esc(cp) + '</li>').join('') || '<li style="color:var(--ink-soft);">등록된 체크포인트가 없습니다.</li>';
  const eviList = (it.evidence||[]).map(e => '<li>' + esc(e) + '</li>').join('') || '<li style="color:var(--ink-soft);">등록된 증빙자료 예시가 없습니다.</li>';
  return '<div class="ov-detail-head"><span class="ov-detail-code">D-' + esc(dom.code) + ' · ' + it.no + '.</span>'
    + '<span class="ov-detail-title">' + esc(it.title) + '</span>'
    + '<span class="ov-irisk" style="' + riskStyle + '">' + esc(RISK_LABEL[it.risk] || it.risk) + '</span></div>'
    + (it.desc ? ('<div class="ov-detail-desc">' + esc(it.desc) + '</div>') : '')
    + '<div class="ov-detail-h4">✅ 세부 체크포인트</div><ul class="ov-detail-list">' + cpList + '</ul>'
    + '<div class="ov-detail-h4">📎 증빙자료 예시</div><ul class="ov-detail-list">' + eviList + '</ul>'
    + (it.law ? ('<div class="ov-detail-h4">📜 관련 법령·기준</div><div class="ov-detail-law">' + esc(it.law) + '</div>') : '')
    + (it.method ? ('<div class="ov-detail-h4">🔍 감사방법</div><div class="ov-detail-law">' + esc(it.method) + '</div>') : '');
}

export function showOvDetail(domainCode, itemNo){
  const dom = DOMAINS.find(d => d.code === domainCode);
  const it = dom && dom.items.find(x => String(x.no) === String(itemNo));
  if(!dom || !it) return;
  const body = document.getElementById('ovDetailBody');
  const modal = document.getElementById('ovDetailModal');
  if(!body || !modal) return;
  body.innerHTML = buildOvDetailHtml(dom, it);
  modal.classList.add('show');
}

export function closeOvDetail(){
  const modal = document.getElementById('ovDetailModal');
  if(modal) modal.classList.remove('show');
}

export function collectAssignedCodesByInterviewer(){
  // 현재 브라우저에 저장된 interviewState 전체를 기준으로, "진행 감사자"가 채워진 항목만 모아
  // 사람별로 묶는다. (렌더링 중인 필터와 무관하게 항상 전체 데이터 기준 — 배정은 화면 필터와 별개다)
  const byPerson = {};
  Object.keys(interviewState).forEach(code => {
    if(!code.includes('-')) return; // 커스텀 항목(체크리스트 외 별도 확인사항)은 도메인 코드 형식이 아니라 제외
    const st = interviewState[code];
    const raw = (st && st.interviewer || '').trim();
    if(!raw) return;
    // [v8.35] "김철수, 이영희"처럼 한 필드에 여러 명이 함께 적힌 경우(협업 병합 시 자동으로
    // 합쳐지거나 직접 여러 명을 적은 경우) 쉼표로 나눠 각자에게 이 항목을 배정한다 — 그러지
    // 않으면 "김철수"와 "김철수, 이영희"가 서로 다른 사람으로 취급되어 배정 목록에 같은 이름이
    // 여러 형태로 겹쳐 나타난다.
    const names = raw.split(/[,，]/).map(n => n.trim()).filter(Boolean);
    names.forEach(name => {
      if(!byPerson[name]) byPerson[name] = [];
      if(!byPerson[name].includes(code)) byPerson[name].push(code);
    });
  });
  Object.keys(byPerson).forEach(name => {
    byPerson[name].sort((a,b) => {
      const [ad, an] = a.split('-'); const [bd, bn] = b.split('-');
      if(ad !== bd) return ad.localeCompare(bd);
      return Number(an) - Number(bn);
    });
  });
  return byPerson;
}

export function collectAuditArchiveSummary(){
  const map = {}; // auditName -> {findings:0, kanban:0, reports:0, lastAt:''}
  const touch = (name, key, at) => {
    const n = name || AUDIT_UNTAGGED_LABEL;
    if(!map[n]) map[n] = {findings:0, kanban:0, reports:0, lastAt:''};
    map[n][key]++;
    if(at && at > map[n].lastAt) map[n].lastAt = at;
  };
  findings.forEach(f => touch(f.auditName, 'findings', f.createdAt || ''));
  (typeof loadKanbanCards === 'function' ? loadKanbanCards() : []).forEach(c => touch(c.auditName, 'kanban', c.updatedAt || c.createdAt || ''));
  loadReportLog().forEach(e => touch(e.auditName, 'reports', e.generatedAt || ''));
  return Object.keys(map).map(name => Object.assign({name}, map[name])).sort((a,b) => (b.lastAt||'').localeCompare(a.lastAt||''));
}
