// ============================================================
// ① 설문지 생성 / 체크리스트 빌더 (generate 탭) — v8.50에서 app.js로부터 물리적으로 분리
// ------------------------------------------------------------
// 체크리스트 항목 편집, 도메인(감사영역) 추가/삭제, 설문지 생성 마법사, 배정표 등.
// wizardItems/wizardIndex/openEditKey는 app.js가 소유한 공유 가변 상태(let)다. ES 모듈의
// import 바인딩은 읽기 전용이라 재할당이 안 되므로, app.js가 내보낸
// setWizardItems/setWizardIndex/setOpenEditKey 세터로만 값을 바꾼다(원본 코드의 직접
// 재할당 3곳을 세터 호출로 치환했을 뿐 로직·순서는 동일하다).
// ============================================================
import {
  DOMAINS,
  interviewState,
  CANONICAL_STANDARDS,
  COMMON_DEPT_LABEL,
  DOMAIN_GROUNDS_BANK,
  DOMAIN_TRASH_STORAGE_KEY,
  STANDING_COUNCIL_NOTE,
  SYSTEM_VERSION,
  TIER_LABELS,
  WIZARD_STEP_HINTS,
  WIZARD_STRUCTURE_LEGEND,
  auditDeptList,
  contentOverrides,
  currentScale,
  domainAuditorMap,
  domainDeptDefaultMap,
  domainTrash,
  expandedDomainCodes,
  igExpandedCodes,
  itemAuditorMap,
  itemDeptMap,
  openEditKey,
  selectedCodes,
  wizardIndex,
  wizardItems,
  setWizardItems,
  setWizardIndex,
  setOpenEditKey,
  setDomains,
} from '../app.js';
import {
  addKnownAuditor, esc, kstDateStr, kstISOString, circledNum, deptSelectOptionsHtml, deptTagHtml,
  deptToArray, downloadHtml, multiDeptSelectHtml, renderAuditDeptChips, riskTag, versionSuffix,
  wireMultiDeptSelect,
} from './common.js';
import DEFAULT_DOMAINS from '../data/domains-data.js';
import SURVEY_TEMPLATE from '../data/survey-template.js';
import TEMPLATE_XLSX_B64 from '../data/template-xlsx-b64.js';
import DOMAIN_BRIEF_DESC from '../data/domain-brief-desc.js';
import { itemDeptAssignmentLabel, loadDistributions } from './dist.js';
import { renderCustomInterviewSection, renderInterviewGuide, saveInterviewState } from './interview.js';
import { renderAuditNameSuggestion } from './report.js';
import { renderOverview } from './auditoverview.js';

export function parseWorkbookToDomains(workbook){
  const domains = [];
  workbook.SheetNames.forEach(name => {
    const m = name.match(/^(\d+)_/);
    if(!m) return;
    const code = m[1];
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, {header:1, blankrows:true, defval:''});
    if(rows.length < 5) return;
    const titleRaw = String(rows[0][0] || '');
    const title = titleRaw.includes('.') ? titleRaw.split('.').slice(1).join('.').trim() : titleRaw;
    const ref = String(rows[1][0] || '').replace('준거 기준: ', '').trim();
    const items = [];
    for(let r = 4; r < rows.length; r++){
      const row = rows[r];
      const noRaw = String(row[0] || '').trim();
      if(!/^\d+$/.test(noRaw)) continue;
      const checkpointsRaw = String(row[3] || '');
      const checkpoints = checkpointsRaw.split('\n').map(s => s.trim()).filter(Boolean)
        .map(s => s.replace(/^[①②③④⑤⑥⑦⑧]\s*/, ''));
      const evidenceRaw = String(row[4] || '');
      const evidence = evidenceRaw.split('\n').map(s => s.trim()).filter(Boolean);
      items.push({
        no: Number(noRaw),
        title: String(row[1] || '').trim(),
        desc: String(row[2] || '').trim(),
        checkpoints, evidence,
        law: String(row[5] || '').trim(),
        risk: String(row[6] || '중').trim() || '중',
        dept: String(row[7] || '').trim(),
      });
    }
    if(items.length) domains.push({code, title, ref, items});
  });
  domains.sort((a,b) => Number(a.code) - Number(b.code));
  return domains;
}

export function downloadChecklistTemplate(){
  // Embedded as base64 so this never depends on the SheetJS CDN being reachable —
  // the button works even if external scripts are blocked in this environment.
  try {
    const b64 = TEMPLATE_XLSX_B64.trim();
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'IT감사_체크리스트_업로드_서식' + versionSuffix() + '.xlsx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch(err){
    alert('서식 파일 다운로드 중 오류가 발생했습니다: ' + err.message);
  }
}

export function refreshChecklistMetaAfterBuilderEdit(){
  const totalItems = DOMAINS.reduce((s,d) => s + d.items.length, 0);
  const totalCp = DOMAINS.reduce((s,d) => s + d.items.reduce((a,it) => a + it.checkpoints.length, 0), 0);
  const metaDomEl = document.getElementById('metaDomains');
  const metaItemsEl = document.getElementById('metaItems');
  const metaCpEl = document.getElementById('metaCp');
  if(metaDomEl) metaDomEl.textContent = DOMAINS.length + '개';
  if(metaItemsEl) metaItemsEl.textContent = totalItems + '개';
  if(metaCpEl) metaCpEl.textContent = totalCp + '개';
  const labelEl = document.getElementById('checklistSourceLabel');
  if(labelEl && labelEl.innerHTML.includes('새로 만드는 체크리스트')){
    labelEl.innerHTML = '현재 사용 중: <b>새로 만드는 체크리스트</b> (' + DOMAINS.length + '개 영역 · ' + totalItems + '항목)';
  }
  if(typeof updateRefsMeta === 'function') updateRefsMeta();
  if(typeof updateGenSummary === 'function') updateGenSummary();
  if(typeof renderOverview === 'function') renderOverview();
  populateBuilderDomainSelect();
  if(typeof renderInterviewGuide === 'function') renderInterviewGuide(); // [v8.44] 체크리스트 변경 시 인터뷰 가이드도 자동 새로고침
}

export function populateBuilderDomainSelect(){
  const sel = document.getElementById('newItemDomain');
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = DOMAINS.length === 0
    ? '<option value="">— 먼저 영역을 추가하세요 —</option>'
    : DOMAINS.map(d => '<option value="' + esc(d.code) + '">D-' + esc(d.code) + ' ' + esc(d.title) + '</option>').join('');
  if(DOMAINS.some(d => d.code === cur)) sel.value = cur;
}

export function addCustomDomain(){
  const codeInput = document.getElementById('newDomainCode');
  const titleInput = document.getElementById('newDomainTitle');
  const refInput = document.getElementById('newDomainRef');
  let code = (codeInput.value || '').trim();
  const title = (titleInput.value || '').trim();
  if(!title){ alert('영역명을 입력해 주세요.'); return; }
  if(!code){
    const maxCode = DOMAINS.reduce((m, d) => Math.max(m, Number(d.code) || 0), 0);
    code = String(maxCode + 1).padStart(2, '0');
  }
  if(DOMAINS.some(d => d.code === code)){ alert('이미 존재하는 영역 코드입니다: ' + code + '\n다른 코드를 쓰거나 비워두면 자동으로 다음 번호가 붙습니다.'); return; }
  DOMAINS.push({code, title, ref: (refInput.value || '').trim(), items: []});
  DOMAINS.sort((a, b) => Number(a.code) - Number(b.code));
  selectedCodes.add(code);
  codeInput.value = ''; titleInput.value = ''; refInput.value = '';
  refreshChecklistMetaAfterBuilderEdit();
  renderDomainList();
}

export function loadDomainTrash(){ try{ return JSON.parse(localStorage.getItem(DOMAIN_TRASH_STORAGE_KEY) || '[]'); }catch(e){ return []; } }

export function saveDomainTrash(list){ try{ localStorage.setItem(DOMAIN_TRASH_STORAGE_KEY, JSON.stringify(list)); }catch(e){ /* non-fatal */ } }

export function renderDomainTrash(){
  const summary = document.getElementById('domainTrashSummary');
  const listEl = document.getElementById('domainTrashList');
  if(summary) summary.textContent = '🗑 삭제한 영역 복원함 (' + domainTrash.length + ')';
  if(!listEl) return;
  if(domainTrash.length === 0){
    listEl.innerHTML = '<div style="font-size:11.5px;color:var(--ink-soft);">삭제한 영역이 없습니다.</div>';
    return;
  }
  listEl.innerHTML = domainTrash.map((entry, idx) => {
    const dom = entry.domain;
    const when = entry.deletedAt ? new Date(entry.deletedAt).toLocaleString('ko-KR') : '';
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin-bottom:6px;background:#fff;">'
      + '<div style="font-size:12px;"><b>D-' + esc(dom.code) + ' ' + esc(dom.title) + '</b>'
      + '<div style="color:var(--ink-soft);font-size:11px;">' + dom.items.length + '항목 · ' + esc(when) + ' 삭제</div></div>'
      + '<div style="display:flex;gap:6px;flex:none;">'
      + '<button type="button" class="gen-small-btn" data-restore-idx="' + idx + '" style="margin:0;background:var(--navy);color:#f4efe2;">복원</button>'
      + '<button type="button" class="gen-small-btn" data-purge-idx="' + idx + '" style="margin:0;background:transparent;color:var(--risk-hi);border:1px solid var(--risk-hi);">영구삭제</button>'
      + '</div></div>';
  }).join('');
  listEl.querySelectorAll('[data-restore-idx]').forEach(btn => {
    btn.addEventListener('click', () => restoreDomainFromTrash(Number(btn.dataset.restoreIdx)));
  });
  listEl.querySelectorAll('[data-purge-idx]').forEach(btn => {
    btn.addEventListener('click', () => purgeDomainTrashEntry(Number(btn.dataset.purgeIdx)));
  });
}

export function restoreDomainFromTrash(idx){
  const entry = domainTrash[idx];
  if(!entry) return;
  let dom = JSON.parse(JSON.stringify(entry.domain));
  if(DOMAINS.some(d => d.code === dom.code)){
    const maxCode = DOMAINS.reduce((m, d) => Math.max(m, Number(d.code) || 0), 0);
    const newCode = String(maxCode + 1).padStart(2, '0');
    alert('영역 코드 ' + dom.code + '는 지금 다른 영역이 쓰고 있어서, 코드 ' + newCode + '(으)로 복원합니다.');
    dom.code = newCode;
  }
  DOMAINS.push(dom);
  DOMAINS.sort((a, b) => Number(a.code) - Number(b.code));
  selectedCodes.add(dom.code);
  domainTrash.splice(idx, 1);
  saveDomainTrash(domainTrash);
  renderDomainTrash();
  refreshChecklistMetaAfterBuilderEdit();
  renderDomainList();
}

export function purgeDomainTrashEntry(idx){
  if(!confirm('이 영역을 복원함에서 완전히 삭제하시겠습니까?\n이후에는 다시 복원할 수 없습니다.')) return;
  domainTrash.splice(idx, 1);
  saveDomainTrash(domainTrash);
  renderDomainTrash();
}

