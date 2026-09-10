// ============================================================
// src/features/kanban.js
// 🗂 칸반보드 탭 — v8.48 app.js에서 물리적으로 분리된 첫 번째 기능 모듈입니다.
// 발견사항/인터뷰 항목을 칸반 카드로 관리(진행상태 변경, 보관함, 진척도 리포트 등)합니다.
// 로직 자체는 원본과 동일하며(수정 없이 이동만 함), 외부(app.js)에서 필요한 공용 유틸/상태만
// import 해서 씁니다.
// ============================================================
import {
  loadFindings,
  DOMAINS, interviewState, selectedCodes
} from '../app.js';
import {
  addKnownAuditor, esc, esc10, getCurrentAuditName, getCurrentAuditor, kstDateStr, kstISOString,
} from './common.js';
import { collectAuditWideStats } from './collect.js';
import { igItemMeta } from './interview.js';
import { logReportGenerated } from './report.js';

export const KANBAN_STORAGE_KEY = 'itaudit_kanban_v1';

export const KANBAN_ARCHIVE_STORAGE_KEY = 'itaudit_kanban_archive_v1';

export function loadKanbanArchive(){ try{ return JSON.parse(localStorage.getItem(KANBAN_ARCHIVE_STORAGE_KEY) || '[]'); }catch(e){ return []; } }

export function saveKanbanArchive(list){ try{ localStorage.setItem(KANBAN_ARCHIVE_STORAGE_KEY, JSON.stringify(list)); }catch(e){ alert('칸반 보관함 저장 실패: ' + e.message); } }

export const KANBAN_COLUMNS = [
  {key:'todo', label:'미착수'},
  {key:'doing', label:'진행중'},
  {key:'review', label:'검토요청'},
  {key:'dispute', label:'이견조율'},
  {key:'done', label:'완료'}
];

export function loadKanbanCards(){ try{ return JSON.parse(localStorage.getItem(KANBAN_STORAGE_KEY) || '[]'); }catch(e){ return []; } }

export function saveKanbanCards(list){ try{ localStorage.setItem(KANBAN_STORAGE_KEY, JSON.stringify(list)); }catch(e){ alert('칸반보드 저장 실패: ' + e.message); } }

export function kanbanPopulateDomainSelect(){
  const sel = document.getElementById('kanbanDomainSelect');
  if(!sel) return;
  // 체크리스트 전체(보통 24~25개 영역)가 아니라, ①설문지 생성 탭에서 "이번 감사 대상"으로
  // 선택해둔 영역(selectedCodes)만 후보로 보여준다 — 이 감사 건과 무관한 영역까지 다 나와서
  // 헷갈린다는 지적을 반영. 아직 대상 영역을 하나도 선택 안 했다면(예: 감사 착수 전 미리 만져볼 때)
  // 전체 체크리스트를 그대로 보여주되, 그 사실을 안내한다.
  const scoped = DOMAINS.filter(d => selectedCodes.has(d.code));
  const useScoped = scoped.length > 0;
  const list = useScoped ? scoped : DOMAINS;
  sel.innerHTML = '<option value="">— 감사영역(도메인) 선택 —</option>' + list.map(d => '<option value="'+d.code+'">D-'+d.code+' '+esc(d.title)+'</option>').join('');
  const hintEl = document.getElementById('kanbanDomainSelectHint');
  if(hintEl) hintEl.textContent = useScoped ? '' : '⚠ ①설문지 생성 탭에서 이번 감사 대상 영역을 아직 선택하지 않아, 체크리스트 전체가 표시되고 있습니다.';
}

export function kanbanPopulateItemSelect(){
  const domSel = document.getElementById('kanbanDomainSelect');
  const itemSel = document.getElementById('kanbanItemSelect');
  if(!domSel || !itemSel) return;
  const dom = DOMAINS.find(d => d.code === domSel.value);
  if(!dom){ itemSel.innerHTML = '<option value="">— 항목 선택 —</option>'; return; }
  itemSel.innerHTML = '<option value="">— 항목 선택 —</option>' + dom.items.map(it => '<option value="'+it.no+'">'+it.no+'. '+esc(it.title)+' [위험'+it.risk+']</option>').join('');
}

export function kanbanAddCard(){
  const domSel = document.getElementById('kanbanDomainSelect');
  const itemSel = document.getElementById('kanbanItemSelect');
  const customInput = document.getElementById('kanbanCustomTitleInput');
  const assigneeInput = document.getElementById('kanbanAssigneeInput');
  const assignee = (assigneeInput.value || '').trim();
  let title = '', domCode = '', itemNo = '', risk = '';
  if(domSel.value && itemSel.value){
    const dom = DOMAINS.find(d => d.code === domSel.value);
    const it = dom ? dom.items.find(x => String(x.no) === itemSel.value) : null;
    if(!it){ alert('항목을 선택해 주세요.'); return; }
    title = it.title; domCode = dom.code; itemNo = it.no; risk = it.risk;
  } else if((customInput.value||'').trim()){
    title = customInput.value.trim();
  } else {
    alert('체크리스트 항목을 선택하거나, 카드 제목을 직접 입력해 주세요.');
    return;
  }
  const cards = loadKanbanCards();
  cards.push({
    id: 'kb' + Date.now() + Math.random().toString(36).slice(2,6),
    title, domCode, itemNo, risk, assignee, auditName: getCurrentAuditName(),
    status: 'todo', notes: '', source: (domCode ? 'checklist' : 'manual'),
    createdAt: kstISOString(), updatedAt: kstISOString(),
    history: [{status: 'todo', at: kstISOString(), by: getCurrentAuditor() || assignee || ''}]
  });
  saveKanbanCards(cards);
  customInput.value = '';
  if(assignee) addKnownAuditor(assignee);
  domSel.value = ''; kanbanPopulateItemSelect();
  renderKanbanBoard();
}

export function kanbanSetStatus(id, newStatus){
  const cards = loadKanbanCards();
  const idx = cards.findIndex(c => c.id === id);
  if(idx === -1) return;
  if(cards[idx].status === newStatus) return;
  cards[idx].status = newStatus;
  cards[idx].updatedAt = kstISOString();
  if(!Array.isArray(cards[idx].history)) cards[idx].history = [];
  cards[idx].history.push({status: newStatus, at: kstISOString(), by: getCurrentAuditor() || ''});
  saveKanbanCards(cards);
  renderKanbanBoard();
}

export function kanbanMoveCard(id, dir){
  const cards = loadKanbanCards();
  const idx = cards.findIndex(c => c.id === id);
  if(idx === -1) return;
  const order = KANBAN_COLUMNS.map(c => c.key);
  const curIdx = order.indexOf(cards[idx].status);
  const newIdx = curIdx + dir;
  if(newIdx < 0 || newIdx >= order.length) return;
  cards[idx].status = order[newIdx];
  cards[idx].updatedAt = kstISOString();
  if(!Array.isArray(cards[idx].history)) cards[idx].history = [];
  cards[idx].history.push({status: order[newIdx], at: kstISOString(), by: getCurrentAuditor() || ''});
  saveKanbanCards(cards);
  renderKanbanBoard();
}

