// ============================================================
// ② 배포·회신 관리 (dist 탭) — v8.50에서 app.js로부터 물리적으로 분리
// ------------------------------------------------------------
// 설문 배포 대상 지정, 수신 여부 자동 매칭, 독촉 대상 관리 등.
// aggRows는 app.js가 소유한 공유 가변 상태(let, 이미 export됨)라서, ES 모듈 import
// 바인딩은 읽기 전용이므로 재할당은 app.js가 내보낸 setAggRows 세터로만 한다
// (원본의 직접 재할당 1곳을 세터 호출로 치환했을 뿐 로직은 동일).
// getChecklistOwnerDept/igFindDomain/resolveItemDeptForAttach는 app.js를 거치지 않고
// generate.js(설문지 생성 탭, 먼저 분리됨)에서 바로 가져온다.
// ============================================================
import {
  COMMON_DEPT_LABEL,
  SYSTEM_VERSION,
  aggRows,
  domainAuditorMap,
  interviewState,
  DISTRIBUTION_STORAGE_KEY,
  RECIPIENT_STORAGE_KEY,
  activeRoundLabel,
  interviewSchedule,
  loadedFiles,
  setAggRows,
} from '../app.js';
import {
  addKnownAuditor, esc, getCurrentAuditor, kstDateStr, kstISOString,
} from './common.js';
import {
  renderCommDistSelect,
} from './comm.js';
import {
  getChecklistOwnerDept,
  igFindDomain,
  resolveItemDeptForAttach,
} from './generate.js';
import {
  igFindItem,
  igGetScript,
  igItemMeta,
  renderInterviewGuide,
  saveInterviewSchedule,
} from './interview.js';
import {
  findMatchingRoundRows,
  itemLevelRows,
  renderAggregation,
  startNewRound,
} from './collect.js';

export function autoFillDistAuditor(){
  const distInput = document.getElementById('distAuditorInput');
  if(!distInput || distInput.value) return; // 이미 값이 있으면 건드리지 않음
  // 각 영역의 배정값은 "김감사, 이감사"처럼 쉼표로 여러 명을 담을 수 있으므로, 먼저 개별 이름 단위로 풀어서 비교한다.
  const allNames = Object.values(domainAuditorMap)
    .filter(Boolean)
    .flatMap(v => v.split(',').map(n => n.trim()).filter(Boolean));
  const mapVals = Array.from(new Set(allNames));
  if(mapVals.length === 1){ distInput.value = mapVals[0]; return; }
  const current = getCurrentAuditor();
  if(current) distInput.value = current;
}

export function itemDeptAssignmentLabel(code){
  const parts = String(code || '').split('-');
  if(parts.length < 2) return {isCommon:false, label:''};
  const arr = resolveItemDeptForAttach(parts[0], Number(parts[1]), '');
  if(arr.length === 0) return {isCommon:false, label:''};
  const isCommon = arr.length > 1 || arr.includes(COMMON_DEPT_LABEL);
  return {isCommon, label: isCommon ? COMMON_DEPT_LABEL : arr[0]};
}

export function loadRecipients(){ try{ return JSON.parse(localStorage.getItem(RECIPIENT_STORAGE_KEY) || '[]'); }catch(e){ return []; } }

export function saveRecipients(list){ try{ localStorage.setItem(RECIPIENT_STORAGE_KEY, JSON.stringify(list)); }catch(e){ alert('명부 저장 실패: ' + e.message); } }

export function loadDistributions(){ try{ return JSON.parse(localStorage.getItem(DISTRIBUTION_STORAGE_KEY) || '[]'); }catch(e){ return []; } }

export function saveDistributions(list){ try{ localStorage.setItem(DISTRIBUTION_STORAGE_KEY, JSON.stringify(list)); }catch(e){ alert('배포 기록 저장 실패: ' + e.message); } }