export function deleteCustomDomain(code){
  const dom = DOMAINS.find(d => d.code === code);
  if(!dom) return;
  const itemCount = dom.items.length;
  const msg = itemCount > 0
    ? ('"' + dom.title + '" 영역과 그 안의 항목 ' + itemCount + '개를 삭제하시겠습니까?\n삭제해도 아래 "🗑 삭제한 영역 복원함"에서 다시 복원할 수 있습니다.')
    : ('"' + dom.title + '" 영역을 삭제하시겠습니까?\n삭제해도 아래 "🗑 삭제한 영역 복원함"에서 다시 복원할 수 있습니다.');
  if(!confirm(msg)) return;
  setDomains(DOMAINS.filter(d => d.code !== code));
  selectedCodes.delete(code);
  expandedDomainCodes.delete(code);
  delete domainAuditorMap[code];
  Object.keys(itemDeptMap).forEach(k => { if(k.startsWith(code + '-')) delete itemDeptMap[k]; });
  Object.keys(itemAuditorMap).forEach(k => { if(k.startsWith(code + '-')) delete itemAuditorMap[k]; });
  Object.keys(contentOverrides).forEach(k => { if(k.startsWith(code + '-')) delete contentOverrides[k]; });
  domainTrash.unshift({ domain: JSON.parse(JSON.stringify(dom)), deletedAt: kstISOString() });
  if(domainTrash.length > 20) domainTrash.length = 20;
  saveDomainTrash(domainTrash);
  renderDomainTrash();
  refreshChecklistMetaAfterBuilderEdit();
  renderDomainList();
}

export function addCustomItem(){
  const domSel = document.getElementById('newItemDomain');
  const titleInput = document.getElementById('newItemTitle');
  const descInput = document.getElementById('newItemDesc');
  const cpInput = document.getElementById('newItemCheckpoints');
  const eviInput = document.getElementById('newItemEvidence');
  const lawInput = document.getElementById('newItemLaw');
  const riskSel = document.getElementById('newItemRisk');
  const code = domSel.value;
  const dom = DOMAINS.find(d => d.code === code);
  if(!dom){ alert('먼저 위에서 영역을 추가하거나 선택해 주세요.'); return; }
  const title = (titleInput.value || '').trim();
  if(!title){ alert('항목명을 입력해 주세요.'); return; }
  const checkpoints = (cpInput.value || '').split('\n').map(s => s.trim()).filter(Boolean);
  if(checkpoints.length === 0){ alert('세부 체크포인트를 한 줄에 하나씩, 최소 1개 이상 입력해 주세요.'); return; }
  const evidence = (eviInput.value || '').split('\n').map(s => s.trim()).filter(Boolean);
  const no = dom.items.reduce((m, it) => Math.max(m, it.no || 0), 0) + 1;
  dom.items.push({
    no, title, desc: (descInput.value || '').trim(),
    checkpoints, evidence,
    law: (lawInput.value || '').trim(), risk: riskSel.value || '중', dept: ''
  });
  selectedCodes.add(code);
  titleInput.value = ''; descInput.value = ''; cpInput.value = ''; eviInput.value = ''; lawInput.value = '';
  refreshChecklistMetaAfterBuilderEdit();
  renderDomainList();
}

export function detectStandards(domainsList){
  const text = domainsList.map(d =>
    (d.ref || '') + ' ' + (d.items || []).map(it => it.law || '').join(' ')
  ).join(' ');
  return CANONICAL_STANDARDS.filter(s => text.includes(s));
}

export function formatStandardsLabel(domainsList, isCustomSource){
  if(isCustomSource){
    const matched = detectStandards(domainsList);
    const base = matched.length === 0
      ? '업로드 체크리스트 기준 (엑셀 내 명시)'
      : matched.slice(0, 4).join(' · ') + (matched.length > 4 ? ' 외 ' + (matched.length - 4) + '종' : '');
    return base + ' · ' + STANDING_COUNCIL_NOTE;
  }
  const matched = detectStandards(domainsList);
  const base = matched.length === 0
    ? 'ISMS-P · 전자금융감독규정'
    : matched.slice(0, 4).join(' · ') + (matched.length > 4 ? ' 외 ' + (matched.length - 4) + '종' : '');
  return base + ' · ' + STANDING_COUNCIL_NOTE;
}

export function updateRefsMeta(){
  const el = document.getElementById('metaRefs');
  if(el) el.textContent = formatStandardsLabel(DOMAINS, DOMAINS !== DEFAULT_DOMAINS);
}

export function riskCounts(dom){
  const c = {"상":0, "중":0, "하":0};
  dom.items.forEach(it => { c[it.risk] = (c[it.risk]||0) + 1; });
  return c;
}

export function isItemExcluded(code, itemNo){
  const ov = contentOverrides[code + '-' + itemNo];
  return !!(ov && ov.excluded);
}

export function setItemExcluded(code, itemNo, excluded){
  const key = code + '-' + itemNo;
  const ov = contentOverrides[key] || {};
  contentOverrides[key] = Object.assign({}, ov, { excluded: excluded });
}

export function riskChipCls(risk){ return risk === '상' ? 'hi' : (risk === '중' ? 'mid' : 'lo'); }

export function renderDipItemHtml(dom, it, selected){
  const excluded = isItemExcluded(dom.code, it.no);
  const risk = (contentOverrides[dom.code + '-' + it.no] || {}).risk || it.risk;
  const title = (contentOverrides[dom.code + '-' + it.no] || {}).title;
  return '<label class="dip-item' + (excluded ? ' excluded' : '') + '">'
    + '<input type="checkbox" class="dip-item-cb" data-code="' + dom.code + '" data-no="' + it.no + '"'
      + (excluded ? '' : ' checked') + (selected ? '' : ' disabled') + '>'
    + '<span class="dip-item-title">' + (title !== undefined ? esc(title) : esc(it.title)) + (excluded ? ' <span class="dip-excluded-badge">제외됨</span>' : '') + '</span>'
    + '<span class="rchip ' + riskChipCls(risk) + '">' + risk + '</span>'
    + '</label>';
}

export function renderDomainItemsPanelHtml(dom){
  const selected = selectedCodes.has(dom.code);
  const included = [], excluded = [];
  dom.items.forEach(it => (isItemExcluded(dom.code, it.no) ? excluded : included).push(it));
  const includedCount = included.length;
  let itemsHtml = '';
  if(included.length > 0){
    itemsHtml += '<div class="dip-group-label dip-group-included">✓ 포함 (' + included.length + ')</div>'
      + '<div class="dip-items">' + included.map(it => renderDipItemHtml(dom, it, selected)).join('') + '</div>';
  }
  if(excluded.length > 0){
    itemsHtml += '<div class="dip-group-label dip-group-excluded">✕ 제외 (' + excluded.length + ')</div>'
      + '<div class="dip-items">' + excluded.map(it => renderDipItemHtml(dom, it, selected)).join('') + '</div>';
  }
  return '<div class="dip-panel' + (selected ? '' : ' disabled') + '" data-code="' + dom.code + '">'
    + '<div class="dip-head">'
      + '<span class="dip-head-label">D-' + dom.code + ' 개별 항목 선택 (' + includedCount + '/' + dom.items.length + '개 포함)'
        + (selected ? '' : '<span class="dip-head-hint">— 이 영역을 먼저 선택해야 제외가 실제로 반영됩니다</span>') + '</span>'
      + '<span class="dip-actions"><button type="button" class="dip-all-btn" data-code="' + dom.code + '">전체 포함</button>'
        + '<button type="button" class="dip-none-btn" data-code="' + dom.code + '">전체 제외</button></span>'
    + '</div>'
    + itemsHtml
    + '</div>';
}

export function renderDomainList(){
  const wrap = document.getElementById('domainList');
  wrap.innerHTML = DOMAINS.map((dom, idx) => {
    const cpCount = dom.items.reduce((s,it) => s + it.checkpoints.length, 0);
    const rc = riskCounts(dom);
    const tone = domainTone(idx); // 내보낸 설문 문서와 동일한 teal/indigo 교차 배색 재사용
    const isExpanded = expandedDomainCodes.has(dom.code);
    const chips = ['상','중','하'].filter(k => rc[k] > 0).map(k => {
      const cls = riskChipCls(k);
      return '<span class="rchip ' + cls + '">' + k + ' ' + rc[k] + '</span>';
    }).join('');
    const cardHtml = '<div class="dcard' + (selectedCodes.has(dom.code) ? ' checked' : '') + '" data-code="' + dom.code + '" data-tone="' + tone + '">'
      + '<div class="drow"><input type="checkbox" data-code="' + dom.code + '"' + (selectedCodes.has(dom.code) ? ' checked' : '') + '>'
      + '<div style="flex:1;">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">'
      + '<span class="dcode">D-' + dom.code + '</span>'
      + '<button type="button" class="dcard-del-btn" data-code="' + dom.code + '" title="이 영역 삭제" style="flex:none;background:none;border:none;color:var(--risk-hi);cursor:pointer;font-size:15px;font-weight:800;line-height:1;padding:0 2px;">✕</button>'
      + '</div>'
      + '<div class="dtitle">' + dom.title + '</div>'
      + (DOMAIN_BRIEF_DESC[dom.code] ? ('<div class="ddesc">' + DOMAIN_BRIEF_DESC[dom.code] + '</div>') : '')
      + '<div class="dmeta">' + dom.items.length + '항목 · ' + cpCount + '체크포인트</div>'
      + '<div class="drisk">' + chips + '</div>'
      + '<button type="button" class="dcard-expand-btn" data-code="' + dom.code + '">' + (isExpanded ? '▲ 접기' : '▼ 항목보기 · 개별 선택') + '</button>'
      + '</div></div></div>';
    return cardHtml + (isExpanded ? renderDomainItemsPanelHtml(dom) : '');
  }).join('');

  wrap.querySelectorAll('.dcard').forEach(card => {
    card.addEventListener('click', (e) => {
      if(e.target.tagName === 'INPUT' || e.target.closest('.dcard-del-btn') || e.target.closest('.dcard-expand-btn')) return;
      const cb = card.querySelector('input');
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    });
  });
  // [v8.05] 도메인 선택 체크박스는 카드(.dcard) 안에만 있으므로 범위를 좁혀서 조회한다 —
  // 펼침 패널(.dip-panel)의 항목별 체크박스(.dip-item-cb)는 카드 밖 형제 요소라 여기 걸리지 않는다.
  wrap.querySelectorAll('.dcard input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const code = cb.dataset.code;
      if(cb.checked) selectedCodes.add(code); else selectedCodes.delete(code);
      cb.closest('.dcard').classList.toggle('checked', cb.checked);
      updateGenSummary();
      if(expandedDomainCodes.has(code)) renderDomainList(); // 펼쳐진 패널의 활성/비활성 상태를 갱신
    });
  });
  wrap.querySelectorAll('.dcard-del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCustomDomain(btn.dataset.code);
    });
  });
  wrap.querySelectorAll('.dcard-expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = btn.dataset.code;
      if(expandedDomainCodes.has(code)) expandedDomainCodes.delete(code); else expandedDomainCodes.add(code);
      renderDomainList();
    });
  });
  wrap.querySelectorAll('.dip-item-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      setItemExcluded(cb.dataset.code, cb.dataset.no, !cb.checked);
      renderDomainList();
      updateGenSummary();
      // [v8.08] 이전에는 여기서 ✏ 문항 직접 편집 패널만 동기화하고 ⑥ "항목별 담당부서·감사역
      // 배정" 표는 갱신하지 않아, 그 표가 이미 화면에 열려 있으면 제외 상태가 반영되지 않은 채로
      // 남아 있는 것처럼 보이는 문제가 있었다. 열려 있을 때만 다시 그리므로 비용도 크지 않다.
      if(typeof renderEditItemList === 'function') renderEditItemList(); // ✏ 문항 직접 편집 패널이 열려 있으면 동기화
      if(typeof renderAssignTable === 'function') renderAssignTable(); // ⑥ 항목별 담당부서·감사역 배정 표도 동기화
    });
  });
  wrap.querySelectorAll('.dip-all-btn, .dip-none-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = btn.dataset.code;
      const dom = DOMAINS.find(d => d.code === code);
      if(!dom) return;
      const exclude = btn.classList.contains('dip-none-btn');
      dom.items.forEach(it => setItemExcluded(code, it.no, exclude));
      renderDomainList();
      updateGenSummary();
      if(typeof renderEditItemList === 'function') renderEditItemList();
      if(typeof renderAssignTable === 'function') renderAssignTable(); // [v8.08] 위와 동일한 이유로 동기화
    });
  });

  // [v8.11] 도메인 목록이 다시 그려질 때마다(제외 토글·도메인 추가/삭제·체크리스트 교체·계획
  // 불러오기 등) 전체 항목 검색 패널도 같은 최신 상태로 동기화한다. renderDomainList()가 이미
  // 모든 관련 변경 지점에서 호출되고 있어, 별도 호출부를 늘리지 않고 이 한 곳에서 챙길 수 있다.
  if(typeof renderDsearchResults === 'function') renderDsearchResults();
}