export function kanbanToggleHistory(btn){
  const card = btn.closest('.kb-card');
  const panel = card ? card.querySelector('.kb-history-panel') : null;
  if(!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

export function kanbanDeleteCard(id){
  if(!confirm('이 카드를 삭제할까요?\n\n완전히 사라지지 않고 "🗄 보관함"으로 이동합니다 — 나중에 감사 진척도 리포트에서 이 이력을 참고할 수 있고, 필요하면 복원할 수도 있습니다.')) return;
  const cards = loadKanbanCards();
  const idx = cards.findIndex(c => c.id === id);
  if(idx === -1) return;
  const card = cards[idx];
  card.archivedAt = kstISOString();
  card.archivedBy = getCurrentAuditor() || '';
  const archive = loadKanbanArchive();
  archive.push(card);
  saveKanbanArchive(archive);
  saveKanbanCards(cards.filter(c => c.id !== id));
  renderKanbanBoard();
  if(typeof refreshInterviewKanbanButtons === 'function') refreshInterviewKanbanButtons();
}

export function kanbanRestoreCard(id){
  const archive = loadKanbanArchive();
  const idx = archive.findIndex(c => c.id === id);
  if(idx === -1) return;
  const card = archive[idx];
  delete card.archivedAt;
  delete card.archivedBy;
  const cards = loadKanbanCards();
  cards.push(card);
  saveKanbanCards(cards);
  saveKanbanArchive(archive.filter(c => c.id !== id));
  renderKanbanBoard();
  if(typeof refreshInterviewKanbanButtons === 'function') refreshInterviewKanbanButtons();
}

export function kanbanPurgeArchivedCard(id){
  if(!confirm('보관함에서 이 카드를 영구 삭제할까요? 이후에는 진척도 리포트에도 포함되지 않으며, 되돌릴 수 없습니다.')) return;
  saveKanbanArchive(loadKanbanArchive().filter(c => c.id !== id));
  renderKanbanBoard();
}

export function renderKanbanArchive(){
  const box = document.getElementById('kanbanArchivePanel');
  if(!box) return;
  const archive = loadKanbanArchive();
  if(archive.length === 0){
    box.innerHTML = '<div class="kb-empty" style="text-align:left;color:var(--ink-soft);">보관함이 비어 있습니다. 카드를 삭제하면 여기로 옮겨집니다.</div>';
    return;
  }
  const sorted = archive.slice().sort((a,b) => (b.archivedAt||'').localeCompare(a.archivedAt||''));
  box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11.5px;">'
    + '<tr style="background:#f1ede1;"><th style="padding:6px 8px;border:1px solid var(--line);text-align:left;">항목</th><th style="padding:6px 8px;border:1px solid var(--line);">담당</th><th style="padding:6px 8px;border:1px solid var(--line);">삭제 시 상태</th><th style="padding:6px 8px;border:1px solid var(--line);">삭제일</th><th style="padding:6px 8px;border:1px solid var(--line);"></th></tr>'
    + sorted.map(c => {
        const statusLabel = (KANBAN_COLUMNS.find(k => k.key === c.status) || {}).label || c.status;
        return '<tr>'
          + '<td style="padding:6px 8px;border:1px solid var(--line);">' + (c.domCode ? ('<span class="mono" style="color:var(--steel);">D-'+esc(c.domCode)+'-'+esc(c.itemNo)+'</span> ') : '') + esc(c.title) + '</td>'
          + '<td style="padding:6px 8px;border:1px solid var(--line);text-align:center;">' + esc(c.assignee || '-') + '</td>'
          + '<td style="padding:6px 8px;border:1px solid var(--line);text-align:center;">' + esc(statusLabel) + '</td>'
          + '<td style="padding:6px 8px;border:1px solid var(--line);text-align:center;">' + esc(String(c.archivedAt||'').replace('T',' ').slice(0,16)) + '</td>'
          + '<td style="padding:6px 8px;border:1px solid var(--line);white-space:nowrap;">'
            + '<button type="button" class="gen-small-btn" style="margin:0 4px 0 0;padding:3px 8px;font-size:10px;" onclick="kanbanRestoreCard(\'' + c.id + '\')">↩ 복원</button>'
            + '<button type="button" class="gen-small-btn" style="margin:0;padding:3px 8px;font-size:10px;background:var(--risk-hi);color:#fff;" onclick="kanbanPurgeArchivedCard(\'' + c.id + '\')">영구삭제</button>'
          + '</td>'
        + '</tr>';
      }).join('')
  + '</table>';
}

export function kanbanUpdateNote(id, val){
  const cards = loadKanbanCards();
  const c = cards.find(x => x.id === id);
  if(!c) return;
  c.notes = val; c.updatedAt = kstISOString();
  saveKanbanCards(cards);
}

export function renderKanbanAssigneeFilter(){
  const sel = document.getElementById('kanbanAssigneeFilter');
  if(!sel) return;
  const cards = loadKanbanCards();
  const names = Array.from(new Set(cards.map(c => c.assignee).filter(Boolean))).sort();
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 보기</option>' + names.map(n => '<option value="'+esc(n)+'">'+esc(n)+'</option>').join('');
  if(names.includes(cur)) sel.value = cur;
}

export function renderKanbanDomainFilter(){
  const sel = document.getElementById('kanbanDomainFilter');
  if(!sel) return;
  const cards = loadKanbanCards();
  const codes = Array.from(new Set(cards.map(c => c.domCode).filter(Boolean))).sort();
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체 영역</option>' + codes.map(code => {
    const dom = DOMAINS.find(d => d.code === code);
    return '<option value="'+esc(code)+'">D-'+esc(code)+(dom ? ' '+esc(dom.title) : '')+'</option>';
  }).join('');
  if(codes.includes(cur)) sel.value = cur;
}

export function renderKanbanOverview(){
  const box = document.getElementById('kanbanOverviewTable');
  if(!box) return;
  const cards = loadKanbanCards();
  if(cards.length === 0){
    box.innerHTML = '<div class="kb-empty" style="text-align:left;color:var(--ink-soft);">아직 카드가 없습니다. 위에서 카드를 추가하거나, 다른 감사역의 JSON을 불러오면 여기 요약이 채워집니다.</div>';
    return;
  }
  const names = Array.from(new Set(cards.map(c => c.assignee || '(미배정)')));
  const rows = names.map(name => {
    const mine = cards.filter(c => (c.assignee || '(미배정)') === name);
    const counts = KANBAN_COLUMNS.map(col => mine.filter(c => c.status === col.key).length);
    const disputeCount = counts[3];
    return '<tr' + (disputeCount > 0 ? ' style="background:var(--risk-hi-bg);"' : '') + '>'
      + '<td style="padding:6px 10px;border:1px solid var(--line);font-weight:700;">' + esc(name) + '</td>'
      + counts.map((n, i) => '<td style="padding:6px 10px;border:1px solid var(--line);text-align:center;' + (i===3 && n>0 ? 'color:var(--risk-hi);font-weight:800;' : '') + '">' + n + '</td>').join('')
      + '<td style="padding:6px 10px;border:1px solid var(--line);text-align:center;font-weight:700;">' + mine.length + '</td>'
    + '</tr>';
  });
  box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11.5px;">'
    + '<tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid var(--line);text-align:left;">담당 감사역</th>'
      + KANBAN_COLUMNS.map(c => '<th style="padding:6px 10px;border:1px solid var(--line);">'+c.label+'</th>').join('')
      + '<th style="padding:6px 10px;border:1px solid var(--line);">합계</th></tr>'
    + rows.join('')
  + '</table>'
  + '<p style="font-size:10.5px;color:var(--ink-soft);margin:8px 0 0;">🔴 빨간 행 = 이견조율 단계 카드가 있어 조율자의 확인이 필요합니다.</p>';
}

