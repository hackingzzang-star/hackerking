// ============================================================
// 🧩 공통 UI 유틸(부서선택/날짜/이스케이프/줌 등 여러 탭에서 공용) — v8.59에서 분리
// ------------------------------------------------------------
// 특정 탭 전용이 아니라 거의 모든 다른 기능 모듈이 가져다 쓰는 헬퍼 함수 모음입니다
// (날짜 포맷, HTML escape, 부서 선택 드롭다운, 화면 확대/축소, 현재 감사역 정보 등).
// 재할당되는 공유 가변 상태가 없어(전부 localStorage 백엔드 또는 순수 함수) 세터가
// 필요 없었습니다. 이 모듈은 다른 12개 기능 모듈 전부가 참조하므로, 여기를 고칠 때는
// 영향 범위가 가장 넓다는 점을 유의하세요.
// ============================================================
import {
  SYSTEM_VERSION,
  auditDeptList,
  COMMON_DEPT_LABEL,
  itemDeptMap,
  CIRCLED,
  ZOOM_STORAGE_KEY,
  ZOOM_STEPS,
  CURRENT_AUDITOR_STORAGE_KEY,
  AUDITOR_LIST_STORAGE_KEY,
} from '../app.js';
import {
  renderAssignTable,
  renderDomainDeptDefaultAssign,
} from './generate.js';

export function circledNum(i){ return CIRCLED[i] || ('(' + (i+1) + ')'); }

export function renderAuditDeptChips(){
  const box = document.getElementById('auditDeptChips');
  if(!box) return;
  if(auditDeptList.length === 0){
    box.innerHTML = '<div style="font-size:11.5px;color:var(--ink-soft);grid-column:1/-1;">아직 등록된 부서가 없습니다. 위에서 부서명을 입력하고 추가하세요. (건너뛰어도 되며, 그 경우 아래 항목별 배정에서 직접 입력할 수 있습니다)</div>';
  } else {
    box.innerHTML = auditDeptList.map((d,i) =>
      '<div class="dist-check-item" style="justify-content:space-between;">' + esc(d)
      + ' <button type="button" data-idx="' + i + '" style="border:none;background:transparent;color:var(--risk-hi);cursor:pointer;font-size:12px;">✕</button></div>'
    ).join('');
    box.querySelectorAll('button[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        auditDeptList.splice(Number(btn.dataset.idx), 1);
        renderAuditDeptChips();
        renderAuditDeptDatalist();
      });
    });
  }
  renderAuditDeptDatalist();
  renderGenDeptOptions();
  if(typeof renderDomainDeptDefaultAssign === 'function') renderDomainDeptDefaultAssign();
}

export function renderAuditDeptDatalist(){
  const dl = document.getElementById('auditDeptDatalist');
  if(!dl) return;
  dl.innerHTML = auditDeptList.map(d => '<option value="' + esc(d) + '">').join('');
}

export function renderGenDeptOptions(){
  const sel = document.getElementById('genDept');
  if(!sel) return;
  const current = sel.value;
  let opts = '<option value="">부서 선택…' + (auditDeptList.length === 0 ? ' (⑤에서 먼저 추가하세요)' : '') + '</option>';
  opts += auditDeptList.map(d => '<option value="' + esc(d) + '">' + esc(d) + '</option>').join('');
  opts += '<option value="__custom__">✏ 직접 입력…</option>';
  sel.innerHTML = opts;
  sel.value = auditDeptList.includes(current) ? current : '';
}

export function addAuditDept(){
  const input = document.getElementById('auditDeptInput');
  const v = (input.value || '').trim();
  if(!v){ return; }
  if(!auditDeptList.includes(v)) auditDeptList.push(v);
  input.value = '';
  renderAuditDeptChips();
  renderAssignTable();
}

export function syncTabGroupDisplay(groupKey){
  document.querySelectorAll('.tabgroup-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.group === groupKey);
  });
  document.querySelectorAll('.tabbtn-group').forEach(grp => {
    grp.classList.toggle('active-group', grp.dataset.group === groupKey);
  });
}

export function refreshCurrentAuditorUI(){
  const name = getCurrentAuditor();
  const statusEl = document.getElementById('currentAuditorStatus');
  const inputEl = document.getElementById('currentAuditorInput');
  if(inputEl && !inputEl.value) inputEl.value = name;
  if(statusEl) statusEl.textContent = name ? ('✓ "' + name + '"(으)로 설정됨') : '';
}

export function getZoomLevel(){
  try{ return Number(localStorage.getItem(ZOOM_STORAGE_KEY)) || 100; }catch(e){ return 100; }
}

export function applyZoomLevel(pct){
  document.body.style.zoom = pct + '%';
  const label = document.getElementById('zoomPctLabel');
  if(label) label.textContent = pct + '%';
  try{ localStorage.setItem(ZOOM_STORAGE_KEY, String(pct)); }catch(e){ /* non-fatal */ }
}