export function searchAllItems(term){
  const t = (term || '').trim().toLowerCase();
  if(!t) return [];
  const out = [];
  DOMAINS.forEach(dom => {
    dom.items.forEach(it => {
      const ov = contentOverrides[dom.code + '-' + it.no] || {};
      const title = ov.title !== undefined ? ov.title : it.title;
      const desc = ov.desc !== undefined ? ov.desc : it.desc;
      const checkpoints = ov.checkpoints !== undefined ? ov.checkpoints : it.checkpoints;
      const law = ov.law !== undefined ? ov.law : (it.law || '');
      const risk = ov.risk || it.risk;
      const code = dom.code + '-' + it.no;
      const haystack = [code, 'D-' + dom.code, dom.title, title, desc, (checkpoints || []).join(' '), law]
        .join(' ').toLowerCase();
      if(haystack.indexOf(t) !== -1) out.push({ dom: dom, it: it, title: title, risk: risk });
    });
  });
  return out;
}

export function highlightDsearchTerm(text, term){
  if(!term) return text;
  try {
    const re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return text.replace(re, '<mark>$1</mark>');
  } catch(e){ return text; }
}

export function renderDsearchItemHtml(r, term){
  const code = r.dom.code + '-' + r.it.no;
  const excluded = isItemExcluded(r.dom.code, r.it.no);
  const domSelected = selectedCodes.has(r.dom.code);
  return '<label class="dsearch-item' + (excluded ? ' excluded' : '') + '">'
    + '<input type="checkbox" class="dsearch-item-cb" data-code="' + r.dom.code + '" data-no="' + r.it.no + '"'
      + (excluded ? '' : ' checked') + '>'
    + '<span class="dsearch-item-code">' + code + '</span>'
    + '<span class="dsearch-item-title">' + highlightDsearchTerm(esc(r.title), term) + (excluded ? ' <span class="dip-excluded-badge">제외됨</span>' : '') + '</span>'
    + '<span class="dsearch-item-domtitle">D-' + r.dom.code + ' ' + esc(r.dom.title) + '</span>'
    + '<span class="rchip ' + riskChipCls(r.risk) + '">' + r.risk + '</span>'
    + (domSelected ? '' : '<span class="dsearch-unselected-hint">체크 시 영역 자동 선택</span>')
    + '</label>';
}

export function renderDsearchResults(){
  const input = document.getElementById('dsearchInput');
  const resultsWrap = document.getElementById('dsearchResults');
  const metaWrap = document.getElementById('dsearchResultsMeta');
  const clearBtn = document.getElementById('dsearchClearBtn');
  if(!input || !resultsWrap || !metaWrap) return;
  const term = input.value.trim();
  if(clearBtn) clearBtn.style.display = term ? '' : 'none';
  if(!term){
    resultsWrap.innerHTML = '';
    metaWrap.style.display = 'none';
    return;
  }
  const results = searchAllItems(term);
  if(results.length === 0){
    metaWrap.style.display = '';
    metaWrap.innerHTML = '<span>"' + esc(term) + '" 검색 결과가 없습니다.</span>';
    resultsWrap.innerHTML = '';
    return;
  }
  const includedCount = results.filter(r => !isItemExcluded(r.dom.code, r.it.no)).length;
  const excludedCount = results.length - includedCount;
  metaWrap.style.display = '';
  metaWrap.innerHTML = '<span>' + results.length + '개 항목 매칭 · 포함 ' + includedCount + ' / 제외 ' + excludedCount + '</span>'
    + '<span><button type="button" class="gen-small-btn dsearch-bulk-btn" data-mode="include">검색결과 전체 포함</button>'
    + '<button type="button" class="gen-small-btn dsearch-bulk-btn" data-mode="exclude">검색결과 전체 제외</button></span>';
  resultsWrap.innerHTML = results.map(r => renderDsearchItemHtml(r, term)).join('');
  resultsWrap.querySelectorAll('.dsearch-item-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      setItemExcluded(cb.dataset.code, cb.dataset.no, !cb.checked);
      // 도메인을 몰라도 검색으로 바로 찾아 넣는 게 이 패널의 목적이므로, 아직 선택되지 않은
      // 영역의 항목을 포함시키면 그 영역도 함께 자동 선택해 실제로 설문지에 반영되게 한다.
      if(cb.checked) selectedCodes.add(cb.dataset.code);
      renderDomainList(); // 이 안에서 renderDsearchResults()도 다시 호출되어 이 패널도 함께 갱신됨
      updateGenSummary();
      if(typeof renderEditItemList === 'function') renderEditItemList();
      if(typeof renderAssignTable === 'function') renderAssignTable();
    });
  });
  metaWrap.querySelectorAll('.dsearch-bulk-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const exclude = btn.dataset.mode === 'exclude';
      const currentResults = searchAllItems(document.getElementById('dsearchInput').value.trim());
      currentResults.forEach(r => {
        setItemExcluded(r.dom.code, r.it.no, exclude);
        if(!exclude) selectedCodes.add(r.dom.code);
      });
      renderDomainList();
      updateGenSummary();
      if(typeof renderEditItemList === 'function') renderEditItemList();
      if(typeof renderAssignTable === 'function') renderAssignTable();
    });
  });
}

export function renderDomainAuditorAssign(){
  // [v8.62] 설문지 생성 후에도 배정 감사자를 언제든지 변경할 수 있음
  const wrap = document.getElementById('domainAuditorAssignWrap');
  if(!wrap) return;
  const selected = DOMAINS.filter(d => selectedCodes.has(d.code));
  if(selected.length === 0){
    wrap.innerHTML = '<div class="assign-empty">③에서 감사 영역을 선택하면 표시됩니다.</div>';
    return;
  }
  // 더 이상 선택되지 않은 도메인의 배정은 정리
  Object.keys(domainAuditorMap).forEach(code => { if(!selectedCodes.has(code)) delete domainAuditorMap[code]; });
  wrap.innerHTML = '<div style="font-size:11px;color:var(--ink-soft);margin-bottom:8px;"><b>🔧 배정 감사자 수정</b> — 설문지 생성 후에도 여기서 언제든지 변경 가능합니다. 한 영역에 여러 명을 함께 배정하려면 <b>쉼표(,)로 구분</b>해서 입력하세요. (예: 김감사, 이감사)</div>'
    + '<table class="assign-tbl"><tr><th style="width:200px;">영역</th><th>담당 감사자 (쉼표로 여러 명 가능)</th></tr>'
    + selected.map(d =>
        '<tr><td>D-' + d.code + ' ' + esc(d.title) + '</td>'
        + '<td><input type="text" class="domain-auditor-input" data-domain="' + d.code + '" list="knownAuditorDatalist" placeholder="담당 감사자 성명 (쉼표로 여러 명)" value="' + esc(domainAuditorMap[d.code]||'') + '" style="width:260px;border:1px solid #c7c1b1;background:#fffdf8;font-family:inherit;font-size:12px;padding:5px 8px;border-radius:5px;"></td></tr>'
      ).join('')
    + '</table>';
  wrap.querySelectorAll('.domain-auditor-input').forEach(el => {
    el.addEventListener('input', () => { domainAuditorMap[el.dataset.domain] = el.value; });
    el.addEventListener('change', () => {
      // 쉼표로 구분된 각 이름을 개별적으로 "알려진 감사자" 목록에 등록해, 다른 입력칸의 자동완성에도 뜨도록 함.
      el.value.split(',').map(n => n.trim()).filter(Boolean).forEach(addKnownAuditor);
      // 항목별 담당 감사역 드롭다운의 후보 목록도 최신 배정으로 갱신한다.
      if(typeof renderAssignTable === 'function') renderAssignTable();
    });
  });
}

export function renderDomainDeptDefaultAssign(){
  const wrap = document.getElementById('domainDeptDefaultWrap');
  if(!wrap) return;
  const selected = DOMAINS.filter(d => selectedCodes.has(d.code));
  if(selected.length === 0){
    wrap.innerHTML = '<div class="assign-empty">③에서 감사 영역을 선택하면 표시됩니다.</div>';
    return;
  }
  Object.keys(domainDeptDefaultMap).forEach(code => { if(!selectedCodes.has(code)) delete domainDeptDefaultMap[code]; });
  wrap.innerHTML = '<table class="assign-tbl"><tr><th style="width:200px;">영역</th><th>기본 담당부서</th></tr>'
    + selected.map(d =>
        '<tr><td>D-' + d.code + ' ' + esc(d.title) + '</td>'
        + '<td><select class="domain-dept-default-select" data-domain="' + d.code + '" style="width:220px;">' + deptSelectOptionsHtml(domainDeptDefaultMap[d.code]||'') + '</select></td></tr>'
      ).join('')
    + '</table>';
  wrap.querySelectorAll('.domain-dept-default-select').forEach(sel => {
    sel.addEventListener('change', () => {
      if(sel.value === '__custom__'){
        const v = (prompt('부서명을 직접 입력해 주세요.') || '').trim();
        if(v){
          if(!auditDeptList.includes(v)) auditDeptList.push(v);
          renderAuditDeptChips();
          domainDeptDefaultMap[sel.dataset.domain] = v;
          const opts = deptSelectOptionsHtml(v);
          sel.innerHTML = opts;
        } else {
          sel.value = domainDeptDefaultMap[sel.dataset.domain] || '';
        }
      } else {
        domainDeptDefaultMap[sel.dataset.domain] = sel.value;
      }
    });
  });
}

export function getSuggestedDept(domCode, itemNo){
  const dom = DOMAINS.find(d => d.code === domCode);
  const item = dom ? dom.items.find(it => it.no === itemNo) : null;
  if(item && item.dept){
    // 체크리스트 원본 데이터의 "공통"이라는 짧은 표기를, 드롭다운의 표준 라벨(COMMON_DEPT_LABEL)로 맞춰준다.
    return item.dept === '공통' ? COMMON_DEPT_LABEL : item.dept;
  }
  if(domainDeptDefaultMap[domCode]) return domainDeptDefaultMap[domCode];
  return document.getElementById('genDept').value.trim() || '수검부서';
}

export function updateGenSummary(){
  const summaryEl = document.getElementById('genSummary');
  const btn = document.getElementById('generateBtn');
  const splitBtn = document.getElementById('generateSplitBtn');
  if(selectedCodes.size === 0){
    summaryEl.innerHTML = '선택된 영역이 없습니다.';
    btn.disabled = true;
    splitBtn.disabled = true;
    renderAssignTable();
    renderEditItemList();
    renderDomainAuditorAssign();
    renderDomainDeptDefaultAssign();
    renderGroundsSuggestions([]);
    return;
  }
  const selected = DOMAINS.filter(d => selectedCodes.has(d.code));
  const selectedApplied = applyOverrides(selected);
  const totalItems = selectedApplied.reduce((s,d) => s + d.items.length, 0);
  const totalCp = selectedApplied.reduce((s,d) => s + d.items.reduce((a,it) => a + it.checkpoints.length, 0), 0);
  const excludedCount = selected.reduce((s,d) => s + d.items.filter(it => {
    const ov = contentOverrides[d.code + '-' + it.no];
    return ov && ov.excluded;
  }).length, 0);
  const names = selected.map(d => 'D-' + d.code).join(', ');
  summaryEl.innerHTML = '선택 영역: <b>' + selected.length + '개</b> (' + names + ')<br>'
    + '총 항목: <b>' + totalItems + '개</b> · 총 체크포인트: <b>' + totalCp + '개</b>'
    + (excludedCount ? ' · <span style="color:var(--risk-hi);">제외됨 ' + excludedCount + '개</span>' : '');
  btn.disabled = false;
  splitBtn.disabled = false;
  renderAssignTable();
  renderEditItemList();
  renderDomainAuditorAssign();
  renderDomainDeptDefaultAssign();
  renderAuditNameSuggestion(selected);
  renderGroundsSuggestions(selected);
}