export const KANBAN_VIEW_KEY = 'itaudit_kanban_view_v1';

export function getKanbanViewMode(){ try{ return localStorage.getItem(KANBAN_VIEW_KEY) || 'board'; }catch(e){ return 'board'; } }

export function setKanbanViewMode(mode){ try{ localStorage.setItem(KANBAN_VIEW_KEY, mode); }catch(e){} }

export function renderKanbanBoard(){
  renderKanbanOverview();
  renderKanbanImportLog();
  const archivePanel = document.getElementById('kanbanArchivePanel');
  if(archivePanel && archivePanel.style.display !== 'none') renderKanbanArchive();
  const board = document.getElementById('kanbanBoard');
  if(!board) return;
  renderKanbanAssigneeFilter();
  renderKanbanDomainFilter();
  const filterSel = document.getElementById('kanbanAssigneeFilter');
  const filterName = filterSel ? filterSel.value : '';
  const domainSel = document.getElementById('kanbanDomainFilter');
  const domainFilter = domainSel ? domainSel.value : '';
  const riskSel = document.getElementById('kanbanRiskFilter');
  const riskFilter = riskSel ? riskSel.value : '';
  let cards = loadKanbanCards();
  if(filterName) cards = cards.filter(c => c.assignee === filterName);
  if(domainFilter) cards = cards.filter(c => c.domCode === domainFilter);
  if(riskFilter) cards = cards.filter(c => c.risk === riskFilter);
  const countEl = document.getElementById('kanbanCardCount');
  if(countEl) countEl.textContent = '총 ' + cards.length + '건';

  const mode = getKanbanViewMode();
  const labelEl = document.getElementById('kanbanViewModeLabel');
  if(labelEl) labelEl.textContent = mode === 'list' ? '목록형' : '보드형';
  board.className = '';
  if(mode === 'list'){
    board.style.display = 'block';
    board.style.overflowX = 'visible';
    board.innerHTML = renderKanbanListHtml(cards);
  } else {
    board.style.display = 'flex';
    board.style.overflowX = 'auto';
    board.innerHTML = renderKanbanColumnsHtml(cards);
  }
}

export function kanbanHistHtml(c){
  const hist = Array.isArray(c.history) ? c.history : [];
  return hist.length === 0 ? '<div style="font-size:9.5px;color:var(--ink-soft);">기록 없음</div>' : hist.slice().reverse().map(h => {
    const label = (KANBAN_COLUMNS.find(k => k.key === h.status) || {}).label || h.status;
    return '<div style="font-size:9.5px;color:var(--ink-soft);padding:2px 0;border-bottom:1px dotted var(--line);">' + esc(String(h.at||'').replace('T',' ').slice(0,16)) + ' → <b>' + esc(label) + '</b>' + (h.by ? ' (' + esc(h.by) + ')' : '') + '</div>';
  }).join('');
}

export function renderKanbanColumnsHtml(cards){
  return KANBAN_COLUMNS.map((col, colIdx) => {
    const colCards = cards.filter(c => c.status === col.key);
    const statusOptionsHtml = (curStatus) => KANBAN_COLUMNS.map(k => '<option value="'+k.key+'"'+(k.key===curStatus?' selected':'')+'>'+k.label+'</option>').join('');
    const cardsHtml = colCards.length === 0 ? '<div class="kb-empty">카드 없음</div>' : colCards.map(c => {
      const hist = Array.isArray(c.history) ? c.history : [];
      const histHtml = kanbanHistHtml(c);
      return '<div class="kb-card">'
        + (c.domCode ? '<span class="kb-tag">D-'+c.domCode+'-'+c.itemNo+(c.risk ? (' · 위험'+c.risk) : '')+'</span>' : '<span class="kb-tag" style="background:var(--indigo);">별도항목</span>')
        + '<div class="kb-title">'+esc(c.title)+'</div>'
        + '<div class="kb-assignee">👤 '+(c.assignee ? esc(c.assignee) : '미배정')+'</div>'
        + (c.updatedAt ? '<div class="kb-assignee" style="opacity:.75;">🕒 ' + esc(String(c.updatedAt).replace('T',' ').slice(0,16)) + '</div>' : '')
        + '<textarea class="kb-note-input" rows="2" placeholder="의견·진행메모" onchange="kanbanUpdateNote(\''+c.id+'\', this.value)">'+esc(c.notes||'')+'</textarea>'
        + '<div class="kb-actions">'
          + '<select class="kb-status-select" onchange="kanbanSetStatus(\''+c.id+'\', this.value)" style="font-size:9.5px;border:1px solid var(--line);border-radius:3px;padding:2px 4px;">'+statusOptionsHtml(c.status)+'</select>'
          + '<button onclick="kanbanToggleHistory(this)">🕐 이력('+hist.length+')</button>'
          + '<button class="kb-del" onclick="kanbanDeleteCard(\''+c.id+'\')">삭제</button>'
        + '</div>'
        + '<div class="kb-history-panel" style="display:none;margin-top:6px;padding-top:6px;border-top:1px solid var(--line);">'+histHtml+'</div>'
        + '</div>';
    }).join('');
    return '<div class="kb-col col-'+col.key+'"><h5>'+col.label+' <span class="kb-col-count">'+colCards.length+'</span></h5>'+cardsHtml+'</div>';
  }).join('');
}