export function renderRecipientsTable(){
  const recipients = loadRecipients();
  const tbl = document.getElementById('recipientsTable');
  if(!tbl) return;
  if(recipients.length === 0){
    tbl.innerHTML = '<tr><td style="padding:10px;color:var(--ink-soft);font-size:11.5px;border:none;">등록된 수검자가 없습니다. 위에서 이름·소속부서를 입력하고 [+ 명부에 추가]를 눌러 주세요.</td></tr>';
  } else {
    let html = '<tr><th>이름</th><th>소속부서</th><th>연락처</th><th>동작</th></tr>';
    recipients.forEach(r => {
      html += '<tr>'
        + '<td>' + esc(r.name) + '</td>'
        + '<td>' + esc(r.dept) + '</td>'
        + '<td class="mono" style="font-size:10.5px;">' + esc(r.contact||'') + '</td>'
        + '<td><button class="gen-small-btn" style="margin:0;color:#b3261e;border-color:#e0a29c;" onclick="deleteRecipient(\'' + r.id + '\')">삭제</button></td>'
        + '</tr>';
    });
    tbl.innerHTML = html;
  }
  renderDistRecipientChecks();
}

export function addRecipient(){
  const nameEl = document.getElementById('recipientNameInput');
  const deptEl = document.getElementById('recipientDeptInput');
  const contactEl = document.getElementById('recipientContactInput');
  const name = (nameEl.value||'').trim();
  const dept = (deptEl.value||'').trim();
  const contact = (contactEl.value||'').trim();
  if(!name || !dept){ alert('이름과 소속부서를 모두 입력해 주세요.'); return; }
  const recipients = loadRecipients();
  recipients.push({id:'p'+Date.now(), name, dept, contact});
  saveRecipients(recipients);
  nameEl.value=''; deptEl.value=''; contactEl.value='';
  renderRecipientsTable();
}

export function deleteRecipient(id){
  const recipients = loadRecipients();
  const r = recipients.find(x=>x.id===id);
  if(!r) return;
  if(!confirm('"' + r.name + '"(' + r.dept + ')을 명부에서 삭제할까요? (이미 등록된 배포 기록의 대상자 목록에는 영향을 주지 않습니다)')) return;
  saveRecipients(recipients.filter(x=>x.id!==id));
  renderRecipientsTable();
}