export function resolveItemDeptForAttach(domCode, itemNo, genDeptVal){
  const key = domCode + '-' + itemNo;
  if(itemDeptMap[key] !== undefined){
    const arr = deptToArray(itemDeptMap[key]);
    if(arr.length > 0) return arr;
  }
  const dom = DOMAINS.find(d => d.code === domCode);
  const item = dom ? dom.items.find(it => it.no === itemNo) : null;
  if(item && item.dept) return [item.dept === '공통' ? COMMON_DEPT_LABEL : item.dept];
  if(domainDeptDefaultMap[domCode]) return [domainDeptDefaultMap[domCode]];
  return genDeptVal ? [genDeptVal] : [];
}

export function itemDeptScopeBadgeHtml(code){
  const info = itemDeptAssignmentLabel(code);
  if(!info.label) return '';
  return info.isCommon
    ? '<span class="dept-scope-badge common" title="여러 부서가 공통으로 응답하는 항목입니다">🤝 공통</span>'
    : '<span class="dept-scope-badge specific" title="' + esc(info.label) + ' 전용 항목입니다">🏢 ' + esc(info.label) + '</span>';
}

export function getDomainAttachDeptLabel(dom, genDeptVal){
  const realDepts = new Set();
  let hasCommon = false, anyMulti = false, itemCount = 0;
  dom.items.forEach(it => {
    const ov = contentOverrides[dom.code + '-' + it.no];
    if(ov && ov.excluded) return;
    itemCount++;
    const arr = resolveItemDeptForAttach(dom.code, it.no, genDeptVal);
    if(arr.length > 1) anyMulti = true;
    arr.forEach(d => {
      if(d === COMMON_DEPT_LABEL) hasCommon = true;
      else if(d && d.trim()) realDepts.add(d);
    });
  });
  if(itemCount === 0 || (realDepts.size === 0 && !hasCommon)) return genDeptVal || '(작성부서 미지정)';
  if(hasCommon || anyMulti || realDepts.size > 1) return '공통작성';
  return Array.from(realDepts)[0];
}

export function buildGroundsSuggestions(selectedDoms){
  return selectedDoms
    .filter(d => DOMAIN_GROUNDS_BANK[d.code])
    .map(d => ({code: d.code, title: d.title, reasons: DOMAIN_GROUNDS_BANK[d.code]}));
}

export function appendGroundsSuggestion(text){
  const el = document.getElementById('auditGroundsInput');
  if(!el) return;
  const cur = el.value.trim();
  if(cur.includes(text)) return; // 이미 포함되어 있으면 중복 추가하지 않음
  // [v7.41] 여러 개를 고르면 " / "로 한 줄에 죽 이어붙던 것을, "- "로 시작하는 별도 줄로 바꿨다.
  // 사유가 늘어날수록 한 줄이 옆으로 계속 길어지는 대신, 항목별로 줄이 나뉘어 읽기 편하다.
  el.value = cur ? (cur + '\n- ' + text) : ('- ' + text);
  el.dispatchEvent(new Event('input', {bubbles:true}));
  renderGroundsSuggestions(DOMAINS.filter(d => selectedCodes.has(d.code)));
}