export function renderKanbanListHtml(cards){
  if(cards.length === 0) return '<div class="kb-empty">카드 없음</div>';
  const order = KANBAN_COLUMNS.map(c => c.key);
  const statusOptionsHtml = (curStatus) => KANBAN_COLUMNS.map(k => '<option value="'+k.key+'"'+(k.key===curStatus?' selected':'')+'>'+k.label+'</option>').join('');
  return cards.map(c => {
    const curIdx = order.indexOf(c.status);
    const isDispute = c.status === 'dispute';
    const steps = KANBAN_COLUMNS.map((col, i) => {
      const isActive = i === curIdx;
      const dotClass = isActive ? (isDispute ? 'active dispute-active' : 'active') : '';
      const lineClass = i < curIdx ? 'done' : '';
      const dot = '<span class="kb-step-dot ' + dotClass + '" title="' + esc(col.label) + '">' + (i+1) + '</span>';
      const line = i < KANBAN_COLUMNS.length - 1 ? '<span class="kb-step-line ' + (i < curIdx ? 'done' : '') + '"></span>' : '';
      return dot + line;
    }).join('');
    const hist = Array.isArray(c.history) ? c.history : [];
    const noteId = 'kbnote_' + c.id;
    return '<div class="kb-list-row' + (isDispute ? ' dispute' : '') + '">'
      + '<div class="kb-list-main">'
        + (c.domCode ? '<span class="kb-tag">D-'+c.domCode+'-'+c.itemNo+(c.risk ? (' · 위험'+c.risk) : '')+'</span>' : '<span class="kb-tag" style="background:var(--indigo);">별도항목</span>')
        + '<div class="kb-list-title">'+esc(c.title)+'</div>'
        + '<div class="kb-list-meta">👤 '+(c.assignee ? esc(c.assignee) : '미배정')+(c.updatedAt ? ' · 🕒 '+esc(String(c.updatedAt).replace('T',' ').slice(0,16)) : '')+'</div>'
      + '</div>'
      + '<div class="kb-step-track">' + steps + '</div>'
      + '<div class="kb-list-actions">'
        + '<select class="kb-status-select" onchange="kanbanSetStatus(\''+c.id+'\', this.value)" style="font-size:10px;border:1px solid var(--line);border-radius:3px;padding:3px 5px;">'+statusOptionsHtml(c.status)+'</select>'
        + '<button class="kb-list-note-toggle" onclick="kanbanToggleListNote(this)">💬 메모/이력</button>'
        + '<button class="kb-list-note-toggle kb-del" onclick="kanbanDeleteCard(\''+c.id+'\')">삭제</button>'
      + '</div>'
      + '<div class="kb-list-note-panel">'
        + '<textarea class="kb-note-input" rows="2" placeholder="의견·진행메모" onchange="kanbanUpdateNote(\''+c.id+'\', this.value)">'+esc(c.notes||'')+'</textarea>'
        + '<div style="margin-top:6px;">'+kanbanHistHtml(c)+'</div>'
      + '</div>'
    + '</div>';
  }).join('');
}

export function kanbanToggleListNote(btn){
  const row = btn.closest('.kb-list-row');
  const panel = row ? row.querySelector('.kb-list-note-panel') : null;
  if(panel) panel.classList.toggle('open');
}