export function stepZoom(direction){
  const current = getZoomLevel();
  const idx = ZOOM_STEPS.reduce((closest, v, i) => Math.abs(v-current) < Math.abs(ZOOM_STEPS[closest]-current) ? i : closest, 0);
  const nextIdx = Math.min(ZOOM_STEPS.length-1, Math.max(0, idx + direction));
  applyZoomLevel(ZOOM_STEPS[nextIdx]);
}

export function deptSelectOptionsHtml(curVal){
  // "공통"은 등록된 부서 목록(auditDeptList)과 무관하게 항상 선택 가능한 고정 옵션입니다.
  let html = '<option value="">부서 선택…</option>';
  html += '<option value="' + esc(COMMON_DEPT_LABEL) + '"' + (curVal === COMMON_DEPT_LABEL ? ' selected' : '') + '>' + esc(COMMON_DEPT_LABEL) + '</option>';
  html += auditDeptList.map(d => '<option value="' + esc(d) + '"' + (d === curVal ? ' selected' : '') + '>' + esc(d) + '</option>').join('');
  const isKnown = curVal === COMMON_DEPT_LABEL || auditDeptList.includes(curVal);
  html += '<option value="__custom__"' + (!isKnown && curVal ? ' selected' : '') + '>✏ 직접 입력…' + (!isKnown && curVal ? (' (현재: ' + esc(curVal) + ')') : '') + '</option>';
  return html;
}

export function riskTag(risk){
  if(risk === '상') return '<span class="tag risk-hi">위험도 상</span>';
  if(risk === '중') return '<span class="tag">중요도 중</span>';
  return '<span class="tag">중요도 하</span>';
}

export function deptTagHtml(code){
  const arr = deptToArray(itemDeptMap[code]);
  if(arr.length === 0) return '';
  return '<span class="tag dept-tag">👥 ' + arr.join(', ').replace(/"/g,'&quot;') + '</span>';
}

export function downloadHtml(html, filename){
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function nowKST(){
  // Date.now()는 브라우저 시간대와 무관한 절대 UTC 타임스탬프이므로,
  // 여기에 +9시간을 더한 뒤 getUTC* 필드로 읽으면 브라우저 로컬 설정과 무관하게
  // 항상 대한민국 표준시(KST, UTC+9) 벽시계 값을 얻을 수 있습니다.
  // 파일 생성시간·인쇄문서 날짜는 전부 이 함수를 거치도록 통일합니다.
  return new Date(Date.now() + 9 * 3600000);
}

export function kstDateStr(){
  const d = nowKST();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
}

export function kstTimeStr(){
  const d = nowKST();
  return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0') + ':' + String(d.getUTCSeconds()).padStart(2,'0');
}

export function kstDateTimeStr(){
  return kstDateStr() + ' ' + kstTimeStr() + ' (KST)';
}

export function kstISOString(){
  const d = nowKST();
  const pad = (n) => String(n).padStart(2,'0');
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth()+1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + '+09:00';
}

export function todayStamp(){
  const d = nowKST();
  return d.getUTCFullYear() + String(d.getUTCMonth()+1).padStart(2,'0') + String(d.getUTCDate()).padStart(2,'0');
}

export function versionSuffix(){
  return '_v' + SYSTEM_VERSION + '_' + todayStamp();
}

export function deptToArray(val){
  if(Array.isArray(val)) return val;
  if(val === undefined || val === null || val === '') return [];
  return [val]; // 하위호환: 이전 버전에서 저장된 단일 문자열 값
}

export function multiDeptSelectHtml(key, selectedArr){
  const isCommon = selectedArr.length === 1 && selectedArr[0] === COMMON_DEPT_LABEL;
  const summary = selectedArr.length === 0 ? '부서 선택…' : selectedArr.join(', ');
  let optsHtml = '<label class="mds-opt"><input type="checkbox" class="mds-common-cb" value="' + esc(COMMON_DEPT_LABEL) + '"' + (isCommon ? ' checked' : '') + '> ' + esc(COMMON_DEPT_LABEL) + '</label>';
  optsHtml += auditDeptList.map(d => '<label class="mds-opt"><input type="checkbox" class="mds-dept-cb" value="' + esc(d) + '"' + (selectedArr.includes(d) ? ' checked' : '') + '> ' + esc(d) + '</label>').join('');
  optsHtml += '<button type="button" class="mds-custom-btn">✏ 직접 입력…</button>';
  return '<div class="multi-dept-select" data-key="' + key + '">'
    + '<button type="button" class="mds-toggle">' + esc(summary) + ' <span class="mds-caret">▾</span></button>'
    + '<div class="mds-panel" style="display:none;">' + optsHtml + '</div>'
  + '</div>';
}

export function wireMultiDeptSelect(container, onChange, fullRerender){
  container.querySelectorAll('.multi-dept-select').forEach(widget => {
    const key = widget.dataset.key;
    const toggle = widget.querySelector('.mds-toggle');
    const panel = widget.querySelector('.mds-panel');
    const caretSpan = toggle.querySelector('.mds-caret');
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = panel.style.display === 'none';
      document.querySelectorAll('.mds-panel').forEach(p => { p.style.display = 'none'; });
      panel.style.display = willOpen ? 'block' : 'none';
    });
    const commonCb = widget.querySelector('.mds-common-cb');
    const deptCbs = widget.querySelectorAll('.mds-dept-cb');
    function getSelected(){
      const arr = [];
      if(commonCb.checked) arr.push(COMMON_DEPT_LABEL);
      deptCbs.forEach(cb => { if(cb.checked) arr.push(cb.value); });
      return arr;
    }
    function commit(){
      const arr = getSelected();
      toggle.childNodes[0].textContent = (arr.length === 0 ? '부서 선택…' : arr.join(', ')) + ' ';
      onChange(key, arr);
    }
    commonCb.addEventListener('change', () => {
      if(commonCb.checked) deptCbs.forEach(cb => { cb.checked = false; });
      commit();
    });
    deptCbs.forEach(cb => {
      cb.addEventListener('change', () => {
        if(cb.checked) commonCb.checked = false;
        commit();
      });
    });
    const customBtn = widget.querySelector('.mds-custom-btn');
    customBtn.addEventListener('click', () => {
      const v = (prompt('부서명을 직접 입력해 주세요.') || '').trim();
      if(!v) return;
      if(!auditDeptList.includes(v)) auditDeptList.push(v);
      renderAuditDeptChips();
      const arr = getSelected().filter(x => x !== COMMON_DEPT_LABEL).concat([v]);
      onChange(key, arr);
      fullRerender();
    });
  });
}