export function renderGroundsSuggestions(selectedDoms){
  const box = document.getElementById('groundsSuggestBox');
  if(!box) return;
  const groups = buildGroundsSuggestions(selectedDoms);
  if(groups.length === 0){
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  const curVal = (document.getElementById('auditGroundsInput') || {}).value || '';
  const allReasons = [];
  const domainsHtml = groups.map(g => {
    const chips = g.reasons.map(r => {
      allReasons.push(r.text);
      const added = curVal.includes(r.text);
      return '<button type="button" class="gsb-chip' + (added ? ' added' : '') + '" data-text="' + r.text.replace(/"/g,'&quot;') + '"' + (added ? ' disabled' : '') + '>'
        + '<span class="gsb-tag">' + esc(r.tag) + '</span><span>' + (added ? '✓ 추가됨 — ' : '') + esc(r.text) + '</span></button>';
    }).join('');
    return '<div class="gsb-domain"><div class="gsb-dtitle">D-' + g.code + ' ' + g.title + '</div><div class="gsb-chip-row">' + chips + '</div></div>';
  }).join('');
  const allAdded = allReasons.every(t => curVal.includes(t));
  box.innerHTML = '<div class="gsb-head"><span class="gsb-label">💡 선택한 영역별 실시 사유 추천 — 클릭하면 위 입력란에 추가됩니다</span>'
    + '<button type="button" class="gsb-addall-btn" id="gsbAddAllBtn"' + (allAdded ? ' disabled' : '') + '>전체 추가</button></div>'
    + '<div class="gsb-warn">⚠ 아래 문구는 통상적으로 이 영역을 감사 대상으로 삼는 근거 유형(정기점검·사고이력·제도변화·후속조치)의 예시입니다. 실제 근거(리스크평가 결과, 실제 사고 이력, 전년도 지적사항 등)에 맞게 반드시 확인·수정한 뒤 사용하십시오.</div>'
    + domainsHtml;
  box.style.display = 'block';
  box.querySelectorAll('.gsb-chip[data-text]').forEach(btn => {
    btn.addEventListener('click', () => appendGroundsSuggestion(btn.dataset.text));
  });
  const addAllBtn = document.getElementById('gsbAddAllBtn');
  if(addAllBtn) addAllBtn.addEventListener('click', () => {
    const el = document.getElementById('auditGroundsInput');
    const toAdd = allReasons.filter(t => !el.value.includes(t));
    if(toAdd.length === 0) return;
    const cur = el.value.trim();
    el.value = cur ? (cur + '\n- ' + toAdd.join('\n- ')) : ('- ' + toAdd.join('\n- '));
    el.dispatchEvent(new Event('input', {bubbles:true}));
    renderGroundsSuggestions(DOMAINS.filter(d => selectedCodes.has(d.code)));
  });
}

export function domainNameSummary(domains, max){
  const names = domains.map(d => d.title);
  if(names.length <= max) return names.join(', ');
  return names.slice(0, max).join(', ') + ' 등';
}

export function renderItem(domainCode, item, scale){
  const no = item.no;
  const code = domainCode + '-' + no;
  const risk = item.risk;
  const law = (item.law || '').replace(/\n/g, ' / ');
  const rows = item.checkpoints.map((cp, i) => {
    const idx = i + 1;
    const name = 'chk-' + domainCode + '-' + no + '-' + idx;
    const opts = scale.map(o =>
      '<td class="opt"><input type="radio" class="resp" name="' + name + '" value="' + o.value.replace(/"/g,'&quot;') + '" data-tier="' + o.tier + '" '
      + 'data-domain="' + domainCode + '" data-code="' + code + '" data-risk="' + risk + '"></td>'
    ).join('');
    const label = circledNum(i) + ' ' + cp;
    const displayLabel = '<span class="cp-row-num">' + (i+1) + '</span> ' + esc(cp);
    return '<tr class="cp-row" data-cptext="' + label.replace(/"/g,'&quot;') + '">'
      + '<td class="q">' + displayLabel + '</td>' + opts + '</tr>';
  }).join('');
  const evidenceHtml = (item.evidence || []).map((e, i) =>
    '<div class="evi-item">'
    + '<label><input type="checkbox" class="evi-box" data-evi-idx="' + (i+1) + '" data-evi-name="' + e.replace(/"/g,'&quot;') + '"> ' + esc(e) + '</label>'
    + '<div class="evi-filename-hint" style="display:none;"></div>'
    + '</div>'
  ).join('') + '<div class="evi-item evi-custom-item"><label style="display:block;color:var(--ink-soft);font-size:11px;margin-bottom:3px;">📎 목록에 없는 자료명, 또는 위 "확인하려는 것"에 대한 설명을 자유롭게 적어주세요 — 파일명·자료가 있는 위치·구두 설명 등 무엇이든 좋습니다</label>'
    + '<textarea class="evi-custom-input" rows="2" placeholder="예1) 202X년 A 시스템 접근권한 현황표.xlsx&#10;예2) 별도 문서 없이 팀 내 구두 공유로 운영 중이며, 필요 시 팀장 인터뷰로 확인 가능합니다" oninput="autoGrowTextarea(this); syncItemFootHeight(this.closest(&quot;.item&quot;))" style="width:100%;border:1px solid #c7c1b1;background:#fffdf8;font-family:inherit;font-size:12px;padding:6px 8px;box-sizing:border-box;resize:vertical;line-height:1.5;"></textarea></div>';
  const srName = 'sr-' + code;
  const ownName = 'own-' + code;
  const famName = 'fam-' + code;
  const scaleHeaders = scale.map(o => '<th>' + o.value + '</th>').join('');
  const lawHtml = law ? '<div class="law-note">관련 법령·기준: ' + esc(law) + '</div>' : '';
  const isMaturityScale = scale.length === 5 && scale.some(o => o.value.indexOf('매우') !== -1);
  const cpHeaderText = isMaturityScale
    ? '<span class="item-step-num">③</span> 세부 체크포인트 — 각 항목이 실제로 얼마나 잘 이행되고 있는지 수준을 평가해 응답해 주십시오 (완전히 이행되어 있으면 "매우 잘함", 전혀 이행되지 않았으면 "매우 미흡")'
    : '<span class="item-step-num">③</span> 세부 체크포인트 — 실제 이행 현황을 응답해 주십시오';

  return '\n    <div class="item" data-code="' + code + '" data-domain="' + domainCode + '" data-risk="' + risk + '" data-title="' + item.title.replace(/"/g,'&quot;') + '" data-law="' + law.replace(/"/g,'&quot;') + '">'
    + '<div class="item-head"><div class="item-no">' + code + '</div>'
    + '<div class="item-title-wrap"><div class="item-title">' + esc(item.title) + '</div>'
    + '<div class="item-desc">' + esc(item.desc) + '</div>' + lawHtml + '</div>'
    + '<div class="item-tags">' + riskTag(risk) + deptTagHtml(code) + '</div></div>'

    + '<div class="owner-check"><label><span class="item-step-num">①</span> 이 업무가 귀 부서의 담당 업무입니까?</label>'
    + '<div class="owner-options">'
    + '<label class="owner-opt"><input type="radio" class="owner-radio" name="' + ownName + '" value="우리 부서 담당"> 우리 부서 담당 업무입니다</label>'
    + '<label class="owner-opt"><input type="radio" class="owner-radio" name="' + ownName + '" value="공동 담당"> 타 부서와 공동으로 담당합니다</label>'
    + '<label class="owner-opt"><input type="radio" class="owner-radio" name="' + ownName + '" value="타 부서 담당"> 타 부서 담당 업무입니다</label>'
    + '<input type="text" class="owner-dept-input" placeholder="필수 — 담당 부서명을 입력해야 완료로 처리됩니다">'
    + '</div>'
    + '<div class="owner-warn-note">⚠ "타 부서 담당"을 선택하면 아래 ②숙지도·③세부 체크포인트 작성이 <b>생략</b>되는 대신, 위 입력칸에 <b>실제 담당 부서명을 반드시 입력해야</b> 이 항목이 "작성완료"로 처리됩니다(입력 전까지는 계속 "작성중"으로 남습니다). 실제로는 귀 부서 업무인데도 사실과 다르게 "타 부서 담당"으로 표시하는 경우, <b>감사방해 행위</b>로 간주되어 경위서 작성이나 감사 중단 조치의 사유가 될 수 있습니다. 신중하게 선택해 주십시오.</div>'
    + '<div class="owner-person-row"><span class="opr-label">👤 실제 담당자</span>'
    + '<input type="text" class="owner-person-input" placeholder="담당자 성명·직책 (예: 홍길동 과장 — 여러 명은 쉼표로 구분: 홍길동 과장, 김철수 대리)">'
    + '<span class="opr-sub">이 항목을 본인이 아닌 다른 분(작성자 대신 답변을 챙겨주신 분)이 실제로 담당하고 계시면, 인터뷰 시 연락드릴 수 있도록 성명을 적어주세요.</span>'
    + '</div></div>'

    + '<div class="fam-check"><label><span class="item-step-num">②</span> 귀 부서 담당 업무라면, 이 항목의 현황을 얼마나 알고 계십니까?</label>'
    + '<div class="fam-options">'
    + '<label class="fam-opt high"><input type="radio" class="fam-radio" name="' + famName + '" value="잘 알고 있음"> 잘 알고 있음</label>'
    + '<label class="fam-opt mid"><input type="radio" class="fam-radio" name="' + famName + '" value="부분적으로 알고 있음"> 부분적으로 알고 있음</label>'
    + '<label class="fam-opt low"><input type="radio" class="fam-radio" name="' + famName + '" value="잘 모름"> 잘 모름 (업무 담당자 확인 필요)</label>'
    + '</div></div>'

    + '<div class="cp-skip-notice">🚫 "타 부서 담당"으로 응답하셨으므로 아래 세부 체크포인트 작성을 생략합니다. 담당 부서명만 입력하시고 다음 항목으로 진행해 주십시오.</div>'
    + '<table class="check-tbl"><tr><th style="text-align:left;width:auto;">' + cpHeaderText + '</th>' + scaleHeaders + '</tr>' + rows + '</table>'
    + '<div class="item-foot"><div class="cell"><label>제출 가능 증빙자료 — 위 점검 내용을 확인·입증할 수 있는 자료라면 목록에 없어도 자유롭게 추가해 주세요</label>'
    + (item.desc ? '<div class="evi-purpose-hint">🎯 이 항목에서 감사팀이 확인하려는 것: ' + esc(item.desc) + ' — 아래 목록은 참고용 예시이며, 이를 입증할 수 있는 자료라면 형식에 관계없이 자유롭게 적어 주십시오.</div>' : '')
    + '<div class="evi-list">' + evidenceHtml + '</div></div>'
    + '<div class="cell"><label>비고 — 응답이 "아니오"·"부분"인 경우 그 사유를, 또는 향후 보완 계획이 있다면 함께 적어주세요</label>'
    + '<textarea class="note-input" rows="3" placeholder="예) 정책 문서 초안은 마련되었으나 아직 최종 결재 전 단계이며, 8월 중 결재 완료 예정입니다" oninput="autoGrowTextarea(this); syncItemFootHeight(this.closest(&quot;.item&quot;))"></textarea></div></div>'
    + '<div class="self-rating"><label><span class="item-step-num">④</span> 담당자 자체평가 — 이 항목의 통제가 실제로 잘 이행되고 있다고 생각하십니까?</label>'
    + '<div class="sr-options">'
    + '<label class="sr-opt good"><input type="radio" class="sr-radio" name="' + srName + '" value="잘함"> 잘하고 있음</label>'
    + '<label class="sr-opt mid"><input type="radio" class="sr-radio" name="' + srName + '" value="보통"> 보통</label>'
    + '<label class="sr-opt poor"><input type="radio" class="sr-radio" name="' + srName + '" value="미흡"> 미흡 (개선 필요)</label>'
    + '</div><textarea class="sr-note" rows="2" placeholder="평가 근거를 적어주세요. 예) \'잘하고 있음\' → 구체적 증빙·운영 사례 / \'미흡\' → 원인 및 개선 계획" oninput="autoGrowTextarea(this)"></textarea></div></div>';
}

export function domainTone(index){
  return index % 2 === 0 ? 'teal' : 'indigo';
}

export function renderDomain(dom, toneIdx, scale){
  const itemsHtml = dom.items.map(it => renderItem(dom.code, it, scale)).join('');
  const cpCount = dom.items.reduce((s,it) => s + it.checkpoints.length, 0);
  return '\n  <div class="domain" data-tone="' + domainTone(toneIdx) + '" data-domain="' + dom.code + '">'
    + '<div class="domain-head"><div class="domain-num">' + dom.code + '</div>'
    + '<div><h2>' + dom.title + '</h2><div class="ref">준거기준 : ' + dom.ref + '</div></div></div>'
    + itemsHtml
    + '<div class="domain-subtotal">DOMAIN ' + dom.code + ' SUBTOTAL — ' + dom.items.length + ' ITEMS / ' + cpCount + ' CHECKPOINTS &nbsp;·&nbsp; 응답완료 <span id="dom-' + dom.code + '-answered">0</span>/' + cpCount + '</div></div>';
}

export function applyOverrides(domainsSubset){
  return domainsSubset.map(dom => ({
    ...dom,
    items: dom.items.filter(it => {
      const ov = contentOverrides[dom.code + '-' + it.no];
      return !(ov && ov.excluded);
    }).map(it => {
      const key = dom.code + '-' + it.no;
      const ov = contentOverrides[key];
      if(!ov) return it;
      return {
        ...it,
        title: (ov.title || '').trim() || it.title,
        desc: (ov.desc || '').trim() || it.desc,
        risk: ov.risk || it.risk,
        law: (ov.law !== undefined) ? ov.law : it.law,
        checkpoints: (ov.checkpoints && ov.checkpoints.length) ? ov.checkpoints : it.checkpoints,
        evidence: (ov.evidence !== undefined) ? ov.evidence : it.evidence,
      };
    })
  }));
}

export function buildSurveyHtml(domainsSubset, deptLabel, customTitle, opts){
  opts = opts || {};
  domainsSubset = applyOverrides(domainsSubset);
  const scale = getCurrentScale();
  const totalItems = domainsSubset.reduce((s,d) => s + d.items.length, 0);
  const totalCp = domainsSubset.reduce((s,d) => s + d.items.reduce((a,it) => a + it.checkpoints.length, 0), 0);
  const domainsHtml = domainsSubset.map((d,i) => renderDomain(d, i, scale)).join('');
  const domainNames = domainsSubset.map(d => 'D-' + d.code + ' ' + d.title).join(' · ');
  const metaDomain = domainsSubset.map(d => 'D-' + d.code).join('·');

  const auditNameEl = document.getElementById('auditNameInput');
  const auditPurposeEl = document.getElementById('auditPurposeInput');
  const auditName = auditNameEl ? auditNameEl.value.trim() : '';
  const auditPurpose = auditPurposeEl ? auditPurposeEl.value.trim() : '';
  const auditContext = auditName
    ? ('<div style="margin-top:10px;font-size:12px;color:#cdd9ea;">📋 <b style="color:#f4efe2;">' + esc(auditName) + '</b>' + (auditPurpose ? ' — ' + esc(auditPurpose) : '') + '</div>')
    : '';

  const dueDateEl = document.getElementById('genDueDate');
  const dueDateVal = dueDateEl ? dueDateEl.value : '';
  const dueDateDisplay = dueDateVal || '(감사자 미지정 — 배포 시 별도 안내)';
  const dueDateNotice = dueDateVal
    ? ('<b>' + dueDateVal + '</b>까지')
    : '안내드리는 기한까지';

  const h1line2 = customTitle || (domainsSubset.length === 1 ? domainsSubset[0].title : (domainsSubset.length + '개 영역 통합 설문'));
  const pageTitle = 'IT감사 사전 설문지 | ' + deptLabel + ' (' + h1line2 + ')' + (opts.isShared ? ' [공통]' : '');
  const subIntro = deptLabel + ' 자체 점검을 위한 설문지입니다 (' + domainNames + '). 문항을 체크하시면 하단에 응답 통계가 자동으로 집계됩니다.';
  const infoBullet1 = '본 설문은 <b>' + deptLabel + '</b>이(가) 수행하는 <b>' + domainNames + '</b> 영역에 대한 사전 자가점검용입니다.';
  const infoBullet6 = '작성 완료 후 화면 하단 <b>[결과 CSV 다운로드]</b> 또는 <b>[결과 JSON 다운로드]</b> 버튼으로 응답 데이터를 저장해 ' + dueDateNotice + ' IT책임감사역에게 회신 바랍니다. (두 형식 모두 감사역 시스템에 업로드하여 취합할 수 있습니다)';
  const infoBullet7 = '<b>작성 중 이어서 하기:</b> 이 창을 실수로 닫거나 F5로 새로고침해도, 이 브라우저에서는 입력하신 내용이 자동으로 저장되어 있어 다시 열면 이어서 작성할 수 있습니다 — 별도 저장 조작이 필요 없습니다. 다만 다른 PC·다른 브라우저로 옮기거나 브라우저 데이터가 초기화된 경우에는 자동저장이 남아있지 않으니, 이럴 때는 중간에 한 번 <b>[결과 JSON 다운로드]</b>로 파일을 받아두시고, 나중에 이 설문지 화면 상단의 <b>[📥 저장한 JSON 불러와 이어작성]</b> 버튼으로 그 파일을 불러오면 그 시점까지의 응답이 그대로 복원됩니다.';
  const footerLabel = 'IT감사 사전 설문지 · ' + deptLabel + ' (' + domainNames + ') · 생성 시스템: IT감사 라이프사이클 플랫폼 v' + SYSTEM_VERSION;

  const sharedBanner = opts.isShared
    ? ('<div style="margin-top:14px;padding:10px 14px;border:1.5px dashed #e4c78a;border-radius:8px;background:rgba(228,199,138,.12);font-size:12.5px;color:#4a3a12;">'
       + '🔗 <b>공통(복수 부서 공동 담당) 항목 설문지입니다.</b> '
       + (opts.otherDepts && opts.otherDepts.length ? esc(opts.otherDepts.join(', ')) + '에도 동일한 항목의 설문지가 별도로 배포되어, 각 부서가 독립적으로 응답합니다. ' : '')
       + '상단 <b>수검부서</b>란에 본 설문지를 실제로 작성하는 <b>귀 부서명(' + esc(deptLabel) + ')</b>을 반드시 그대로 유지해 주십시오 — 다른 값으로 바꾸면 취합 시 응답이 다른 부서의 응답과 뒤섞이거나 서로 덮어쓸 수 있습니다.'
       + '</div>')
    : '';

  let out = SURVEY_TEMPLATE;
  const repl = {
    '__PAGE_TITLE__': pageTitle,
    '__H1_LINE1__': 'IT감사 사전 설문지',
    '__H1_LINE2__': deptLabel + ' · ' + h1line2 + (opts.isShared ? ' (공통)' : ''),
    '__SUB_INTRO__': subIntro,
    '__META_DOMAIN__': metaDomain,
    '__META_REFS__': formatStandardsLabel(domainsSubset, DOMAINS !== DEFAULT_DOMAINS),
    '__TOTAL_ITEMS__': String(totalItems),
    '__TOTAL_CP__': String(totalCp),
    '__INFO_BULLET1__': infoBullet1,
    '__INFO_BULLET6__': infoBullet6,
    '__INFO_BULLET7__': infoBullet7,
    '__DUE_DATE_DISPLAY__': esc(dueDateDisplay),
    '__DUE_DATE_VALUE__': esc(dueDateVal),
    '__SCALE_HINT__': scale.map(o => o.value).join(' / '),
    '__SYSTEM_VERSION_SUFFIX__': '_v' + SYSTEM_VERSION,
    '__DEPT_PLACEHOLDER__': '예) ' + deptLabel,
    '__DEPT_PREFILL__': esc(deptLabel),
    '__SHARED_BANNER__': sharedBanner,
    '__AUDIT_CONTEXT__': auditContext,
    '__DOMAINS_HTML__': domainsHtml,
    '__FOOTER_LABEL__': footerLabel,
  };
  Object.keys(repl).forEach(k => { out = out.split(k).join(repl[k]); });
  return out;
}

export function generateSurvey(){
  if(selectedCodes.size === 0) return;
  // [v8.10] 엑셀 업로드 순서·영역 직접추가(끝에 덧붙여짐)·복원함에서 되살린 순서 등에 따라
  // DOMAINS 배열 자체의 순서가 코드 오름차순과 어긋날 수 있어, 실제로 설문지에 항목이 뒤죽박죽
  // 순서로 나온다는 지적이 있었다. 설문지에 실제로 들어가는 순간에는 항상 도메인 코드
  // 오름차순(1~25)으로 강제 정렬해, 화면 어디서 어떤 순서로 선택했든 결과물은 항상 정돈되게 한다.
  const selected = DOMAINS.filter(d => selectedCodes.has(d.code))
    .slice().sort((a,b) => parseInt(a.code,10) - parseInt(b.code,10));
  const dept = document.getElementById('genDept').value.trim() || '수검부서';
  const customTitle = document.getElementById('genTitle').value.trim();
  const html = buildSurveyHtml(selected, dept, customTitle);
  const codesLabel = selected.map(d => d.code).join('-');
  const itemCount = selected.reduce((s,d) => s + d.items.length, 0);
  downloadHtml(html, 'IT감사_사전설문지_' + dept + '_D' + codesLabel + '(' + itemCount + '문항)' + versionSuffix() + '.html');
}

export function computeSplitSurveyOutputs(){
  if(selectedCodes.size === 0) return [];
  // [v8.10] 위 generateSurvey()와 동일한 이유로, 부서별 분리 생성 결과물 안의 영역 순서도
  // 코드 오름차순으로 고정한다.
  const selected = DOMAINS.filter(d => selectedCodes.has(d.code))
    .slice().sort((a,b) => parseInt(a.code,10) - parseInt(b.code,10));
  const defaultDept = document.getElementById('genDept').value.trim() || '수검부서';

  const byDept = {};
  const sharedItems = {};

  selected.forEach(dom => {
    dom.items.forEach(it => {
      const key = dom.code + '-' + it.no;
      let arr = deptToArray(itemDeptMap[key]);
      if(arr.length === 0) arr = [defaultDept];
      const hasCommon = arr.includes(COMMON_DEPT_LABEL);
      const realDepts = arr.filter(d => d !== COMMON_DEPT_LABEL && d.trim());

      if(hasCommon){
        if(!sharedItems[dom.code]) sharedItems[dom.code] = { ...dom, items: [] };
        sharedItems[dom.code].items.push(it);
      }
      realDepts.forEach(dept => {
        if(!byDept[dept]) byDept[dept] = {};
        if(!byDept[dept][dom.code]) byDept[dept][dom.code] = { ...dom, items: [] };
        byDept[dept][dom.code].items.push(it);
      });
      if(!hasCommon && realDepts.length === 0){
        if(!byDept[defaultDept]) byDept[defaultDept] = {};
        if(!byDept[defaultDept][dom.code]) byDept[defaultDept][dom.code] = { ...dom, items: [] };
        byDept[defaultDept][dom.code].items.push(it);
      }
    });
  });

  const realDeptKeys = Object.keys(byDept);
  const hasSharedContent = Object.keys(sharedItems).length > 0;
  if(realDeptKeys.length === 0 && !hasSharedContent) return [];

  const outputs = [];
  realDeptKeys.forEach(dept => {
    outputs.push({dept, domainsSubset: Object.values(byDept[dept]), isShared:false, otherDepts:[]});
  });
  if(hasSharedContent){
    const sharedDomainsSubset = Object.values(sharedItems);
    const targets = realDeptKeys.length > 0 ? realDeptKeys : [defaultDept];
    targets.forEach(realDept => {
      outputs.push({
        dept: realDept,
        domainsSubset: sharedDomainsSubset,
        isShared: true,
        otherDepts: targets.filter(d => d !== realDept)
      });
    });
  }
  outputs.forEach(out => {
    out.codesLabel = out.domainsSubset.map(d => d.code).join('-');
    out.tag = out.isShared ? '_공통' : '';
    out.itemCount = out.domainsSubset.reduce((s,d) => s + d.items.length, 0);
    out.filename = 'IT감사_사전설문지_' + out.dept + out.tag + '_D' + out.codesLabel + '(' + out.itemCount + '문항)' + versionSuffix() + '.html';
  });
  return outputs;
}

export function generateSplitByDept(){
  const outputs = computeSplitSurveyOutputs();
  outputs.forEach((out, i) => {
    const html = buildSurveyHtml(out.domainsSubset, out.dept, null, {isShared: out.isShared, otherDepts: out.otherDepts});
    setTimeout(() => {
      downloadHtml(html, out.filename);
    }, i * 350);
  });
}

export function domainAuditorCandidates(domCode){
  return String(domainAuditorMap[domCode] || '').split(',').map(s => s.trim()).filter(Boolean);
}

export function renderAssignTable(){
  const wrap = document.getElementById('assignWrap');
  const tblWrap = document.getElementById('assignTableWrap');
  if(selectedCodes.size === 0){
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  const defaultDept = document.getElementById('genDept').value.trim() || '수검부서';
  const selected = DOMAINS.filter(d => selectedCodes.has(d.code));
  const excludedTotal = selected.reduce((s,d) => s + d.items.filter(it => isItemExcluded(d.code, it.no)).length, 0);

  let rows = '<tr><th style="width:1%;"></th><th>영역</th><th>항목코드</th><th>항목명</th><th>위험도</th><th>담당부서</th><th>담당 감사역</th><th style="width:1%;"></th></tr>';
  selected.forEach(dom => {
    const auditorCandidates = domainAuditorCandidates(dom.code);
    dom.items.forEach(it => {
      const key = dom.code + '-' + it.no;
      // [v8.09] 제외 항목 표시를 간결하게 정리 — 예전에는 행마다 긴 안내 문장을 통째로 반복해
      // 표가 지저분해 보인다는 지적을 반영했다. 작은 "제외됨" 배지만 남기고, 안내 문구는
      // 아래 표 위쪽에 (제외 항목이 있을 때만) 한 번만 보여준다.
      // [v8.28] "이 화면에서도 포함/제외를 바로 고르고 싶다"는 요청에 따라, ③ 영역 선택의 개별
      // 항목 체크박스(dip-item-cb)와 완전히 같은 저장소(isItemExcluded/setItemExcluded, 즉
      // contentOverrides[key].excluded)를 공유하는 체크박스를 이 표 맨 앞 칸에도 추가한다.
      // 어느 화면에서 체크를 바꾸든 다른 화면도 즉시 같은 상태로 보이게 된다.
      if(isItemExcluded(dom.code, it.no)){
        rows += '<tr class="assign-row-excluded"><td><input type="checkbox" class="assign-item-cb" data-code="' + dom.code + '" data-no="' + it.no + '"></td><td class="mono">D-' + dom.code + '</td><td class="mono">' + key + '</td>'
          + '<td>' + esc(it.title) + ' <span class="dip-excluded-badge">제외됨</span></td>'
          + '<td>' + it.risk + '</td>'
          + '<td colspan="2">—</td>'
          + '<td></td></tr>';
        return;
      }
      if(itemDeptMap[key] === undefined) itemDeptMap[key] = deptToArray(getSuggestedDept(dom.code, it.no));
      const curArr = deptToArray(itemDeptMap[key]);
      const deptControl = multiDeptSelectHtml(key, curArr);
      // 영역에 배정된 감사역이 2명 이상일 때만 항목별로 1명을 고르는 드롭다운을 보여준다.
      // 1명뿐이면 그 이름이 자동 적용되므로(인터뷰 가이드 쪽에서 처리) 별도 선택 UI가 불필요하다.
      let auditorControl;
      if(auditorCandidates.length >= 2){
        if(itemAuditorMap[key] && !auditorCandidates.includes(itemAuditorMap[key])) itemAuditorMap[key] = '';
        auditorControl = '<select class="item-auditor-select" data-key="' + key + '" style="width:120px;border:1px solid #c7c1b1;background:#fffdf8;font-family:inherit;font-size:11.5px;padding:4px 6px;border-radius:5px;">'
          + '<option value="">— 선택 —</option>'
          + auditorCandidates.map(n => '<option value="' + esc(n) + '"' + (itemAuditorMap[key]===n?' selected':'') + '>' + esc(n) + '</option>').join('')
        + '</select>';
      } else if(auditorCandidates.length === 1){
        auditorControl = '<span style="color:var(--ink-soft);">' + esc(auditorCandidates[0]) + '</span>';
      } else {
        auditorControl = '<span style="color:#b3ab99;">(영역 배정 없음)</span>';
      }
      rows += '<tr><td><input type="checkbox" class="assign-item-cb" data-code="' + dom.code + '" data-no="' + it.no + '" checked></td><td class="mono">D-' + dom.code + '</td><td class="mono">' + key + '</td>'
        + '<td>' + it.title + '</td><td>' + it.risk + '</td>'
        + '<td>' + deptControl + '</td>'
        + '<td>' + auditorControl + '</td>'
        + '<td><button type="button" class="assign-dept-reset-btn" data-key="' + key + '" data-domain="' + dom.code + '" data-itemno="' + it.no + '" title="이 항목만 제안된 기본값으로 되돌리기">↺</button></td></tr>';
    });
  });
  const excludedHint = excludedTotal > 0
    ? ('<div style="font-size:11px;color:var(--risk-hi);margin-bottom:8px;">⚪ 회색 "제외됨" 표시(' + excludedTotal + '개)는 ③ 영역 선택의 개별 항목 선택에서 뺀 항목입니다 — 맨 앞 체크박스로 이 화면에서 바로 되돌리거나 다시 뺄 수도 있습니다.</div>')
    : '';
  tblWrap.innerHTML = excludedHint + '<table class="assign-tbl">' + rows + '</table>';
  wireMultiDeptSelect(tblWrap, (key, arr) => { itemDeptMap[key] = arr; }, renderAssignTable);
  tblWrap.querySelectorAll('.item-auditor-select').forEach(sel => {
    sel.addEventListener('change', () => { itemAuditorMap[sel.dataset.key] = sel.value; });
  });
  tblWrap.querySelectorAll('.assign-dept-reset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      itemDeptMap[btn.dataset.key] = deptToArray(getSuggestedDept(btn.dataset.domain, Number(btn.dataset.itemno)));
      renderAssignTable();
    });
  });
  // [v8.28] 이 표의 포함/제외 체크박스는 ③ 영역 선택 화면의 것과 같은 저장소를 쓰므로, 여기서
  // 바꾸면 ③ 화면(펼쳐져 있다면)과 ✏ 문항 직접 편집 목록도 함께 다시 그려 서로 어긋나지 않게 한다.
  tblWrap.querySelectorAll('.assign-item-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      setItemExcluded(cb.dataset.code, Number(cb.dataset.no), !cb.checked);
      renderAssignTable();
      updateGenSummary();
      if(typeof renderDomainList === 'function') renderDomainList();
      if(typeof renderEditItemList === 'function') renderEditItemList();
    });
  });

  // prune assignments for items no longer selected
  const validKeys = new Set();
  selected.forEach(dom => dom.items.forEach(it => validKeys.add(dom.code + '-' + it.no)));
  Object.keys(itemDeptMap).forEach(k => { if(!validKeys.has(k)) delete itemDeptMap[k]; });
  Object.keys(itemAuditorMap).forEach(k => { if(!validKeys.has(k)) delete itemAuditorMap[k]; });
}