export function exportRecipients(){
  const recipients = loadRecipients();
  const blob = new Blob([JSON.stringify({exportedAt:kstISOString(), recipients}, null, 2)], {type:'application/json;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IT감사_수검자명부.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importRecipientsFile(file){
  const reader = new FileReader();
  reader.onload = (e) => {
    try{
      const parsed = JSON.parse(e.target.result);
      const list = Array.isArray(parsed.recipients) ? parsed.recipients : (Array.isArray(parsed) ? parsed : null);
      if(!list){ alert(file.name + ': 인식 가능한 명부 파일 구조가 아닙니다.'); return; }
      const recipients = loadRecipients();
      const existingKeys = new Set(recipients.map(r => r.name + '|' + r.dept));
      let added = 0;
      list.forEach(r => {
        if(!r.name || !r.dept) return;
        const key = r.name + '|' + r.dept;
        if(existingKeys.has(key)) return;
        recipients.push({id: r.id || ('p'+Date.now()+Math.random().toString(36).slice(2,6)), name:r.name, dept:r.dept, contact:r.contact||''});
        existingKeys.add(key);
        added++;
      });
      saveRecipients(recipients);
      renderRecipientsTable();
      alert(added + '명을 명부에 추가했습니다. (중복된 이름·부서 조합은 건너뛰었습니다)');
    }catch(err){
      alert(file.name + ' 파일을 읽는 중 오류: ' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

export function renderDistRecipientChecks(){
  const wrap = document.getElementById('distRecipientChecks');
  if(!wrap) return;
  const recipients = loadRecipients();
  if(recipients.length === 0){
    wrap.innerHTML = '<div style="font-size:11.5px;color:var(--ink-soft);grid-column:1/-1;">먼저 위에서 수검자 명부를 등록해 주세요.</div>';
    return;
  }
  wrap.innerHTML = recipients.map(r =>
    '<label class="dist-check-item"><input type="checkbox" class="dist-recipient-cb" value="' + r.id + '"> ' + esc(r.name) + ' (' + esc(r.dept) + ')</label>'
  ).join('');
}

export function toggleSelectAllRecipients(){
  const boxes = document.querySelectorAll('.dist-recipient-cb');
  const allChecked = Array.from(boxes).every(b => b.checked);
  boxes.forEach(b => b.checked = !allChecked);
}

export function createDistribution(){
  const roundLabel = (document.getElementById('distRoundLabelInput').value||'').trim();
  const distDate = document.getElementById('distDateInput').value || kstDateStr();
  const dueDate = document.getElementById('distDueDateInput').value || '';
  const note = (document.getElementById('distNoteInput').value||'').trim();
  const auditorName = (document.getElementById('distAuditorInput').value||'').trim();
  const groupwareNo = (document.getElementById('distGroupwareNoInput').value||'').trim();
  const domains = Array.from(document.querySelectorAll('.dist-domain-cb:checked')).map(cb => cb.value);
  const recipientIds = Array.from(document.querySelectorAll('.dist-recipient-cb:checked')).map(cb => cb.value);
  if(!roundLabel){ alert('회차명을 입력해 주세요.'); return; }
  if(domains.length === 0){ alert('대상 도메인을 하나 이상 선택해 주세요.'); return; }
  if(recipientIds.length === 0){ alert('배포 대상자를 하나 이상 선택해 주세요.'); return; }
  const allRecipients = loadRecipients();
  const record = {
    id: 'd' + Date.now(),
    roundLabel, distributedAt: distDate, dueDate, note, domains, auditorName, groupwareNo,
    createdAt: kstISOString(),
    recipients: recipientIds.map(rid => {
      const r = allRecipients.find(x => x.id === rid);
      return {recipientId: rid, name: r ? r.name : '(삭제된 수검자)', dept: r ? r.dept : '', received:false, receivedAt:null};
    })
  };
  if(auditorName) addKnownAuditor(auditorName);
  const distributions = loadDistributions();
  distributions.push(record);
  saveDistributions(distributions);
  document.getElementById('distNoteInput').value = '';
  document.getElementById('distGroupwareNoInput').value = '';
  document.querySelectorAll('.dist-domain-cb:checked').forEach(cb => cb.checked = false);
  document.querySelectorAll('.dist-recipient-cb:checked').forEach(cb => cb.checked = false);
  renderDistributionList();
  renderCommDistSelect();
  alert('"' + roundLabel + '" 회차로 ' + recipientIds.length + '명에게 배포 등록했습니다.');
}

export function autoMatchResponses(distId){
  const distributions = loadDistributions();
  const dist = distributions.find(d => d.id === distId);
  if(!dist) return;
  const rows = findMatchingRoundRows(dist.roundLabel);
  if(rows.length === 0){
    alert('"' + dist.roundLabel + '" 회차명으로 저장되었거나 현재 불러온 응답 데이터가 없습니다.\n③ 응답 집계 탭에서 동일한 회차명으로 데이터를 업로드·저장한 뒤 다시 시도해 주세요.');
    return;
  }
  const deptDateMap = {}; // dept name -> latest date seen
  rows.forEach(r => {
    const dept = (r.dept||'').trim();
    if(!dept) return;
    if(!deptDateMap[dept] || (r.date && r.date > deptDateMap[dept])) deptDateMap[dept] = r.date || dist.distributedAt;
  });
  let matched = 0;
  dist.recipients.forEach(rec => {
    if(rec.received) return;
    const hit = Object.keys(deptDateMap).find(dept => dept === rec.dept || dept.includes(rec.dept) || rec.dept.includes(dept));
    if(hit){ rec.received = true; rec.receivedAt = deptDateMap[hit]; matched++; }
  });
  saveDistributions(distributions);
  renderDistributionList();
  renderCommDistSelect();
  alert('회신 자동 매칭 완료: ' + matched + '명을 회신완료로 표시했습니다. (부서명 일치 기준 — 정확히 매칭되지 않으면 표에서 직접 체크해 주세요)');
}

export function toggleReceivedManually(distId, recipientId){
  const distributions = loadDistributions();
  const dist = distributions.find(d => d.id === distId);
  if(!dist) return;
  const rec = dist.recipients.find(r => r.recipientId === recipientId);
  if(!rec) return;
  rec.received = !rec.received;
  rec.receivedAt = rec.received ? kstDateStr() : null;
  saveDistributions(distributions);
  renderDistributionList();
  renderCommDistSelect();
}

export function deptMatches(deptA, deptB){
  if(!deptA || !deptB) return false;
  return deptA === deptB || deptA.includes(deptB) || deptB.includes(deptA);
}

export function renderSubmissionTracker(){
  const panel = document.getElementById('submissionTrackerPanel');
  const body = document.getElementById('submissionTrackerBody');
  if(!panel || !body) return;

  if(aggRows.length === 0 || !activeRoundLabel){
    panel.style.display = 'none';
    return;
  }
  const distributions = loadDistributions();
  const matchingDists = distributions.filter(d => d.roundLabel === activeRoundLabel);
  if(matchingDists.length === 0){
    panel.style.display = 'block';
    document.getElementById('strRoundLabel').textContent = activeRoundLabel;
    body.innerHTML = '<div class="assign-empty">이 회차명(' + esc(activeRoundLabel) + ')과 일치하는 ② 배포 기록이 없습니다. ②에서 회차명을 이 이름으로 배포 등록하면 여기서 자동으로 추적됩니다. (배포 기록 없이 응답만 취합하는 것도 문제없이 계속 사용할 수 있습니다)</div>';
    return;
  }
  panel.style.display = 'block';
  document.getElementById('strRoundLabel').textContent = activeRoundLabel;

  // Build per-department response stats from currently loaded aggRows
  const items = itemLevelRows();
  const deptStats = {};
  items.forEach(it => {
    if(!deptStats[it.dept]) deptStats[it.dept] = {total:0, issues:0, highRiskIssues:0, evidence:0, authors:new Set()};
    deptStats[it.dept].total++;
    if(it.hasIssue) deptStats[it.dept].issues++;
    if(it.hasIssue && it.risk === '상') deptStats[it.dept].highRiskIssues++;
    if(it.evidence) deptStats[it.dept].evidence++;
    if(it.author) deptStats[it.dept].authors.add(it.author);
  });
  const respDepts = Object.keys(deptStats);

  let rows = '<table class="assign-tbl"><tr><th>배포 대상 부서</th><th>담당자</th><th>회신기한</th><th>회신 여부(②기준)</th><th>실제 응답 업로드</th><th>응답 요약</th><th>바로가기</th></tr>';
  matchingDists.forEach(dist => {
    dist.recipients.forEach(rec => {
      const respDeptHit = respDepts.find(d => deptMatches(d, rec.dept));
      const stat = respDeptHit ? deptStats[respDeptHit] : null;
      const receivedBadge = rec.received
        ? '<span style="color:var(--good);font-weight:700;">✅ 회신완료' + (rec.receivedAt ? ' (' + esc(rec.receivedAt) + ')' : '') + '</span>'
        : '<span style="color:var(--risk-hi);">⏳ 미회신</span>';
      const uploadBadge = stat
        ? '<span style="color:var(--good);font-weight:700;">📥 업로드됨' + (stat.authors.size ? ' — ' + esc(Array.from(stat.authors).join(', ')) : '') + '</span>'
        : '<span style="color:var(--ink-soft);">— 아직 없음</span>';
      const summaryText = stat
        ? (stat.total + '항목 · 미흡 ' + stat.issues + '건' + (stat.highRiskIssues > 0 ? ' <b style="color:var(--risk-hi);">(위험도상 ' + stat.highRiskIssues + '건)</b>' : '') + ' · 증빙 ' + stat.evidence + '건')
        : '-';
      const gotoBtn = stat
        ? '<button type="button" class="assign-dept-reset-btn str-goto-interview-btn" data-dept="' + esc(respDeptHit) + '" title="이 부서 응답으로 인터뷰 가이드 필터링">🎤</button>'
        : '';
      rows += '<tr><td>' + esc(rec.dept) + '</td><td>' + esc(rec.name || '-') + '</td><td class="mono">' + esc(dist.dueDate || '-') + '</td>'
        + '<td>' + receivedBadge + '</td><td>' + uploadBadge + '</td><td style="font-size:11px;">' + summaryText + '</td>'
        + '<td>' + gotoBtn + '</td></tr>';
    });
  });
  rows += '</table>';
  body.innerHTML = rows;

  body.querySelectorAll('.str-goto-interview-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('.tabbtn[data-tab="interview"]').click();
      // 인터뷰 가이드에서 해당 부서가 관련된 항목만 눈으로 훑어보기 쉽도록 알려줌
      // (인터뷰 가이드 자체는 담당 감사자 기준 필터라, 부서 단위 필터는 별도로 안내)
      alert('🎤 인터뷰 가이드 탭으로 이동했습니다. "' + btn.dataset.dept + '" 관련 항목은 각 카드의 "📇 설문 응답상 관련 담당자"·"제출 부서" 표시로 확인할 수 있습니다.');
    });
  });
}

export function deleteDistribution(distId){
  const distributions = loadDistributions();
  const dist = distributions.find(d => d.id === distId);
  if(!dist) return;
  if(!confirm('"' + dist.roundLabel + '" 배포 기록을 삭제할까요?')) return;
  saveDistributions(distributions.filter(d => d.id !== distId));
  renderDistributionList();
  renderCommDistSelect();
}

export function exportDistribution(distId){
  const distributions = loadDistributions();
  const dist = distributions.find(d => d.id === distId);
  if(!dist) return;
  const blob = new Blob([JSON.stringify(dist, null, 2)], {type:'application/json;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = String(dist.roundLabel).replace(/[\\/:*?"<>|\s]+/g,'_');
  a.href = url; a.download = 'IT감사_배포기록_' + safe + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copyPendingNames(distId){
  const distributions = loadDistributions();
  const dist = distributions.find(d => d.id === distId);
  if(!dist) return;
  const pending = dist.recipients.filter(r => !r.received);
  if(pending.length === 0){ alert('미회신자가 없습니다.'); return; }
  const text = pending.map(r => r.name + '(' + r.dept + ')').join(', ');
  const box = document.getElementById('copyBox-' + distId);
  if(box){ box.style.display = 'block'; box.textContent = text; }
  try{
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert('미회신자 ' + pending.length + '명 이름을 클립보드에 복사했습니다.');
  }catch(e){
    alert('클립보드 복사에 실패했습니다. 아래 표시된 텍스트를 직접 선택해 복사해 주세요.');
  }
}

export function toggleDistPendingOnly(distId){
  const el = document.getElementById('distTable-' + distId);
  if(!el) return;
  el.classList.toggle('pending-only');
}

export function renderDistributionList(){
  const container = document.getElementById('distributionListContainer');
  if(!container) return;
  const distributions = loadDistributions();

  // 담당 감사자 필터 옵션 갱신 (기존 선택값 유지)
  const filterEl = document.getElementById('distAuditorFilter');
  let filterVal = '';
  if(filterEl){
    filterVal = filterEl.value;
    const auditors = Array.from(new Set(distributions.map(d => d.auditorName).filter(Boolean))).sort();
    const optionsHtml = '<option value="">전체</option>' + auditors.map(a => '<option value="' + esc(a) + '">' + esc(a) + '</option>').join('');
    if(filterEl.innerHTML !== optionsHtml) filterEl.innerHTML = optionsHtml;
    filterEl.value = auditors.includes(filterVal) ? filterVal : '';
    filterVal = filterEl.value;
  }
  const visibleDistributions = filterVal ? distributions.filter(d => d.auditorName === filterVal) : distributions;

  if(distributions.length === 0){
    container.innerHTML = '<div class="ig-empty">등록된 배포 기록이 없습니다. 위에서 회차명·도메인·대상자를 선택하고 [📤 배포 등록]을 눌러 주세요.</div>';
    return;
  }
  if(visibleDistributions.length === 0){
    container.innerHTML = '<div class="ig-empty">"' + esc(filterVal) + '" 담당 배포 기록이 없습니다.</div>';
    return;
  }
  container.innerHTML = visibleDistributions.slice().reverse().map(dist => {
    const total = dist.recipients.length;
    const done = dist.recipients.filter(r => r.received).length;
    const pendingCount = total - done;
    const pct = total ? Math.round(done/total*100) : 0;
    const domainTags = dist.domains.map(dc => {
      const dom = igFindDomain(dc);
      return '<span class="dist-domain-tag">D-' + dc + (dom ? ' ' + esc(dom.title) : '') + '</span>';
    }).join('');
    const rowsHtml = dist.recipients.map(r =>
      '<tr class="' + (r.received ? '' : 'dist-row-pending') + '" ' + (r.received ? '' : 'data-pending-row="1"') + '>'
      + '<td>' + esc(r.name) + '</td><td>' + esc(r.dept) + '</td>'
      + '<td><span class="dist-status-badge ' + (r.received?'received':'pending') + '">' + (r.received?'✅ 회신완료':'⏳ 미회신') + '</span></td>'
      + '<td class="mono" style="font-size:10.5px;">' + esc(r.receivedAt||'-') + '</td>'
      + '<td><button class="gen-small-btn" style="margin:0;font-size:10px;padding:3px 8px;" onclick="toggleReceivedManually(\'' + dist.id + '\',\'' + r.recipientId + '\')">' + (r.received?'미회신으로 되돌리기':'회신완료로 표시') + '</button></td>'
      + '</tr>'
    ).join('');
    return (
      '<div class="dist-card' + (pendingCount > 0 ? ' has-pending' : '') + '" id="distCard-' + dist.id + '">'
      + '<div class="dist-card-head">'
        + '<div class="dist-card-title">' + esc(dist.roundLabel) + (dist.auditorName ? ' <span class="dist-auditor-tag">👤 ' + esc(dist.auditorName) + '</span>' : '') + '</div>'
        + '<div class="dist-card-meta"><span>' + domainTags + '</span><span>배포일 ' + esc(dist.distributedAt) + '</span>' + (dist.dueDate ? '<span>회신기한 ' + esc(dist.dueDate) + '</span>' : '') + '<span' + (pendingCount > 0 ? ' style="color:var(--risk-hi);font-weight:800;"' : '') + '>' + (pendingCount > 0 ? ('🚨 미회신 ' + pendingCount + '명 / ') : '') + done + ' / ' + total + '명 회신</span></div>'
        + '<div class="dist-progress-bar"><div style="width:' + pct + '%;"></div></div>'
      + '</div>'
      + '<div class="dist-card-body">'
        + (dist.note ? '<div style="font-size:11.5px;color:var(--ink-soft);margin-bottom:8px;">비고: ' + esc(dist.note) + '</div>' : '')
        + '<table class="agg-tbl" id="distTable-' + dist.id + '"><tr><th>이름</th><th>부서</th><th>상태</th><th>회신일</th><th>동작</th></tr>' + rowsHtml + '</table>'
        + '<div class="dist-card-actions">'
          + '<button class="gen-small-btn" style="margin:0;" onclick="autoMatchResponses(\'' + dist.id + '\')">🔄 회신 자동 매칭</button>'
          + '<button class="gen-small-btn" style="margin:0;" onclick="copyPendingNames(\'' + dist.id + '\')">📋 미회신자 이름 복사</button>'
          + '<button class="gen-small-btn" style="margin:0;" onclick="exportDistribution(\'' + dist.id + '\')">⬇ 내보내기</button>'
          + '<button class="gen-small-btn" style="margin:0;color:#b3261e;border-color:#e0a29c;" onclick="deleteDistribution(\'' + dist.id + '\')">삭제</button>'
        + '</div>'
        + '<div class="dist-copy-box" id="copyBox-' + dist.id + '"></div>'
      + '</div>'
      + '</div>'
    );
  }).join('');
}

export function findAssignmentMismatches(rows){
  const mismatches = [];
  rows.forEach(r => {
    const m = /-(\d+)$/.exec(r.code || '');
    if(!m) return;
    const itemNo = Number(m[1]);
    const owner = getChecklistOwnerDept(r.domain, itemNo);
    if(!owner) return; // 공통 항목이거나 배정정보가 없으면 검증 대상 아님
    const actual = (r.dept || '').trim();
    if(!actual || actual === owner) return;
    mismatches.push({code: r.code, owner, actual});
  });
  return mismatches;
}

export function renderFileChips(){
  const wrap = document.getElementById('fileChipRow');
  const bar = document.getElementById('fileSummaryBar');
  if(loadedFiles.length === 0){
    wrap.innerHTML = '';
    if(bar) bar.innerHTML = '';
    return;
  }
  wrap.innerHTML = loadedFiles.map((f,i) => {
    const rowsForFile = aggRows.filter(r => r.file === f.name);
    const depts = Array.from(new Set(rowsForFile.map(r => r.dept).filter(Boolean)));
    const domains = Array.from(new Set(rowsForFile.map(r => r.domain).filter(Boolean))).sort();
    const deptLabel = depts.length ? esc(depts.join('·')) : '(부서명 없음)';
    const domainLabel = domains.length ? domains.map(d => 'D-' + d).join(',') : '-';
    return '<div class="file-chip rich">'
      + '<div class="fc-top"><span class="fc-name">' + esc(f.name) + '</span><button data-idx="' + i + '" title="이 파일만 제거">✕</button></div>'
      + '<div class="fc-meta">' + deptLabel + ' · ' + domainLabel + ' · ' + rowsForFile.length + '행</div>'
      + '</div>';
  }).join('');
  wrap.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const removed = loadedFiles[idx];
      if(!confirm('"' + removed.name + '" 파일의 응답 데이터만 제거할까요? (다른 파일은 그대로 유지됩니다)')) return;
      loadedFiles.splice(idx, 1);
      setAggRows(aggRows.filter(r => r.file !== removed.name));
      renderFileChips();
      renderAggregation();
      renderInterviewGuide();
    });
  });

  if(bar){
    const totalDepts = new Set(aggRows.map(r => r.dept).filter(Boolean));
    const totalDomains = new Set(aggRows.map(r => r.domain).filter(Boolean));
    bar.innerHTML = '<span>현재 작업 중 (미저장): <b>' + loadedFiles.length + '</b>개 파일</span>'
      + '<span><b>' + totalDepts.size + '</b>개 부서</span>'
      + '<span><b>' + totalDomains.size + '</b>개 영역</span>'
      + '<span><b>' + aggRows.length + '</b>행</span>'
      + (activeRoundLabel ? '<span>회차: <b>' + esc(activeRoundLabel) + '</b></span>' : '<span style="color:var(--risk-hi);">⚠ 아직 회차로 저장되지 않음</span>')
      + '<button id="clearAllFilesBtn">전체 초기화</button>';
    const clearBtn = document.getElementById('clearAllFilesBtn');
    if(clearBtn) clearBtn.addEventListener('click', startNewRound);
  }
}

export function exportAssignmentPackage(){
  const auditor = document.getElementById('apAuditorSelect').value;
  if(!auditor){ alert('먼저 배정 감사자를 선택해 주세요. (인터뷰 일정 관리 표의 "배정 감사자" 칸에 이름을 적으면 여기 목록에 나타납니다)'); return; }
  const targetKeys = Object.keys(interviewSchedule).filter(k => (interviewSchedule[k].assignedAuditor||'').trim() === auditor);
  if(targetKeys.length === 0){ alert('이 감사자에게 배정된 대상이 없습니다.'); return; }
  const targetSet = new Set(targetKeys);
  const responses = aggRows.filter(r => targetSet.has((r.dept||'') + '|||' + (r.author||'')));
  const targets = targetKeys.map(k => ({key: k, ...interviewSchedule[k]}));
  const pkg = {
    __assignmentPackage: true,
    assignedTo: auditor,
    generatedBy: (document.getElementById('currentAuditorInput')||{}).value || '',
    generatedAt: kstISOString(),
    systemVersion: SYSTEM_VERSION,
    targets: targets,
    responses: responses
  };
  const blob = new Blob([JSON.stringify(pkg, null, 2)], {type: 'application/json;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'IT감사_배정패키지_' + auditor.replace(/[\\/:*?"<>|]/g,'') + '_' + kstDateStr() + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ingestAssignmentPackage(pkg){
  const hint = document.getElementById('apImportHint');
  let addedResp = 0, addedSched = 0;
  (pkg.responses || []).forEach(r => {
    // 이미 같은 (부서,작성자,항목코드,체크포인트)가 있으면 건너뛰어 중복 반영을 막는다.
    const dup = aggRows.some(x => x.dept === r.dept && x.author === r.author && x.code === r.code && x.cptext === r.cptext);
    if(!dup){ aggRows.push(r); addedResp++; }
  });
  (pkg.targets || []).forEach(t => {
    const key = t.key || ((t.dept||'') + '|||' + (t.author||''));
    interviewSchedule[key] = Object.assign({}, interviewSchedule[key] || {}, {
      datetime: t.datetime, place: t.place, status: t.status, memo: t.memo, assignedAuditor: t.assignedAuditor
    });
    addedSched++;
  });
  saveInterviewSchedule();
  if(hint){
    hint.style.display = 'block';
    hint.textContent = '✅ "' + (pkg.assignedTo||'') + '" 배정 패키지를 불러왔습니다 — 응답 ' + addedResp + '건, 일정 대상 ' + addedSched + '건 반영됨. 이제 🎤 인터뷰 가이드에서 바로 작업을 시작할 수 있습니다.';
  }
  renderAggregation();
  if(typeof renderInterviewGuide === 'function') renderInterviewGuide();
}

export function buildAssignmentPacketJson(interviewerName, codes){
  const items = codes.map(code => {
    const meta = igItemMeta(code);
    const item = igFindItem(code);
    const dom = igFindDomain(code.split('-')[0]);
    const script = igGetScript(code);
    const st = interviewState[code] || {};
    return {
      code, domain: code.split('-')[0], domainTitle: dom ? dom.title : '',
      title: meta.title, risk: item ? (item.risk || '') : '', law: meta.law || '',
      decisionQ: script ? script.decisionQ : '',
      branches: script ? {
        verify: script.verify, verifyEnd: script.verifyEnd,
        partial: script.partial, partialEnd: script.partialEnd,
        rootcause: script.rootcause, rootcauseEnd: script.rootcauseEnd,
        na: script.na, naEnd: script.naEnd
      } : null,
      currentState: { done: !!st.done, note: st.note||'', interviewee: st.interviewee||'', interviewedAt: st.interviewedAt||'', location: st.location||'', evidenceStatus: st.evidenceStatus||'' }
    };
  });
  return {
    interviewer: interviewerName,
    generatedAt: kstISOString(),
    generatedBy: getCurrentAuditor() || '',
    itemCount: items.length,
    note: '이 파일은 배정 안내용입니다. 실제 인터뷰 기록은 이 도구(같은 HTML 파일)를 열어 🎤 인터뷰 가이드 화면에서 직접 입력해 주세요. 작업이 끝나면 "📤 내 기록 내보내기(협업용)"으로 결과를 보내주시면 책임 감사역이 병합합니다.',
    items
  };
}