export function kanbanExport(){
  let cards = loadKanbanCards();
  const scopeSel = document.getElementById('kanbanExportScope');
  const scope = scopeSel ? scopeSel.value : 'all';
  let scopeLabel = '전체';
  if(scope === 'filtered'){
    const filterSel = document.getElementById('kanbanAssigneeFilter');
    const filterName = filterSel ? filterSel.value : '';
    const domainSel = document.getElementById('kanbanDomainFilter');
    const domainFilter = domainSel ? domainSel.value : '';
    const riskSel = document.getElementById('kanbanRiskFilter');
    const riskFilter = riskSel ? riskSel.value : '';
    if(!filterName && !domainFilter && !riskFilter){
      alert('먼저 위 보드에서 담당 감사역·감사영역·위험도 필터 중 하나 이상을 선택한 뒤 다시 시도해 주세요. (전체 보기 상태에서는 "현재 필터만"을 고를 수 없습니다)');
      return;
    }
    if(filterName) cards = cards.filter(c => c.assignee === filterName);
    if(domainFilter) cards = cards.filter(c => c.domCode === domainFilter);
    if(riskFilter) cards = cards.filter(c => c.risk === riskFilter);
    const labelParts = [];
    if(filterName) labelParts.push(filterName);
    if(domainFilter) labelParts.push('D-'+domainFilter);
    if(riskFilter) labelParts.push('위험'+riskFilter);
    scopeLabel = labelParts.join('·') + ' 필터';
  }
  const payload = {exportedAt: kstISOString(), exportedBy: getCurrentAuditor(), scope: scopeLabel, cards};
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const who = (getCurrentAuditor() || '감사역').replace(/[\\\/:*?"<>|\s]/g, '_');
  const scopeTag = scope === 'filtered' ? '_' + scopeLabel.replace(/[\\\/:*?"<>|\s]/g, '_') : '';
  a.href = url; a.download = 'IT감사_칸반보드_' + who + scopeTag + '_' + kstDateStr() + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export let _kanbanImportParsed = null;

export function kanbanHandleImportFile(file){
  const reader = new FileReader();
  reader.onload = (e) => {
    let parsed;
    try{ parsed = JSON.parse(e.target.result); }catch(err){ alert('JSON 파일을 읽을 수 없습니다: ' + err.message); return; }
    const incoming = Array.isArray(parsed.cards) ? parsed.cards : (Array.isArray(parsed) ? parsed : null);
    if(!incoming){ alert(file.name + ': 인식 가능한 칸반보드 파일 구조가 아닙니다.'); return; }
    _kanbanImportParsed = {fileName: file.name, exportedBy: parsed.exportedBy || '', exportedAt: parsed.exportedAt || '', fileLastModified: file.lastModified || null, cards: incoming};
    kanbanShowImportPreview();
  };
  reader.readAsText(file, 'UTF-8');
}

export function kanbanShowImportPreview(){
  const box = document.getElementById('kanbanImportPreview');
  if(!box || !_kanbanImportParsed) return;
  const existing = loadKanbanCards();
  const existingIds = new Set(existing.map(c => c.id));
  const incoming = _kanbanImportParsed.cards;
  const newCount = incoming.filter(c => !existingIds.has(c.id)).length;
  const updateCount = incoming.filter(c => existingIds.has(c.id)).length;
  const log = loadKanbanImportLog();
  const dupEntry = log.find(l => l.exportedAt && l.exportedAt === _kanbanImportParsed.exportedAt && l.exportedBy === _kanbanImportParsed.exportedBy);
  const dupWarningHtml = dupEntry
    ? '<div style="background:var(--risk-hi-bg);border:1px solid var(--risk-hi);border-radius:5px;padding:8px 10px;margin-bottom:10px;font-size:11.5px;color:var(--risk-hi);">⚠ 이 파일은 이전에 이미 가져온 것과 같아 보입니다 — ' + esc(String(dupEntry.importedAt || '').replace('T',' ').slice(0,16)) + '에 "' + esc(dupEntry.fileName||'') + '" 파일을 가져온 기록이 있습니다. 같은 파일을 다시 가져오면 병합이라도 중복 반영될 수 있으니 확인해 주세요.</div>'
    : '';
  box.style.display = 'block';
  box.innerHTML = dupWarningHtml +
    '<div style="font-size:12.5px;color:var(--navy);font-weight:700;margin-bottom:8px;">📄 '+esc(_kanbanImportParsed.fileName)+' 미리보기</div>'
    + '<div style="font-size:11.5px;color:var(--ink);line-height:1.8;margin-bottom:12px;">'
      + '이 파일에는 카드 <b>'+incoming.length+'개</b>가 있습니다'
      + (_kanbanImportParsed.exportedBy ? ' (내보낸 사람: '+esc(_kanbanImportParsed.exportedBy)+')' : '')
      + (_kanbanImportParsed.exportedAt ? ' · 내보낸 시각: '+esc(String(_kanbanImportParsed.exportedAt).replace('T',' ').slice(0,16)) : '') + '.<br>'
      + '현재 내 보드에는 카드 <b>'+existing.length+'개</b>가 있습니다.<br>'
      + '<b style="color:var(--navy-2);">병합</b>하면: 새 카드 <b>'+newCount+'개</b> 추가, 겹치는 카드 <b>'+updateCount+'개</b>는 파일 내용으로 갱신되고 나머지 기존 카드는 그대로 유지됩니다.<br>'
      + '<b style="color:var(--risk-hi);">전체 덮어쓰기</b>하면: 현재 내 보드의 카드 '+existing.length+'개가 모두 사라지고 이 파일의 카드 '+incoming.length+'개로 완전히 교체됩니다.'
    + '</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
      + '<button class="gen-small-btn" style="margin:0;background:var(--navy-2);color:#fff;" onclick="kanbanConfirmImport(\'merge\')">✅ 이대로 병합 (안전)</button>'
      + '<button class="gen-small-btn" style="margin:0;background:var(--risk-hi);color:#fff;" onclick="kanbanConfirmImport(\'overwrite\')">🗑 전체 덮어쓰기 (주의)</button>'
      + '<button class="gen-small-btn" style="margin:0;" onclick="kanbanCancelImport()">취소</button>'
    + '</div>';
}

export function kanbanConfirmImport(mode){
  if(!_kanbanImportParsed) return;
  const incoming = _kanbanImportParsed.cards;
  let added = 0, updated = 0;
  if(mode === 'overwrite'){
    if(!confirm('정말 전체 덮어쓰기 하시겠습니까? 현재 내 보드의 카드가 모두 사라지고 파일 내용으로 교체됩니다. 되돌릴 수 없습니다.')) return;
    added = incoming.length; updated = 0;
    saveKanbanCards(incoming);
    alert('전체 덮어쓰기 완료: 카드 ' + incoming.length + '개로 교체했습니다.');
  } else {
    const existing = loadKanbanCards();
    const map = {};
    existing.forEach(c => map[c.id] = c);
    incoming.forEach(c => {
      if(map[c.id]) updated++; else added++;
      map[c.id] = c;
    });
    saveKanbanCards(Object.values(map));
    alert('병합 완료: 신규 ' + added + '건 추가, ' + updated + '건 갱신했습니다.');
  }
  addKanbanImportLogEntry({
    importedAt: kstISOString(),
    fileName: _kanbanImportParsed.fileName,
    fileLastModified: _kanbanImportParsed.fileLastModified,
    exportedAt: _kanbanImportParsed.exportedAt,
    exportedBy: _kanbanImportParsed.exportedBy,
    cardsInFile: incoming.length,
    mode, added, updated
  });
  kanbanCancelImport();
  renderKanbanBoard();
  renderKanbanImportLog();
  if(typeof refreshInterviewKanbanButtons === 'function') refreshInterviewKanbanButtons();
}

export const KANBAN_IMPORT_LOG_KEY = 'itaudit_kanban_import_log_v1';

export function loadKanbanImportLog(){ try{ return JSON.parse(localStorage.getItem(KANBAN_IMPORT_LOG_KEY) || '[]'); }catch(e){ return []; } }

export function saveKanbanImportLog(log){ try{ localStorage.setItem(KANBAN_IMPORT_LOG_KEY, JSON.stringify(log)); }catch(e){} }

export function addKanbanImportLogEntry(entry){
  const log = loadKanbanImportLog();
  log.unshift(entry);
  if(log.length > 50) log.length = 50;
  saveKanbanImportLog(log);
}

export function renderKanbanImportLog(){
  const box = document.getElementById('kanbanImportLogTable');
  const countEl = document.getElementById('kanbanImportLogCount');
  if(!box) return;
  const log = loadKanbanImportLog();
  if(countEl) countEl.textContent = log.length > 0 ? ('(' + log.length + '건)') : '';
  if(log.length === 0){
    box.innerHTML = '<div class="kb-empty" style="text-align:left;color:var(--ink-soft);">아직 불러온 기록이 없습니다.</div>';
    return;
  }
  box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11px;">'
    + '<tr style="background:#f1ede1;"><th style="padding:5px 8px;border:1px solid var(--line);">불러온 시각</th><th style="padding:5px 8px;border:1px solid var(--line);">파일명</th><th style="padding:5px 8px;border:1px solid var(--line);">내보낸 사람·시각</th><th style="padding:5px 8px;border:1px solid var(--line);">파일 카드 수</th><th style="padding:5px 8px;border:1px solid var(--line);">방식</th><th style="padding:5px 8px;border:1px solid var(--line);">결과</th></tr>'
    + log.map(l => (
        '<tr>'
        + '<td style="padding:5px 8px;border:1px solid var(--line);font-family:monospace;">' + esc(String(l.importedAt||'').replace('T',' ').slice(0,16)) + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--line);">' + esc(l.fileName||'-') + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--line);">' + esc(l.exportedBy||'(미상)') + (l.exportedAt ? ' · ' + esc(String(l.exportedAt).replace('T',' ').slice(0,16)) : '') + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--line);text-align:center;">' + (l.cardsInFile != null ? l.cardsInFile : '-') + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--line);text-align:center;">' + (l.mode === 'overwrite' ? '🗑 덮어쓰기' : '✅ 병합') + '</td>'
        + '<td style="padding:5px 8px;border:1px solid var(--line);text-align:center;">신규 ' + (l.added||0) + ' · 갱신 ' + (l.updated||0) + '</td>'
        + '</tr>'
      )).join('')
  + '</table>';
}

export function kanbanCancelImport(){
  _kanbanImportParsed = null;
  const box = document.getElementById('kanbanImportPreview');
  if(box){ box.style.display = 'none'; box.innerHTML = ''; }
  const fileInput = document.getElementById('kanbanImportFileInput');
  if(fileInput) fileInput.value = '';
}

export function kanbanSendFromFinding(finding, btnEl){
  if(!finding) return;
  const cards = loadKanbanCards();
  const dup = finding.code
    ? cards.find(c => c.domCode === finding.code.split('-')[0] && String(c.itemNo) === String(finding.code.split('-')[1]))
    : cards.find(c => c.findingId === finding.id);
  if(dup){
    const colLabel = (KANBAN_COLUMNS.find(c => c.key === dup.status) || {}).label || dup.status;
    const makeAnother = confirm(
      '이미 칸반보드에 있는 항목입니다 (현재 상태: ' + colLabel + ').\n\n'
      + '[확인] = 재점검·후속 확인 등을 위해 새 카드를 추가로 만듭니다 (기존 카드는 그대로 둡니다)\n'
      + '[취소] = 새로 만들지 않고 🗂 칸반보드 탭에서 기존 카드를 확인합니다'
    );
    if(!makeAnother) return;
  }
  let domCode = '', itemNo = '';
  if(finding.code){
    const parts = finding.code.split('-');
    domCode = parts[0]; itemNo = parts[1];
  }
  const assignee = finding.assignee || getCurrentAuditor() || '';
  cards.push({
    id: 'kb' + Date.now() + Math.random().toString(36).slice(2,6),
    title: finding.title || finding.code || '(제목 없음)', domCode, itemNo, risk: finding.riskLevel || '',
    assignee, auditName: getCurrentAuditName(), findingId: finding.id,
    status: 'todo', notes: dup ? '(같은 발견사항의 추가 카드 — 재점검·후속 확인용)' : ('발견사항에서 전송: ' + (finding.department||'-')),
    source: 'finding',
    createdAt: kstISOString(), updatedAt: kstISOString(),
    history: [{status: 'todo', at: kstISOString(), by: assignee || ''}]
  });
  saveKanbanCards(cards);
  if(assignee) addKnownAuditor(assignee);
  if(btnEl){
    btnEl.textContent = '✅ 칸반 카드로 보냄';
    const origTitle = btnEl.title;
    setTimeout(() => { btnEl.textContent = '🗂 칸반 카드로 보내기'; }, 2000);
  }
}

export function kanbanSendFromInterview(code, btnEl){
  const meta = (typeof igItemMeta === 'function') ? igItemMeta(code) : {title: code};
  const parts = String(code).split('-');
  const domCode = parts[0];
  const itemNo = parts[1];
  const dom = DOMAINS.find(d => d.code === domCode);
  const itemObj = dom ? dom.items.find(x => String(x.no) === String(itemNo)) : null;
  const risk = itemObj ? itemObj.risk : '';
  const cards = loadKanbanCards();
  const dup = cards.find(c => c.domCode === domCode && String(c.itemNo) === String(itemNo));
  if(dup){
    const colLabel = (KANBAN_COLUMNS.find(c => c.key === dup.status) || {}).label || dup.status;
    const makeAnother = confirm(
      '이미 칸반보드에 있는 항목입니다 (현재 상태: ' + colLabel + ').\n\n'
      + '[확인] = 재점검·후속 확인 등을 위해 새 카드를 추가로 만듭니다 (기존 카드는 그대로 둡니다)\n'
      + '[취소] = 새로 만들지 않고 🗂 칸반보드 탭에서 기존 카드를 확인합니다'
    );
    if(!makeAnother){
      refreshInterviewKanbanButtons();
      return;
    }
  }
  const st = (typeof interviewState !== 'undefined' && interviewState[code]) ? interviewState[code] : {};
  const assignee = st.interviewer || getCurrentAuditor() || '';
  cards.push({
    id: 'kb' + Date.now() + Math.random().toString(36).slice(2,6),
    title: meta.title || code, domCode, itemNo, risk, assignee, auditName: getCurrentAuditName(),
    status: 'todo', notes: dup ? '(같은 항목의 추가 카드 — 재점검·후속 확인용)' : '', source: 'interview',
    createdAt: kstISOString(), updatedAt: kstISOString(),
    history: [{status: 'todo', at: kstISOString(), by: assignee || ''}]
  });
  saveKanbanCards(cards);
  if(assignee) addKnownAuditor(assignee);
  refreshInterviewKanbanButtons();
}

export function refreshInterviewKanbanButtons(){
  const cards = loadKanbanCards();
  document.querySelectorAll('.ig-kanban-send-btn[data-ig-kanban-code]').forEach(btn => {
    const code = btn.getAttribute('data-ig-kanban-code');
    const parts = String(code).split('-');
    const count = cards.filter(c => c.domCode === parts[0] && String(c.itemNo) === String(parts[1])).length;
    if(count > 0){
      btn.textContent = '🗂 칸반 카드로 보내기 (이미 ' + count + '건)';
    } else {
      btn.textContent = '🗂 칸반 카드로 보내기';
    }
    btn.disabled = false;
    btn.style.opacity = '';
  });
}

export function buildKanbanProgressReportHtml(){
  const active = loadKanbanCards();
  const archived = loadKanbanArchive();
  const all = active.concat(archived);
  const auditName = (document.getElementById('auditNameInput') || {}).value || '(감사명 미입력)';
  const today = kstDateStr();

  // ⓪ 감사 수행 현황 요약 — 칸반보드뿐 아니라 응답 취합·인터뷰·발견사항까지, 지금 이 감사가
  // 전반적으로 어디까지 왔는지 한눈에 보여준다("진행형 사항을 많이 담아달라"는 요청 반영).
  const wideStats = (typeof collectAuditWideStats === 'function') ? collectAuditWideStats() : null;
  const findingsList = (typeof loadFindings === 'function') ? loadFindings() : [];
  const FINDING_STATUS_LABEL10 = {draft:'📝 초안', confirmed:'✅ 확정', in_progress:'🔧 조치중', remediated:'🛠 조치완료', closed:'🔒 종결'};
  const findingStatusCounts10 = {};
  findingsList.forEach(f => { const s = f.status || 'draft'; findingStatusCounts10[s] = (findingStatusCounts10[s]||0) + 1; });
  const findingsFromKanban = all.filter(c => c.source === 'finding').length;
  const overviewHtml10 = '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
    + '<tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;text-align:left;">구분</th><th style="padding:6px 10px;border:1px solid #ccc;text-align:left;">현황</th></tr>'
    + '<tr><td style="padding:6px 10px;border:1px solid #ccc;">📋 설문 응답 취합</td><td style="padding:6px 10px;border:1px solid #ccc;">' + (wideStats && wideStats.totalResp > 0 ? (wideStats.respDepts.size + '개 부서 · 체크포인트 ' + wideStats.totalResp + '건 응답') : '아직 취합된 응답 없음') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;border:1px solid #ccc;">🎤 인터뷰 진행</td><td style="padding:6px 10px;border:1px solid #ccc;">' + (wideStats && wideStats.interviewTotal > 0 ? (wideStats.interviewDoneCount + ' / ' + wideStats.interviewTotal + '건 완료') : '아직 진행된 인터뷰 없음') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;border:1px solid #ccc;">📋 발견사항 등록</td><td style="padding:6px 10px;border:1px solid #ccc;">' + (findingsList.length > 0 ? (findingsList.length + '건 — ' + Object.keys(FINDING_STATUS_LABEL10).map(s => findingStatusCounts10[s] ? (FINDING_STATUS_LABEL10[s] + ' ' + findingStatusCounts10[s] + '건') : '').filter(Boolean).join(' · ')) : '아직 등록된 발견사항 없음') + '</td></tr>'
    + '<tr><td style="padding:6px 10px;border:1px solid #ccc;">🗂 칸반보드 연계</td><td style="padding:6px 10px;border:1px solid #ccc;">전체 ' + all.length + '건 (인터뷰에서 전송 ' + all.filter(c=>c.source==='interview').length + '건 · 발견사항에서 전송 ' + findingsFromKanban + '건 · 직접 등록 ' + all.filter(c=>c.source==='manual'||!c.source).length + '건)</td></tr>'
  + '</table>';

  if(all.length === 0){
    return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>감사 진척도 리포트</title></head><body style="font-family:sans-serif;padding:40px;text-align:center;color:#777;">'
      + '<h2>아직 칸반 카드가 없습니다</h2><p>🗂 칸반보드 탭에서 카드를 추가하거나 인터뷰 가이드에서 카드를 보낸 뒤 다시 생성해 주세요.</p></body></html>';
  }

  // 단계별 분포 (활성 카드 기준 — 보관된 카드는 이미 감사 흐름에서 빠진 것이므로 "현재 진행 단계" 집계에서는 제외하고
  // 완료 건수 집계 시에만 함께 합산한다)
  const stageCounts = KANBAN_COLUMNS.map(col => active.filter(c => c.status === col.key).length);
  const doneActive = stageCounts[KANBAN_COLUMNS.findIndex(c => c.key === 'done')] || 0;
  const doneArchived = archived.filter(c => c.status === 'done').length;
  const totalDone = doneActive + doneArchived;
  const totalAll = all.length;
  const overallPct = totalAll ? Math.round((totalDone / totalAll) * 100) : 0;
  const maxStage = Math.max(1, ...stageCounts);

  const stageBarsHtml = KANBAN_COLUMNS.map((col, i) => {
    const n = stageCounts[i];
    const pct = Math.round((n / maxStage) * 100);
    const barColor = col.key === 'done' ? 'var(--good)' : (col.key === 'dispute' ? 'var(--risk-hi)' : 'var(--navy-2)');
    return '<div style="margin-bottom:9px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px;"><span>' + esc10(col.label) + '</span><b>' + n + '건</b></div>'
      + '<div style="background:#e7e1d1;height:14px;border-radius:3px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:' + barColor + ';"></div></div>'
    + '</div>';
  }).join('');

  // 담당자별 현황 (활성 + 보관 합산, 보관은 별도 열로 구분)
  const names = Array.from(new Set(all.map(c => c.assignee || '(미배정)')));
  const assigneeRows = names.map(name => {
    const mine = active.filter(c => (c.assignee || '(미배정)') === name);
    const mineArchived = archived.filter(c => (c.assignee || '(미배정)') === name);
    const counts = KANBAN_COLUMNS.map(col => mine.filter(c => c.status === col.key).length);
    return '<tr><td style="padding:6px 10px;border:1px solid #ccc;font-weight:700;">' + esc10(name) + '</td>'
      + counts.map(n => '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + n + '</td>').join('')
      + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;color:#777;">' + mineArchived.length + '</td>'
      + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;font-weight:700;">' + (mine.length + mineArchived.length) + '</td></tr>';
  }).join('');

  // 위험도 '상' + 아직 완료되지 않은 항목 (우선순위 참고용)
  const highRiskPending = active.filter(c => c.risk === '상' && c.status !== 'done')
    .sort((a,b) => (a.updatedAt||'').localeCompare(b.updatedAt||''));
  const highRiskHtml = highRiskPending.length === 0
    ? '<p style="font-size:12px;color:#2e7d5b;">✓ 위험도 "상"이면서 미완료인 카드가 없습니다.</p>'
    : '<table style="width:100%;border-collapse:collapse;font-size:12px;"><tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;text-align:left;">항목</th><th style="padding:6px 10px;border:1px solid #ccc;">담당</th><th style="padding:6px 10px;border:1px solid #ccc;">현재 단계</th></tr>'
      + highRiskPending.map(c => '<tr><td style="padding:6px 10px;border:1px solid #ccc;">' + (c.domCode ? ('D-'+esc10(c.domCode)+'-'+esc10(c.itemNo)+' · ') : '') + esc10(c.title) + '</td><td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + esc10(c.assignee||'-') + '</td><td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + esc10((KANBAN_COLUMNS.find(k=>k.key===c.status)||{}).label||c.status) + '</td></tr>').join('')
    + '</table>';

  // 정체 항목: 완료가 아니면서 7일 이상 상태 변경이 없는 카드 — "앞으로 할 일이 얼마나 남았는지"를
  // 판단할 때, 단순 건수뿐 아니라 "멈춰 있는 항목"이 있는지가 기간 연장 여부 판단에 중요하다는 점에 착안.
  const now = Date.now();
  const STALE_DAYS = 7;
  const staleCards = active.filter(c => {
    if(c.status === 'done') return false;
    const last = c.updatedAt || c.createdAt;
    if(!last) return false;
    const diffDays = (now - new Date(last).getTime()) / 86400000;
    return diffDays >= STALE_DAYS;
  }).sort((a,b) => (a.updatedAt||'').localeCompare(b.updatedAt||''));
  const staleHtml = staleCards.length === 0
    ? '<p style="font-size:12px;color:#2e7d5b;">✓ ' + STALE_DAYS + '일 이상 멈춰 있는 항목이 없습니다.</p>'
    : '<table style="width:100%;border-collapse:collapse;font-size:12px;"><tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;text-align:left;">항목</th><th style="padding:6px 10px;border:1px solid #ccc;">담당</th><th style="padding:6px 10px;border:1px solid #ccc;">현재 단계</th><th style="padding:6px 10px;border:1px solid #ccc;">마지막 변경</th></tr>'
      + staleCards.map(c => {
          const last = String(c.updatedAt || c.createdAt || '').replace('T',' ').slice(0,16);
          return '<tr><td style="padding:6px 10px;border:1px solid #ccc;">' + (c.domCode ? ('D-'+esc10(c.domCode)+'-'+esc10(c.itemNo)+' · ') : '') + esc10(c.title) + '</td><td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + esc10(c.assignee||'-') + '</td><td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + esc10((KANBAN_COLUMNS.find(k=>k.key===c.status)||{}).label||c.status) + '</td><td style="padding:6px 10px;border:1px solid #ccc;text-align:center;color:#a23b2e;">' + esc10(last) + '</td></tr>';
        }).join('')
    + '</table>';

  // 진행 속도(추세) 추정: 모든 카드(활성+보관)의 히스토리에서 "done" 전환 시점을 모아, 감사 시작(추정, 가장 이른 createdAt)부터
  // 오늘까지 경과 주(週) 수 대비 완료 건수로 "주당 평균 완료 속도"를 구하고, 남은 건수를 그 속도로 나눠 "남은 기간(추정)"을 계산한다.
  // 이 계산은 어디까지나 지금까지의 평균 속도를 그대로 미래에 적용한 단순 추정치이며, 실제 남은 난이도·인력 변화는 반영하지 않는다.
  const createdDates = all.map(c => c.createdAt).filter(Boolean).map(d => new Date(d).getTime());
  const earliestCreated = createdDates.length ? Math.min(...createdDates) : now;
  const elapsedWeeks = Math.max(1, (now - earliestCreated) / (7*86400000));
  const velocityPerWeek = totalDone / elapsedWeeks;
  const remaining = totalAll - totalDone;
  const estWeeksLeft = velocityPerWeek > 0.01 ? Math.ceil(remaining / velocityPerWeek) : null;

  const paceNote = remaining === 0
    ? '<p style="font-size:12.5px;color:#2e7d5b;font-weight:700;">🎉 모든 카드가 완료되었습니다.</p>'
    : (estWeeksLeft === null
        ? '<p style="font-size:12.5px;color:#a23b2e;">⚠ 최근 완료 속도가 거의 0에 가깝습니다 (주당 ' + velocityPerWeek.toFixed(2) + '건). 진행이 멈춘 것은 아닌지 확인이 필요합니다.</p>'
        : '<p style="font-size:12.5px;color:#1b2330;">현재 평균 속도(주당 약 <b>' + velocityPerWeek.toFixed(1) + '건</b> 완료)가 그대로 유지된다고 가정하면, 남은 ' + remaining + '건을 마치는 데 약 <b>' + estWeeksLeft + '주</b>가 더 필요할 것으로 추정됩니다. (평균 속도 기반 단순 추정이며, 실제 남은 항목의 난이도나 인력 배치에 따라 달라질 수 있습니다.)</p>');

  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>감사 진척도 리포트 — ' + esc10(auditName) + '</title><style>'
    + 'body{font-family:"Pretendard","Noto Sans KR",sans-serif;color:#1b2330;max-width:800px;margin:24px auto;padding:0 20px;}'
    + ':root{--navy:#132845;--navy-2:#1d3a63;--good:#2e7d5b;--risk-hi:#a23b2e;}'
    + '.pr-hero{background:linear-gradient(155deg,#132845 0%,#1d3a63 62%,#24406b 100%);color:#f4efe2;padding:24px 30px;border-radius:6px 6px 0 0;}'
    + '.pr-hero .eyebrow{font-family:monospace;letter-spacing:.15em;font-size:11px;color:#e4c78a;text-transform:uppercase;margin-bottom:6px;}'
    + '.pr-hero h1{margin:0 0 4px;font-size:21px;}'
    + '.pr-hero .sub{font-size:12px;color:#c9d2e2;}'
    + '.pr-gauge{display:flex;align-items:center;gap:18px;margin-top:14px;}'
    + '.pr-gauge .num{font-size:38px;font-weight:800;font-family:monospace;color:#fff;}'
    + '.pr-gauge .track{flex:1;height:16px;background:rgba(255,255,255,.18);border-radius:8px;overflow:hidden;}'
    + '.pr-gauge .fill{height:100%;background:#e4c78a;}'
    + '.pr-body{border:1px solid #dcd6c8;border-top:none;padding:22px 26px;}'
    + '.pr-section{margin-bottom:22px;}'
    + '.pr-section h3{font-size:14px;color:#132845;border-bottom:2px solid #132845;padding-bottom:6px;margin-bottom:12px;}'
    + '.pr-print-btn{margin:16px 0;font-family:monospace;font-size:12px;background:#132845;color:#f4efe2;border:none;padding:9px 18px;border-radius:6px;cursor:pointer;}'
    + '@media print{ .pr-print-btn{display:none;} body{margin:0;max-width:none;} @page{size:A4;margin:14mm 12mm;} }'
    + '</style></head><body>'
    + '<button class="pr-print-btn" onclick="window.print()">🖨 인쇄 / PDF 저장</button>'
    + '<div class="pr-hero"><div class="eyebrow">IT AUDIT · PROGRESS INFOGRAPHIC</div><h1>📊 감사 진척도 리포트</h1><div class="sub">' + esc10(auditName) + ' · 작성일 ' + today + ' (KST) · 활성 ' + active.length + '건 + 보관 ' + archived.length + '건 = 총 ' + totalAll + '건</div>'
      + '<div class="pr-gauge"><div class="num">' + overallPct + '%</div><div class="track"><div class="fill" style="width:' + overallPct + '%;"></div></div></div>'
    + '</div>'
    + '<div class="pr-body">'
      + '<div class="pr-section"><h3>⓪ 감사 수행 현황 요약 (칸반보드 외 전체)</h3>' + overviewHtml10 + '</div>'
      + '<div class="pr-section"><h3>① 단계별 분포 (현재 활성 카드 기준)</h3>' + stageBarsHtml + '</div>'
      + '<div class="pr-section"><h3>② 담당 감사역별 현황</h3><table style="width:100%;border-collapse:collapse;font-size:11.5px;"><tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;text-align:left;">담당</th>'
        + KANBAN_COLUMNS.map(c => '<th style="padding:6px 10px;border:1px solid #ccc;">'+esc10(c.label)+'</th>').join('')
        + '<th style="padding:6px 10px;border:1px solid #ccc;">보관(삭제)</th><th style="padding:6px 10px;border:1px solid #ccc;">합계</th></tr>' + assigneeRows + '</table></div>'
      + '<div class="pr-section"><h3>③ 위험도 "상" 미완료 항목 (우선순위 참고)</h3>' + highRiskHtml + '</div>'
      + '<div class="pr-section"><h3>④ 정체된 항목 (' + STALE_DAYS + '일 이상 변화 없음)</h3>' + staleHtml + '</div>'
      + '<div class="pr-section"><h3>⑤ 진행 속도 · 잔여 기간 추정</h3>' + paceNote + '</div>'
      + '<div style="font-size:11px;color:#5a6472;background:#f5f1e6;border-radius:6px;padding:10px 14px;line-height:1.7;">💡 이 리포트는 감사 기간 연장·조기 종료 여부를 판단하는 참고 자료입니다. 개별 발견사항의 상세 내용은 📋 발견사항 관리 탭과 📄 감사조서를 참고하세요.</div>'
    + '</div>'
    + '</body></html>';
}

export function openKanbanProgressReport(){
  const html = buildKanbanProgressReportHtml();
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=900,height=1000');
  logReportGenerated('progress', '📊 감사 진척도 리포트', '');
}

// ============================================================
// [v8.49] 모듈 전환에 따른 명시적 전역(window) 노출
// ------------------------------------------------------------
// 이 모듈이 render 함수들로 동적으로 그려내는 칸반 카드 HTML 안에는
// onclick="kanbanDeleteCard(...)" 같은 인라인 핸들러 문자열이 그대로 박혀 있다.
// app.js가 index.html의 정적 onclick을 위해 하는 것과 같은 이유로, 이 모듈도
// 자기 자신이 만들어내는 동적 onclick 대상 함수들을 window에 노출해야 한다.
// (app.js 쪽 노출은 app.js 파일 끝의 동일한 블록 참고 — 정적 onclick(openKanbanProgressReport)
// 하나만 app.js가 이 모듈에서 import해 쓰는 것도 그쪽에 노출되어 있다.)
Object.assign(window, {
  kanbanCancelImport,
  kanbanConfirmImport,
  kanbanDeleteCard,
  kanbanPurgeArchivedCard,
  kanbanRestoreCard,
  kanbanSetStatus,
  kanbanToggleHistory,
  kanbanToggleListNote,
  kanbanUpdateNote,
  // app.js가 인터뷰 가이드 화면에서 동적으로 그리는 "칸반으로 보내기" 버튼이 참조
  kanbanSendFromInterview,
});