export function getCurrentScale(){ return currentScale; }

export function renderScaleTable(){
  const tbl = document.getElementById('scaleTable');
  let rows = '<tr><th>응답 옵션 라벨</th><th style="width:110px;">성격</th><th style="width:24px;"></th></tr>';
  currentScale.forEach((o, i) => {
    const opts = Object.keys(TIER_LABELS).map(t =>
      '<option value="' + t + '"' + (t === o.tier ? ' selected' : '') + '>' + TIER_LABELS[t] + '</option>'
    ).join('');
    rows += '<tr>'
      + '<td><input type="text" data-idx="' + i + '" data-field="value" value="' + o.value.replace(/"/g,'&quot;') + '"></td>'
      + '<td><select data-idx="' + i + '" data-field="tier">' + opts + '</select></td>'
      + '<td><button data-idx="' + i + '" class="scale-remove-btn" title="삭제">✕</button></td>'
      + '</tr>';
  });
  tbl.innerHTML = rows;
  tbl.querySelectorAll('input[data-field=value]').forEach(inp => {
    inp.addEventListener('change', () => { currentScale[Number(inp.dataset.idx)].value = inp.value.trim() || '옵션'; });
  });
  tbl.querySelectorAll('select[data-field=tier]').forEach(sel => {
    sel.addEventListener('change', () => { currentScale[Number(sel.dataset.idx)].tier = sel.value; });
  });
  tbl.querySelectorAll('.scale-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if(currentScale.length <= 2){ alert('응답 옵션은 최소 2개 이상이어야 합니다.'); return; }
      currentScale.splice(Number(btn.dataset.idx), 1);
      renderScaleTable();
    });
  });
}

