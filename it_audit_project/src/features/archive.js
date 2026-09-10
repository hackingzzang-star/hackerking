// ============================================================
// 📚 감사 건별 보기 (auditarchive 탭) — v8.56에서 app.js로부터 물리적으로 분리
// ------------------------------------------------------------
// 감사 건(Engagement) 단위로 지난 결과 모아보기. 3개 함수뿐인 작은 탭입니다.
// 재할당되는 공유 가변 상태가 없어 세터가 필요 없었습니다.
// ============================================================
import {
  AUDIT_UNTAGGED_LABEL,
  REPORT_LOG_TYPE_LABEL,
  findings,
} from '../app.js';
import { esc } from './common.js';
import {
  collectAuditArchiveSummary,
  loadRoundsFromStorage,
} from './collect.js';
import {
  loadReportLog,
} from './report.js';
import {
  KANBAN_COLUMNS,
  loadKanbanCards,
} from './kanban.js';

export function renderAuditArchiveList(){
  const box = document.getElementById('auditArchiveList');
  if(!box) return;
  const rows = collectAuditArchiveSummary();
  if(rows.length === 0){
    box.innerHTML = '<div class="assign-empty" style="text-align:left;color:var(--ink-soft);">아직 태깅된 데이터가 없습니다. ①설문지 생성 탭에 감사명을 입력한 뒤 발견사항·칸반카드·보고서를 만들면 여기에 나타납니다.</div>';
    return;
  }
  box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
    + '<tr style="background:#f1ede1;"><th style="padding:7px 10px;border:1px solid var(--line);text-align:left;">감사명</th><th style="padding:7px 10px;border:1px solid var(--line);">발견사항</th><th style="padding:7px 10px;border:1px solid var(--line);">칸반카드</th><th style="padding:7px 10px;border:1px solid var(--line);">보고서</th><th style="padding:7px 10px;border:1px solid var(--line);">최근 활동</th><th style="padding:7px 10px;border:1px solid var(--line);"></th></tr>'
    + rows.map(r => {
        const isUntagged = r.name === AUDIT_UNTAGGED_LABEL;
        return '<tr' + (isUntagged ? ' style="color:var(--ink-soft);"' : '') + '>'
          + '<td style="padding:7px 10px;border:1px solid var(--line);font-weight:700;' + (isUntagged ? 'font-weight:400;font-style:italic;' : 'color:var(--navy);') + '">' + esc(r.name) + '</td>'
          + '<td style="padding:7px 10px;border:1px solid var(--line);text-align:center;">' + r.findings + '</td>'
          + '<td style="padding:7px 10px;border:1px solid var(--line);text-align:center;">' + r.kanban + '</td>'
          + '<td style="padding:7px 10px;border:1px solid var(--line);text-align:center;">' + r.reports + '</td>'
          + '<td style="padding:7px 10px;border:1px solid var(--line);text-align:center;white-space:nowrap;">' + esc(String(r.lastAt||'').replace('T',' ').slice(0,16) || '-') + '</td>'
          + '<td style="padding:7px 10px;border:1px solid var(--line);text-align:center;"><button type="button" class="gen-small-btn" style="margin:0;" onclick="showAuditArchiveDetail(' + JSON.stringify(r.name).replace(/"/g, '&quot;') + ')">열어보기 ▶</button></td>'
        + '</tr>';
      }).join('')
  + '</table>';
}

export function showAuditArchiveList(){
  const listPanel = document.getElementById('auditArchiveListPanel');
  const detailPanel = document.getElementById('auditArchiveDetailPanel');
  if(listPanel) listPanel.style.display = 'block';
  if(detailPanel) detailPanel.style.display = 'none';
  renderAuditArchiveList();
}

export function showAuditArchiveDetail(auditName){
  const listPanel = document.getElementById('auditArchiveListPanel');
  const detailPanel = document.getElementById('auditArchiveDetailPanel');
  const titleEl = document.getElementById('auditArchiveDetailTitle');
  const bodyEl = document.getElementById('auditArchiveDetailBody');
  if(!detailPanel || !bodyEl) return;
  if(listPanel) listPanel.style.display = 'none';
  detailPanel.style.display = 'block';
  const isUntagged = auditName === AUDIT_UNTAGGED_LABEL;
  if(titleEl) titleEl.textContent = '📚 ' + auditName;

  const matchName = (n) => (n || AUDIT_UNTAGGED_LABEL) === auditName;
  const fList = findings.filter(f => matchName(f.auditName));
  const kList = (typeof loadKanbanCards === 'function' ? loadKanbanCards() : []).filter(c => matchName(c.auditName));
  const rList = loadReportLog().filter(e => matchName(e.auditName)).sort((a,b) => (b.generatedAt||'').localeCompare(a.generatedAt||''));
  const roundList = (typeof loadRoundsFromStorage === 'function' ? loadRoundsFromStorage() : []).filter(r => matchName(r.auditName)).sort((a,b) => (b.savedAt||'').localeCompare(a.savedAt||''));

  const STATUS_LABEL_ARCH = {draft:'📝 초안', confirmed:'✅ 확정', in_progress:'🔧 조치중', remediated:'🛠 조치완료', closed:'🔒 종결'};
  // 발견사항은 클릭하면 현황·권고사항·조치계획 전문까지 펼쳐볼 수 있게 한다 — "이전 감사 때 이 항목을
  // 뭐라고 지적했었는지" 다시 감사를 시작할 때 바로 확인할 수 있어야 한다는 요청을 반영.
  const findingsHtml = fList.length === 0
    ? '<div class="kb-empty" style="text-align:left;">이 감사 건에 등록된 발견사항이 없습니다.</div>'
    : fList.map((f,i) => {
        const rowId = 'archFind' + i;
        return '<details style="border:1px solid var(--line);border-left:3px solid ' + (f.riskLevel==='상'?'var(--risk-hi)':(f.riskLevel==='중'?'var(--risk-mid)':'var(--good)')) + ';margin-bottom:6px;">'
          + '<summary style="cursor:pointer;padding:8px 10px;font-size:11.5px;display:flex;gap:10px;align-items:center;">'
            + '<span class="mono" style="color:var(--ink-soft);">' + esc(f.code||'-') + '</span>'
            + '<b style="flex:1;">' + esc(f.title||'') + '</b>'
            + '<span>위험도 ' + esc(f.riskLevel||'-') + '</span>'
            + '<span>' + esc(f.department||'-') + '</span>'
            + '<span>' + esc(STATUS_LABEL_ARCH[f.status]||'📝 초안') + '</span>'
          + '</summary>'
          + '<div style="padding:10px 14px;font-size:11.5px;line-height:1.7;background:#fffdf8;">'
            + '<div><b>현황:</b> ' + esc(f.description||'(작성 필요)') + '</div>'
            + '<div style="margin-top:4px;"><b>권고사항:</b> ' + esc(f.recommendation||'(작성 필요)') + '</div>'
            + (f.actionPlan ? ('<div style="margin-top:4px;"><b>조치계획:</b> ' + esc(f.actionPlan) + '</div>') : '')
            + (f.dueDate ? ('<div style="margin-top:4px;color:var(--risk-hi);"><b>조치기한:</b> ' + esc(f.dueDate) + '</div>') : '')
            + (f.closedAt ? ('<div style="margin-top:4px;color:var(--good);"><b>조치완료일:</b> ' + esc(String(f.closedAt).replace('T',' ').slice(0,16)) + '</div>') : '')
          + '</div>'
        + '</details>';
      }).join('');

  const kanbanHtml = kList.length === 0
    ? '<div class="kb-empty" style="text-align:left;">이 감사 건에 등록된 칸반카드가 없습니다.</div>'
    : kList.map((c,i) => {
        const hist = Array.isArray(c.history) ? c.history : [];
        return '<details style="border:1px solid var(--line);margin-bottom:6px;">'
          + '<summary style="cursor:pointer;padding:8px 10px;font-size:11.5px;display:flex;gap:10px;align-items:center;">'
            + '<b style="flex:1;">' + esc(c.title||'') + '</b>'
            + '<span>' + esc((typeof KANBAN_COLUMNS !== 'undefined' ? (KANBAN_COLUMNS.find(k=>k.key===c.status)||{}).label : c.status) || c.status) + '</span>'
            + '<span>' + esc(c.assignee||'-') + '</span>'
          + '</summary>'
          + '<div style="padding:10px 14px;font-size:11.5px;line-height:1.7;background:#fffdf8;">'
            + (c.notes ? ('<div><b>메모:</b> ' + esc(c.notes) + '</div>') : '<div style="color:var(--ink-soft);">메모 없음</div>')
            + (hist.length > 0 ? ('<div style="margin-top:6px;"><b>이력:</b>' + hist.slice().reverse().map(h => '<div style="font-size:10.5px;color:var(--ink-soft);">' + esc(String(h.at||'').replace('T',' ').slice(0,16)) + ' → ' + esc((KANBAN_COLUMNS.find(k=>k.key===h.status)||{}).label||h.status) + (h.by?(' ('+esc(h.by)+')'):'') + '</div>').join('') + '</div>') : '')
          + '</div>'
        + '</details>';
      }).join('');

  const reportsHtml = rList.length === 0
    ? '<div class="kb-empty" style="text-align:left;">이 감사 건에 생성된 보고서 이력이 없습니다.</div>'
    : '<table style="width:100%;border-collapse:collapse;font-size:11.5px;">'
      + '<tr style="background:#f1ede1;"><th style="padding:6px 8px;border:1px solid var(--line);text-align:left;">유형</th><th style="padding:6px 8px;border:1px solid var(--line);text-align:left;">제목/범위</th><th style="padding:6px 8px;border:1px solid var(--line);">생성일시</th></tr>'
      + rList.map(e => '<tr><td style="padding:6px 8px;border:1px solid var(--line);">' + esc(REPORT_LOG_TYPE_LABEL[e.type] || e.type) + '</td><td style="padding:6px 8px;border:1px solid var(--line);">' + esc(e.label) + (e.extra ? (' — ' + esc(e.extra)) : '') + '</td><td style="padding:6px 8px;border:1px solid var(--line);text-align:center;white-space:nowrap;">' + esc(String(e.generatedAt||'').replace('T',' ').slice(0,16)) + '</td></tr>').join('')
    + '</table>';

  // 설문 응답 회차 — ③응답 집계에서 "회차로 저장"해둔 스냅샷 중 이 감사명으로 저장된 것들.
  // 이전 감사 때 실제로 어떤 응답이 취합됐었는지, 원자료(rows)까지 열어볼 수 있게 JSON으로 내보내는
  // 버튼을 둔다 — 지난 감사 상세 내역을 나중에 다시 확인해야 하는 상황에 대응.
  const roundsHtml = roundList.length === 0
    ? '<div class="kb-empty" style="text-align:left;">이 감사 건으로 저장된 응답 회차가 없습니다. (③응답 집계에서 "회차로 저장"할 때 ①설문지 생성 탭에 이 감사명이 입력되어 있어야 여기 연결됩니다.)</div>'
    : '<table style="width:100%;border-collapse:collapse;font-size:11.5px;">'
      + '<tr style="background:#f1ede1;"><th style="padding:6px 8px;border:1px solid var(--line);text-align:left;">회차명</th><th style="padding:6px 8px;border:1px solid var(--line);">저장일시</th><th style="padding:6px 8px;border:1px solid var(--line);">응답 건수</th><th style="padding:6px 8px;border:1px solid var(--line);"></th></tr>'
      + roundList.map(r => '<tr><td style="padding:6px 8px;border:1px solid var(--line);">' + esc(r.label||'-') + '</td><td style="padding:6px 8px;border:1px solid var(--line);text-align:center;white-space:nowrap;">' + esc(String(r.savedAt||'').replace('T',' ').slice(0,16)) + '</td><td style="padding:6px 8px;border:1px solid var(--line);text-align:center;">' + (r.rows||[]).length + '건</td><td style="padding:6px 8px;border:1px solid var(--line);text-align:center;"><button type="button" class="gen-small-btn" style="margin:0;font-size:10px;padding:3px 8px;" onclick="exportRoundById(\'' + esc(r.id) + '\')">⬇ JSON</button></td></tr>').join('')
    + '</table>';

  bodyEl.innerHTML =
    (isUntagged ? '<div style="font-size:11px;color:var(--risk-mid);background:var(--risk-mid-bg);border-radius:5px;padding:8px 10px;margin-bottom:14px;">⚠ 이 항목들은 감사명이 지정되기 전(v6.64 이전)에 만들어졌거나, ①설문지 생성 탭에 감사명을 비워둔 채 만들어진 것들입니다.</div>' : '')
    + '<h5 style="font-size:12.5px;color:var(--navy);margin:0 0 8px;">📋 발견사항 (' + fList.length + '건) <span style="font-weight:400;font-size:10.5px;color:var(--ink-soft);">— 클릭하면 상세 펼쳐짐</span></h5>' + findingsHtml
    + '<h5 style="font-size:12.5px;color:var(--navy);margin:14px 0 8px;">🗂 칸반보드 (' + kList.length + '건) <span style="font-weight:400;font-size:10.5px;color:var(--ink-soft);">— 클릭하면 메모·이력 펼쳐짐</span></h5>' + kanbanHtml
    + '<h5 style="font-size:12.5px;color:var(--navy);margin:14px 0 8px;">📈 저장된 응답 회차 (' + roundList.length + '건)</h5>' + roundsHtml
    + '<h5 style="font-size:12.5px;color:var(--navy);margin:14px 0 8px;">📜 보고서 이력 (' + rList.length + '건)</h5>' + reportsHtml;
}