export function fmtDateTime(iso){
  const dt = new Date(iso);
  if(isNaN(dt.getTime())) return iso || '';
  const p2 = (n) => String(n).padStart(2,'0');
  return dt.getFullYear() + '-' + p2(dt.getMonth()+1) + '-' + p2(dt.getDate()) + ' ' + p2(dt.getHours()) + ':' + p2(dt.getMinutes());
}

export function getCurrentAuditor(){
  try{ return localStorage.getItem(CURRENT_AUDITOR_STORAGE_KEY) || ''; }catch(e){ return ''; }
}

export function setCurrentAuditor(name){
  try{ localStorage.setItem(CURRENT_AUDITOR_STORAGE_KEY, name || ''); }catch(e){ /* non-fatal */ }
  addKnownAuditor(name);
}

export function loadKnownAuditors(){
  try{ return JSON.parse(localStorage.getItem(AUDITOR_LIST_STORAGE_KEY) || '[]'); }catch(e){ return []; }
}

export function addKnownAuditor(name){
  // [v8.35] "진행 감사자" 등 일부 입력란은 "홍길동, 김철수"처럼 여러 명을 한 번에 적을 수 있는데,
  // 지금까지는 이 문자열 전체를 이름 하나로 저장해 자동완성 목록에 "김철수"와 "김철수, 이영희"가
  // 서로 다른 사람인 것처럼 따로 나타나는 원인이었다. 쉼표로 나눠 각 이름을 개별로 등록한다.
  const names = String(name || '').split(/[,，]/).map(n => n.trim()).filter(Boolean);
  if(names.length === 0) return;
  const list = loadKnownAuditors();
  let changed = false;
  names.forEach(n => {
    if(!list.includes(n)){ list.push(n); changed = true; }
  });
  if(changed){
    try{ localStorage.setItem(AUDITOR_LIST_STORAGE_KEY, JSON.stringify(list)); }catch(e){ /* non-fatal */ }
  }
  renderAuditorDatalist();
}

export function renderAuditorDatalist(){
  const dl = document.getElementById('knownAuditorDatalist');
  if(!dl) return;
  const list = loadKnownAuditors();
  dl.innerHTML = list.map(n => '<option value="' + String(n).replace(/"/g,'&quot;') + '">').join('');
}

export function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

export function escFd(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

export function esc2(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

export function getCurrentAuditName(){
  const el = document.getElementById('auditNameInput');
  const v = el ? el.value.trim() : '';
  return v || '(감사명 미지정)';
}

export function esc10(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

export function rcGoTo(tabId, elId){
  const btn = document.querySelector('.tabbtn[data-tab="' + tabId + '"]');
  if(btn) btn.click();
  setTimeout(() => {
    const el = elId ? document.getElementById(elId) : null;
    if(el){
      el.scrollIntoView({behavior:'smooth', block:'start'});
      el.classList.add('js-highlight');
      setTimeout(() => el.classList.remove('js-highlight'), 1800);
    }
  }, 120);
}