export function buildWizardItems(){
  const selected = DOMAINS.filter(d => selectedCodes.has(d.code));
  const list = [];
  selected.forEach(dom => dom.items.forEach(it => list.push({domCode: dom.code, domTitle: dom.title, itemNo: it.no, key: dom.code + '-' + it.no, baseItem: it})));
  return list;
}

export function openWizard(){
  if(selectedCodes.size === 0){ alert('먼저 ③에서 감사 영역을 선택해 주세요.'); return; }
  setWizardItems(buildWizardItems());
  if(wizardItems.length === 0){ alert('검토할 항목이 없습니다.'); return; }
  setWizardIndex(0);
  document.getElementById('wizardOverlay').style.display = 'flex';
  document.getElementById('wizardTotalLabel').textContent = wizardItems.length;
  renderWizardStep();
}

export function closeWizard(){
  saveCurrentWizardStep();
  document.getElementById('wizardOverlay').style.display = 'none';
  renderEditItemList();
  renderAssignTable();
}

export function saveCurrentWizardStep(){
  const body = document.getElementById('wizardBody');
  const form = body.querySelector('.wizard-edit-fields');
  if(!form) return;
  const cur = wizardItems[wizardIndex];
  if(!cur) return;
  const key = cur.key;
  contentOverrides[key] = {
    title: form.querySelector('.wiz-title').value,
    desc: form.querySelector('.wiz-desc').value,
    risk: form.querySelector('.wiz-risk').value,
    law: form.querySelector('.wiz-law').value,
    excluded: form.querySelector('.wiz-excluded').checked,
    checkpoints: form.querySelector('.wiz-checkpoints').value.split('\n').map(s => s.trim()).filter(Boolean),
    evidence: form.querySelector('.wiz-evidence').value.split('\n').map(s => s.trim()).filter(Boolean),
  };
  // 담당부서(itemDeptMap)는 다중선택 체크박스의 change 이벤트에서 이미 실시간으로 반영되므로
  // 여기서 다시 읽을 필요가 없다.
}

export function renderWizardStep(){
  const cur = wizardItems[wizardIndex];
  if(!cur) return;
  const key = cur.key;
  const it = cur.baseItem;
  const ov = contentOverrides[key] || {};
  const title = ov.title !== undefined ? ov.title : it.title;
  const desc = ov.desc !== undefined ? ov.desc : it.desc;
  const risk = ov.risk !== undefined ? ov.risk : it.risk;
  const law = ov.law !== undefined ? ov.law : (it.law || '');
  const excluded = !!ov.excluded;
  const checkpoints = (ov.checkpoints !== undefined ? ov.checkpoints : it.checkpoints).join('\n');
  const evidence = (ov.evidence !== undefined ? ov.evidence : (it.evidence || [])).join('\n');
  const defaultDept = getSuggestedDept(cur.domCode, cur.itemNo);
  const dept = itemDeptMap[key] !== undefined ? deptToArray(itemDeptMap[key]) : deptToArray(defaultDept);
  const stepHint = WIZARD_STEP_HINTS[Math.min(wizardIndex, 4) % WIZARD_STEP_HINTS.length];

  document.getElementById('wizardIdxLabel').textContent = wizardIndex + 1;
  document.getElementById('wizardDomainLabel').textContent = 'D-' + cur.domCode + ' ' + cur.domTitle;
  document.getElementById('wizardProgressFill').style.width = Math.round((wizardIndex+1)/wizardItems.length*100) + '%';

  const body = document.getElementById('wizardBody');
  body.innerHTML = WIZARD_STRUCTURE_LEGEND
    + '<div class="wizard-step-hint">' + WIZARD_STEP_HINTS.join('<br>') + '</div>'
    + '<div class="wizard-item-code">' + key + (excluded ? ' <span class="eh-excluded-badge">제외됨</span>' : '') + '</div>'
    + '<div class="wizard-item-title">' + esc(title) + '</div>'
    + '<div class="wizard-edit-fields" style="margin-top:14px;">'
      + '<label>① 항목명 <span class="wiz-field-hint">→ 설문지 카드 제목(굵게)으로 표시</span></label><input type="text" class="wiz-title" value="' + esc(title) + '">'
      + '<label>② 설명 / 질문 <span class="wiz-field-hint">→ 항목명 바로 아래 회색 설명글로 표시</span></label><textarea class="wiz-desc" rows="2">' + esc(desc) + '</textarea>'
      + '<div class="edit-row-2col">'
        + '<div><label>③ 위험도 <span class="wiz-field-hint">→ 카드 우측 위험도 태그</span></label><select class="wiz-risk"><option value="상"' + (risk==='상'?' selected':'') + '>상</option><option value="중"' + (risk==='중'?' selected':'') + '>중</option><option value="하"' + (risk==='하'?' selected':'') + '>하</option></select></div>'
        + '<div><label>④ 관련 법령 <span class="wiz-field-hint">→ 체크포인트 표 위에 작게 표시</span></label><input type="text" class="wiz-law" value="' + esc(String(law)) + '"></div>'
      + '</div>'
      + '<label>⑤ 세부 체크포인트(한 줄에 하나씩) <span class="wiz-field-hint">→ 응답표의 각 행 — 응답자가 실제로 체크하는 질문 그 자체</span></label><textarea class="wiz-checkpoints" rows="4">' + esc(checkpoints) + '</textarea>'
      + '<label>⑥ 증빙자료 목록(한 줄에 하나씩) <span class="wiz-field-hint">→ 체크포인트 아래 "제출 가능 증빙" 체크박스 목록</span></label><textarea class="wiz-evidence" rows="3">' + esc(evidence) + '</textarea>'
      + '<div class="wizard-field-divider"></div>'
      + '<label><input type="checkbox" class="wiz-excluded"' + (excluded ? ' checked' : '') + '> 이 항목을 이번 설문에서 제외(비활성화) — 체크하면 이 항목이 설문지에서 통째로 사라집니다</label>'
      + '<label>담당 부서(복수 선택 가능) <span class="wiz-field-hint">→ 설문지에는 표시되지 않음(응답자에게 안 보임) — 내부적으로 "누가 응답해야 하는 항목인지" 관리하는 용도</span></label>'
      + multiDeptSelectHtml(key, dept)
    + '</div>';

  document.getElementById('wizardPrevBtn').disabled = (wizardIndex === 0);
  const isLast = wizardIndex === wizardItems.length - 1;
  document.getElementById('wizardNextBtn').style.display = isLast ? 'none' : '';
  document.getElementById('wizardFinishBtn').style.display = isLast ? '' : 'none';
  const nextDomExists = wizardItems.slice(wizardIndex+1).some(x => x.domCode !== cur.domCode);
  document.getElementById('wizardSkipDomainBtn').style.display = nextDomExists ? '' : 'none';

  wireMultiDeptSelect(body, (k, arr) => { itemDeptMap[k] = arr; }, () => { saveCurrentWizardStep(); renderWizardStep(); });
}

export function wizardGoTo(newIndex){
  saveCurrentWizardStep();
  setWizardIndex(Math.max(0, Math.min(wizardItems.length - 1, newIndex)));
  renderWizardStep();
}

export function getWizardState(){ return {items: wizardItems, index: wizardIndex}; }

export function renderEditItemList(){
  const wrap = document.getElementById('editWrap');
  const listEl = document.getElementById('editItemList');
  if(selectedCodes.size === 0){
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  const selected = DOMAINS.filter(d => selectedCodes.has(d.code));
  const defaultDept = document.getElementById('genDept').value.trim() || '수검부서';

  let html = '';
  selected.forEach(dom => {
    dom.items.forEach(it => {
      const key = dom.code + '-' + it.no;
      const ov = contentOverrides[key] || {};
      const title = ov.title !== undefined ? ov.title : it.title;
      const desc = ov.desc !== undefined ? ov.desc : it.desc;
      const risk = ov.risk !== undefined ? ov.risk : it.risk;
      const law = ov.law !== undefined ? ov.law : (it.law || '');
      const excluded = !!ov.excluded;
      const checkpoints = (ov.checkpoints !== undefined ? ov.checkpoints : it.checkpoints).join('\n');
      const evidence = (ov.evidence !== undefined ? ov.evidence : (it.evidence || [])).join('\n');
      const dept = deptToArray(itemDeptMap[key] !== undefined ? itemDeptMap[key] : defaultDept);
      const deptLabel = dept.join(', ') || '(미지정)';
      const isOpen = openEditKey === key;
      html += '<div class="edit-item' + (excluded ? ' excluded' : '') + '">'
        + '<div class="edit-item-head" data-key="' + key + '"><span><span class="eh-code">' + key + '</span><span class="eh-title">' + esc(title) + '</span>'
        + ' <span class="eh-dept-badge">' + deptLabel + '</span>' + (excluded ? ' <span class="eh-excluded-badge">제외됨</span>' : '') + '</span>'
        + '<span class="eh-caret">' + (isOpen ? '▲ 접기' : '▼ 검토 · 담당부서 지정') + '</span></div>'
        + '<div class="edit-item-body' + (isOpen ? ' open' : '') + '" data-key="' + key + '">'
        + '<label><input type="checkbox" class="ov-excluded" ' + (excluded ? 'checked' : '') + '> 이 항목을 이번 설문에서 제외(비활성화)</label>'
        + '<label>담당 부서(복수 선택 가능)</label>' + multiDeptSelectHtml(key, dept)
        + '<label>항목명</label><input type="text" class="ov-title" value="' + title.replace(/"/g,'&quot;') + '">'
        + '<label>설명 / 질문</label><textarea class="ov-desc" rows="2">' + esc(desc) + '</textarea>'
        + '<div class="edit-row-2col">'
          + '<div><label>위험도</label><select class="ov-risk"><option value="상"' + (risk==='상'?' selected':'') + '>상</option><option value="중"' + (risk==='중'?' selected':'') + '>중</option><option value="하"' + (risk==='하'?' selected':'') + '>하</option></select></div>'
          + '<div><label>관련 법령</label><input type="text" class="ov-law" value="' + String(law).replace(/"/g,'&quot;') + '"></div>'
        + '</div>'
        + '<label>세부 체크포인트 (한 줄에 하나씩)</label><textarea class="ov-checkpoints" rows="4">' + esc(checkpoints) + '</textarea>'
        + '<div class="edit-hint">화면 표시 시 ①②③④ 번호가 자동으로 붙습니다.</div>'
        + '<label>증빙자료 목록 (한 줄에 하나씩)</label><textarea class="ov-evidence" rows="3">' + esc(evidence) + '</textarea>'
        + '</div></div>';
    });
  });
  listEl.innerHTML = html || '<div class="edit-empty">선택된 항목이 없습니다.</div>';

  listEl.querySelectorAll('.edit-item-head').forEach(head => {
    head.addEventListener('click', () => {
      const key = head.dataset.key;
      setOpenEditKey((openEditKey === key) ? null : key);
      renderEditItemList();
    });
  });
  listEl.querySelectorAll('.edit-item-body').forEach(body => {
    const key = body.dataset.key;
    const save = () => {
      contentOverrides[key] = {
        title: body.querySelector('.ov-title').value,
        desc: body.querySelector('.ov-desc').value,
        risk: body.querySelector('.ov-risk').value,
        law: body.querySelector('.ov-law').value,
        excluded: body.querySelector('.ov-excluded').checked,
        checkpoints: body.querySelector('.ov-checkpoints').value.split('\n').map(s => s.trim()).filter(Boolean),
        evidence: body.querySelector('.ov-evidence').value.split('\n').map(s => s.trim()).filter(Boolean),
      };
    };
    body.querySelectorAll('.ov-title, .ov-desc, .ov-checkpoints, .ov-evidence, .ov-risk, .ov-law').forEach(el => el.addEventListener('change', save));
    body.querySelector('.ov-excluded').addEventListener('change', () => { save(); renderEditItemList(); updateGenSummary(); });
  });
  wireMultiDeptSelect(listEl, (key, arr) => {
    itemDeptMap[key] = arr;
    const badge = listEl.querySelector('.edit-item-head[data-key="' + CSS.escape(key) + '"] .eh-dept-badge');
    if(badge) badge.textContent = arr.join(', ') || '(미지정)';
  }, renderEditItemList);

  // prune overrides for items no longer selected
  const validKeys = new Set();
  selected.forEach(dom => dom.items.forEach(it => validKeys.add(dom.code + '-' + it.no)));
  Object.keys(contentOverrides).forEach(k => { if(!validKeys.has(k)) delete contentOverrides[k]; });
}

export function renderDistDomainChecks(){
  const wrap = document.getElementById('distDomainChecks');
  if(!wrap) return;
  wrap.innerHTML = DOMAINS.map(d =>
    '<label class="dist-check-item"><input type="checkbox" class="dist-domain-cb" value="' + d.code + '"> D-' + d.code + ' ' + esc(d.title) + '</label>'
  ).join('');
}

export function domainListText(dist){
  return dist.domains.map(dc => {
    const d = igFindDomain(dc);
    return 'D-' + dc + (d ? ' ' + d.title : '');
  }).join(', ');
}

export function getChecklistOwnerDept(domCode, itemNo){
  const dom = DOMAINS.find(d => d.code === domCode);
  const item = dom ? dom.items.find(it => it.no === itemNo) : null;
  if(item && item.dept && item.dept !== '공통') return item.dept;
  return null;
}

export function downloadFullChecklistXlsx(){
  if(typeof XLSX === 'undefined'){ alert('엑셀 라이브러리를 아직 불러오지 못했습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.'); return; }
  // 참고: 이 라이브러리(js-xlsx 커뮤니티 에디션)는 셀 배경색·글자색·테두리·틀고정 같은
  // "스타일" 정보를 실제 xlsx 파일에 기록하지 못합니다(유료 Pro 버전 전용 기능이라, 시도해도
  // 조용히 무시되어 열어보면 그대로 민무늬로 나옵니다). 대신 실제로 파일에 반영되는 것들
  // (열 너비, 위험도 기호 표기, 안내 시트)로 가독성을 높였습니다.
  const wb = XLSX.utils.book_new();

  const guideRows = [
    ['IT 감사 체크리스트 전체 상세'],
    [''],
    ['이 파일은 이 도구가 갖고 있는 체크리스트 원본 전체를 담고 있습니다.'],
    ['· 00_총괄 시트: 25개 영역의 항목수·체크포인트수·위험도 분포 요약'],
    ['· D01_xxx ~ D25_xxx 시트: 영역별 항목 상세(항목명·설명·위험도·법령·체크포인트·증빙자료)'],
    ['· 위험도 표기: 🔴 상 / 🟡 중 / 🟢 하'],
    [''],
    ['생성일: ' + kstDateStr()]
  ];
  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideSheet['!cols'] = [{wch:70}];
  XLSX.utils.book_append_sheet(wb, guideSheet, '00_안내');

  const RISK_ICON = {'상':'🔴 상', '중':'🟡 중', '하':'🟢 하'};

  const summaryRows = [['영역코드','영역명','항목수','체크포인트수','위험상','위험중','위험하']];
  DOMAINS.forEach(dom => {
    const cp = dom.items.reduce((s,it) => s + it.checkpoints.length, 0);
    const rc = riskCounts(dom);
    summaryRows.push(['D-'+dom.code, dom.title, dom.items.length, cp, rc['상'], rc['중'], rc['하']]);
  });
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{wch:8},{wch:30},{wch:10},{wch:12},{wch:8},{wch:8},{wch:8}];
  XLSX.utils.book_append_sheet(wb, summarySheet, '01_총괄');

  DOMAINS.forEach(dom => {
    const sheetRows = [['번호','항목명','설명','위험도','관련법령','세부체크포인트','증빙자료']];
    dom.items.forEach(it => {
      sheetRows.push([
        it.no, it.title, it.desc || '', RISK_ICON[it.risk] || it.risk,
        (it.law || '').replace(/\n/g, ' / '),
        (it.checkpoints || []).join('\n'),
        (it.evidence || []).join('\n')
      ]);
    });
    const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
    sheet['!cols'] = [{wch:5},{wch:28},{wch:34},{wch:8},{wch:22},{wch:44},{wch:30}];
    // 시트명은 31자 제한 + 일부 특수문자 금지 — 안전하게 코드+영역명 앞부분만 사용
    let sheetName = ('D' + dom.code + '_' + dom.title).replace(/[\\/*?:\[\]]/g, '');
    if(sheetName.length > 31) sheetName = sheetName.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  });

  const fname = 'IT감사_체크리스트_전체상세' + (typeof versionSuffix === 'function' ? versionSuffix() : '') + '.xlsx';
  XLSX.writeFile(wb, fname);
}

export function igEvidenceChecklistHtml(code, items){
  const rows = items.length === 0
    ? '<div class="ig-evi-empty">등록된 증빙자료 항목이 없습니다. 아래에서 추가하세요.</div>'
    : items.map((it, idx) =>
        '<div class="ig-evi-row">'
          + '<label><input type="checkbox" class="ig-evi-collected" data-code="' + esc(code) + '" data-idx="' + idx + '"' + (it.collected?' checked':'') + '> ' + esc(it.name) + '</label>'
          + '<button type="button" class="ig-evi-remove" data-code="' + esc(code) + '" data-idx="' + idx + '" title="삭제">✕</button>'
        + '</div>'
      ).join('');
  return '<div class="ig-evi-checklist">'
    + '<div class="ig-evi-checklist-label">📎 증빙자료 확인 목록 <span style="font-weight:400;color:var(--ink-soft);">(실제로 수령·확인한 것을 체크하거나, 인터뷰 중 추가로 요청한 자료를 직접 추가하세요)</span></div>'
    + '<div class="ig-evi-checklist-body">' + rows + '</div>'
    + '<div class="ig-evi-add-row"><input type="text" class="ig-evi-add-input" data-code="' + esc(code) + '" placeholder="증빙자료명 직접 추가"><button type="button" class="ig-evi-add-btn" data-code="' + esc(code) + '">+ 추가</button></div>'
  + '</div>';
}

export function wireIgEvidenceChecklist(container){
  container.querySelectorAll('.ig-evi-collected').forEach(cb => {
    cb.addEventListener('change', () => {
      const code = cb.dataset.code, idx = Number(cb.dataset.idx);
      if(interviewState[code] && interviewState[code].evidenceItems && interviewState[code].evidenceItems[idx]){
        interviewState[code].evidenceItems[idx].collected = cb.checked;
        saveInterviewState();
      }
    });
  });
  container.querySelectorAll('.ig-evi-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code, idx = Number(btn.dataset.idx);
      if(interviewState[code] && interviewState[code].evidenceItems){
        interviewState[code].evidenceItems.splice(idx, 1);
        saveInterviewState();
        if(document.getElementById('customInterviewList') && document.getElementById('customInterviewList').contains(btn)){
          renderCustomInterviewSection();
        } else {
          renderInterviewGuide();
        }
      }
    });
  });
  container.querySelectorAll('.ig-evi-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      const input = container.querySelector('.ig-evi-add-input[data-code="' + CSS.escape(code) + '"]');
      const name = (input.value || '').trim();
      if(!name) return;
      const st = interviewState[code] || (interviewState[code] = {done:false, note:'', interviewee:'', interviewer:'', interviewedAt:'', location:'', evidenceStatus:''});
      if(!st.evidenceItems) st.evidenceItems = [];
      st.evidenceItems.push({name, collected:false});
      saveInterviewState();
      if(document.getElementById('customInterviewList') && document.getElementById('customInterviewList').contains(btn)){
        renderCustomInterviewSection();
      } else {
        renderInterviewGuide();
      }
    });
  });
}

export function igFindDomain(domCode){
  return DOMAINS.find(d => d.code === domCode) || DEFAULT_DOMAINS.find(d => d.code === domCode);
}

export function igBulkExpandDomain(domCode, expand){
  const group = document.querySelector('.ig-domain-group[data-ig-domain-group="' + domCode + '"]');
  if(!group) return;
  group.querySelectorAll('.ig-card').forEach(card => {
    const code = card.dataset.igCode;
    const body = card.querySelector('.ig-collapsible-body');
    const btn = card.querySelector('.ig-expand-toggle-btn');
    if(!body || !code) return;
    body.style.display = expand ? 'block' : 'none';
    if(expand) igExpandedCodes.add(code); else igExpandedCodes.delete(code);
    if(btn) btn.innerHTML = expand ? '▲ 접기' : '▼ 인터뷰 진행 (질문·기록)';
    card.classList.toggle('ig-card-expanded', expand);
  });
}

export function renderPendingSurveyBanner(){
  const banner = document.getElementById('pendingSurveyBadge');
  if(!banner) return;
  const distributions = loadDistributions();
  let pending = 0;
  const byRound = {};
  distributions.forEach(d => {
    let roundPending = 0;
    (d.recipients || []).forEach(r => { if(!r.received){ pending++; roundPending++; } });
    if(roundPending > 0) byRound[d.roundLabel || '(회차명 미상)'] = (byRound[d.roundLabel || '(회차명 미상)'] || 0) + roundPending;
  });
  const countEl = document.getElementById('pendingSurveyCount');
  const detailEl = document.getElementById('pendingSurveyDetail');
  if(pending > 0){
    banner.style.display = 'inline-flex';
    banner.style.alignItems = 'center';
    if(countEl) countEl.textContent = pending;
    const roundLabels = Object.keys(byRound);
    if(detailEl){
      detailEl.textContent = roundLabels.length > 1
        ? (' (' + roundLabels.map(l => l + ' ' + byRound[l] + '건').join(' · ') + ')')
        : '';
    }
  } else {
    banner.style.display = 'none';
  }
}
