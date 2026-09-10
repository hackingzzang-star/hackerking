// ============================================================
// 🎤 인터뷰 가이드 (interview 탭) — v8.52에서 app.js로부터 물리적으로 분리
// [v8.61 버그수정] INTERVIEW_SCRIPTS/AI_FLOW_DEFAULTS/DEFAULT_DOMAINS 3개가 이 파일에서
// 실제로 쓰이는데도 v8.52 분리 당시 import가 통째로 빠져 있었음("... is not defined" 런타임
// 에러 원인). 원본 v8.48 HTML과 데이터 6종을 바이트 단위로 재대사해 데이터 유실은 없음을
// 확인했고, 이 파일 3개를 포함해 app.js+13개 기능 모듈 전체를 정적 분석 스캐너로 재검증해
// "쓰지만 import 안 된 식별자"가 더 없음을 확인함.
// ------------------------------------------------------------
// 인터뷰 스크립트/순서도 편집(scriptOverrides·flowOverrides), AI 프롬프트 제작기,
// 인터뷰 일정 달력, 협동 감사 기록 병합 등.
// igDomainFilter/igGroupFilter/igGroupMode/igViewMode/customInterviewItems/_imCalMonth/
// _imCalYear는 app.js가 소유한 공유 가변 상태(let)라서, 재할당은 app.js가 내보낸 세터로만
// 한다(원본의 직접 재할당을 세터 호출로 치환했을 뿐 로직·순서는 동일). scriptOverrides/
// flowOverrides는 재할당이 아니라 항상 프로퍼티 단위로만 변경되므로(OverrideStore와 같은
// 객체를 참조) 세터가 필요 없다.
// ============================================================
import INTERVIEW_SCRIPTS from '../data/interview-scripts.js';
import AI_FLOW_DEFAULTS from '../data/ai-flow-defaults.js';
import DEFAULT_DOMAINS from '../data/domains-data.js';
import {
  CUSTOM_INTERVIEW_STORAGE_KEY,
  DOMAINS,
  IGW_FLOWCHART_JS_BODY,
  IG_TIER_ICON,
  IG_TIER_LABEL,
  INTERVIEW_FLOW_OVERRIDE_KEY,
  INTERVIEW_ITEM_META,
  INTERVIEW_SCHEDULE_KEY,
  INTERVIEW_SCRIPT_OVERRIDE_KEY,
  INTERVIEW_STATE_STORAGE_KEY,
  IPPF_STAGES,
  SYSTEM_VERSION,
  _imCalMonth,
  _imCalYear,
  activeRoundLabel,
  aggRows,
  aiNoContextCodes,
  customInterviewItems,
  findings,
  flowOverrides,
  flowStore,
  igCardDeptView,
  igDomainFilter,
  igExpandedCodes,
  igForkExpandedCodes,
  igGroupFilter,
  igGroupMode,
  igViewMode,
  igfEditState,
  igfOpenCodes,
  interviewSchedule,
  interviewState,
  itemAuditorMap,
  scriptOverrides,
  scriptStore,
  setIgDomainFilter,
  setIgGroupFilter,
  setIgGroupMode,
  setIgViewMode,
  setCustomInterviewItems,
  setImCalMonth,
  setImCalYear,
} from '../app.js';
import {
  addKnownAuditor, esc, esc2, escFd, getCurrentAuditName, getCurrentAuditor,
  kstDateStr, kstISOString, loadKnownAuditors, versionSuffix, safeAssign,
} from './common.js';
import {
  applyOverrides,
  domainAuditorCandidates,
  igEvidenceChecklistHtml,
  igFindDomain,
  itemDeptScopeBadgeHtml,
  wireIgEvidenceChecklist,
} from './generate.js';
import {
  itemLevelRows,
  loadRoundsFromStorage,
} from './collect.js';
import {
  openFindingEditGuarded,
  scrollToFindingCard,
} from './findings.js';
import {
  computeIppfStageStatuses,
  logReportGenerated,
} from './report.js';
import { exportAssignedPacketsByAuditor } from './data.js';

export function renderIppfFlow(stats){
  const el = document.getElementById('ippfFlow');
  if(!el) return;
  const {statuses} = computeIppfStageStatuses(stats);
  const STATUS_LABEL = {done:'완료', current:'진행중', todo:'예정'};

  el.innerHTML = IPPF_STAGES.map((s, i) => {
    const st = statuses[i];
    const box = '<div class="ippf-step ' + st + '"><span class="ippf-status">' + STATUS_LABEL[st] + '</span>'
      + '<span class="ippf-num">' + s.num + '</span><b>' + s.title + '</b><span>' + s.desc + '</span></div>';
    return i < IPPF_STAGES.length - 1 ? (box + '<div class="ippf-arrow">→</div>') : box;
  }).join('');
}

export function igOwnerPersonDetailHtml(person, fRows, rowId){
  // 지목된 관련 담당자(person) 이름이 들어간 모든 행을 모아, 그 사람이 관련된 항목들을 코드 단위로
  // 펼쳐 보여준다. ownPerson은 콤마로 여러 명이 함께 적혀 있을 수 있으므로, 여기서도 그 이름이
  // 포함된 행인지(정확히 이 사람 것인지) 다시 한 번 콤마 분리해서 확인한다.
  const rows = fRows.filter(r => r.ownPerson && String(r.ownPerson).split(',').map(s => s.trim()).includes(person));
  if(rows.length === 0) return '<div class="ig-detail-empty">관련 응답이 없습니다.</div>' + igDetailCloseBarHtml(rowId);
  const byCode = {};
  const order = [];
  rows.forEach(r => {
    if(!byCode[r.code]){ byCode[r.code] = []; order.push(r.code); }
    byCode[r.code].push(r);
  });
  order.sort((a,b) => {
    const [ad,an] = a.split('-'); const [bd,bn] = b.split('-');
    if(ad !== bd) return ad.localeCompare(bd);
    return Number(an) - Number(bn);
  });
  const TIER_ICON4 = {good:'✅', neutral:'🟡', bad:'🚩', na:'⬜'};
  const TIER_LABEL5 = {good:'이행', neutral:'부분이행', bad:'미흡', na:'해당없음'};
  return '<div class="ig-detail-panel" style="display:block;border-top:none;">'
    + '<div class="ig-detail-groups">'
    + order.map(code => {
        const itemRows = byCode[code];
        const meta = igItemMeta(code);
        const dept = itemRows[0].dept || '(부서 미상)';
        const author = itemRows[0].author || '';
        const note = itemRows.find(r => r.note)?.note || '';
        return '<div class="ig-detail-group">'
          + '<div class="ig-detail-group-head"><span class="ig-detail-dept">' + esc(code) + '</span>'
            + '<span class="ig-detail-author">' + esc(meta.title) + '</span>'
            + '<span class="ig-detail-sr">' + esc(dept) + (author ? ' · 작성 ' + esc(author) : '') + '</span>'
          + '</div>'
          + (note ? '<div class="ig-detail-note">📝 비고: ' + esc(note) + '</div>' : '')
          + '<ul class="ig-detail-cp-list">'
            + itemRows.map(r => {
                const t = r.tier || 'neutral';
                return '<li class="ig-detail-cp"><span class="ig-detail-badge ' + t + '">' + (TIER_ICON4[t]||'') + ' ' + (TIER_LABEL5[t]||r.resp||'') + '</span><span class="ig-detail-cptext">' + esc(r.cptext||'') + '</span></li>';
              }).join('')
          + '</ul>'
        + '</div>';
      }).join('')
    + '</div>' + igDetailCloseBarHtml(rowId) + '</div>';
}

export function igTargetDetailHtml(dept, author, rowId){
  // 인터뷰 대상자 현황 표의 [🔍 상세] 버튼용 — 해당 부서·작성자가 실제로 어떤 항목에서
  // 무엇을 어떻게 응답했는지 항목 단위로 펼쳐 보여준다. igResponseDetailHtml(항목코드 기준)의
  // 대응 짝으로, 여기서는 "사람" 기준으로 그 사람이 답한 모든 항목을 모아 보여준다.
  const isMissingDept = dept === '(부서 미입력)';
  const isMissingAuthor = author === '(작성자 미입력)';
  const rows = aggRows.filter(r =>
    (isMissingDept ? !r.dept : r.dept === dept) && (isMissingAuthor ? !r.author : r.author === author)
  );
  if(rows.length === 0) return '<div class="ig-detail-empty">응답 데이터가 없습니다.</div>' + igDetailCloseBarHtml(rowId);
  const byCode = {};
  const order = [];
  rows.forEach(r => {
    if(!byCode[r.code]){ byCode[r.code] = []; order.push(r.code); }
    byCode[r.code].push(r);
  });
  order.sort((a,b) => {
    const [ad,an] = a.split('-'); const [bd,bn] = b.split('-');
    if(ad !== bd) return ad.localeCompare(bd);
    return Number(an) - Number(bn);
  });
  const TIER_ICON3 = {good:'✅', neutral:'🟡', bad:'🚩', na:'⬜'};
  const TIER_LABEL4 = {good:'이행', neutral:'부분이행', bad:'미흡', na:'해당없음'};
  return '<div class="ig-detail-panel" style="display:block;border-top:none;">'
    + '<div class="ig-detail-groups">'
    + order.map(code => {
        const itemRows = byCode[code];
        const meta = igItemMeta(code);
        const note = itemRows.find(r => r.note)?.note || '';
        const sr = itemRows.find(r => r.sr)?.sr || '';
        const srNote = itemRows.find(r => r.srNote)?.srNote || '';
        return '<div class="ig-detail-group">'
          + '<div class="ig-detail-group-head"><span class="ig-detail-dept">' + esc(code) + '</span>'
            + '<span class="ig-detail-author">' + esc(meta.title) + '</span>'
            + (sr ? '<span class="ig-detail-sr">자체평가: ' + esc(sr) + '</span>' : '')
          + '</div>'
          + (note ? '<div class="ig-detail-note">📝 비고: ' + esc(note) + '</div>' : '')
          + (srNote ? '<div class="ig-detail-note">🗒 자체평가 근거: ' + esc(srNote) + '</div>' : '')
          + '<ul class="ig-detail-cp-list">'
            + itemRows.map(r => {
                const t = r.tier || 'neutral';
                return '<li class="ig-detail-cp"><span class="ig-detail-badge ' + t + '">' + (TIER_ICON3[t]||'') + ' ' + (TIER_LABEL4[t]||r.resp||'') + '</span><span class="ig-detail-cptext">' + esc(r.cptext||'') + '</span></li>';
              }).join('')
          + '</ul>'
        + '</div>';
      }).join('')
    + '</div>' + igDetailCloseBarHtml(rowId) + '</div>';
}

export function igDetailCloseBarHtml(rowId){
  if(!rowId) return '';
  return '<div style="text-align:center;padding:10px 0 4px;border-top:1px dashed var(--line);margin-top:8px;">'
    + '<button type="button" class="ig-detail-toggle-btn" onclick="collapseDetailRowAndScroll(\'' + rowId + '\')">🔼 닫기 (목록으로)</button>'
  + '</div>';
}

export function getAllInterviewOverrides(){
  // 모든 항목의 interviewState.cpOverrides를 훑어, 인터뷰로 응답이 바뀐 체크포인트를 전부 모은다.
  const list = [];
  Object.keys(interviewState).forEach(code => {
    const st = interviewState[code];
    if(!st || !st.cpOverrides) return;
    const item = igFindItem ? igFindItem(code) : null;
    const meta = igItemMeta ? igItemMeta(code) : null;
    Object.keys(st.cpOverrides).forEach(key => {
      const ov = st.cpOverrides[key];
      list.push(Object.assign({code, itemTitle: (meta && meta.title) || (item && item.title) || '', risk: item ? item.risk : ''}, ov));
    });
  });
  list.sort((a,b) => (b.changedAt||'').localeCompare(a.changedAt||''));
  return list;
}

export function renderInterviewOverridesTable(){
  const wrap = document.getElementById('interviewOverridesTableWrap');
  const table = document.getElementById('interviewOverridesTable');
  const badge = document.getElementById('cnt-interviewOverridesTable');
  if(!table) return;
  const overrides = getAllInterviewOverrides();
  if(wrap) wrap.style.display = overrides.length > 0 ? 'block' : 'none';
  if(badge) badge.textContent = overrides.length > 0 ? String(overrides.length) : '';
  if(overrides.length === 0){ table.innerHTML = ''; return; }
  table.innerHTML = '<tr><th>부서</th><th>항목코드</th><th class="agg-wrap-cell">항목명</th><th class="agg-wrap-cell">체크포인트</th><th>원래 응답</th><th>변경된 응답</th><th class="agg-wrap-cell">변경 사유</th><th>변경자</th><th>변경일시</th></tr>'
    + overrides.map(ov =>
      '<tr><td>' + esc(ov.dept||'-') + '</td><td class="mono">' + esc(ov.code) + '</td><td class="agg-wrap-cell">' + esc(ov.itemTitle) + '</td>'
      + '<td class="agg-wrap-cell">' + esc(ov.cptext||'') + '</td>'
      + '<td><span class="ig-detail-badge ' + (ov.originalTier||'neutral') + '">' + (IG_TIER_ICON[ov.originalTier]||'') + ' ' + esc(IG_TIER_LABEL[ov.originalTier]||ov.originalResp||'') + '</span></td>'
      + '<td><span class="ig-detail-badge ' + (ov.newTier||'neutral') + '">' + (IG_TIER_ICON[ov.newTier]||'') + ' ' + esc(IG_TIER_LABEL[ov.newTier]||'') + '</span></td>'
      + '<td class="agg-wrap-cell">' + esc(ov.reason||'-') + '</td><td>' + esc(ov.changedBy||'-') + '</td>'
      + '<td>' + esc(ov.changedAt ? String(ov.changedAt).replace('T',' ').slice(0,16) : '-') + '</td></tr>'
    ).join('');
}

export function downloadInterviewOverridesCSV(){
  const overrides = getAllInterviewOverrides();
  if(overrides.length === 0){ alert('아직 인터뷰 후 재검토로 변경된 응답이 없습니다.'); return; }
  const rows = [['부서','항목코드','항목명','체크포인트','원래응답','변경된응답','변경사유','변경자','변경일시']];
  overrides.forEach(ov => rows.push([
    ov.dept||'', ov.code, ov.itemTitle, ov.cptext||'',
    IG_TIER_LABEL[ov.originalTier]||ov.originalResp||'', IG_TIER_LABEL[ov.newTier]||'',
    ov.reason||'', ov.changedBy||'', ov.changedAt ? String(ov.changedAt).replace('T',' ').slice(0,16) : ''
  ]));
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IT감사_인터뷰후_응답변경사항' + (typeof versionSuffix === 'function' ? versionSuffix() : '') + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function loadInterviewState(){
  try{ return JSON.parse(localStorage.getItem(INTERVIEW_STATE_STORAGE_KEY) || '{}'); }catch(e){ return {}; }
}

export function saveInterviewState(){
  try{ localStorage.setItem(INTERVIEW_STATE_STORAGE_KEY, JSON.stringify(interviewState)); }catch(e){ /* non-fatal */ }
}

export function loadCustomInterviewItems(){
  try{ return JSON.parse(localStorage.getItem(CUSTOM_INTERVIEW_STORAGE_KEY) || '[]'); }catch(e){ return []; }
}

export function saveCustomInterviewItems(){
  try{ localStorage.setItem(CUSTOM_INTERVIEW_STORAGE_KEY, JSON.stringify(customInterviewItems)); }catch(e){ alert('저장 실패: ' + e.message); }
}

export function renderCustomInterviewForm(editingItem){
  const wrap = document.getElementById('customInterviewForm');
  if(!wrap) return;
  const isEdit = !!editingItem;
  wrap.innerHTML = '<div class="ig-edit-form" data-dirty="0" style="display:block;position:static;">'
    + (isEdit ? '<div style="font-size:11.5px;font-weight:700;color:var(--gold);margin-bottom:6px;">✏ 항목 수정 중 — 저장하면 기존 항목 내용이 바뀝니다 (완료여부·메모 등 인터뷰 기록은 그대로 유지됩니다)</div>' : '')
    + '<label>항목 제목</label><input type="text" id="ci-title" placeholder="예) 최근 언론 보도 관련 특이사항 확인" value="' + (isEdit ? esc(editingItem.title||'') : '') + '">'
    + '<label>배경 / 사유 (왜 이 항목을 별도로 확인하는지)</label><textarea id="ci-background" rows="2" placeholder="예) 2026년 6월 유사 금융기관 사고 관련, 당행 대응 현황 확인 필요">' + (isEdit ? esc(editingItem.background||'') : '') + '</textarea>'
    + '<label>확인 질문 (한 줄에 하나씩)</label><textarea id="ci-questions" rows="4" placeholder="질문을 한 줄에 하나씩 입력하세요">' + (isEdit ? esc((editingItem.questions||[]).join('\n')) : '') + '</textarea>'
    + '<div class="ig-edit-actions">'
      + '<button class="gen-small-btn" id="ciSaveBtn" style="margin:0;background:var(--indigo);color:#fff;">💾 ' + (isEdit ? '수정 내용 저장' : '이 항목 저장') + '</button>'
      + '<button class="gen-small-btn" id="ciCancelBtn" style="margin:0;">✕ 취소</button>'
    + '</div>'
  + '</div>';

  document.getElementById('ciSaveBtn').addEventListener('click', () => {
    const title = document.getElementById('ci-title').value.trim();
    if(!title){ alert('항목 제목을 입력해 주세요.'); return; }
    const background = document.getElementById('ci-background').value.trim();
    const questions = document.getElementById('ci-questions').value.split('\n').map(s => s.trim()).filter(Boolean);
    if(isEdit){
      editingItem.title = title;
      editingItem.background = background;
      editingItem.questions = questions;
      editingItem.updatedAt = kstISOString();
    } else {
      customInterviewItems.push({
        id: 'CUSTOM-' + Date.now(),
        title, background, questions,
        createdAt: kstISOString()
      });
    }
    saveCustomInterviewItems();
    document.getElementById('customInterviewForm').style.display = 'none';
    renderCustomInterviewSection();
  });
  document.getElementById('ciCancelBtn').addEventListener('click', () => {
    document.getElementById('customInterviewForm').style.display = 'none';
  });
}

export function igEnsureEvidenceItems(code, st, suggestedNames){
  if(!st.evidenceItems){
    st.evidenceItems = (suggestedNames || []).map(name => ({name, collected:false}));
  }
  return st.evidenceItems;
}

export function igCustomCardHtml(item){
  const st = interviewState[item.id] || (interviewState[item.id] = {done:false, note:'', interviewee:'', interviewer:'', interviewedAt:'', location:'', evidenceStatus:''});
  const eviItems = igEnsureEvidenceItems(item.id, st, []);
  return '<div class="ig-card" data-ig-code="' + item.id + '" data-ig-interviewer="' + esc(st.interviewer||'') + '" style="border-left:4px solid var(--indigo);">'
    + '<div class="ig-card-head">'
      + '<div class="ig-card-head-main">'
        + '<div class="ig-code" style="background:var(--indigo);">CUSTOM</div>'
        + '<div style="flex:1;"><div class="ig-card-title">' + esc(item.title) + '</div>'
        + (item.background ? '<div class="ig-card-law">' + esc(item.background) + '</div>' : '') + '</div>'
      + '</div>'
      + '<div class="ig-card-head-actions">'
        + '<button class="assign-dept-reset-btn ci-edit-btn" data-id="' + item.id + '" title="이 항목 수정" style="width:auto;padding:5px 10px;font-size:10.5px;">✏ 수정</button>'
        + '<button class="assign-dept-reset-btn ci-delete-btn" data-id="' + item.id + '" title="이 항목 삭제" style="width:auto;padding:5px 10px;font-size:10.5px;">🗑️ 삭제</button>'
      + '</div>'
    + '</div>'
    + '<div class="ig-body">'
      + '<div class="ig-decision">이 사항에 대해 확인이 필요합니다.</div>'
      + '<div class="ig-arrow-down"></div>'
      + '<div class="ig-fork" style="grid-template-columns:1fr;">'
        + '<div class="ig-branch yes"><div class="ig-branch-head">📋 확인 질문</div>' + igStepsHtml(item.questions) + '</div>'
      + '</div>'
      + igEvidenceChecklistHtml(item.id, eviItems)
    + '</div>'
    + '<div class="ig-footer">'
      + '<div class="ig-footer-meta">'
        + '<label style="display:flex;align-items:center;gap:5px;"><input type="checkbox" class="ig-done-cb" data-code="' + item.id + '"' + (st.done?' checked':'') + '> 완료</label>'
        + '<input type="text" class="ig-meta-input ig-interviewer" data-code="' + item.id + '" placeholder="진행 감사자" value="' + esc(st.interviewer||'') + '">'
        + '<input type="text" class="ig-meta-input ig-interviewee" data-code="' + item.id + '" placeholder="면담자(수검자)" value="' + esc(st.interviewee||'') + '">'
        + '<input type="datetime-local" class="ig-meta-input ig-interviewedat" data-code="' + item.id + '" value="' + esc(st.interviewedAt||'') + '">'
        + '<input type="text" class="ig-meta-input ig-location" data-code="' + item.id + '" placeholder="장소(선택)" value="' + esc(st.location||'') + '">'
      + '</div>'
      + '<textarea class="ig-note" data-code="' + item.id + '" placeholder="인터뷰 결과 메모">' + esc(st.note||'') + '</textarea>'
    + '</div>'
  + '</div>';
}

export function renderCustomInterviewSection(){
  const listEl = document.getElementById('customInterviewList');
  if(!listEl) return;
  const badgeEl = document.getElementById('customInterviewCountBadge');
  if(badgeEl) badgeEl.textContent = customInterviewItems.length > 0 ? (customInterviewItems.length + '건') : '';
  if(customInterviewItems.length === 0){
    listEl.innerHTML = '<div class="assign-empty">아직 추가한 별도 항목이 없습니다.</div>';
    return;
  }
  listEl.innerHTML = customInterviewItems.map(igCustomCardHtml).join('');

  listEl.querySelectorAll('.ci-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = customInterviewItems.find(it => it.id === id);
      if(!item) return;
      const formWrap = document.getElementById('customInterviewForm');
      formWrap.style.display = 'block';
      renderCustomInterviewForm(item);
      formWrap.scrollIntoView({behavior:'smooth', block:'center'});
    });
  });
  listEl.querySelectorAll('.ci-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if(!confirm('이 별도 인터뷰 항목을 삭제할까요? 기록된 메모·완료여부도 함께 사라집니다.')) return;
      const id = btn.dataset.id;
      setCustomInterviewItems(customInterviewItems.filter(it => it.id !== id));
      delete interviewState[id];
      saveCustomInterviewItems();
      saveInterviewState();
      renderCustomInterviewSection();
    });
  });
  wireIgCardMetaInputs(listEl);
  wireIgEvidenceChecklist(listEl);
}

export function openCustomInterviewWindow(){
  if(customInterviewItems.length === 0){
    alert('아직 추가한 별도 확인사항이 없습니다. 먼저 "➕ 새 항목 추가"로 하나 이상 만들어 주세요.');
    return;
  }
  const EVID_LABEL2 = {received_ok:'✅ 수령·확인됨(적절)', received_issue:'⚠ 수령·미흡·보완필요', not_received:'🚫 미제출·미수령', '':''};
  const cardsHtml = customInterviewItems.map(item => {
    const st = interviewState[item.id] || {done:false, note:'', interviewee:'', interviewer:'', interviewedAt:'', location:''};
    return '<div class="ciw-card">'
      + '<div class="ciw-head"><span class="ciw-badge">' + (st.done ? '✅ 완료' : '⏳ 진행중') + '</span><h3>' + esc(item.title) + '</h3></div>'
      + (item.background ? '<div class="ciw-bg">' + esc(item.background) + '</div>' : '')
      + '<div class="ciw-q-label">📋 확인 질문</div>'
      + (item.questions||[]).map((q,i) => '<div class="ciw-q">Q' + (i+1) + '. ' + esc(q) + '</div>').join('')
      + '<div class="ciw-record">'
        + '<div><span>진행 감사자</span><b>' + esc(st.interviewer || '__________') + '</b></div>'
        + '<div><span>면담자</span><b>' + esc(st.interviewee || '__________') + '</b></div>'
        + '<div><span>일시·장소</span><b>' + esc((st.interviewedAt || '____-__-__') + (st.location ? ' · ' + esc(st.location) : '')) + '</b></div>'
        + '<div class="ciw-note-box"><span>메모</span><div>' + esc(st.note || '').replace(/\n/g,'<br>') + '</div></div>'
      + '</div>'
    + '</div>';
  }).join('');

  const html = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>체크리스트 외 별도 확인사항</title><style>'
    + '*{box-sizing:border-box;}body{margin:0;background:#dcd5c4;font-family:"Pretendard","Noto Sans KR",sans-serif;color:#1b2330;font-size:14px;}'
    + '.ciw-shell{max-width:760px;margin:20px auto;background:#f6f3ec;box-shadow:0 10px 30px rgba(19,40,69,.2);padding-bottom:26px;}'
    + '.ciw-hero{background:linear-gradient(155deg,#132845 0%,#1d3a63 62%,#24406b 100%);color:#f4efe2;padding:24px 32px;}'
    + '.ciw-hero h1{margin:0 0 6px;font-size:20px;}.ciw-hero .sub{font-size:12.5px;color:#c9d2e2;}'
    + '.ciw-card{background:#fff;border:1px solid #dcd6c8;border-radius:6px;margin:16px 28px;padding:14px 18px;}'
    + '.ciw-head{display:flex;align-items:center;gap:10px;margin-bottom:6px;}'
    + '.ciw-head h3{margin:0;font-size:15px;color:#1b2330;}'
    + '.ciw-badge{font-family:monospace;font-size:10px;padding:2px 8px;border-radius:10px;background:#e5f2ea;color:#2e7d5b;flex:none;}'
    + '.ciw-bg{font-size:12px;color:#5a6472;background:#f5f1e6;padding:6px 10px;border-radius:4px;margin-bottom:10px;}'
    + '.ciw-q-label{font-size:11.5px;font-weight:700;color:#132845;margin-bottom:4px;}'
    + '.ciw-q{font-size:13px;margin-bottom:4px;}'
    + '.ciw-record{margin-top:12px;padding:10px 12px;background:#faf8f0;border:1px solid #dcd6c8;border-radius:5px;font-size:12.5px;}'
    + '.ciw-record > div{display:flex;gap:8px;margin-bottom:6px;}'
    + '.ciw-record span{width:90px;flex:none;color:#5a6472;font-family:monospace;font-size:10.5px;}'
    + '.ciw-note-box div{flex:1;min-height:36px;border:1px solid #dcd6c8;background:#fff;padding:6px 8px;border-radius:3px;}'
    + '.ciw-print-btn{position:fixed;right:20px;bottom:20px;background:#132845;color:#f4efe2;border:none;padding:10px 16px;border-radius:24px;cursor:pointer;font-size:12.5px;}'
    + '@media print{ .ciw-print-btn{display:none;} .ciw-shell{box-shadow:none;margin:0;} body{background:#fff;} @page{size:A4;margin:14mm 12mm;} }'
    + '</style></head><body>'
    + '<div class="ciw-shell">'
      + '<div class="ciw-hero"><h1>🆕 체크리스트 외 별도 확인사항</h1><div class="sub">인터뷰 중 참고하거나 인쇄해서 들고 다니실 수 있습니다. (총 ' + customInterviewItems.length + '건)</div></div>'
      + cardsHtml
    + '</div>'
    + '<button class="ciw-print-btn" onclick="window.print()">🖨 인쇄 / PDF로 저장</button>'
    + '</body></html>';

  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=820,height=900');
}

export function igFindItem(code){
  const [domCode, no] = code.split('-');
  const dom = DOMAINS.find(d => d.code === domCode) || DEFAULT_DOMAINS.find(d => d.code === domCode);
  return dom ? dom.items.find(x => String(x.no) === no) : null;
}

export function igItemMeta(code){
  if(INTERVIEW_ITEM_META[code]) return INTERVIEW_ITEM_META[code];
  const it = igFindItem(code);
  const meta = it ? {title: it.title, law: it.law || ''} : {title: code, law: ''};
  INTERVIEW_ITEM_META[code] = meta;
  return meta;
}

export function igGenericScript(item){
  // Template-based fallback for domains without a hand-authored INTERVIEW_SCRIPTS entry.
  const cps = (item.checkpoints || []).slice(0, 5);
  const ev = item.evidence || [];
  const verify = cps.map((cp, i) =>
    ev[i] ? ('"' + cp + '" 항목을 ' + ev[i] + '(으)로 확인해 주시겠습니까?')
          : ('"' + cp + '" 항목이 실제로 지켜지고 있음을 보여주는 증적을 확인해 주시겠습니까?')
  );
  if(verify.length === 0) verify.push('이 항목이 실제로 이행되고 있음을 보여주는 증적을 확인해 주시겠습니까?');
  verify.push('예외적으로 지켜지지 않았던 사례가 있다면, 경위와 처리 절차를 설명해 주시겠습니까?');

  return {
    decisionQ: '설문에서 "' + item.title + '" 항목이 이행되고 있다고 응답하셨습니다. 아래 체크포인트를 실제 증적으로 확인해 주실 수 있습니까?',
    verify: verify,
    verifyEnd: '제시된 증적이 응답과 일치하면 양호로 확정합니다. 불일치가 발견되면 해당 체크포인트만 미흡 경로로 전환합니다.',
    partial: [
      '체크포인트 중 구체적으로 어느 부분은 지켜지고 어느 부분은 미흡한지 구분해 주시겠습니까?',
      '부분적으로만 이행된 이유는 무엇입니까?',
      '완전한 이행을 위한 조치 계획과 일정은 어떻게 되십니까?'
    ],
    partialEnd: '미흡한 체크포인트를 특정하여 개선계획 수립을 요청하고, 다음 점검에서 완전 이행 여부를 재확인합니다.',
    rootcause: [
      '현재 이 항목이 지켜지지 않고 있는 구체적인 이유는 무엇입니까?',
      '이 상태가 언제부터 지속되었고, 그동안 인지하고 계셨습니까?',
      '지금 즉시 취할 수 있는 임시 조치는 무엇입니까?',
      '근본적인 개선 계획과 완료 목표일은 언제입니까?'
    ],
    rootcauseEnd: '결함으로 확정하고, 개선계획서와 조치기한을 서면으로 요청합니다.' + (item.risk === '상' ? ' 위험도가 높은 항목이므로 별도 보고를 권고합니다.' : ''),
    na: [
      '이 항목을 "해당없음"으로 판단하신 근거는 무엇입니까?',
      '조직·업무 특성상 실제로 적용 대상이 아닌 것이 맞습니까?',
      '향후 상황이 바뀌면 이 항목이 적용될 가능성이 있습니까?'
    ],
    naEnd: '해당없음 판단의 근거가 명확하면 확인을 종료하고, 향후 상황 변경 시 재점검이 필요함을 안내합니다.',
    _generic: true
  };
}

export function loadScriptOverrides(){ return scriptStore.load(); }

export function saveScriptOverrides(){ scriptStore.save(); }

export function loadFlowOverrides(){ return flowStore.load(); }

export function saveFlowOverrides(){ flowStore.save(); }

export function exportInterviewGuideBundle(){
  const scriptData = loadScriptOverrides();
  const flowData = loadFlowOverrides();
  const scriptCount = Object.keys(scriptData || {}).length;
  const flowCount = Object.keys(flowData || {}).length;
  if(scriptCount === 0 && flowCount === 0){
    if(!confirm('① 인터뷰 질문 편집 내역·② 순서도·분기형 편집 내역이 모두 비어 있습니다. 빈 백업 파일을 그래도 내려받을까요?')) return;
  }
  const bundle = {
    exportedAt: kstISOString(), systemVersion: SYSTEM_VERSION, bundleType: 'interviewGuideBundle',
    scriptOverrides: scriptData, flowOverrides: flowData
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {type:'application/json;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IT감사_인터뷰가이드_전체백업(AI응답포함)' + versionSuffix() + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert('인터뷰 가이드 전체 백업을 내려받았습니다.\n\n① 질문 편집 내역: ' + scriptCount + '개 항목\n② 순서도·분기형 편집 내역: ' + flowCount + '개 항목');
}

export function importInterviewGuideBundle(file){
  const reader = new FileReader();
  reader.onload = (e) => {
    try{
      const bundle = JSON.parse(e.target.result);
      const incScript = (bundle.scriptOverrides && typeof bundle.scriptOverrides === 'object') ? bundle.scriptOverrides : {};
      const incFlow = (bundle.flowOverrides && typeof bundle.flowOverrides === 'object') ? bundle.flowOverrides : {};
      if(Object.keys(incScript).length === 0 && Object.keys(incFlow).length === 0){
        alert('이 파일에서 인터뷰 가이드 편집 내역(① 질문·② 순서도)을 찾을 수 없습니다. "📤 인터뷰 가이드 전체 백업"으로 받은 파일이 맞는지 확인해 주세요.');
        return;
      }
      const curScript = loadScriptOverrides();
      const curFlow = loadFlowOverrides();
      const curScriptCount = Object.keys(curScript || {}).length;
      const curFlowCount = Object.keys(curFlow || {}).length;
      const incScriptCount = Object.keys(incScript).length;
      const incFlowCount = Object.keys(incFlow).length;

      const strategy = prompt(
        '인터뷰 가이드 전체(① 질문 편집 내역 + ② 순서도·분기형 편집 내역) 복원 방식을 선택해 주세요.\n\n' +
        '1 = 병합 (겹치는 항목코드는 백업 내용으로 갱신, 새 항목코드는 추가, 그 외 기존 항목은 유지)\n' +
        '2 = 완전 교체 (①②를 통째로 백업 파일 내용으로 바꿈)\n\n' +
        '① 질문 편집: 현재 ' + curScriptCount + '개 항목 / 백업 파일 ' + incScriptCount + '개 항목\n' +
        '② 순서도·분기형 편집: 현재 ' + curFlowCount + '개 항목 / 백업 파일 ' + incFlowCount + '개 항목\n\n숫자 1 또는 2를 입력하세요.',
        '1'
      );
      if(strategy !== '1' && strategy !== '2') return;

      let finalScript, finalFlow, summaryMsg;
      if(strategy === '2'){
        finalScript = incScript;
        finalFlow = incFlow;
        summaryMsg = '완전 교체: ① ' + curScriptCount + '개 → ' + incScriptCount + '개, ② ' + curFlowCount + '개 → ' + incFlowCount + '개';
      } else {
        finalScript = safeAssign(safeAssign({}, curScript || {}), incScript);
        finalFlow = safeAssign(safeAssign({}, curFlow || {}), incFlow);
        summaryMsg = '병합: ① 총 ' + Object.keys(finalScript).length + '개, ② 총 ' + Object.keys(finalFlow).length + '개';
      }

      if(!confirm('인터뷰 가이드 전체 복원을 진행합니다.\n\n' + summaryMsg + '\n\n계속할까요?')) return;

      Object.keys(scriptOverrides).forEach(k => delete scriptOverrides[k]);
      safeAssign(scriptOverrides, finalScript);
      saveScriptOverrides();
      Object.keys(flowOverrides).forEach(k => delete flowOverrides[k]);
      safeAssign(flowOverrides, finalFlow);
      saveFlowOverrides();
      if(typeof renderInterviewGuide === 'function') renderInterviewGuide();
      alert('인터뷰 가이드 전체를 복원했습니다.\n\n' + summaryMsg);
    }catch(err){
      alert(file.name + ' 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

export function saveInterviewSchedule(){
  try{ localStorage.setItem(INTERVIEW_SCHEDULE_KEY, JSON.stringify(interviewSchedule)); }catch(e){ /* non-fatal */ }
}

export function renderInterviewScheduleTable(fRows){
  const table = document.getElementById('interviewScheduleTable');
  if(!table) return;
  const byTarget = {};
  fRows.forEach(r => {
    const dept = r.dept || '(부서 미입력)';
    const author = r.author || '(작성자 미입력)';
    const key = dept + '|||' + author;
    if(!byTarget[key]) byTarget[key] = {dept, author, hiBad: 0, note: r.interviewNote || '', contact: r.interviewContact || ''};
    if(!byTarget[key].note && r.interviewNote) byTarget[key].note = r.interviewNote;
    if(!byTarget[key].contact && r.interviewContact) byTarget[key].contact = r.interviewContact;
    if(igClassifyRow(r) === 'no' && r.risk === '상') byTarget[key].hiBad++;
  });
  const keys = Object.keys(byTarget).sort((a,b) => byTarget[b].hiBad - byTarget[a].hiBad);
  const badge = document.getElementById('cnt-interviewSchedule');
  if(badge) badge.textContent = keys.length > 0 ? (keys.length + '명') : '';

  // 인터뷰 안내 메시지 패널의 대상자 선택 목록도 여기서 함께 갱신한다(항상 최신 대상자 목록 유지).
  const tplSel = document.getElementById('imTemplateTarget');
  if(tplSel){
    const prevVal = tplSel.value;
    tplSel.innerHTML = '<option value="">— 대상자 선택 —</option>'
      + keys.map(key => '<option value="' + esc(key) + '">' + esc(byTarget[key].dept) + ' · ' + esc(byTarget[key].author) + '</option>').join('');
    if(keys.includes(prevVal)) tplSel.value = prevVal;
  }
  window._imByTarget = byTarget;

  // 감사자별 배정 패키지 내보내기 드롭다운도 여기서 함께 최신화.
  // "인터뷰 일정 표의 담당 감사자" 칸에 아직 아무도 입력을 안 했으면 이 목록이 계속 비어있던 문제가
  // 있었다 — ①~②에서 이미 입력해둔 "알려진 감사자 목록"도 함께 후보로 보여주도록 넓혔다.
  const apSel = document.getElementById('apAuditorSelect');
  if(apSel){
    const prevAp = apSel.value;
    const scheduleAuditors = Object.values(interviewSchedule).map(s => (s.assignedAuditor||'').trim()).filter(Boolean);
    const knownAuditors = (typeof loadKnownAuditors === 'function') ? loadKnownAuditors() : [];
    const auditors = Array.from(new Set([...scheduleAuditors, ...knownAuditors])).sort();
    apSel.innerHTML = '<option value="">— 배정 감사자 선택 —</option>' + auditors.map(a => '<option value="' + esc(a) + '">' + esc(a) + '</option>').join('');
    if(auditors.includes(prevAp)) apSel.value = prevAp;
    const apHintEl = document.getElementById('apAuditorSelectHint');
    if(apHintEl) apHintEl.textContent = auditors.length === 0 ? '⚠ 아직 등록된 감사자가 없습니다 — 위 "🎤 인터뷰 일정 관리" 표의 "담당 감사자" 칸에 이름을 입력하면 여기 나타납니다.' : '';
  }

  const STATUS_OPTS = ['제안', '확정', '완료'];
  table.innerHTML = '<tr><th>부서</th><th>작성자</th><th>👤 인터뷰 담당자</th><th>위험상 미흡</th><th>🗓 조율 참고사항</th><th>👥 배정 감사자</th><th>일시</th><th>장소</th><th>진행상태</th><th>메모</th></tr>'
    + (keys.length === 0
      ? '<tr><td colspan="10" style="padding:16px;text-align:center;color:#777;">인터뷰 대상자가 없습니다. 먼저 응답 파일을 업로드해 주세요.</td></tr>'
      : keys.map(key => {
          const t = byTarget[key];
          const sc = interviewSchedule[key] || {};
          const k = esc(key);
          return '<tr' + (t.hiBad > 0 ? ' class="risk-row-상"' : '') + '>'
            + '<td>' + esc(t.dept) + '</td><td>' + esc(t.author) + '</td>'
            + '<td class="agg-wrap-cell" style="font-weight:700;color:var(--navy);max-width:160px;">' + (t.contact ? esc(t.contact) : '<span style="color:#c00;font-weight:400;">(미기재)</span>') + '</td>'
            + '<td class="num-cell" style="font-weight:700;color:var(--risk-hi);">' + t.hiBad + '</td>'
            + '<td class="agg-wrap-cell" style="max-width:200px;">' + (t.note ? ('<span style="display:inline-block;font-size:11.5px;font-weight:700;color:#8a3b1f;background:#fdf2e9;border:1px solid #edcba8;border-radius:4px;padding:4px 7px;line-height:1.5;white-space:normal;">⚠ ' + esc(t.note) + '</span>') : '<span style="color:var(--ink-soft);font-size:11px;">-</span>') + '</td>'
            + '<td><input type="text" class="is-input" data-key="' + k + '" data-field="assignedAuditor" list="knownAuditorDatalist" value="' + esc(sc.assignedAuditor||'') + '" placeholder="담당 감사자" style="width:90px;font-family:inherit;font-size:11.5px;padding:4px;"></td>'
            + '<td><input type="datetime-local" class="is-input" data-key="' + k + '" data-field="datetime" value="' + esc(sc.datetime||'') + '" style="font-family:inherit;font-size:11.5px;padding:4px;"></td>'
            + '<td><input type="text" class="is-input" data-key="' + k + '" data-field="place" value="' + esc(sc.place||'') + '" placeholder="예) 3층 회의실" style="width:100px;font-family:inherit;font-size:11.5px;padding:4px;"></td>'
            + '<td><select class="is-input" data-key="' + k + '" data-field="status" style="font-size:11.5px;">'
              + STATUS_OPTS.map(s => '<option value="' + s + '"' + (sc.status === s ? ' selected' : '') + '>' + s + '</option>').join('')
              + '</select></td>'
            + '<td><input type="text" class="is-input" data-key="' + k + '" data-field="memo" value="' + esc(sc.memo||'') + '" placeholder="메모" style="width:120px;font-family:inherit;font-size:11.5px;padding:4px;"></td>'
            + '</tr>';
        }).join(''));
  table.querySelectorAll('.is-input').forEach(el => {
    el.addEventListener('change', () => {
      const key = el.dataset.key, field = el.dataset.field;
      if(!interviewSchedule[key]) interviewSchedule[key] = {};
      interviewSchedule[key][field] = el.value;
      saveInterviewSchedule();
      const calView = document.getElementById('interviewCalendarView');
      if(calView && calView.style.display !== 'none') renderInterviewCalendar();
    });
  });
}

export function toggleInterviewCalendarView(){
  const table = document.getElementById('interviewScheduleTable');
  const cal = document.getElementById('interviewCalendarView');
  const btn = document.getElementById('imViewToggleBtn');
  if(!table || !cal || !btn) return;
  const showingCal = cal.style.display !== 'none';
  table.style.display = showingCal ? 'table' : 'none';
  cal.style.display = showingCal ? 'none' : 'block';
  btn.textContent = showingCal ? '🗓 달력으로 보기' : '📋 표로 보기';
  if(!showingCal) renderInterviewCalendar();
}

export function renderInterviewCalendar(){
  const cal = document.getElementById('interviewCalendarView');
  if(!cal) return;
  const now = new Date(Date.now() + 9 * 3600000); // KST 기준 "오늘"
  if(_imCalYear === null){ setImCalYear(now.getUTCFullYear()); setImCalMonth(now.getUTCMonth()); }
  const y = _imCalYear, m = _imCalMonth;

  // 이 달에 해당하는 일정만 모아 날짜별로 묶는다.
  const byDay = {};
  Object.keys(interviewSchedule).forEach(key => {
    const sc = interviewSchedule[key];
    if(!sc.datetime) return;
    const d = new Date(sc.datetime);
    if(d.getFullYear() !== y || d.getMonth() !== m) return;
    const day = d.getDate();
    if(!byDay[day]) byDay[day] = [];
    const parts = key.split('|||');
    byDay[day].push({
      time: String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'),
      dept: parts[0] || '', author: parts[1] || '', status: sc.status || '제안', key
    });
  });
  Object.values(byDay).forEach(list => list.sort((a,b) => a.time.localeCompare(b.time)));

  const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const isCurrentMonth = (y === now.getUTCFullYear() && m === now.getUTCMonth());
  const todayDate = now.getUTCDate();

  const DOW = ['일','월','화','수','목','금','토'];
  let cells = '';
  for(let i = 0; i < firstDow; i++) cells += '<div class="im-cal-cell im-cal-blank"></div>';
  for(let day = 1; day <= daysInMonth; day++){
    const entries = byDay[day] || [];
    const isToday = isCurrentMonth && day === todayDate;
    cells += '<div class="im-cal-cell' + (isToday ? ' im-cal-today' : '') + '">'
      + '<div class="im-cal-daynum">' + day + '</div>'
      + entries.map(e => '<div class="im-cal-entry st-' + e.status + '" title="' + esc(e.dept + ' ' + e.author + ' · ' + e.status) + '" onclick="alert(' + JSON.stringify(e.time + ' ' + e.dept + ' ' + e.author + ' — ' + e.status) + ')">' + esc(e.time + ' ' + e.author) + '</div>').join('')
    + '</div>';
  }
  const totalCells = firstDow + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for(let i = 0; i < trailing; i++) cells += '<div class="im-cal-cell im-cal-blank"></div>';

  cal.innerHTML = '<div class="im-cal-head">'
    + '<h4>' + y + '년 ' + (m + 1) + '월</h4>'
    + '<div class="im-cal-nav">'
      + '<button type="button" onclick="imCalShiftMonth(-1)">◀ 이전달</button>'
      + '<button type="button" onclick="imCalGoToday()">오늘</button>'
      + '<button type="button" onclick="imCalShiftMonth(1)">다음달 ▶</button>'
    + '</div></div>'
    + '<div class="im-cal-grid">' + DOW.map(d => '<div class="im-cal-dow">' + d + '</div>').join('') + cells + '</div>'
    + '<p style="font-size:10.5px;color:var(--ink-soft);margin:8px 0 0;">색상: <span style="background:var(--indigo-bg);color:var(--indigo);padding:1px 6px;border-radius:3px;">제안</span> <span style="background:var(--good-bg);color:var(--good);padding:1px 6px;border-radius:3px;margin-left:4px;">확정</span> <span style="background:#eee;color:var(--ink-soft);padding:1px 6px;border-radius:3px;margin-left:4px;text-decoration:line-through;">완료</span> — 일정을 클릭하면 상세를 볼 수 있고, 실제 입력·수정은 위 [📋 표로 보기]에서 합니다.</p>';
}

export function imCalShiftMonth(delta){
  if(_imCalYear === null) renderInterviewCalendar();
  setImCalMonth(_imCalMonth + delta);
  if(_imCalMonth < 0){ setImCalMonth(11); setImCalYear(_imCalYear - 1); }
  if(_imCalMonth > 11){ setImCalMonth(0); setImCalYear(_imCalYear + 1); }
  renderInterviewCalendar();
}

export function imCalGoToday(){
  setImCalYear(null); setImCalMonth(null);
  renderInterviewCalendar();
}

export function buildInterviewMsgText(key, kind){
  const t = (window._imByTarget || {})[key];
  if(!t) return '';
  const sc = interviewSchedule[key] || {};
  let dtText = '(추후 협의)';
  if(sc.datetime){
    try{ dtText = new Date(sc.datetime).toLocaleString('ko-KR', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', weekday:'short'}); }catch(e){ dtText = sc.datetime; }
  }
  const place = sc.place || '(추후 안내)';
  const contactLine = t.contact ? (t.contact + '님') : (t.author + '님');
  const noteLine = t.note ? ('\n\n※ 귀하께서 남겨주신 조율 참고사항을 확인했습니다: "' + t.note + '"') : '';

  if(kind === 'propose'){
    return '[' + t.dept + ' ' + contactLine + '께]\n\n'
      + '안녕하십니까, IT감사팀입니다.\n'
      + '금번 IT 자체감사와 관련하여 귀 부서 담당자님과 간단한 인터뷰를 진행하고자 합니다.\n\n'
      + '편하신 일정을 회신해 주시면 조율하여 확정 안내드리겠습니다(30분 내외 예상).'
      + noteLine
      + '\n\n회신 부탁드립니다. 감사합니다.';
  }
  if(kind === 'confirm'){
    return '[' + t.dept + ' ' + contactLine + '께]\n\n'
      + '안녕하십니까, IT감사팀입니다.\n'
      + '요청하신 인터뷰 일정이 아래와 같이 확정되었음을 안내드립니다.\n\n'
      + '- 일시: ' + dtText + '\n'
      + '- 장소: ' + place + '\n\n'
      + '부득이 일정 변경이 필요하신 경우 사전에 편하신 방법으로 연락 부탁드립니다.\n'
      + '감사합니다.';
  }
  // remind
  return '[' + t.dept + ' ' + contactLine + '께]\n\n'
    + '안녕하십니까, IT감사팀입니다.\n'
    + '아래 예정된 인터뷰 일정을 다시 한 번 안내드립니다.\n\n'
    + '- 일시: ' + dtText + '\n'
    + '- 장소: ' + place + '\n\n'
    + '당일 참석 부탁드리며, 문의사항 있으시면 언제든 연락 주십시오.\n'
    + '감사합니다.';
}

export function refreshInterviewMsgPreview(){
  const sel = document.getElementById('imTemplateTarget');
  const kindSel = document.getElementById('imTemplateKind');
  const preview = document.getElementById('imTemplatePreview');
  if(!sel || !kindSel || !preview) return;
  preview.value = sel.value ? buildInterviewMsgText(sel.value, kindSel.value) : '';
}

export function exportInterviewSchedule(){
  const noteByKey = {};
  const contactByKey = {};
  aggRows.forEach(r => {
    const key = (r.dept || '(부서 미입력)') + '|||' + (r.author || '(작성자 미입력)');
    if(r.interviewNote && !noteByKey[key]) noteByKey[key] = r.interviewNote;
    if(r.interviewContact && !contactByKey[key]) contactByKey[key] = r.interviewContact;
  });
  const rows = Object.keys(interviewSchedule).map(key => {
    const parts = key.split('|||');
    return {dept: parts[0] || '', author: parts[1] || '', note: noteByKey[key] || '', contact: contactByKey[key] || '', ...interviewSchedule[key]};
  }).filter(r => r.datetime || r.place || r.status || r.memo);
  rows.sort((a,b) => (a.datetime||'').localeCompare(b.datetime||''));
  const rowsHtml = rows.length === 0
    ? '<tr><td colspan="7" style="padding:14px;text-align:center;color:#777;">등록된 일정이 없습니다. 먼저 [응답집계] 탭의 인터뷰 일정 관리 표에서 일시를 입력해 주세요.</td></tr>'
    : rows.map(r => {
        let dt = '(미정)';
        if(r.datetime){
          try{ dt = new Date(r.datetime).toLocaleString('ko-KR', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}); }catch(e){ dt = r.datetime; }
        }
        return '<tr><td>' + escFd(dt) + '</td><td>' + escFd(r.dept) + '</td><td>' + escFd(r.author) + '</td>'
          + '<td style="font-weight:700;">' + escFd(r.contact || '-') + '</td>'
          + '<td>' + escFd(r.place || '-') + '</td><td>' + escFd((r.status || '제안') + (r.memo ? (' · ' + r.memo) : '')) + '</td>'
          + '<td style="color:#a23b2e;">' + escFd(r.note || '-') + '</td></tr>';
      }).join('');
  const html = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>IT 감사 인터뷰 일정표</title><style>'
    + 'body{font-family:"Pretendard","Noto Sans KR",sans-serif;color:#1b2330;max-width:760px;margin:24px auto;padding:0 20px;}'
    + '.is-hero{background:#132845;color:#f4efe2;padding:22px 28px;border-radius:6px 6px 0 0;}'
    + '.is-hero .eyebrow{font-family:monospace;letter-spacing:.15em;font-size:11px;color:#e4c78a;text-transform:uppercase;margin-bottom:6px;}'
    + '.is-hero h1{margin:0;font-size:20px;}'
    + '.is-hero .sub{font-size:12px;color:#c9d2e2;margin-top:6px;}'
    + '.is-body{border:1px solid #dcd6c8;border-top:none;padding:20px 24px;}'
    + 'table{width:100%;border-collapse:collapse;font-size:12.5px;}'
    + 'th,td{border:1px solid #ccc;padding:7px 10px;text-align:left;}'
    + 'th{background:#f1ede1;}'
    + '.is-print-btn{margin:14px 0;font-family:monospace;font-size:12px;background:#132845;color:#f4efe2;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;}'
    + '@media print{ .is-print-btn{display:none;} body{margin:0;max-width:none;} @page{size:A4;margin:14mm 12mm;} }'
    + '</style></head><body>'
    + '<button class="is-print-btn" onclick="window.print()">🖨 인쇄 / PDF 저장</button>'
    + '<div class="is-hero"><div class="eyebrow">IT AUDIT · 인터뷰 일정표</div><h1>IT 감사 인터뷰 일정표</h1><div class="sub">작성일: ' + kstDateStr() + ' (KST) · 총 ' + rows.length + '건</div></div>'
    + '<div class="is-body"><table><tr><th>일시</th><th>부서</th><th>작성자</th><th>인터뷰 담당자</th><th>장소</th><th>진행상태</th><th>조율 참고사항</th></tr>' + rowsHtml + '</table></div>'
    + '</body></html>';
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=820,height=900');
  logReportGenerated('schedule', '🗓 인터뷰 일정표', rows.length + '건');
}

export function scrollToInterviewCard(code){
  const targetBtn = document.querySelector('.tabbtn[data-tab="interview"]');
  if(targetBtn) targetBtn.click();
  setTimeout(() => {
    const card = document.querySelector('.ig-card[data-ig-code="' + CSS.escape(code) + '"]');
    if(card){
      card.scrollIntoView({behavior:'smooth', block:'start'});
      card.classList.add('js-highlight');
      setTimeout(() => card.classList.remove('js-highlight'), 1800);
    }
  }, 120);
}

export function registerFindingFromInterviewCode(code){
  if(findings.some(f => f.code === code)){
    // 이미 등록된 항목이면(다른 창에서 등록되는 등 드문 경우) 새로 만들지 않고 그 항목으로 이동
    scrollToFindingCard(code);
    return;
  }
  const meta = igItemMeta(code);
  const item = igFindItem(code);
  const st = interviewState[code];
  const newFinding = {
    id: 'F-' + Date.now(), code, title: meta.title, description: (st && st.note) || '',
    riskLevel: item ? item.risk : '중', department: igOwnerDepts(code).join(', '), assignee: igOwnerPersons(code).join(', '),
    recommendation: '', status: 'draft', createdAt: kstISOString(), auditName: getCurrentAuditName()
  };
  const targetBtn = document.querySelector('.tabbtn[data-tab="findings"]');
  if(targetBtn) targetBtn.click();
  setTimeout(() => { openFindingEditGuarded(newFinding); }, 120);
}

export function igGetScript(code){
  const base = INTERVIEW_SCRIPTS[code] || (() => { const item = igFindItem(code); return item ? igGenericScript(item) : null; })();
  if(!base) return null;
  const ov = scriptOverrides[code];
  const merged = ov
    ? Object.assign({}, base, ov, {_generic: base._generic, _edited: true})
    : Object.assign({}, base);
  merged._aiNoContext = aiNoContextCodes.has(code);
  return igSanitizeScript(merged);
}

export function igSanitizeScript(script){
  if(!script) return script;
  ['verify', 'partial', 'rootcause', 'na'].forEach(key => {
    const val = script[key];
    if(Array.isArray(val)) return; // 이미 정상 형태
    const endKey = key + 'End';
    if(val && typeof val === 'object'){
      // {naQ: '...', naEnd: '...'} 같은 예전 손상 형태 — 질문 문구는 배열로, 종결 문구는 *End 필드로 복구
      const qKey = Object.keys(val).find(k => /q$/i.test(k) && typeof val[k] === 'string');
      const endValKey = Object.keys(val).find(k => /end$/i.test(k) && typeof val[k] === 'string');
      script[key] = qKey ? [val[qKey]] : Object.values(val).filter(v => typeof v === 'string');
      if(!script[endKey] && endValKey) script[endKey] = val[endValKey];
    } else if(typeof val === 'string' && val.trim()){
      script[key] = [val]; // 단일 문자열로 저장된 경우도 배열로 감싼다
    } else {
      script[key] = []; // null/undefined/빈 값 등은 빈 배열로 — 렌더링은 되지만 질문 없이 표시됨
    }
  });
  return script;
}

export function igClassifyRow(r){
  // 4-way classification: 'yes' (good) / 'partial' (부분·보통) / 'no' (미흡·아니오) / 'na' (해당없음)
  const resp = r.resp || '';
  if(resp === '해당없음' || r.tier === 'na') return 'na';
  if(resp === '부분' || resp === '보통' || r.tier === 'neutral') return 'partial';
  if(r.tier === 'bad') return 'no';
  if(resp === '예' || r.tier === 'good') return 'yes';
  return 'no'; // unrecognized negative-leaning response defaults to the safer (more scrutiny) bucket
}

export function igComputeStats(code, deptFilter){
  // code is already domain-prefixed (도메인코드-항목번호, e.g. '04-1') and globally unique,
  // so filtering by code alone is correct and works for every domain — not just D-25.
  const allRows = aggRows.filter(r => r.code === code);
  const depts = new Set();
  allRows.forEach(r => { if(r.dept) depts.add(r.dept); });
  // [v8.36] deptFilter가 주어지면 그 팀의 응답만으로 집계를 다시 계산한다 — depts는 항상 실제로
  // 응답을 제출한 전체 팀 목록을 유지해, 필터링 중에도 "팀 선택" 드롭다운 옵션이 줄어들지 않게 한다.
  const rows = deptFilter ? allRows.filter(r => (r.dept || '(부서명 미입력)') === deptFilter) : allRows;
  const stats = {total: rows.length, yes:0, partial:0, no:0, na:0, depts};
  rows.forEach(r => {
    stats[igClassifyRow(r)]++;
  });
  return stats;
}

export function igBranchClass(stats){
  if(stats.total === 0) return 'unknown';
  if(stats.na === stats.total) return 'na';
  if(stats.no > 0) return 'no';
  if(stats.partial > 0) return 'partial';
  return 'yes';
}

export function igSwitchCardDept(selEl, code, dept){
  igCardDeptView[code] = dept;
  const cardEl = selEl && selEl.closest ? selEl.closest('.ig-card') : document.querySelector('.ig-card[data-ig-code="' + CSS.escape(code) + '"]');
  if(!cardEl) return;
  const temp = document.createElement('div');
  temp.innerHTML = igRenderCard(code);
  const newCard = temp.firstElementChild;
  if(!newCard) return;
  cardEl.replaceWith(newCard);
  wireIgCardMetaInputs(newCard);
  wireIgEvidenceChecklist(newCard);
}

export function igMetaTarget(code, dept){
  const st = interviewState[code] || (interviewState[code] = {done:false, note:'', interviewee:'', interviewer:getCurrentAuditor(), interviewedAt:'', location:'', evidenceStatus:''});
  if(!dept) return st;
  st.deptMeta = st.deptMeta || {};
  if(!st.deptMeta[dept]) st.deptMeta[dept] = {note:'', interviewee:'', interviewer:'', interviewedAt:'', location:'', evidenceStatus:''};
  return st.deptMeta[dept];
}

export function igOwnerDepts(code){
  // [수정] "관련부서" 자동 채움에 담당자 성명(igOwnerPersons)이 잘못 들어가던 버그를 고치기 위해 신설.
  // 이 항목에 실제로 응답을 제출한 부서(수검부서) 목록을 모아, 발견사항의 "관련 부서" 란을
  // 사람 이름이 아니라 진짜 부서명으로 자동 채울 수 있게 한다.
  const set = new Set();
  aggRows.filter(r => r.code === code).forEach(r => { if(r.dept) set.add(r.dept); });
  return Array.from(set);
}

export function igRecomputeMultiDeptDone(code){
  // [v8.34] 응답 부서가 2개 이상인 항목은 부서별 완료 여부(deptDone)만 사실상의 정답이고,
  // done은 그로부터 파생된 값("전 부서 완료")이다 — 병합·가져오기 등 다른 경로로 deptDone이
  // 바뀔 때마다 이 함수를 호출해 done을 다시 맞춰야 한다.
  const st = interviewState[code];
  if(!st) return;
  const depts = igOwnerDepts(code);
  if(depts.length > 1){
    st.deptDone = st.deptDone || {};
    st.done = depts.every(d => !!st.deptDone[d]);
  }
}

export function igRefreshCardDoneBadge(card, code){
  // 부서별 체크박스 하나를 토글했을 때 카드 전체를 다시 그리지 않고(펼침 상태·스크롤 위치 보존)
  // 제목 배지와 그룹 라벨의 숫자만 그 자리에서 갱신한다.
  const st = interviewState[code];
  if(!st || !card) return;
  const respondentDepts = igOwnerDepts(code);
  const deptDoneCount = respondentDepts.filter(d => st.deptDone && st.deptDone[d]).length;
  const titleWrap = card.querySelector('.ig-card-title');
  if(titleWrap){
    const oldBadge = titleWrap.querySelector('.ig-done-badge');
    if(oldBadge) oldBadge.remove();
    if(st.done || (respondentDepts.length > 1 && deptDoneCount > 0)){
      const span = document.createElement('span');
      span.className = 'ig-done-badge' + (!st.done ? ' partial' : '');
      span.textContent = st.done ? '✅ 인터뷰 완료' : ('🔶 인터뷰 ' + deptDoneCount + '/' + respondentDepts.length + '개 부서 완료');
      titleWrap.appendChild(document.createTextNode(' '));
      titleWrap.appendChild(span);
    }
  }
  const groupLabel = card.querySelector('.ig-dept-done-label');
  if(groupLabel) groupLabel.textContent = '🏢 부서별 인터뷰 완료 (' + deptDoneCount + '/' + respondentDepts.length + '):';
}

export function igOwnerPersons(code){
  // 설문 응답 시 수집한 "관련 담당자(선택)" 성명을 모아 인터뷰 카드에 참고 힌트로 보여준다.
  // 표시만 하고 면담자(interviewee) 입력값을 자동으로 덮어쓰지는 않는다 — 감사자가 의도적으로
  // 비워둔 값을 매 렌더링마다 되살리면 오히려 혼란을 준다.
  const set = new Set();
  aggRows.filter(r => r.code === code).forEach(r => { if(r.ownPerson) set.add(r.ownPerson); });
  return Array.from(set);
}

export function igEvidenceList(code){
  // 설문 작성 시 응답자가 체크한 "제출 가능 증빙자료" 목록을 부서별로 모아, 인터뷰 전 무엇을
  // 받아서 봐야 하는지, 어느 부서가 제출을 약속했는지 인터뷰 가이드에서 바로 보이게 한다.
  const byDept = {};
  aggRows.filter(r => r.code === code && r.evidence).forEach(r => {
    const names = String(r.evidence).split('/').map(s => s.trim()).filter(Boolean);
    if(names.length === 0) return;
    if(!byDept[r.dept]) byDept[r.dept] = new Set();
    names.forEach(n => byDept[r.dept].add(n));
  });
  return Object.keys(byDept).map(dept => ({dept, items: Array.from(byDept[dept])}));
}

export function igStepsHtml(list){
  return list.map((q,i) => '<div class="ig-step"><span class="ig-step-no">Q' + (i+1) + '.</span>' + q.replace(/</g,'&lt;') + '</div>').join('');
}

export function igEditFormHtml(code, script){
  const joinQ = (arr) => (arr || []).join('\n');
  return '<div class="ig-edit-form" data-code="' + code + '" data-dirty="0" style="display:none;">'
    + '<div class="ig-edit-hint">✏ 아래 내용을 자유롭게 수정한 뒤, <b>맨 아래 [💾 이 항목 저장]</b>을 눌러야 반영됩니다. 저장하지 않고 닫으면(✕ 버튼 또는 위쪽 "질문 편집" 다시 클릭) 변경 내용을 잃을 수 있다고 미리 확인해 드립니다.</div>'
    + '<label>확인 질문 (decisionQ)</label><textarea class="ige-decisionQ" rows="2">' + esc(script.decisionQ||'') + '</textarea>'
    + '<div class="ig-edit-branch-grid">'
      + '<div><label>✅ YES·검증형 질문 (한 줄에 하나씩)</label><textarea class="ige-verify" rows="3">' + esc(joinQ(script.verify)) + '</textarea><label>YES 종결판단</label><textarea class="ige-verifyEnd" rows="2">' + esc(script.verifyEnd||'') + '</textarea></div>'
      + '<div><label>🟡 부분이행 질문 (한 줄에 하나씩)</label><textarea class="ige-partial" rows="3">' + esc(joinQ(script.partial)) + '</textarea><label>부분이행 종결판단</label><textarea class="ige-partialEnd" rows="2">' + esc(script.partialEnd||'') + '</textarea></div>'
      + '<div><label>🚩 NO·원인규명형 질문 (한 줄에 하나씩)</label><textarea class="ige-rootcause" rows="3">' + esc(joinQ(script.rootcause)) + '</textarea><label>NO 종결판단</label><textarea class="ige-rootcauseEnd" rows="2">' + esc(script.rootcauseEnd||'') + '</textarea></div>'
      + '<div><label>⬜ N/A·타당성확인형 질문 (한 줄에 하나씩)</label><textarea class="ige-na" rows="3">' + esc(joinQ(script.na)) + '</textarea><label>N/A 종결판단</label><textarea class="ige-naEnd" rows="2">' + esc(script.naEnd||'') + '</textarea></div>'
    + '</div>'
    + '<div class="ig-edit-actions">'
      + '<button class="gen-small-btn ig-edit-save-btn" data-code="' + code + '" style="margin:0;background:var(--navy);color:#f4efe2;font-size:12.5px;padding:8px 16px;">💾 이 항목 저장 (누르지 않으면 반영되지 않습니다)</button>'
      + '<span class="ig-edit-saved-flash" data-code="' + code + '" style="display:none;color:var(--good);font-weight:700;font-size:11.5px;">✓ 저장되었습니다</span>'
      + '<button class="gen-small-btn ig-edit-reset-btn" data-code="' + code + '" style="margin:0;">↺ 기본값으로 되돌리기</button>'
      + '<button class="gen-small-btn ig-edit-cancel-btn" data-code="' + code + '" style="margin:0;">✕ 저장하지 않고 닫기</button>'
    + '</div>'
  + '</div>';
}

export function igCpOverrideKey(dept, author, idx){
  return String(dept||'') + '::' + String(author||'') + '::' + idx;
}

export function igRenderCpRowHtml(code, ovKey, dept, author, cptext, resp, originalTier, ov){
  const t = originalTier || 'neutral';
  const ovBadge = ov
    ? ('<div class="ig-cp-override-badge">🔄 인터뷰 후 변경: ' + (IG_TIER_ICON[ov.originalTier]||'') + esc(IG_TIER_LABEL[ov.originalTier]||ov.originalResp||'') + ' → <b>' + (IG_TIER_ICON[ov.newTier]||'') + esc(IG_TIER_LABEL[ov.newTier]||'') + '</b>'
        + (ov.reason ? (' · 사유: ' + esc(ov.reason)) : '') + ' · ' + esc(ov.changedBy||'') + (ov.changedAt ? (' (' + esc(String(ov.changedAt).slice(0,10)) + ')') : '') + '</div>')
    : '';
  return '<li class="ig-detail-cp" data-cp-key="' + esc(ovKey) + '">'
    + '<div class="ig-detail-cp-row"><span class="ig-detail-badge ' + t + '">' + (IG_TIER_ICON[t]||'') + ' ' + (IG_TIER_LABEL[t]||resp||'') + '</span><span class="ig-detail-cptext">' + esc(cptext||'') + '</span>'
    + '<button type="button" class="ig-cp-override-toggle-btn" data-code="' + esc(code) + '" data-cp-key="' + esc(ovKey) + '">' + (ov ? '✏ 재검토 수정' : '🔄 인터뷰 후 재검토') + '</button></div>'
    + ovBadge
    + '<div class="ig-cp-override-form" data-cp-key="' + esc(ovKey) + '" style="display:none;">'
      + '<label style="font-size:10.8px;color:var(--ink-soft);">인터뷰로 확인된 실제 판정</label>'
      + '<select class="ig-cp-override-select" data-cp-key="' + esc(ovKey) + '">'
        + ['good','neutral','bad','na'].map(tv => '<option value="' + tv + '"' + ((ov ? ov.newTier : t) === tv ? ' selected' : '') + '>' + IG_TIER_ICON[tv] + ' ' + IG_TIER_LABEL[tv] + '</option>').join('')
      + '</select>'
      + '<input type="text" class="ig-cp-override-reason" data-cp-key="' + esc(ovKey) + '" placeholder="변경 사유 (예: 서면상 미흡이었으나 현장 확인 결과 정상 이행 확인)" value="' + esc(ov ? ov.reason || '' : '') + '">'
      + '<div class="ig-cp-override-actions">'
        + '<button type="button" class="gen-small-btn ig-cp-override-save-btn" data-code="' + esc(code) + '" data-cp-key="' + esc(ovKey) + '" data-dept="' + esc(dept) + '" data-author="' + esc(author) + '" data-cptext="' + esc(cptext||'') + '" data-original-tier="' + t + '" data-original-resp="' + esc(resp||'') + '" style="margin:0;background:var(--navy);color:#f4efe2;">저장</button>'
        + (ov ? ('<button type="button" class="gen-small-btn ig-cp-override-clear-btn" data-code="' + esc(code) + '" data-cp-key="' + esc(ovKey) + '" style="margin:0;">되돌리기(변경 취소)</button>') : '')
      + '</div>'
    + '</div>'
  + '</li>';
}

export function igResponseDetailHtml(code){
  // "이행/미흡 개수는 보이는데 실제로 어떤 응답인지 내용을 확인할 수가 없다"는 지적에 대한 대응.
  // 집계된 aggRows를 (부서+작성자) 단위로 묶어, 체크포인트별 실제 응답(이행/부분이행/미흡/해당없음)과
  // 비고·자체평가 내용을 그대로 펼쳐 보여준다. 인터뷰 가이드 카드 안에서 바로 열람 가능.
  // v6.80: 인터뷰 결과 원래 응답과 다르게 판단되는 경우(예: 서면 "이행"이었으나 실사 결과 "미흡"으로
  // 확인) 그 자리에서 바로 재검토·기록할 수 있는 컨트롤을 각 체크포인트 줄에 추가했다.
  const rows = aggRows.filter(r => r.code === code);
  if(rows.length === 0){
    return '<div class="ig-detail-empty">집계된 응답 데이터가 없습니다.</div>';
  }
  const overrides = (interviewState[code] && interviewState[code].cpOverrides) || {};
  const groups = {};
  const order = [];
  rows.forEach(r => {
    const key = (r.dept||'(부서미상)') + '::' + (r.author||'');
    if(!groups[key]){
      groups[key] = {dept:r.dept||'(부서미상)', author:r.author||'', note:r.note||'', sr:r.sr||'', srNote:r.srNote||'', rows:[]};
      order.push(key);
    }
    groups[key].rows.push(r);
  });
  return '<div class="ig-detail-groups">' + order.map(key => {
    const g = groups[key];
    return '<div class="ig-detail-group">'
      + '<div class="ig-detail-group-head"><span class="ig-detail-dept">🏢 ' + esc(g.dept) + '</span>'
        + (g.author ? '<span class="ig-detail-author">👤 ' + esc(g.author) + '</span>' : '')
        + (g.sr ? '<span class="ig-detail-sr">자체평가: ' + esc(g.sr) + '</span>' : '')
      + '</div>'
      + (g.note ? '<div class="ig-detail-note">📝 비고: ' + esc(g.note) + '</div>' : '')
      + (g.srNote ? '<div class="ig-detail-note">🗒 자체평가 근거: ' + esc(g.srNote) + '</div>' : '')
      + '<ul class="ig-detail-cp-list">'
        + g.rows.map((r, idx) => {
            const ovKey = igCpOverrideKey(g.dept, g.author, idx);
            return igRenderCpRowHtml(code, ovKey, g.dept, g.author, r.cptext, r.resp, r.tier || 'neutral', overrides[ovKey]);
          }).join('')
      + '</ul>'
    + '</div>';
  }).join('') + '</div>';
}

export function igToggleDetail(btn){
  const card = btn.closest('.ig-card');
  const panel = card ? card.querySelector('.ig-detail-panel') : null;
  if(!panel) return;
  const show = panel.style.display === 'none';
  panel.style.display = show ? 'block' : 'none';
  btn.textContent = show ? '🔼 응답 상세 닫기' : '🔍 응답 상세 (누가 어떻게 응답했는지)';
  btn.classList.toggle('active', show);
}

export function buildNodesFromFlowSpec(spec){
  const nodes = {};
  const steps = (spec && spec.steps) || [];
  const n = steps.length;
  const needsHoldEnd = steps.some(s => s && s.holdLabel);
  if(needsHoldEnd){
    const he = spec.holdEnd || {};
    nodes.hold_end = { end:'hold', title: he.title || '자료 확보 — 정밀검토 예정',
      flowLabel:[he.title || '잠재 결함','정밀검토 예정'], text: he.text || '' };
  }
  steps.forEach((step, i) => {
    const key = 'q' + (i + 1);
    const isLast = (i + 1 === n);
    const nextKey = isLast ? 'good' : 'q' + (i + 2);
    const options = [];
    options.push({ label: step.downLabel || '예 (확인됨)', next: nextKey, flow:'down' });
    (step.fails || []).forEach((f, fi) => {
      const failKey = key + '_f' + fi;
      nodes[failKey] = { end:'bad', title: f.title || '결함 의심',
        flowLabel:[f.title || '결함 의심', f.sub || ''], text: f.text || '' };
      options.push({ label: f.label || '아니오', next: failKey, flow:'side' });
    });
    if(step.holdLabel){
      options.push({ label: step.holdLabel, next: isLast ? 'hold_end' : nextKey,
        flow: isLast ? 'holdend' : 'holdnote', hold:true });
    }
    nodes[key] = { q: step.q || '', flowLabel:[step.label1 || ('질문 ' + (i + 1)), step.label2 || ''],
      guide: step.guide || '', options: options };
  });
  nodes.good = { end:'good', title:'양호', flowLabel:['양호','전 항목 통과'], text: (spec && spec.goodText) || '' };
  return nodes;
}

export function igfGenericSpecFor(script){
  const verify = (script && script.verify) || [];
  return {
    steps: verify.map((q, i) => ({
      q: q, label1:'질문 ' + (i + 1), label2:'',
      guide:'증빙을 제시하면 예. 제시하지 못하거나 응답과 다르면 아니오. 자료는 확보했지만 판단은 감사역이 나중에 하겠다면 세 번째를 선택하세요.',
      downLabel:'예 (증빙 제시·확인됨)',
      fails:[{label:'아니오 (제시 못함 / 응답과 불일치)', title:'결함 의심', sub:'', text:(script && script.rootcauseEnd) || '결함으로 확정하고 원인규명형 질문으로 전환하세요.'}],
      holdLabel:'자료는 확보함 — 감사역이 정밀 검토'
    })),
    goodText: (script && script.verifyEnd) || '검증형 질문이 모두 확인되어 양호로 확정합니다.',
    holdEnd: { title:'자료 확보 — 정밀검토 예정', text:'확보한 자료를 바탕으로 감사역이 추후 판독해 최종 결론을 확정합니다.' }
  };
}

export function igfDefaultSpecFor(code, script){
  const existing = flowOverrides[code] || AI_FLOW_DEFAULTS[code];
  if(existing) return JSON.parse(JSON.stringify(existing));
  return igfGenericSpecFor(script);
}

export function downloadFlowSpecXlsx(codes){
  if(typeof XLSX === 'undefined'){ alert('엑셀 라이브러리를 아직 불러오지 못했습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.'); return; }
  let list = (codes && codes.length) ? codes.slice() : [];
  if(list.length === 0){
    const applied = applyOverrides(DOMAINS);
    applied.forEach(d => d.items.forEach(it => list.push(d.code + '-' + it.no)));
  }
  list = Array.from(new Set(list)).sort((a,b) => {
    const [ad,an] = a.split('-'); const [bd,bn] = b.split('-');
    if(ad !== bd) return ad.localeCompare(bd);
    return Number(an) - Number(bn);
  });

  const guideRows = [
    ['IT 감사 인터뷰 가이드 — ②순서도·③분기형 대량 편집 서식'],
    [''],
    ['이 파일은 ②순서도·③분기형 화면에 나오는 질문·결함 시나리오·보류 옵션·양호 판정 문구를 담고 있습니다.'],
    ['· 01_질문 시트: 항목별 질문(순서도의 마름모) — 한 행 = 항목 1개의 질문 1개'],
    ['· 02_결함시나리오 시트: 그 질문이 "정상이 아닐 때" 보여줄 결함 박스 — 한 행 = 질문 1개의 결함 시나리오 1개'],
    ['· 두 시트는 "항목코드" + "질문순번"으로 서로 연결됩니다. 질문순번은 그 항목 안에서 1부터 시작하는 정수입니다.'],
    ['· 수정한 파일을 그대로 "📥 엑셀에서 순서도·분기형 가져오기"로 올리면, 항목코드가 일치하는 항목만 갱신되고 나머지 항목은 그대로 유지됩니다.'],
    ['· 질문 추가: 01_질문 시트에서 그 항목의 새 질문순번(마지막 다음 번호)으로 행을 추가하세요.'],
    ['· 질문 삭제: 01_질문 시트에서 그 행을 지우고, 남은 질문들의 순번을 1부터 빈틈없이 다시 매기세요(예: 1,2,4처럼 중간이 비면 그 항목 전체가 반영되지 않고 건너뜁니다). 02_결함시나리오의 해당 질문순번 행도 함께 정리해 주세요.'],
    ['· "보류 버튼 문구"를 채우면 그 질문에 보류(자료는 확보, 감사역이 나중에 정밀검토) 옵션이 생깁니다. 비워두면 보류 옵션 없음.'],
    ['· "양호 판정 문구"·"보류 결함 박스 제목/설명"은 항목 전체에 하나씩만 있으면 되므로, 그 항목의 질문순번 1행에만 적으세요(다른 행에 적어도 무시됩니다).'],
    ['· "항목명" 열은 참고용입니다 — 고쳐도 반영되지 않으며, 실제 기준은 항목코드입니다.'],
    [''],
    ['생성일: ' + kstDateStr()]
  ];
  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideSheet['!cols'] = [{wch:95}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, guideSheet, '00_안내');

  const qRows = [['항목코드','항목명(참고용)','질문순번','질문문장','순서도라벨1','순서도라벨2','진행안내','정상진행버튼문구','보류버튼문구(있으면 채움)','양호판정문구(질문1행에만)','보류결함박스제목(질문1행에만)','보류결함박스설명(질문1행에만)']];
  const fRows = [['항목코드','질문순번','결함순번','버튼문구','박스제목','구체사유','박스설명']];
  list.forEach(code => {
    const script = igGetScript(code);
    if(!script) return;
    const spec = igfDefaultSpecFor(code, script);
    const meta = igItemMeta(code);
    (spec.steps || []).forEach((step, i) => {
      const n = i + 1;
      qRows.push([
        code, (meta && meta.title) || '', n, step.q || '', step.label1 || '', step.label2 || '',
        step.guide || '', step.downLabel || '', step.holdLabel || '',
        n === 1 ? (spec.goodText || '') : '',
        n === 1 ? ((spec.holdEnd && spec.holdEnd.title) || '') : '',
        n === 1 ? ((spec.holdEnd && spec.holdEnd.text) || '') : ''
      ]);
      (step.fails || []).forEach((f, fi) => {
        fRows.push([code, n, fi + 1, f.label || '', f.title || '', f.sub || '', f.text || '']);
      });
    });
  });
  const qSheet = XLSX.utils.aoa_to_sheet(qRows);
  qSheet['!cols'] = [{wch:8},{wch:26},{wch:8},{wch:44},{wch:16},{wch:16},{wch:32},{wch:24},{wch:28},{wch:32},{wch:24},{wch:32}];
  XLSX.utils.book_append_sheet(wb, qSheet, '01_질문');
  const fSheet = XLSX.utils.aoa_to_sheet(fRows);
  fSheet['!cols'] = [{wch:8},{wch:8},{wch:8},{wch:26},{wch:20},{wch:20},{wch:36}];
  XLSX.utils.book_append_sheet(wb, fSheet, '02_결함시나리오');

  const fname = 'IT감사_인터뷰가이드_순서도분기형' + (typeof versionSuffix === 'function' ? versionSuffix() : '') + '.xlsx';
  XLSX.writeFile(wb, fname);
}

export function handleFlowSpecXlsxFile(file){
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const wb = XLSX.read(ev.target.result, {type:'array'});
      const qSheet = wb.Sheets['01_질문'];
      if(!qSheet){ alert('"01_질문" 시트를 찾을 수 없습니다. 이 도구에서 "📤 순서도·분기형 엑셀로 내보내기"로 받은 서식 파일이 맞는지 확인해 주세요.'); return; }
      const qRows = XLSX.utils.sheet_to_json(qSheet, {header:1, blankrows:false, defval:''});
      const fSheetObj = wb.Sheets['02_결함시나리오'];
      const fRows = fSheetObj ? XLSX.utils.sheet_to_json(fSheetObj, {header:1, blankrows:false, defval:''}) : [];

      const failsByKey = {};
      fRows.slice(1).forEach(r => {
        const code = String(r[0] || '').trim();
        const stepNo = Number(r[1]);
        if(!code || !stepNo) return;
        const key = code + '::' + stepNo;
        (failsByKey[key] = failsByKey[key] || []).push({
          _idx: Number(r[2]) || 0,
          label: String(r[3] || ''), title: String(r[4] || ''), sub: String(r[5] || ''), text: String(r[6] || '')
        });
      });
      Object.keys(failsByKey).forEach(k => failsByKey[k].sort((a,b) => a._idx - b._idx));

      const byCode = {};
      qRows.slice(1).forEach(r => {
        const code = String(r[0] || '').trim();
        const stepNo = Number(r[2]);
        if(!code || !stepNo) return;
        if(!byCode[code]) byCode[code] = { steps: [], goodText:'', holdEndTitle:'', holdEndText:'' };
        const entry = byCode[code];
        entry.steps.push({
          no: stepNo, q: String(r[3] || ''), label1: String(r[4] || ''), label2: String(r[5] || ''),
          guide: String(r[6] || ''), downLabel: String(r[7] || ''), holdLabel: String(r[8] || '')
        });
        if(stepNo === 1){
          entry.goodText = String(r[9] || '');
          entry.holdEndTitle = String(r[10] || '');
          entry.holdEndText = String(r[11] || '');
        }
      });

      const codes = Object.keys(byCode);
      if(codes.length === 0){ alert('파일에서 유효한 항목 행을 찾지 못했습니다.'); return; }

      let updated = 0, skippedUnknown = 0;
      const warnings = [];
      codes.forEach(code => {
        if(!igFindItem(code)){ skippedUnknown++; return; }
        const entry = byCode[code];
        entry.steps.sort((a,b) => a.no - b.no);
        const nums = entry.steps.map(s => s.no);
        const expected = nums.map((_, i) => i + 1);
        const isSequential = nums.length > 0 && JSON.stringify(nums) === JSON.stringify(expected);
        if(!isSequential){
          warnings.push(code + ' (질문순번이 1부터 빈틈없이 이어지지 않아 건너뜀: ' + nums.join(',') + ')');
          return;
        }
        const spec = {
          steps: entry.steps.map(s => ({
            q: s.q, label1: s.label1, label2: s.label2, guide: s.guide, downLabel: s.downLabel,
            holdLabel: s.holdLabel ? s.holdLabel : null,
            fails: (failsByKey[code + '::' + s.no] || []).map(f => ({label:f.label, title:f.title, sub:f.sub, text:f.text}))
          })),
          goodText: entry.goodText,
          holdEnd: (entry.holdEndTitle || entry.holdEndText) ? {title: entry.holdEndTitle, text: entry.holdEndText} : null
        };
        flowOverrides[code] = spec;
        updated++;
      });
      saveFlowOverrides();
      if(typeof renderInterviewGuide === 'function') renderInterviewGuide();

      let msg = updated + '개 항목의 순서도·분기형 내용을 반영했습니다.';
      if(skippedUnknown) msg += '\n(존재하지 않는 항목코드 ' + skippedUnknown + '건은 건너뛰었습니다.)';
      if(warnings.length) msg += '\n\n다음 항목은 질문순번 오류로 건너뛰었습니다:\n' + warnings.join('\n');
      alert(msg);
    } catch(err){
      alert('엑셀 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

export function buildInterviewAiPromptText(domainCode, auditorContext, itemCode){
  const dom = igFindDomain(domainCode);
  if(!dom) return '';
  const ctxText = String(auditorContext || '').trim();
  const ctxBlock = ctxText
    ? ('[감사역이 이 영역에 대해 이미 파악하고 있는 사실·우려사항 — 질문을 만들 때 반드시 이 내용을 파고들도록 반영할 것]\n' + ctxText + '\n\n')
    : '';
  // [v8.31] itemCode가 주어지면 그 항목 하나만, 없으면(기존 동작) 도메인 전체 항목을 대상으로 한다.
  const targetItems = itemCode
    ? (dom.items || []).filter(it => (domainCode + '-' + it.no) === itemCode)
    : (dom.items || []);
  const itemLines = targetItems.map(it => {
    const code = domainCode + '-' + it.no;
    const cps = (it.checkpoints || []).map(c => '    - ' + c).join('\n');
    const ev = (it.evidence || []).join(', ');
    return '- 항목코드: ' + code + '\n'
      + '  제목: ' + (it.title || '') + '\n'
      + '  설명: ' + (it.desc || '') + '\n'
      + '  체크포인트:\n' + (cps || '    (없음)') + '\n'
      + '  증빙자료 예시: ' + (ev || '(없음)') + '\n'
      + '  근거법령: ' + (it.law || '').replace(/\n/g, ' / ') + '\n'
      + '  위험도: ' + (it.risk || '');
  }).join('\n\n');

  let fewshotJson = '';
  try {
    const sample = igGetScript('25-1');
    const sampleFlow = AI_FLOW_DEFAULTS['25-1'];
    if(sample && sampleFlow){
      const fewshot = {
        '25-1(예시 — 실제로는 이 코드를 쓰지 말고, 아래 [이번에 작성해야 할 항목들]의 코드로 작성)': {
          script: { decisionQ: sample.decisionQ, verify: sample.verify, verifyEnd: sample.verifyEnd, partial: sample.partial, partialEnd: sample.partialEnd, rootcause: sample.rootcause, rootcauseEnd: sample.rootcauseEnd, na: sample.na, naEnd: sample.naEnd },
          flow: { steps: (sampleFlow.steps || []).slice(0, 2), goodText: sampleFlow.goodText, holdEnd: sampleFlow.holdEnd }
        }
      };
      fewshotJson = JSON.stringify(fewshot, null, 2);
    }
  } catch(e){ fewshotJson = '(예시를 만들지 못했습니다 — 아래 스키마 설명만 참고해 주세요)'; }

  const scopeLabel = itemCode
    ? ('감사영역 D-' + domainCode + ' ' + (dom.title || '') + ' 중 항목 ' + itemCode)
    : ('감사영역(D-' + domainCode + ' ' + (dom.title || '') + ')의 점검항목들');
  return '당신은 저축은행 IT감사역을 돕는 "감사 인터뷰 가이드 설계자"입니다.\n'
    + '아래 ' + scopeLabel + '을(를) 바탕으로, 실제 현장 인터뷰에서 감사역이 쓸 질문·판정 문구를 만들어 주세요.\n\n'
    + ctxBlock
    + '[출력 형식 — 반드시 지킬 것]\n'
    + '- 다른 설명 문구 없이, 아래 스키마를 따르는 JSON 객체 "하나만" 코드블록(```json ... ```)으로 출력하세요.\n'
    + '- 최상위 키는 항목코드(예: "' + domainCode + '-1")이고, 값은 "script"(①기존형 — 4갈래 텍스트 판단형)와 "flow"(②순서도 — 단계별 확인 질문형) 두 필드를 가진 객체입니다.\n\n'
    + '[JSON 스키마]\n'
    + '{\n'
    + '  "항목코드": {\n'
    + '    "script": {\n'
    + '      "decisionQ": "감사역이 인터뷰 시작 시 던지는 핵심 확인 질문 한 문장",\n'
    + '      "verify": ["YES(정상 이행) 판정으로 이어지는 확인 질문들 — 배열, 몇 개든 가능"],\n'
    + '      "verifyEnd": "YES 경로 종결 판단 문구",\n'
    + '      "partial": ["부분이행·경계 확인형 질문들"],\n'
    + '      "partialEnd": "부분이행 경로 종결 판단 문구",\n'
    + '      "rootcause": ["NO(미흡) 판정 시 원인을 규명하는 질문들"],\n'
    + '      "rootcauseEnd": "NO 경로 종결 판단 문구",\n'
    + '      "na": ["N/A(해당없음) 타당성을 확인하는 질문들"],\n'
    + '      "naEnd": "N/A 경로 종결 판단 문구"\n'
    + '    },\n'
    + '    "flow": {\n'
    + '      "steps": [\n'
    + '        {\n'
    + '          "q": "그 자리에서 바로 확인 가능한 질문 (예: \'지금 ...자료를 보여주시겠습니까?\', \'감사역이 지정하는 ...을 재조회해 주시겠습니까?\')",\n'
    + '          "label1": "순서도에 표시할 짧은 라벨 1줄 (예: \'① 조회내역\')",\n'
    + '          "label2": "순서도에 표시할 짧은 라벨 2줄 (예: \'지금 조회 가능?\')",\n'
    + '          "guide": "화면에 보여줄 진행 안내 문구 (회색 설명 글씨)",\n'
    + '          "downLabel": "정상 진행(통과) 버튼 문구 (예: \'예 (조회해서 보여줌)\')",\n'
    + '          "fails": [ {"label":"결함 버튼 문구 (예: \'아니오 (제시 못함)\')", "title":"결함 의심 또는 결함 확정", "sub":"짧은 사유 요약", "text":"결함 박스에 보여줄 구체 설명"} ],\n'
    + '          "holdLabel": "보류(자료는 확보, 감사역이 나중에 정밀검토) 옵션이 자연스러운 질문에만 문구를 채우고, 아니면 null"\n'
    + '        }\n'
    + '      ],\n'
    + '      "goodText": "모든 질문을 통과했을 때 양호로 확정하는 문구",\n'
    + '      "holdEnd": {"title":"보류 결함 박스 제목", "text":"보류 결함 박스 설명"}\n'
    + '    }\n'
    + '  }\n'
    + '}\n'
    + '(holdEnd는 steps 중 holdLabel을 쓴 질문이 하나도 없으면 null로 두세요)\n\n'
    + '[작성 지침]\n'
    + '- flow.steps는 항목 하나당 3~5개 권장, 각 질문은 "보여달라/재조회해달라/시연해달라"처럼 감사역이 현장에서 바로 검증할 수 있는 형태로 구체적으로 쓸 것 — 추상적인 "확인하십시오" 식 질문 금지.\n'
    + '- fails는 질문마다 최소 1개, 필요하면 여러 개(예: "미실시"와 "불일치"를 별도 결함으로 구분).\n'
    + '- 아래 각 항목의 체크포인트·근거법령·증빙자료 예시를 실제로 참고해서 질문에 반영할 것 — 항목마다 두루뭉술하게 비슷한 질문을 반복하지 말 것.\n'
    + '- script 쪽 4갈래(verify/partial/rootcause/na)도 flow.steps의 논리와 어긋나지 않게 작성할 것.\n'
    + (ctxText ? '- 위 [감사역이 이미 파악하고 있는 사실·우려사항]에 나온 내용은 일반론으로 흘리지 말고, 그 사실관계를 직접 캐묻는 질문으로 최소 한 군데 이상 구체적으로 반영할 것.\n\n' : '\n')
    + '[아래는 이미 완성된 다른 항목의 예시 — 문체와 구체성 수준을 참고하세요]\n'
    + fewshotJson + '\n\n'
    + '[이번에 작성해야 할 항목들]\n'
    + itemLines + '\n\n'
    + '위 항목 전체에 대해 script와 flow를 스키마대로 작성해서, 하나의 JSON 객체로 출력해 주세요.';
}

export function igAiPromptItemOptionsHtml(domainCode, selectedItemCode){
  const dom = igFindDomain(domainCode);
  const items = dom ? (dom.items || []) : [];
  let html = '<option value="">전체 항목 (도메인 전체)</option>';
  html += items.map(it => {
    const code = domainCode + '-' + it.no;
    const sel = code === selectedItemCode ? ' selected' : '';
    return '<option value="' + code + '"' + sel + '>' + code + ' ' + esc(it.title || '') + '</option>';
  }).join('');
  return html;
}

export function igOpenAiToolsWindow(domainCode, itemCode){
  const dom = igFindDomain(domainCode);
  if(!dom){ alert('도메인을 찾을 수 없습니다.'); return; }
  const targetItem = itemCode ? (dom.items || []).find(it => (domainCode + '-' + it.no) === itemCode) : null;
  if(itemCode && !targetItem){ alert('선택한 항목(' + itemCode + ')을 이 도메인에서 찾을 수 없습니다.'); return; }
  const promptText = buildInterviewAiPromptText(domainCode, '', itemCode || '');
  const win = window.open('', '_blank', 'width=880,height=920,resizable=yes,scrollbars=yes');
  if(!win){ alert('팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도해 주세요.'); return; }
  const esc2 = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const titleSuffix = itemCode ? (itemCode + ' ' + (targetItem.title || '')) : ('D-' + domainCode);

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>AI 프롬프트 제작기 — ' + esc2(titleSuffix) + '</title>'
    + '<style>'
    + 'body{font-family:"Pretendard","Malgun Gothic",sans-serif;margin:0;padding:18px 22px 30px;color:#222;background:#f7f8fb;}'
    + 'h1{font-size:17px;margin:0 0 4px;}'
    + '.sub{font-size:12px;color:#666;margin-bottom:16px;line-height:1.5;}'
    + '.section{background:#fff;border:1px solid #d8dce6;border-radius:8px;padding:14px 16px;margin-bottom:16px;}'
    + '.section h2{font-size:13.5px;margin:0 0 8px;color:#2a3358;}'
    + '.hint{font-size:11px;color:#888;margin-bottom:8px;line-height:1.5;}'
    + 'textarea{width:100%;box-sizing:border-box;font-family:"D2Coding","Consolas",monospace;font-size:11.5px;line-height:1.5;border:1px solid #c9d0e0;border-radius:5px;padding:8px;}'
    + '#promptBox{height:330px;background:#fbfbfd;color:#333;}'
    + '#contextBox{height:80px;}'
    + '#jsonBox{height:160px;}'
    + '.regen-btn{background:#8a6a24;}'
    + 'button{margin-top:8px;padding:7px 14px;border:none;border-radius:5px;background:#4a5a8a;color:#fff;font-size:12px;font-weight:600;cursor:pointer;}'
    + 'button:hover{opacity:.9;}'
    + '.flash{display:none;margin-left:10px;color:#2a7a3f;font-size:11.5px;font-weight:600;}'
    + '.result{margin-top:10px;font-size:11.5px;white-space:pre-wrap;line-height:1.6;}'
    + '.result.ok{color:#2a7a3f;}'
    + '.result.err{color:#a23b2e;}'
    + '</style></head><body>'
    + '<h1>🤖 AI 프롬프트 제작기</h1>'
    + '<div class="sub">' + (itemCode
        ? (esc2(itemCode) + ' ' + esc2(targetItem.title || '') + ' (D-' + esc2(domainCode) + ' ' + esc2(dom.title || '') + ') — 이 항목 1개의 인터뷰 가이드(①기존형·②순서도) 콘텐츠만 AI에게 만들어달라고 요청하는 프롬프트입니다.')
        : ('D-' + esc2(domainCode) + ' ' + esc2(dom.title || '') + ' — 이 도메인 ' + (dom.items || []).length + '개 항목 전체의 인터뷰 가이드(①기존형·②순서도) 콘텐츠를 AI에게 만들어달라고 요청하는 프롬프트입니다.')
      ) + ' 체크리스트 자체는 이미 등록돼 있다는 전제이며, 이 창은 그 항목의 인터뷰 콘텐츠만 채웁니다.</div>'
    + '<div class="section">'
      + '<h2>0) (선택) 이 영역에 대해 이미 파악하고 있는 사실·우려사항이 있으면 적어주세요</h2>'
      + '<div class="hint">예: "지난 감사 때 A부서 인력 부족으로 문서화가 부실했음", "최근 이 영역 관련 사고·민원 이력 있음" 등 — 적어두면 AI가 그 부분을 더 구체적으로 캐묻는 질문을 만듭니다. 비워두면 지금까지처럼 일반적인 질문으로 만들어집니다.</div>'
      + '<textarea id="contextBox" placeholder="여기에 감사역이 파악한 사실·우려사항을 적어주세요 (선택 사항)"></textarea>'
      + '<button id="regenBtn" type="button" class="regen-btn">🔄 이 내용 반영해서 프롬프트 다시 만들기</button>'
    + '</div>'
    + '<div class="section">'
      + '<h2>1) 아래 프롬프트를 복사해서 원하는 AI(ChatGPT·Gemini·Claude 등 어디든)에 붙여넣으세요</h2>'
      + '<textarea id="promptBox" readonly>' + esc2(promptText) + '</textarea>'
      + '<button id="copyBtn" type="button">📋 프롬프트 복사</button>'
      + '<span id="copyFlash" class="flash">✓ 복사되었습니다</span>'
    + '</div>'
    + '<div class="section">'
      + '<h2>2) AI가 응답한 내용을 통째로 복사해서 아래에 붙여넣고 "가져오기"를 누르세요</h2>'
      + '<div class="hint">```json 코드블록 표시나 앞뒤 설명 문구가 섞여 있어도 괜찮습니다 — 첫 { 부터 마지막 } 까지만 골라서 읽습니다. 이미 존재하는 항목코드만 반영되고, 없는 코드는 건너뜁니다. 위 0)번 사실·우려사항 칸이 비어 있는 채로 가져오면, 인터뷰 가이드 카드에 "🧪 AI 초안(사실·우려사항 미반영)" 표시가 자동으로 붙습니다 — 나중에 사실·우려사항을 채워 다시 가져오면 그 표시는 사라집니다.</div>'
      + '<textarea id="jsonBox" placeholder="여기에 AI 응답을 통째로 붙여넣으세요"></textarea>'
      + '<button id="importBtn" type="button">📥 가져오기</button>'
      + '<div id="importResult" class="result"></div>'
    + '</div>'
    + '<script>'
    + 'var DOMAIN_CODE = ' + JSON.stringify(domainCode) + ';'
    + 'var ITEM_CODE = ' + JSON.stringify(itemCode || '') + ';'
    + 'document.getElementById("regenBtn").addEventListener("click", function(){'
      + 'var ctx = document.getElementById("contextBox").value;'
      + 'try{'
        + 'if(!window.opener || window.opener.closed) throw new Error("원래 화면(오프너)을 찾을 수 없습니다 — 이 창을 새로고침하지 말고, 원래 화면에서 다시 열어주세요.");'
        + 'var newText = window.opener.buildInterviewAiPromptText(DOMAIN_CODE, ctx, ITEM_CODE);'
        + 'document.getElementById("promptBox").value = newText;'
      + '}catch(e){ alert("프롬프트를 다시 만들지 못했습니다: " + e.message); }'
    + '});'
    + 'document.getElementById("copyBtn").addEventListener("click", function(){'
      + 'var box = document.getElementById("promptBox"); box.focus(); box.select();'
      + 'try{ box.setSelectionRange(0, 9999999); }catch(e){}'
      + 'var ok = false; try{ ok = document.execCommand("copy"); }catch(e){}'
      + 'if(!ok && navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(box.value).catch(function(){}); }'
      + 'var f = document.getElementById("copyFlash"); f.style.display = "inline"; setTimeout(function(){ f.style.display = "none"; }, 1800);'
    + '});'
    + 'document.getElementById("importBtn").addEventListener("click", function(){'
      + 'var text = document.getElementById("jsonBox").value;'
      + 'var hasCtx = !!document.getElementById("contextBox").value.trim();'
      + 'var resultEl = document.getElementById("importResult");'
      + 'if(!text.trim()){ resultEl.textContent = "붙여넣은 내용이 없습니다."; resultEl.className = "result err"; return; }'
      + 'try{'
        + 'if(!window.opener || window.opener.closed) throw new Error("원래 화면(오프너)을 찾을 수 없습니다 — 이 창을 새로고침하지 말고, 원래 화면에서 다시 열어주세요.");'
        + 'var r = window.opener.handleAiJsonImportText(text, hasCtx);'
        + 'if(r.error){ resultEl.textContent = "오류: " + r.error; resultEl.className = "result err"; return; }'
        + 'var msg = (r.scriptUpdated + r.flowUpdated) + "건 반영됨 (①기존형 " + r.scriptUpdated + "건 · ②순서도 " + r.flowUpdated + "건).";'
        + 'msg += hasCtx ? "\\n(사실·우려사항을 반영한 프롬프트 기준으로 기록됨)" : "\\n(사실·우려사항 없이 만든 프롬프트 기준 — 인터뷰 가이드에 \\"AI 초안(미반영)\\" 표시가 붙습니다)";'
        + 'if(r.skippedUnknown) msg += "\\n존재하지 않는 항목코드 " + r.skippedUnknown + "건은 건너뛰었습니다.";'
        + 'if(r.warnings && r.warnings.length) msg += "\\n\\n주의:\\n" + r.warnings.join("\\n");'
        + 'resultEl.textContent = msg; resultEl.className = "result ok";'
      + '}catch(e){'
        + 'resultEl.textContent = "가져오기 실패: " + e.message; resultEl.className = "result err";'
      + '}'
    + '});'
    + '<\/script>'
    + '</body></html>';

  win.document.write(html);
  win.document.close();
}

export function igfTogglePanel(code){
  const panel = document.querySelector('.igf-edit-form[data-code="' + CSS.escape(code) + '"]');
  if(!panel) return;
  if(igfOpenCodes.has(code)){
    if(panel.dataset.dirty === '1' && !confirm('저장하지 않은 수정 내용이 있습니다. 저장하지 않고 닫으면 방금 고친 내용은 사라집니다.\n\n그래도 닫을까요? ([취소]를 누르면 계속 편집할 수 있습니다)')) return;
    igfOpenCodes.delete(code);
    delete igfEditState[code];
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }
  igfEditState[code] = igfDefaultSpecFor(code, igGetScript(code));
  igfOpenCodes.add(code);
  panel.style.display = 'block';
  panel.dataset.dirty = '0';
  igfRenderPanel(code);
}

export function igfRenderPanel(code){
  const panel = document.querySelector('.igf-edit-form[data-code="' + CSS.escape(code) + '"]');
  if(!panel || !igfEditState[code]) return;
  const hasCustom = !!(flowOverrides[code] || AI_FLOW_DEFAULTS[code]);
  panel.innerHTML = igfBuildFormHtml(code, igfEditState[code], hasCustom);
  igfWirePanel(code, panel);
}

export function igfBuildFormHtml(code, spec, hasCustom){
  const anyHold = (spec.steps || []).some(s => s && s.holdLabel);
  let html = '<div class="igf-intro">🗺 여기서 편집한 내용은 ②순서도·③분기형(체험) 화면 새 창에 그대로 반영됩니다. 질문은 몇 개든 추가할 수 있고, 질문마다 "정상이 아닐 때" 시나리오(결함 박스)를 여러 개 둘 수 있습니다.'
    + (hasCustom ? '' : ' 아직 이 항목만의 전용 시나리오가 없어, 기존 검증형 질문으로 초안을 채워 두었습니다 — 자유롭게 고쳐 쓰세요.')
    + '</div>';
  html += spec.steps.map((step, i) => igfStepCardHtml(code, step, i, spec.steps.length)).join('');
  html += '<button type="button" class="igf-add-btn igf-add-step-btn" data-code="' + code + '">+ 질문 추가</button>';
  html += '<div class="igf-hold-fields" style="display:' + (anyHold ? 'block' : 'none') + ';margin-top:12px;">'
    + '<div style="font-size:11px;font-weight:700;color:#1B5A8A;margin-bottom:6px;">🔷 "보류"를 마지막 질문에서 고르면 나오는 결함 박스 (질문들이 공용으로 씀)</div>'
    + '<label>박스 제목</label><input type="text" class="igf-holdend-title" data-code="' + code + '" value="' + esc((spec.holdEnd && spec.holdEnd.title) || '') + '">'
    + '<label>박스 설명</label><textarea class="igf-holdend-text" data-code="' + code + '" rows="2">' + esc((spec.holdEnd && spec.holdEnd.text) || '') + '</textarea>'
  + '</div>';
  html += '<div class="igf-good-section"><label style="margin-top:0;">✅ 양호(모든 질문 통과) 판정 문구</label>'
    + '<textarea class="igf-goodtext" data-code="' + code + '" rows="2">' + esc(spec.goodText || '') + '</textarea></div>';
  html += '<div class="ig-edit-actions">'
    + '<button class="gen-small-btn igf-save-btn" data-code="' + code + '" style="margin:0;background:var(--navy);color:#f4efe2;font-size:12.5px;padding:8px 16px;">💾 이 항목 저장 (누르지 않으면 반영되지 않습니다)</button>'
    + '<span class="igf-saved-flash" data-code="' + code + '" style="display:none;color:var(--good);font-weight:700;font-size:11.5px;">✓ 저장되었습니다</span>'
    + '<button class="gen-small-btn igf-reset-btn" data-code="' + code + '" style="margin:0;">↺ 기본값으로 되돌리기</button>'
    + '<button class="gen-small-btn igf-cancel-btn" data-code="' + code + '" style="margin:0;">✕ 저장하지 않고 닫기</button>'
  + '</div>';
  return html;
}

export function igfFailRowHtml(code, stepIdx, f, failIdx){
  return '<div class="igf-fail-row">'
    + '<div class="igf-fail-row-head"><span class="igf-fail-idx">결함 시나리오 ' + (failIdx + 1) + '</span>'
      + '<button type="button" class="igf-fail-del-btn" data-code="' + code + '" data-idx="' + stepIdx + '" data-fail-idx="' + failIdx + '">✕</button></div>'
    + '<div style="margin-bottom:6px;"><input type="text" class="igf-fail-label" data-code="' + code + '" data-idx="' + stepIdx + '" data-fail-idx="' + failIdx + '" placeholder="버튼 문구 (예: 아니오 — 제시 못함)" value="' + esc(f.label || '') + '"></div>'
    + '<div class="igf-fail-title-row">'
      + '<input type="text" class="igf-fail-title" data-code="' + code + '" data-idx="' + stepIdx + '" data-fail-idx="' + failIdx + '" placeholder="박스 제목 (예: 결함 의심)" value="' + esc(f.title || '') + '">'
      + '<input type="text" class="igf-fail-sub" data-code="' + code + '" data-idx="' + stepIdx + '" data-fail-idx="' + failIdx + '" placeholder="구체 사유(짧게, 예: 자료제시 거부)" value="' + esc(f.sub || '') + '">'
    + '</div>'
    + '<textarea class="igf-fail-text" data-code="' + code + '" data-idx="' + stepIdx + '" data-fail-idx="' + failIdx + '" rows="2" placeholder="결함 박스 설명">' + esc(f.text || '') + '</textarea>'
  + '</div>';
}

export function igfStepCardHtml(code, step, i, total){
  const n = i + 1;
  return '<div class="igf-step-card">'
    + '<div class="igf-step-head"><span class="igf-step-head-label">질문 ' + n + (n === total ? ' (마지막)' : '') + '</span>'
      + (total > 1 ? '<button type="button" class="igf-step-del-btn" data-code="' + code + '" data-idx="' + i + '">✕ 이 질문 삭제</button>' : '')
    + '</div>'
    + '<label style="margin-top:0;">질문 문장 (③분기형 체험에서 실제로 보여줄 질문)</label>'
    + '<textarea class="igf-f-q" data-code="' + code + '" data-idx="' + i + '" rows="2">' + esc(step.q || '') + '</textarea>'
    + '<div class="igf-label-row">'
      + '<div><label>순서도 라벨 1줄(짧게)</label><input type="text" class="igf-f-label1" data-code="' + code + '" data-idx="' + i + '" value="' + esc(step.label1 || '') + '"></div>'
      + '<div><label>순서도 라벨 2줄(짧게)</label><input type="text" class="igf-f-label2" data-code="' + code + '" data-idx="' + i + '" value="' + esc(step.label2 || '') + '"></div>'
    + '</div>'
    + '<label>진행 안내 (체험 화면에 회색 글씨로 표시)</label>'
    + '<textarea class="igf-f-guide" data-code="' + code + '" data-idx="' + i + '" rows="2">' + esc(step.guide || '') + '</textarea>'
    + '<label>✅ "정상 진행" 버튼 문구 (정답이 항상 "예"는 아닙니다 — "아니오"가 정상인 질문도 그대로 적으세요)</label>'
    + '<input type="text" class="igf-f-downlabel" data-code="' + code + '" data-idx="' + i + '" value="' + esc(step.downLabel || '') + '">'
    + '<div class="igf-fails">'
      + '<div class="igf-fails-head">🚩 결함 시나리오 (이 질문이 정상이 아닐 때 — 여러 개 가능)</div>'
      + (step.fails || []).map((f, fi) => igfFailRowHtml(code, i, f, fi)).join('')
      + '<button type="button" class="igf-add-btn igf-add-fail-btn" data-code="' + code + '" data-idx="' + i + '">+ 결함 시나리오 추가</button>'
    + '</div>'
    + '<div class="igf-hold-toggle-row"><label><input type="checkbox" class="igf-f-hold-toggle" data-code="' + code + '" data-idx="' + i + '"' + (step.holdLabel ? ' checked' : '') + '> 이 질문에 "보류(자료는 확보, 감사역이 나중에 정밀검토)" 옵션 추가</label></div>'
    + '<div class="igf-hold-fields" style="display:' + (step.holdLabel ? 'block' : 'none') + ';">'
      + '<label style="margin-top:0;">보류 버튼 문구</label><input type="text" class="igf-f-holdlabel" data-code="' + code + '" data-idx="' + i + '" value="' + esc(step.holdLabel || '') + '">'
    + '</div>'
  + '</div>';
}

export function igfWirePanel(code, panel){
  const spec = () => igfEditState[code];
  const markDirty = () => { panel.dataset.dirty = '1'; };
  const idxOf = (el) => +el.dataset.idx;

  panel.querySelectorAll('.igf-f-q').forEach(el => el.addEventListener('input', () => { spec().steps[idxOf(el)].q = el.value; markDirty(); }));
  panel.querySelectorAll('.igf-f-label1').forEach(el => el.addEventListener('input', () => { spec().steps[idxOf(el)].label1 = el.value; markDirty(); }));
  panel.querySelectorAll('.igf-f-label2').forEach(el => el.addEventListener('input', () => { spec().steps[idxOf(el)].label2 = el.value; markDirty(); }));
  panel.querySelectorAll('.igf-f-guide').forEach(el => el.addEventListener('input', () => { spec().steps[idxOf(el)].guide = el.value; markDirty(); }));
  panel.querySelectorAll('.igf-f-downlabel').forEach(el => el.addEventListener('input', () => { spec().steps[idxOf(el)].downLabel = el.value; markDirty(); }));
  panel.querySelectorAll('.igf-f-holdlabel').forEach(el => el.addEventListener('input', () => { spec().steps[idxOf(el)].holdLabel = el.value; markDirty(); }));

  panel.querySelectorAll('.igf-fail-label').forEach(el => el.addEventListener('input', () => { spec().steps[idxOf(el)].fails[+el.dataset.failIdx].label = el.value; markDirty(); }));
  panel.querySelectorAll('.igf-fail-title').forEach(el => el.addEventListener('input', () => { spec().steps[idxOf(el)].fails[+el.dataset.failIdx].title = el.value; markDirty(); }));
  panel.querySelectorAll('.igf-fail-sub').forEach(el => el.addEventListener('input', () => { spec().steps[idxOf(el)].fails[+el.dataset.failIdx].sub = el.value; markDirty(); }));
  panel.querySelectorAll('.igf-fail-text').forEach(el => el.addEventListener('input', () => { spec().steps[idxOf(el)].fails[+el.dataset.failIdx].text = el.value; markDirty(); }));

  panel.querySelectorAll('.igf-goodtext').forEach(el => el.addEventListener('input', () => { spec().goodText = el.value; markDirty(); }));
  panel.querySelectorAll('.igf-holdend-title').forEach(el => el.addEventListener('input', () => { spec().holdEnd = spec().holdEnd || {}; spec().holdEnd.title = el.value; markDirty(); }));
  panel.querySelectorAll('.igf-holdend-text').forEach(el => el.addEventListener('input', () => { spec().holdEnd = spec().holdEnd || {}; spec().holdEnd.text = el.value; markDirty(); }));

  panel.querySelectorAll('.igf-f-hold-toggle').forEach(el => el.addEventListener('change', () => {
    const st = spec().steps[idxOf(el)];
    st.holdLabel = el.checked ? (st.holdLabel || '자료는 확보함 — 감사역이 정밀 검토') : null;
    markDirty();
    igfRenderPanel(code);
  }));
  panel.querySelectorAll('.igf-add-fail-btn').forEach(btn => btn.addEventListener('click', () => {
    const st = spec().steps[idxOf(btn)];
    st.fails = st.fails || [];
    st.fails.push({label:'', title:'결함 의심', sub:'', text:''});
    markDirty();
    igfRenderPanel(code);
  }));
  panel.querySelectorAll('.igf-fail-del-btn').forEach(btn => btn.addEventListener('click', () => {
    spec().steps[idxOf(btn)].fails.splice(+btn.dataset.failIdx, 1);
    markDirty();
    igfRenderPanel(code);
  }));
  panel.querySelectorAll('.igf-step-del-btn').forEach(btn => btn.addEventListener('click', () => {
    if(spec().steps.length <= 1){ alert('최소 1개의 질문은 있어야 합니다.'); return; }
    if(!confirm('이 질문을 삭제할까요?')) return;
    spec().steps.splice(idxOf(btn), 1);
    markDirty();
    igfRenderPanel(code);
  }));
  panel.querySelectorAll('.igf-add-step-btn').forEach(btn => btn.addEventListener('click', () => {
    spec().steps.push({ q:'', label1:'질문 ' + (spec().steps.length + 1), label2:'', guide:'', downLabel:'예 (확인됨)',
      fails:[{label:'아니오', title:'결함 의심', sub:'', text:''}], holdLabel:null });
    markDirty();
    igfRenderPanel(code);
  }));
  panel.querySelectorAll('.igf-save-btn').forEach(btn => btn.addEventListener('click', () => {
    flowOverrides[code] = JSON.parse(JSON.stringify(spec()));
    saveFlowOverrides();
    panel.dataset.dirty = '0';
    const flash = panel.querySelector('.igf-saved-flash');
    if(flash){ flash.style.display = 'inline'; setTimeout(() => { flash.style.display = 'none'; }, 2500); }
    const card = panel.closest('.ig-card');
    if(card){
      const titleEl = card.querySelector('.ig-card-title');
      if(titleEl && !titleEl.querySelector('.ig-edited-badge')){
        titleEl.insertAdjacentHTML('beforeend', ' <span class="ig-edited-badge">✏ 감사역 편집됨</span>');
      }
    }
  }));
  panel.querySelectorAll('.igf-reset-btn').forEach(btn => btn.addEventListener('click', () => {
    if(!confirm('이 항목의 순서도·분기형을 기본값으로 되돌릴까요? (저장된 편집 내용이 삭제됩니다)')) return;
    delete flowOverrides[code];
    saveFlowOverrides();
    igfEditState[code] = igfDefaultSpecFor(code, igGetScript(code));
    panel.dataset.dirty = '0';
    igfRenderPanel(code);
  }));
  panel.querySelectorAll('.igf-cancel-btn').forEach(btn => btn.addEventListener('click', () => { igfTogglePanel(code); }));
}

export function igwBuildGenericNodes(script){
  const nodes = {}; const verify = script.verify || []; const n = verify.length;
  verify.forEach((q,i)=>{
    const key='q'+(i+1); const isLast=(i+1===n);
    const nextKey = isLast ? 'good' : 'q'+(i+2);
    const badKey = 'f_bad'+(i+1);
    nodes[key] = {
      q:q, flowLabel:['질문 '+(i+1),''],
      guide:'증빙을 제시하면 예. 제시하지 못하거나 응답과 다르면 아니오. 자료는 확보했지만 판단은 감사역이 나중에 하겠다면 세 번째를 선택하세요.',
      options:[
        {label:'예 (증빙 제시·확인됨)', next:nextKey, flow:'down'},
        {label:'아니오 (제시 못함 / 응답과 불일치)', next:badKey, flow:'side'},
        {label:'자료는 확보함 — 감사역이 정밀 검토', next: isLast?'hold_end':nextKey, flow: isLast?'holdend':'holdnote', hold:true}
      ]
    };
    nodes[badKey] = {end:'bad', title:'결함 의심', flowLabel:['결함 의심','원인규명 필요'], text: script.rootcauseEnd || '결함으로 확정하고 원인규명형 질문으로 전환하세요.'};
  });
  nodes.good = {end:'good', title:'양호', flowLabel:['양호','전 항목 통과'], text: script.verifyEnd || '검증형 질문이 모두 확인되어 양호로 확정합니다.'};
  nodes.hold_end = {end:'hold', title:'자료 확보 — 정밀검토 예정', flowLabel:['잠재 결함','정밀검토 예정'], text:'확보한 자료를 바탕으로 감사역이 추후 판독해 최종 결론을 확정합니다.'};
  return nodes;
}

export function igwGetNodes(code, script){
  const spec = flowOverrides[code] || AI_FLOW_DEFAULTS[code];
  if(spec) return buildNodesFromFlowSpec(spec);
  return igwBuildGenericNodes(script);
}

export function igwEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

export function igwBuildFlowchartHTML(nodes){
  const chain=[]; let curKey='q1';
  while(true){
    const n = nodes[curKey];
    if(!n){ break; }
    if(n.end){ chain.push({key:curKey,node:n,isEnd:true}); break; }
    chain.push({key:curKey,node:n,isEnd:false});
    const d = n.options.find(o=>o.flow==='down');
    if(!d) break;
    curKey = d.next;
  }
  /* [v8.12] 화면이 항목마다 지나치게 길고 크다는 지적에 따라 전체적으로 축소했다
     (행간 170→128, 마름모 210x96→176x76, 결함/보류 박스 150x62→134x52, 양호 박스 220x72→186x58,
     글자 11.5px→10.5px, 캔버스 폭 720→640). */
  const rowH=128, cx=280, sideX=520, startY=76, hw=88, hh=38;
  let parts=[]; let maxY=startY;
  function lines(arr){ return arr.map((l,i)=>'<tspan x="'+cx+'" dy="'+(i===0?0:14)+'">'+igwEsc(l)+'</tspan>').join(''); }
  function linesAt(arr,x){ return arr.map((l,i)=>'<tspan x="'+x+'" dy="'+(i===0?0:14)+'">'+igwEsc(l)+'</tspan>').join(''); }
  function diamond(cy,label){ return '<polygon points="'+cx+','+(cy-hh)+' '+(cx+hw)+','+cy+' '+cx+','+(cy+hh)+' '+(cx-hw)+','+cy+'" fill="#FAFAF8" stroke="#333" stroke-width="1.2"/>'+'<text y="'+(cy-3)+'" text-anchor="middle" font-size="10.5" font-weight="600">'+lines(label)+'</text>'; }
  function box(cyy,w,h,label,kind){ const colors={bad:['#FAECE7','#993C1D','#4A1B0C'],hold:['#E6F1FB','#1B5A8A','#042C53'],good:['#E1F5EE','#0F6E56','#04342C']}; const c=colors[kind]||colors.bad; return '<rect x="'+(sideX-w/2)+'" y="'+(cyy-h/2)+'" width="'+w+'" height="'+h+'" rx="8" fill="'+c[0]+'" stroke="'+c[1]+'" stroke-width="1.1"/>'+'<text x="'+sideX+'" y="'+(cyy-2)+'" text-anchor="middle" font-size="10.5" font-weight="700" fill="'+c[2]+'">'+linesAt(label,sideX)+'</text>'; }
  function goodbox(cyy,w,h,label,kind){ const colors={bad:['#FAECE7','#993C1D','#4A1B0C'],hold:['#E6F1FB','#1B5A8A','#042C53'],good:['#E1F5EE','#0F6E56','#04342C']}; const c=colors[kind]||colors.good; return '<rect x="'+(cx-w/2)+'" y="'+(cyy-h/2)+'" width="'+w+'" height="'+h+'" rx="8" fill="'+c[0]+'" stroke="'+c[1]+'" stroke-width="1.1"/>'+'<text x="'+cx+'" y="'+(cyy-2)+'" text-anchor="middle" font-size="10.5" font-weight="700" fill="'+c[2]+'">'+lines(label)+'</text>'; }
  function arrowV(y1,y2){ return '<line x1="'+cx+'" y1="'+y1+'" x2="'+cx+'" y2="'+y2+'" stroke="#555" stroke-width="1.5" marker-end="url(#igwArrow)"/>'+'<text x="'+(cx+9)+'" y="'+((y1+y2)/2)+'" font-size="10.5" fill="#0F6E56" font-weight="600">예</text>'; }
  function arrowH(x1,y){ return '<line x1="'+x1+'" y1="'+y+'" x2="'+(sideX-60)+'" y2="'+y+'" stroke="#993C1D" stroke-width="1.5" marker-end="url(#igwArrow)"/>'+'<text x="'+((x1+sideX-60)/2-12)+'" y="'+(y-5)+'" font-size="10" fill="#993C1D" font-weight="600">아니오</text>'; }
  function arrowDash(x1,y1,y2){ return '<line x1="'+x1+'" y1="'+y1+'" x2="'+(sideX-60)+'" y2="'+y2+'" stroke="#1B5A8A" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#igwArrow)"/>'+'<text x="'+((x1+sideX-60)/2)+'" y="'+((y1+y2)/2-5)+'" font-size="10" fill="#1B5A8A" font-weight="600">보류</text>'; }
  chain.forEach((item,i)=>{
    if(item.isEnd) return;
    const cy = startY + i*rowH; maxY = Math.max(maxY,cy);
    const n = item.node;
    parts.push(diamond(cy, n.flowLabel));
    const nextCy = startY + (i+1)*rowH;
    parts.push(arrowV(cy+hh, nextCy-hh));
    const sideOpts = n.options.filter(o=>o.flow==='side');
    sideOpts.forEach((so,si)=>{
      const boxCy = cy + (si-(sideOpts.length-1)/2)*58;
      parts.push(arrowH(cx+hw, boxCy));
      parts.push(box(boxCy,134,52,nodes[so.next].flowLabel,'bad'));
      maxY = Math.max(maxY, boxCy+34);
    });
    const holdendOpt = n.options.find(o=>o.flow==='holdend');
    if(holdendOpt){
      const by = cy + (sideOpts.length>1?118:68);
      parts.push(arrowDash(cx+hw*0.55, cy+hh*0.85, by));
      parts.push(box(by,134,52,nodes[holdendOpt.next].flowLabel,'hold'));
      maxY = Math.max(maxY, by+30);
    }
    const holdnoteOpt = n.options.find(o=>o.flow==='holdnote');
    if(holdnoteOpt){
      parts.push('<text x="'+(cx-hw-12)+'" y="'+(cy+4)+'" text-anchor="end" font-size="9" fill="#888">보류→기록 후 계속</text>');
    }
  });
  const endIdx = chain.length-1;
  const goodCy = startY + endIdx*rowH;
  parts.push(goodbox(goodCy,186,58,chain[endIdx].node.flowLabel,chain[endIdx].node.end));
  maxY = Math.max(maxY, goodCy+42);
  const svg = '<svg viewBox="0 0 640 '+(maxY+34)+'" width="100%" xmlns="http://www.w3.org/2000/svg">'
    + '<defs><marker id="igwArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
    + '<path d="M1 1L9 5L1 9" fill="none" stroke="#555" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>'
    + parts.join('') + '</svg>';
  return svg + '<div style="display:flex;gap:16px;font-size:11px;color:#444;margin-top:8px;flex-wrap:wrap">'
    + '<span><span style="display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;background:#E1F5EE;border:1px solid #0F6E56"></span>양호</span>'
    + '<span><span style="display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;background:#FAECE7;border:1px solid #993C1D"></span>결함 의심/확정</span>'
    + '<span><span style="display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;background:#E6F1FB;border:1px solid #1B5A8A"></span>보류(정밀검토)</span>'
    + '<span style="color:#888">※ 앞선 질문의 보류는 기록 후 계속 진행됨(별도 종결 아님)</span></div>';
}

export function igwBuildInterviewHTML(code){
  const script = igGetScript(code);
  const meta = igItemMeta(code);
  const stats = igComputeStats(code);
  const rec = igBranchClass(stats);
  const nodes = igwGetNodes(code, script);
  const nodesJson = JSON.stringify(nodes);
  const itemJson = JSON.stringify(script);
  const recJson = JSON.stringify(rec);
  const title = igwEsc((meta && meta.title) || code);
  // v8.13 — "✏ 순서도 편집" 패널이 카드 안에 텍스트 칸만 잔뜩 나열되어 뭘 고치는지 안 보인다는
  // 지적에 따라, 카드 내부 인라인 편집기는 걷어내고 이 새 창(①②③ 보기 창) 자체에 편집 기능을
  // 통합했다. ②순서도를 고치면 바로 옆에 실시간 미리보기(SVG 순서도)가 다시 그려져서
  // "지금 텍스트를 고치면 도식이 이렇게 바뀐다"가 바로 보이고, ①③도 같은 창에서 고칠 수 있다.
  const defaultItem = INTERVIEW_SCRIPTS[code] || (() => { const it = igFindItem(code); return it ? igGenericScript(it) : null; })();
  const initialSpec = igfDefaultSpecFor(code, script);
  const defaultSpec = AI_FLOW_DEFAULTS[code] ? JSON.parse(JSON.stringify(AI_FLOW_DEFAULTS[code])) : igfGenericSpecFor(script);
  const defaultItemJson = JSON.stringify(defaultItem);
  const initialSpecJson = JSON.stringify(initialSpec);
  const defaultSpecJson = JSON.stringify(defaultSpec);
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>' + igwEsc(code) + ' 인터뷰</title><style>'
+ 'body{font-family:-apple-system,"Malgun Gothic",sans-serif;max-width:800px;margin:16px auto;padding:0 20px 50px;color:#1b2330}'
+ '.zoom-ctrl{position:fixed;top:12px;right:16px;z-index:100;display:flex;align-items:center;gap:2px;background:#132845;border-radius:8px;padding:4px;box-shadow:0 3px 10px rgba(19,40,69,.3)}'
+ '.zoom-ctrl button{font-family:monospace;font-size:14px;font-weight:700;background:transparent;border:none;color:#f4efe2;cursor:pointer;width:26px;height:26px;border-radius:5px}'
+ '.zoom-ctrl button:hover{background:rgba(255,255,255,.18)}'
+ '.zoom-ctrl .pct{font-family:monospace;font-size:10.5px;color:#c9d2e2;min-width:36px;text-align:center}'
+ 'h1{font-size:19px;margin:0 0 2px}.sub{font-size:12.5px;color:#5a6472;margin:0 0 16px}'
+ '.tabs{display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid #dcd6c8}'
+ '.tab{padding:9px 18px;font-size:13.5px;cursor:pointer;border:none;background:none;color:#5a6472;border-bottom:3px solid transparent}'
+ '.tab.active{color:#132845;font-weight:700;border-bottom-color:#132845}'
+ '.panel{display:none}.panel.active{display:block}'
+ '.ig-decision{font-size:13.5px;color:#333;margin-bottom:16px;padding:10px 14px;background:#f6f3ec;border-left:3px solid #132845}'
+ '.rec-banner{font-size:12.5px;font-weight:700;padding:8px 12px;border-radius:6px;margin-bottom:12px}'
+ '.ig-fork{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}'
+ '.ig-fork.collapsed .ig-branch:not(.rec){display:none}'
+ '.ig-branch{position:relative;padding-top:14px}'
+ '.ig-branch-head{display:flex;align-items:center;gap:5px;justify-content:center;font-weight:800;font-size:12.5px;padding:7px 6px;margin-bottom:10px;font-family:monospace;text-align:center;border-radius:4px}'
+ '.ig-branch.yes .ig-branch-head{background:#e5f2ea;color:#2e7d5b;border:1px solid #2e7d5b}'
+ '.ig-branch.partial .ig-branch-head{background:#f7edd9;color:#b8863b;border:1px solid #b8863b}'
+ '.ig-branch.no .ig-branch-head{background:#f7e6e2;color:#a23b2e;border:1px solid #a23b2e}'
+ '.ig-branch.na .ig-branch-head{background:#eceae4;color:#5a6472;border:1px solid #c7c1b1}'
+ '.ig-step{background:#fff;border:1px solid #dcd6c8;border-radius:6px;padding:8px 10px;font-size:11.8px;margin-bottom:3px;line-height:1.5}'
+ '.ig-step:not(:first-child){margin-top:14px}'
+ '.ig-step:not(:first-child)::before{content:"↓";display:block;text-align:center;color:#c7c1b1;font-size:11px;margin:-11px auto 3px;background:#fff;width:16px}'
+ '.ig-end{margin-top:10px;border-radius:6px;padding:9px 10px;font-size:11.5px;line-height:1.55}'
+ '.ig-branch.yes .ig-end{background:#e5f2ea;color:#2e7d5b;border:1px solid #2e7d5b}'
+ '.ig-branch.partial .ig-end{background:#f7edd9;color:#b8863b;border:1px solid #b8863b}'
+ '.ig-branch.no .ig-end{background:#f7e6e2;color:#a23b2e;border:1px solid #a23b2e}'
+ '.ig-branch.na .ig-end{background:#eceae4;color:#5a6472;border:1px solid #c7c1b1}'
+ '.expand-btn{font-size:11.5px;color:#132845;background:none;border:1px solid #dcd6c8;border-radius:6px;padding:5px 10px;cursor:pointer;margin-top:10px}'
+ '.turn{background:#f6f6f4;border-radius:10px;padding:12px 16px;margin-bottom:10px}.turn .q{font-weight:600;font-size:14px;margin-bottom:4px}.turn .a{font-size:13px;color:#333}'
+ '.current{background:#fff;border:1px solid #ddd;border-radius:10px;padding:16px}.current .q{font-size:15px;font-weight:600;margin-bottom:6px}'
+ '.guide{font-size:12px;color:#888;margin-bottom:14px;font-style:italic}'
+ '.opt{display:block;width:100%;text-align:left;background:#fafaf8;border:1px solid #ddd;border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:14px;cursor:pointer}'
+ '.opt:hover{background:#eee}.opt.hold{color:#7a6a2f;border-color:#e2d7a8;background:#fdf8ec}'
+ '.concl{border-radius:10px;padding:16px;margin-top:6px}.concl.good{background:#e1f5ee;color:#04342c}.concl.bad{background:#faece7;color:#4a1b0c}.concl.hold{background:#e6f1fb;color:#042c53}'
+ '.concl .tag{font-weight:600;font-size:14px;margin-bottom:6px}'
+ 'button.reset{margin-top:16px;background:none;border:1px solid #ccc;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;color:#555}'
+ '@media(max-width:680px){.ig-fork{grid-template-columns:1fr}}'
+ '.pd-tab-toolbar{text-align:right;margin-bottom:8px;}'
+ '.pd-edit-toggle{font-size:11.5px;background:#132845;color:#f4efe2;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;}'
+ '.pd-edit-toggle:hover{opacity:.85}'
+ '.pd-edit-wrap{display:none;background:#fffdf5;border:2px dashed #c7a445;border-radius:8px;padding:14px 16px;margin-top:4px;}'
+ '.pd-edit-wrap.active{display:block}'
+ '.pd-edit-wrap label{display:block;font-size:11.5px;font-weight:700;color:#132845;margin:10px 0 4px}'
+ '.pd-edit-wrap label:first-of-type{margin-top:0}'
+ '.pd-edit-wrap input[type=text],.pd-edit-wrap textarea{width:100%;box-sizing:border-box;border:1px solid #c7c1b1;background:#fffdf8;font-family:inherit;font-size:11.5px;padding:6px 8px;}'
+ '.pd-edit-wrap textarea{resize:vertical}'
+ '.pd-2col{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
+ '.pd-step-card{background:#fff;border:1px solid #dcd6c8;border-radius:6px;padding:10px 12px;margin-bottom:10px}'
+ '.pd-step-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;font-family:monospace;font-weight:700;font-size:11px;color:#132845}'
+ '.pd-fail-row{background:#faece7;border:1px solid #e3bdb3;border-radius:5px;padding:8px 10px;margin-bottom:6px;margin-top:8px;}'
+ '.pd-add-btn{font-size:10.5px;padding:5px 10px;border:1px dashed #132845;background:none;color:#132845;border-radius:5px;cursor:pointer;margin-top:4px;}'
+ '.pd-del-btn{background:none;border:1px solid #a23b2e;color:#a23b2e;border-radius:4px;font-size:10px;padding:2px 7px;cursor:pointer}'
+ '.pd-live-flow{border:1px solid #dcd6c8;border-radius:8px;padding:10px;margin-top:12px;background:#fafaf8;overflow-x:auto;}'
+ '.pd-actions{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}'
+ '.pd-save-btn{background:#132845;color:#f4efe2;border:none;border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer}'
+ '.pd-reset-btn,.pd-cancel-btn{background:none;border:1px solid #ccc;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;color:#555}'
+ '.pd-flash{color:#0F6E56;font-weight:700;font-size:11.5px;display:none}'
+ '.pd-hint{font-size:11px;color:#7a5a1e;background:#f7edd9;border:1px solid #e0c98f;border-radius:5px;padding:8px 10px;margin-bottom:10px;line-height:1.6}'
+ '</style></head><body>'
+ '<div class="zoom-ctrl"><button onclick="zoomStep(-1)">−</button><span class="pct" id="zoomPct">100%</span><button onclick="zoomStep(1)">+</button><button onclick="zoomSet(100)" title="100%로">↺</button></div>'
+ '<h1>' + igwEsc(code) + ' 인터뷰 가이드</h1><div class="sub">' + title + ' — ①기존형 ②순서도 ③분기형</div>'
+ '<div class="tabs"><button class="tab active" data-tab="orig" onclick="switchTab(\'orig\')">① 기존형</button><button class="tab" data-tab="flow" onclick="switchTab(\'flow\')">② 순서도</button><button class="tab" data-tab="branch" onclick="switchTab(\'branch\')">③ 분기형</button></div>'
+ '<div id="panel-orig" class="panel active">'
  + '<div class="pd-tab-toolbar"><button type="button" class="pd-edit-toggle" onclick="toggleOrigEdit()">✏ 이 화면 편집</button></div>'
  + '<div id="origContent"></div>'
  + '<div class="pd-edit-wrap" id="origEditWrap"></div>'
+ '</div>'
+ '<div id="panel-flow" class="panel">'
  + '<div class="pd-tab-toolbar"><button type="button" class="pd-edit-toggle" onclick="toggleFlowEdit()">✏ 이 화면 편집 (③분기형에도 함께 반영됨)</button></div>'
  + '<div id="flowContent"></div>'
  + '<div class="pd-edit-wrap" id="flowEditWrap"></div>'
+ '</div>'
+ '<div id="panel-branch" class="panel">'
  + '<div class="pd-hint">✏ 여기 나오는 질문은 <b>② 순서도</b> 탭에서 편집합니다. <button type="button" class="pd-edit-toggle" style="margin-left:6px;" onclick="switchTab(\'flow\');toggleFlowEdit(true)">② 순서도 편집하러 가기</button></div>'
  + '<div id="transcript"></div><div id="stage"></div><button class="reset" onclick="resetBranch()">처음부터 다시</button>'
+ '</div>'
+ '<script>'
+ 'const ZOOM_STEPS=[80,90,100,110,125,140,160];let zoomLevel=100;function zoomApply(pct){document.body.style.zoom=pct+"%";document.getElementById("zoomPct").textContent=pct+"%";zoomLevel=pct;}function zoomStep(dir){let idx=ZOOM_STEPS.reduce((c,v,i)=>Math.abs(v-zoomLevel)<Math.abs(ZOOM_STEPS[c]-zoomLevel)?i:c,0);idx=Math.min(ZOOM_STEPS.length-1,Math.max(0,idx+dir));zoomApply(ZOOM_STEPS[idx]);}function zoomSet(pct){zoomApply(pct);}'
+ 'const item = ' + itemJson + ';'
+ 'const defaultItem = ' + defaultItemJson + ';'
+ 'let nodes = ' + nodesJson + ';'
+ 'let curSpec = ' + initialSpecJson + ';'
+ 'const defaultSpec = ' + defaultSpecJson + ';'
+ 'const rec = ' + recJson + ';'
+ 'const SCRIPT_KEY = ' + JSON.stringify(INTERVIEW_SCRIPT_OVERRIDE_KEY) + ';'
+ 'const FLOW_KEY = ' + JSON.stringify(INTERVIEW_FLOW_OVERRIDE_KEY) + ';'
+ 'const CODE = ' + JSON.stringify(code) + ';'
+ 'let origDirty=false, flowDirty=false;'
+ 'function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}'
+ 'function autoGrow(el){if(!el)return;el.style.height="auto";el.style.height=(el.scrollHeight+3)+"px";}'
+ 'function autoGrowAll(root){(root||document).querySelectorAll("textarea").forEach(autoGrow);}'
+ 'function switchTab(name){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id==="panel-"+name));if(name==="flow"&&!document.getElementById("flowContent").dataset.built){document.getElementById("flowContent").innerHTML=buildFlowchartHTML(nodes);document.getElementById("flowContent").dataset.built="1";}}'
+ 'function renderOrig(){const branchHtml=(cls,icon,label,qs,end)=>"<div class=\\"ig-branch "+cls+(rec===cls?" rec":"")+"\\"><div class=\\"ig-branch-head\\">"+icon+" "+label+"</div>"+(qs||[]).map(q=>"<div class=\\"ig-step\\">"+q+"</div>").join("")+"<div class=\\"ig-end\\">"+(end||"")+"</div></div>";const map={yes:["#e5f2ea","#2e7d5b","이행"],partial:["#f7edd9","#b8863b","부분이행"],no:["#f7e6e2","#a23b2e","미흡"],na:["#eceae4","#5a6472","해당없음"]};let bannerHtml="";if(rec!=="unknown"){const c=map[rec];bannerHtml="<div class=\\"rec-banner\\" style=\\"background:"+c[0]+";color:"+c[1]+"\\">📋 실제 응답 집계상 추천 분기: "+c[2]+"</div>";}document.getElementById("origContent").innerHTML=bannerHtml+"<div class=\\"ig-decision\\">📋 <b>도입 질문:</b> "+(item.decisionQ||"")+"</div>"+"<div class=\\"ig-fork"+(rec!=="unknown"?" collapsed":"")+"\\" id=\\"igFork\\">"+branchHtml("yes","✅","이행",item.verify,item.verifyEnd)+branchHtml("partial","🟡","부분이행",item.partial,item.partialEnd)+branchHtml("no","🚩","미흡",item.rootcause,item.rootcauseEnd)+branchHtml("na","⬜","해당없음",item.na,item.naEnd)+"</div>"+(rec!=="unknown"?"<button class=\\"expand-btn\\" onclick=\\"toggleFork()\\">다른 분기도 보기 / 접기</button>":"");}'
+ 'let forkExpanded=false;function toggleFork(){const fork=document.getElementById("igFork");forkExpanded=!forkExpanded;fork.classList.toggle("collapsed",!forkExpanded);}'
+ 'function buildFlowchartHTML(nodes){' + IGW_FLOWCHART_JS_BODY + '}'
+ 'function buildNodesFromFlowSpec(spec){const nodes={};const steps=(spec&&spec.steps)||[];const n=steps.length;const needsHoldEnd=steps.some(s=>s&&s.holdLabel);if(needsHoldEnd){const he=spec.holdEnd||{};nodes.hold_end={end:"hold",title:he.title||"자료 확보 — 정밀검토 예정",flowLabel:[he.title||"잠재 결함","정밀검토 예정"],text:he.text||""};}steps.forEach((step,i)=>{const key="q"+(i+1);const isLast=(i+1===n);const nextKey=isLast?"good":"q"+(i+2);const options=[];options.push({label:step.downLabel||"예 (확인됨)",next:nextKey,flow:"down"});(step.fails||[]).forEach((f,fi)=>{const failKey=key+"_f"+fi;nodes[failKey]={end:"bad",title:f.title||"결함 의심",flowLabel:[f.title||"결함 의심",f.sub||""],text:f.text||""};options.push({label:f.label||"아니오",next:failKey,flow:"side"});});if(step.holdLabel){options.push({label:step.holdLabel,next:isLast?"hold_end":nextKey,flow:isLast?"holdend":"holdnote",hold:true});}nodes[key]={q:step.q||"",flowLabel:[step.label1||("질문 "+(i+1)),step.label2||""],guide:step.guide||"",options:options};});nodes.good={end:"good",title:"양호",flowLabel:["양호","전 항목 통과"],text:(spec&&spec.goodText)||""};return nodes;}'
+ 'function notifyOpener(fn){try{if(window.opener&&!window.opener.closed&&typeof fn==="function")fn(window.opener);}catch(e){}}'
+ 'function toggleOrigEdit(){const wrap=document.getElementById("origEditWrap");if(wrap.classList.contains("active")){if(origDirty&&!confirm("저장하지 않은 수정 내용이 있습니다. 저장하지 않고 닫을까요?"))return;wrap.classList.remove("active");wrap.innerHTML="";origDirty=false;return;}wrap.innerHTML=buildOrigEditHtml();wrap.classList.add("active");wireOrigEdit();autoGrowAll(wrap);}'
+ 'function buildOrigEditHtml(){const joinQ=a=>(a||[]).join("\\n");return "<label>확인 질문</label><textarea id=\\"oe-decisionQ\\" rows=\\"2\\">"+esc(item.decisionQ||"")+"</textarea>"+"<div class=\\"pd-2col\\">"+"<div><label>✅ YES·검증형 (줄마다 하나씩)</label><textarea id=\\"oe-verify\\" rows=\\"3\\">"+esc(joinQ(item.verify))+"</textarea><label>YES 종결판단</label><textarea id=\\"oe-verifyEnd\\" rows=\\"2\\">"+esc(item.verifyEnd||"")+"</textarea></div>"+"<div><label>🟡 부분이행</label><textarea id=\\"oe-partial\\" rows=\\"3\\">"+esc(joinQ(item.partial))+"</textarea><label>부분이행 종결판단</label><textarea id=\\"oe-partialEnd\\" rows=\\"2\\">"+esc(item.partialEnd||"")+"</textarea></div>"+"<div><label>🚩 NO·원인규명형</label><textarea id=\\"oe-rootcause\\" rows=\\"3\\">"+esc(joinQ(item.rootcause))+"</textarea><label>NO 종결판단</label><textarea id=\\"oe-rootcauseEnd\\" rows=\\"2\\">"+esc(item.rootcauseEnd||"")+"</textarea></div>"+"<div><label>⬜ N/A·타당성확인형</label><textarea id=\\"oe-na\\" rows=\\"3\\">"+esc(joinQ(item.na))+"</textarea><label>N/A 종결판단</label><textarea id=\\"oe-naEnd\\" rows=\\"2\\">"+esc(item.naEnd||"")+"</textarea></div>"+"</div>"+"<div class=\\"pd-actions\\"><button type=\\"button\\" class=\\"pd-save-btn\\" onclick=\\"saveOrigEdit()\\">💾 저장</button><span class=\\"pd-flash\\" id=\\"oe-flash\\">✓ 저장되었습니다</span><button type=\\"button\\" class=\\"pd-reset-btn\\" onclick=\\"resetOrigEdit()\\">↺ 기본값으로</button><button type=\\"button\\" class=\\"pd-cancel-btn\\" onclick=\\"toggleOrigEdit()\\">✕ 닫기</button></div>";}'
+ 'function wireOrigEdit(){document.querySelectorAll("#origEditWrap textarea").forEach(t=>t.addEventListener("input",()=>{origDirty=true;autoGrow(t);}));}'
+ 'function saveOrigEdit(){const v=id=>document.getElementById(id).value;const splitLines=s=>s.split("\\n").map(x=>x.trim()).filter(Boolean);const data={decisionQ:v("oe-decisionQ").trim(),verify:splitLines(v("oe-verify")),verifyEnd:v("oe-verifyEnd").trim(),partial:splitLines(v("oe-partial")),partialEnd:v("oe-partialEnd").trim(),rootcause:splitLines(v("oe-rootcause")),rootcauseEnd:v("oe-rootcauseEnd").trim(),na:splitLines(v("oe-na")),naEnd:v("oe-naEnd").trim()};let all={};try{all=JSON.parse(localStorage.getItem(SCRIPT_KEY)||"{}");}catch(e){}all[CODE]=data;localStorage.setItem(SCRIPT_KEY,JSON.stringify(all));Object.assign(item,data);origDirty=false;const f=document.getElementById("oe-flash");if(f){f.style.display="inline";setTimeout(()=>{f.style.display="none";},2000);}renderOrig();notifyOpener(op=>{op.scriptOverrides[CODE]=data;op.saveScriptOverrides&&op.saveScriptOverrides();op.renderInterviewGuide&&op.renderInterviewGuide();});}'
+ 'function resetOrigEdit(){if(!confirm("기본값으로 되돌릴까요? 저장된 편집 내용이 삭제됩니다."))return;let all={};try{all=JSON.parse(localStorage.getItem(SCRIPT_KEY)||"{}");}catch(e){}delete all[CODE];localStorage.setItem(SCRIPT_KEY,JSON.stringify(all));Object.assign(item,defaultItem);origDirty=false;renderOrig();document.getElementById("origEditWrap").innerHTML=buildOrigEditHtml();wireOrigEdit();autoGrowAll(document.getElementById("origEditWrap"));notifyOpener(op=>{delete op.scriptOverrides[CODE];op.saveScriptOverrides&&op.saveScriptOverrides();op.renderInterviewGuide&&op.renderInterviewGuide();});}'
+ 'function refreshLivePreview(){const el=document.getElementById("flowLivePreview");if(!el)return;try{el.innerHTML="<div style=\\"font-size:10.5px;color:#888;margin-bottom:4px;\\">🔴 실시간 미리보기</div>"+buildFlowchartHTML(buildNodesFromFlowSpec(curSpec));}catch(e){el.innerHTML="<div style=\\"font-size:11px;color:#a23b2e;\\">미리보기를 만들 수 없습니다 — 입력값을 확인해 주세요.</div>";}}'
+ 'function markFlowDirty(){flowDirty=true;refreshLivePreview();}'
+ 'function updStep(i,field,val){curSpec.steps[i][field]=val;markFlowDirty();}'
+ 'function updFail(i,fi,field,val){curSpec.steps[i].fails[fi][field]=val;markFlowDirty();}'
+ 'function toggleHold(i,checked){curSpec.steps[i].holdLabel=checked?(curSpec.steps[i].holdLabel||"자료는 확보함 — 감사역이 정밀 검토"):null;flowDirty=true;rebuildFlowEditPanel();}'
+ 'function addFail(i){curSpec.steps[i].fails=curSpec.steps[i].fails||[];curSpec.steps[i].fails.push({label:"",title:"결함 의심",sub:"",text:""});flowDirty=true;rebuildFlowEditPanel();}'
+ 'function delFail(i,fi){curSpec.steps[i].fails.splice(fi,1);flowDirty=true;rebuildFlowEditPanel();}'
+ 'function delStep(i){if(curSpec.steps.length<=1){alert("최소 1개의 질문은 있어야 합니다.");return;}if(!confirm("이 질문을 삭제할까요?"))return;curSpec.steps.splice(i,1);flowDirty=true;rebuildFlowEditPanel();}'
+ 'function addStep(){curSpec.steps.push({q:"",label1:"질문 "+(curSpec.steps.length+1),label2:"",guide:"",downLabel:"예 (확인됨)",fails:[{label:"아니오",title:"결함 의심",sub:"",text:""}],holdLabel:null});flowDirty=true;rebuildFlowEditPanel();}'
+ 'function buildFailRowHtml(i,f,fi){return "<div class=\\"pd-fail-row\\"><div style=\\"display:flex;justify-content:space-between;\\"><span style=\\"font-size:9.5px;font-weight:700;color:#a23b2e;\\">결함 시나리오 "+(fi+1)+"</span><button type=\\"button\\" class=\\"pd-del-btn\\" onclick=\\"delFail("+i+","+fi+")\\">✕</button></div>"+"<input type=\\"text\\" placeholder=\\"버튼 문구 (예: 아니오 — 제시 못함)\\" value=\\""+esc(f.label||"")+"\\" oninput=\\"updFail("+i+","+fi+",\'label\',this.value)\\" style=\\"margin-bottom:6px;\\">"+"<div class=\\"pd-2col\\"><input type=\\"text\\" placeholder=\\"박스 제목\\" value=\\""+esc(f.title||"")+"\\" oninput=\\"updFail("+i+","+fi+",\'title\',this.value)\\"><input type=\\"text\\" placeholder=\\"구체 사유\\" value=\\""+esc(f.sub||"")+"\\" oninput=\\"updFail("+i+","+fi+",\'sub\',this.value)\\"></div>"+"<textarea rows=\\"2\\" placeholder=\\"결함 박스 설명\\" oninput=\\"updFail("+i+","+fi+",\'text\',this.value);autoGrow(this)\\">"+esc(f.text||"")+"</textarea>"+"</div>";}'
+ 'function buildStepCardHtml(step,i,total){const n=i+1;return "<div class=\\"pd-step-card\\">"+"<div class=\\"pd-step-head\\"><span>질문 "+n+(n===total?" (마지막)":"")+"</span>"+(total>1?"<button type=\\"button\\" class=\\"pd-del-btn\\" onclick=\\"delStep("+i+")\\">✕ 삭제</button>":"")+"</div>"+"<label style=\\"margin-top:0;\\">질문 문장 (③분기형에서 실제로 보여줄 질문)</label><textarea rows=\\"2\\" oninput=\\"updStep("+i+",\'q\',this.value);autoGrow(this)\\">"+esc(step.q||"")+"</textarea>"+"<div class=\\"pd-2col\\"><div><label>순서도 라벨 1줄(짧게)</label><input type=\\"text\\" value=\\""+esc(step.label1||"")+"\\" oninput=\\"updStep("+i+",\'label1\',this.value)\\"></div><div><label>순서도 라벨 2줄(짧게)</label><input type=\\"text\\" value=\\""+esc(step.label2||"")+"\\" oninput=\\"updStep("+i+",\'label2\',this.value)\\"></div></div>"+"<label>진행 안내 (③분기형 화면 회색 글씨)</label><textarea rows=\\"2\\" oninput=\\"updStep("+i+",\'guide\',this.value);autoGrow(this)\\">"+esc(step.guide||"")+"</textarea>"+"<label>✅ \\"정상 진행\\" 버튼 문구</label><input type=\\"text\\" value=\\""+esc(step.downLabel||"")+"\\" oninput=\\"updStep("+i+",\'downLabel\',this.value)\\">"+"<div style=\\"margin-top:10px;font-size:11px;font-weight:700;color:#a23b2e;\\">🚩 결함 시나리오 (정상이 아닐 때 — 여러 개 가능)</div>"+(step.fails||[]).map((f,fi)=>buildFailRowHtml(i,f,fi)).join("")+"<button type=\\"button\\" class=\\"pd-add-btn\\" onclick=\\"addFail("+i+")\\">+ 결함 시나리오 추가</button>"+"<div style=\\"margin-top:10px;\\"><label style=\\"display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:400;color:#555;margin:0;\\"><input type=\\"checkbox\\" style=\\"width:14px;height:14px;\\" "+(step.holdLabel?"checked":"")+" onchange=\\"toggleHold("+i+",this.checked)\\"> \\"보류(자료는 확보, 나중에 정밀검토)\\" 옵션 추가</label></div>"+(step.holdLabel!=null?("<div style=\\"margin-top:6px;\\"><label style=\\"margin-top:0;\\">보류 버튼 문구</label><input type=\\"text\\" value=\\""+esc(step.holdLabel||"")+"\\" oninput=\\"updStep("+i+",\'holdLabel\',this.value)\\"></div>"):"")+"</div>";}'
+ 'function buildFlowEditHtml(){const anyHold=(curSpec.steps||[]).some(s=>s&&s.holdLabel);let html="<div class=\\"pd-hint\\">여기서 고친 내용은 이 화면(②순서도)과 ③분기형 모두에 함께 반영됩니다. 질문은 몇 개든 추가할 수 있고, 질문마다 결함 시나리오를 여러 개 둘 수 있습니다.</div>";html+=curSpec.steps.map((s,i)=>buildStepCardHtml(s,i,curSpec.steps.length)).join("");html+="<button type=\\"button\\" class=\\"pd-add-btn\\" onclick=\\"addStep()\\">+ 질문 추가</button>";html+="<div class=\\"pd-edit-wrap active\\" style=\\"display:"+(anyHold?"block":"none")+";margin-top:12px;background:#e6f1fb;border-color:#b9d3ea;\\"><label style=\\"margin-top:0;\\">🔷 보류 결함 박스 제목 (마지막 질문에서 \\"보류\\" 선택 시)</label><input type=\\"text\\" id=\\"fe-holdend-title\\" value=\\""+esc((curSpec.holdEnd&&curSpec.holdEnd.title)||"")+"\\"><label>보류 결함 박스 설명</label><textarea id=\\"fe-holdend-text\\" rows=\\"2\\">"+esc((curSpec.holdEnd&&curSpec.holdEnd.text)||"")+"</textarea></div>";html+="<label>✅ 양호(모든 질문 통과) 판정 문구</label><textarea id=\\"fe-goodtext\\" rows=\\"2\\">"+esc(curSpec.goodText||"")+"</textarea>";html+="<div id=\\"flowLivePreview\\" class=\\"pd-live-flow\\"></div>";html+="<div class=\\"pd-actions\\"><button type=\\"button\\" class=\\"pd-save-btn\\" onclick=\\"saveFlowEdit()\\">💾 저장</button><span class=\\"pd-flash\\" id=\\"fe-flash\\">✓ 저장되었습니다</span><button type=\\"button\\" class=\\"pd-reset-btn\\" onclick=\\"resetFlowEdit()\\">↺ 기본값으로</button><button type=\\"button\\" class=\\"pd-cancel-btn\\" onclick=\\"toggleFlowEdit()\\">✕ 닫기</button></div>";return html;}'
+ 'function wireFlowEditInputs(){const gt=document.getElementById("fe-goodtext");if(gt)gt.addEventListener("input",()=>{curSpec.goodText=gt.value;markFlowDirty();autoGrow(gt);});const ht=document.getElementById("fe-holdend-title");if(ht)ht.addEventListener("input",()=>{curSpec.holdEnd=curSpec.holdEnd||{};curSpec.holdEnd.title=ht.value;markFlowDirty();});const hx=document.getElementById("fe-holdend-text");if(hx)hx.addEventListener("input",()=>{curSpec.holdEnd=curSpec.holdEnd||{};curSpec.holdEnd.text=hx.value;markFlowDirty();autoGrow(hx);});}'
+ 'function rebuildFlowEditPanel(){const w=document.getElementById("flowEditWrap");w.innerHTML=buildFlowEditHtml();refreshLivePreview();wireFlowEditInputs();autoGrowAll(w);}'
+ 'function toggleFlowEdit(forceOpen){const wrap=document.getElementById("flowEditWrap");const open=wrap.classList.contains("active");if(open){if(forceOpen)return;if(flowDirty&&!confirm("저장하지 않은 수정 내용이 있습니다. 저장하지 않고 닫을까요?"))return;wrap.classList.remove("active");wrap.innerHTML="";flowDirty=false;return;}wrap.innerHTML=buildFlowEditHtml();wrap.classList.add("active");refreshLivePreview();wireFlowEditInputs();autoGrowAll(wrap);}'
+ 'function saveFlowEdit(){let all={};try{all=JSON.parse(localStorage.getItem(FLOW_KEY)||"{}");}catch(e){}all[CODE]=JSON.parse(JSON.stringify(curSpec));localStorage.setItem(FLOW_KEY,JSON.stringify(all));nodes=buildNodesFromFlowSpec(curSpec);flowDirty=false;const f=document.getElementById("fe-flash");if(f){f.style.display="inline";setTimeout(()=>{f.style.display="none";},2000);}document.getElementById("flowContent").innerHTML=buildFlowchartHTML(nodes);document.getElementById("flowContent").dataset.built="1";resetBranch();notifyOpener(op=>{op.flowOverrides[CODE]=all[CODE];op.saveFlowOverrides&&op.saveFlowOverrides();op.renderInterviewGuide&&op.renderInterviewGuide();});}'
+ 'function resetFlowEdit(){if(!confirm("기본값으로 되돌릴까요? 저장된 편집 내용이 삭제됩니다."))return;let all={};try{all=JSON.parse(localStorage.getItem(FLOW_KEY)||"{}");}catch(e){}delete all[CODE];localStorage.setItem(FLOW_KEY,JSON.stringify(all));curSpec=JSON.parse(JSON.stringify(defaultSpec));flowDirty=false;nodes=buildNodesFromFlowSpec(curSpec);document.getElementById("flowContent").innerHTML=buildFlowchartHTML(nodes);document.getElementById("flowContent").dataset.built="1";rebuildFlowEditPanel();resetBranch();notifyOpener(op=>{delete op.flowOverrides[CODE];op.saveFlowOverrides&&op.saveFlowOverrides();op.renderInterviewGuide&&op.renderInterviewGuide();});}'
+ 'let cur="q1";let transcript=[];let holds=[];function renderTranscript(){document.getElementById("transcript").innerHTML=transcript.map(t=>"<div class=\\"turn\\"><div class=\\"q\\">"+t.q+"</div><div class=\\"a\\">"+t.a+"</div></div>").join("");}function choose(i){const node=nodes[cur];const opt=node.options[i];transcript.push({q:node.q,a:opt.label});renderTranscript();if(opt.hold)holds.push(node.q);cur=opt.next;renderBranch();}function renderBranch(){const node=nodes[cur];const s=document.getElementById("stage");if(node.end){const cls=node.end==="good"?"good":node.end==="hold"?"hold":"bad";let html="<div class=\\"concl "+cls+"\\"><div class=\\"tag\\">"+node.title+"</div><div>"+node.text+"</div>";if(holds.length)html+="<div style=\\"margin-top:12px;font-size:13px\\"><strong>정밀검토 예정 항목 ("+holds.length+"건)</strong><ul>"+holds.map(h=>"<li>"+h+"</li>").join("")+"</ul></div>";html+="</div>";s.innerHTML=html;return;}s.innerHTML="<div class=\\"current\\"><div class=\\"q\\">"+node.q+"</div><div class=\\"guide\\">"+node.guide+"</div>"+node.options.map((o,i)=>"<button class=\\"opt"+(o.hold?" hold":"")+"\\" onclick=\\"choose("+i+")\\">"+o.label+"</button>").join("")+"</div>";}function resetBranch(){cur="q1";transcript=[];holds=[];renderTranscript();renderBranch();}'
+ 'renderOrig();renderBranch();'
+ '<\/script></body></html>';
}

export function igOpenBranchWindow(code){
  const win = window.open('', '_blank', 'width=860,height=820,scrollbars=yes'); // [v8.12] 화면이 너무 크다는 지적에 따라 축소(1080x920→860x820)
  if(!win){ alert('팝업이 차단되었습니다. 브라우저의 팝업 허용 설정 후 다시 시도해 주세요.'); return; }
  win.document.write(igwBuildInterviewHTML(code));
  win.document.close();
}

export function igToggleCardExpand(btnOrCode, maybeCode){
  const btn = (btnOrCode instanceof HTMLElement) ? btnOrCode : null;
  const code = btn ? maybeCode : btnOrCode;
  const card = btn ? btn.closest('.ig-card') : document.querySelector('.ig-card[data-ig-code="' + CSS.escape(code) + '"]');
  if(!card) return;
  const body = card.querySelector('.ig-collapsible-body');
  const expandBtn = card.querySelector('.ig-expand-toggle-btn');
  if(!body) return;
  const nowShow = body.style.display === 'none';
  body.style.display = nowShow ? 'block' : 'none';
  if(nowShow) igExpandedCodes.add(code); else igExpandedCodes.delete(code);
  if(expandBtn) expandBtn.innerHTML = nowShow ? '▲ 접기' : '▼ 인터뷰 진행 (질문·기록)';
  card.classList.toggle('ig-card-expanded', nowShow);
}

export function igToggleForkExpand(btnOrCode, maybeCode){
  const btn = (btnOrCode instanceof HTMLElement) ? btnOrCode : null;
  const code = btn ? maybeCode : btnOrCode;
  const card = btn ? btn.closest('.ig-card') : document.querySelector('.ig-card[data-ig-code="' + CSS.escape(code) + '"]');
  if(!card) return;
  const fork = card.querySelector('.ig-fork');
  const forkBtn = card.querySelector('.ig-fork-toggle-btn');
  if(!fork) return;
  const nowExpanded = fork.classList.toggle('ig-fork-collapsed') === false; // 클래스가 빠졌으면(=collapsed 해제) 지금 펼쳐진 상태
  if(nowExpanded) igForkExpandedCodes.add(code); else igForkExpandedCodes.delete(code);
  if(forkBtn) forkBtn.textContent = nowExpanded ? '▲ 추천 분기만 보기' : '▸ 다른 분기도 보기 (전체 4가지 시나리오)';
}

export function igRenderCard(code, lockedDept){
  const script = igGetScript(code);
  if(!script) return '';
  const meta = igItemMeta(code);
  const allStats = igComputeStats(code);
  // [v8.36] 담당팀이 2개 이상이면(공통 항목), 인터뷰는 한 팀씩 진행하는 게 맞으므로 화면도
  // 기본적으로 한 팀 기준으로만 보여준다 — 팀을 뭉뚱그려 집계하면 어느 팀이 미흡이고 어느 팀이
  // 이행인지 구분이 안 되고, 추천 분기(질문 스크립트)도 어느 팀 것인지 알 수 없었다.
  const respondentDeptsForView = Array.from(allStats.depts).sort();
  const isMultiDept = respondentDeptsForView.length > 1;
  let activeDept = null;
  if(isMultiDept){
    if(lockedDept && respondentDeptsForView.includes(lockedDept)){
      // [v8.40] "인터뷰 대상자별"·"담당 감사역순" 그룹에서는 이 카드가 애초에 특정 팀(그 그룹)
      // 것으로 이미 확정된 상태로 열린다 — 그런데도 팀을 또 고를 수 있는 드롭다운이 남아 있으면,
      // "이미 B팀 그룹에서 열었는데 왜 또 팀을 고르라는 거지?" 하는 혼란과, 실수로 그 카드에서
      // A팀으로 바꿔버리는 사고 위험이 있었다. 그룹이 이미 팀을 정해준 경우엔 드롭다운 대신
      // 고정 라벨만 보여주고, 값은 그 그룹의 팀으로 고정한다.
      activeDept = lockedDept;
    } else {
      const manual = igCardDeptView[code];
      if(manual && respondentDeptsForView.includes(manual)){
        activeDept = manual;
      } else {
        // [v8.38] 아직 이 카드에서 팀을 손으로 고른 적이 없다면, "현재 작업자"로 등록된 이름이 이미
        // 어느 팀 세션에 진행 감사자로 기록돼 있는지 찾아 그 팀을 자동으로 열어준다 — 감사역마다
        // 매번 드롭다운을 직접 바꾸지 않아도 자기가 맡은 팀이 먼저 보이게 하기 위함.
        const curAuditor = (typeof getCurrentAuditor === 'function') ? getCurrentAuditor() : '';
        const existing = interviewState[code];
        const autoMatch = curAuditor && existing && existing.deptMeta
          && respondentDeptsForView.find(d => existing.deptMeta[d] && existing.deptMeta[d].interviewer === curAuditor);
        activeDept = autoMatch || respondentDeptsForView[0];
      }
    }
  }
  const stats = isMultiDept ? igComputeStats(code, activeDept) : allStats;
  const teamSelectHtml = !isMultiDept ? '' : (lockedDept
    ? ('<div class="ig-team-select-row"><label>🏢 인터뷰 대상 팀:</label>'
        + '<span class="ig-team-locked-label">' + esc(activeDept) + '</span>'
        + '<span class="ig-team-select-hint">이 카드는 현재 그룹(팀·담당자별 보기) 기준으로 ' + esc(activeDept) + ' 세션이 고정되어 있습니다. 다른 팀 데이터는 "영역순" 그룹으로 바꾸거나 "🔍 응답 상세"에서 확인하세요.</span>'
      + '</div>')
    : ('<div class="ig-team-select-row"><label>🏢 인터뷰 대상 팀:</label>'
        + '<select class="ig-team-select" data-code="' + code + '">'
          + respondentDeptsForView.map(d => '<option value="' + esc(d) + '"' + (d === activeDept ? ' selected' : '') + '>' + esc(d) + '</option>').join('')
        + '</select>'
        + '<span class="ig-team-select-hint">선택한 팀의 응답만 반영해 추천 분기·집계뿐 아니라 아래 메모·면담자·진행 감사자 등 인터뷰 기록도 팀별로 따로 저장됩니다. (다른 팀 응답은 팀을 바꿔 확인하거나 "🔍 응답 상세"에서 한번에 볼 수 있습니다)</span>'
      + '</div>'));
  const rec = igBranchClass(stats); // 'yes' | 'partial' | 'no' | 'na' | 'unknown'
  const recClass = (name) => rec === name ? ' recommend' : '';
  const st = interviewState[code] || (interviewState[code] = {done:false, note:'', interviewee:'', interviewer:getCurrentAuditor(), interviewedAt:'', location:'', evidenceStatus:''});
  // [v8.38] 메모·면담자·진행 감사자·일시·장소·증빙확인상태는, 팀이 여럿인 항목이면 activeDept
  // 세션(igMetaTarget)에서, 아니면 기존처럼 st에서 그대로 읽고 쓴다.
  const sess = isMultiDept ? igMetaTarget(code, activeDept) : st;
  // [v8.34] 같은 항목에 두 개 이상 부서가 각자 응답을 제출한 경우, 인터뷰 완료 여부를 부서
  // 단위로 따로 관리한다 — 지금까지는 완료 체크박스가 항목당 하나뿐이라 "어느 부서 인터뷰까지
  // 끝났는지" 구분할 방법이 없었다. deptDone은 {부서명: true/false}이고, done은 응답 부서가
  // 여럿일 때 "모든 부서가 완료"일 때만 true로 파생시켜(igRecomputeMultiDeptDone), 이 값을
  // 그대로 읽는 기존 통계·필터·CSV·병합 로직은 손대지 않고도 정확하게 동작한다.
  const respondentDepts = respondentDeptsForView;
  st.deptDone = st.deptDone || {};
  if(respondentDepts.length > 1) st.done = respondentDepts.every(d => !!st.deptDone[d]);
  const deptDoneCount = respondentDepts.filter(d => st.deptDone[d]).length;
  const ownerPersons = igOwnerPersons(code);
  const ownerHint = ownerPersons.length > 0
    ? '<div class="ig-owner-hint">📇 설문 응답상 관련 담당자: <b>' + esc(ownerPersons.join(', ')) + '</b></div>'
    : '';
  const evidenceByDept = igEvidenceList(code);
  const evidenceHint = evidenceByDept.length > 0
    ? ('<div class="ig-evidence-hint">📎 설문 응답 시 제출 예정으로 체크된 증빙자료:<br>'
        + evidenceByDept.map(g => '&nbsp;&nbsp;· <b>' + esc(g.dept) + '</b> — ' + g.items.map(esc).join(', ')).join('<br>')
      + '</div>')
    : '';
  const suggestedEviNames = Array.from(new Set(evidenceByDept.flatMap(g => g.items)));
  const eviChecklistItems = igEnsureEvidenceItems(code, st, suggestedEviNames);

  const tally = stats.total === 0
    ? '<span class="ig-pill na">집계 데이터 없음</span>'
    : ('<span class="ig-pill good">이행 ' + stats.yes + '</span>'
       + (stats.partial ? '<span class="ig-pill partial">부분이행 ' + stats.partial + '</span>' : '')
       + (stats.no ? '<span class="ig-pill bad">미흡 ' + stats.no + '</span>' : '')
       + (stats.na ? '<span class="ig-pill na">해당없음 ' + stats.na + '</span>' : '')
       + (isMultiDept ? ('<span class="ig-pill dept">🏢 ' + esc(activeDept) + ' 기준</span>') : (stats.depts.size ? '<span class="ig-pill dept">🏢 ' + Array.from(stats.depts).join('·') + '</span>' : '')));

  const branchHtml = (cls, icon, label, questions, endText) =>
    '<div class="ig-branch ' + cls + recClass(cls) + '">'
      + '<div class="ig-branch-head">' + icon + ' ' + label + '<span class="ig-rec-badge">📍 응답 결과상 이 질문으로 진행하세요</span></div>'
      + igStepsHtml(questions)
      + '<div class="ig-end">→ ' + endText + '</div>'
    + '</div>';

  // v6.76 — 화면이 한꺼번에 너무 복잡해 보인다는 지적에 따라, 카드는 기본 "접힘"(제목·집계·핵심 버튼만)
  // 상태로 렌더링하고, 실제로 인터뷰를 진행할 항목만 펼쳐서 질문·기록칸이 나오도록 한다.
  // 새로고침 전까지는 igExpandedCodes에 남아 있어, 화면이 다시 그려져도 펼쳐둔 카드는 유지된다.
  const isExpanded = igExpandedCodes.has(code);
  // 분기(4갈래)도 응답 결과가 가리키는 분기 하나만 기본으로 보여준다 — 아직 응답 데이터가 없어
  // 추천할 분기가 없으면(rec==='unknown') 처음부터 4갈래를 그대로 보여준다.
  const hasRecommendation = rec !== 'unknown';
  const forkExpanded = !hasRecommendation || igForkExpandedCodes.has(code);
  const forkToggleRow = hasRecommendation
    ? ('<div class="ig-fork-toggle-row"><button class="ig-fork-toggle-btn" type="button" onclick="igToggleForkExpand(this, \'' + code + '\')">'
        + (forkExpanded ? '▲ 추천 분기만 보기' : '▸ 다른 분기도 보기 (전체 4가지 시나리오)') + '</button></div>')
    : '';

  return (
    '<div class="ig-card' + (isExpanded ? ' ig-card-expanded' : '') + '" data-ig-code="' + code + '" data-ig-interviewer="' + esc(st.interviewer||'') + '" data-ig-noctx="' + (script._aiNoContext ? '1' : '0') + '">'
    + '<div class="ig-card-head">'
      + '<div class="ig-card-head-main">'
        + '<div class="ig-code">' + code + '</div>'
        + '<div style="flex:1;"><div class="ig-card-title">' + meta.title + ' ' + itemDeptScopeBadgeHtml(code) + (script._generic ? ' <span class="ig-auto-badge">🤖 자동생성 질문</span>' : '') + (script._aiApplied ? ' <span class="ig-ai-badge">🤖 AI 응답 반영</span>' : '') + (script._aiNoContext ? ' <span class="ig-noctx-badge" title="사실·우려사항 없이 만든 프롬프트로 받은 AI 응답입니다. 사실·우려사항을 파악한 뒤 AI 프롬프트 제작기로 다시 돌리면 이 표시가 사라집니다.">🧪 AI 초안(미반영)</span>' : '') + (script._edited ? ' <span class="ig-edited-badge">✏ 감사역 편집됨</span>' : '') + (st.done ? ' <span class="ig-done-badge">✅ 인터뷰 완료</span>' : (respondentDepts.length > 1 && deptDoneCount > 0 ? ' <span class="ig-done-badge partial">🔶 인터뷰 ' + deptDoneCount + '/' + respondentDepts.length + '개 부서 완료</span>' : '')) + '</div>'
        + (meta.law ? '<div class="ig-card-law">' + meta.law.replace(/\n/g,' · ') + '</div>' : '') + '</div>'
        + '<div class="ig-tally">' + tally + '</div>'
      + '</div>'
      + '<div class="ig-card-head-actions">'
        + '<button class="ig-expand-toggle-btn" type="button" onclick="igToggleCardExpand(this, \'' + code + '\')">' + (isExpanded ? '▲ 접기' : '▼ 인터뷰 진행 (질문·기록)') + '</button>'
        + (stats.total > 0 ? ('<button class="ig-detail-toggle-btn" type="button" onclick="igToggleDetail(this)">🔍 응답 상세</button>') : '')
        + (findings.some(f => f.code === code) ? ('<button class="ig-goto-finding-btn" data-code="' + code + '" type="button" title="이미 등록된 발견사항으로 이동">📋 발견사항 보기</button>') : ('<button class="ig-add-finding-btn" data-code="' + code + '" type="button" title="인터뷰로 확인된 결함을 발견사항으로 등록">🚩 발견사항으로 등록</button>'))
        + '<button class="ig-edit-toggle-btn ig-kanban-send-btn" type="button" data-ig-kanban-code="' + code + '" onclick="kanbanSendFromInterview(\'' + code + '\', this)" title="이 항목을 칸반보드 카드로 보내 진행상황을 추적합니다">🗂 칸반 카드로 보내기</button>'
        + '<button class="ig-edit-toggle-btn" type="button" onclick="igOpenBranchWindow(\'' + code + '\')" title="①기존형·②순서도·③분기형을 새 창에서 보고, 그 창 안에서 바로 편집할 수 있습니다">🗺✏ 순서도·분기형 보기·편집 (새 창)</button>'
      + '</div>'
    + '</div>'
    + teamSelectHtml
    + (stats.total > 0 ? ('<div class="ig-detail-panel" style="display:none;">' + igResponseDetailHtml(code) + '</div>') : '')
    + '<div class="ig-collapsible-body" style="display:' + (isExpanded ? 'block' : 'none') + ';">'
      + '<div class="ig-body">'
        + '<div class="ig-decision-row">'
          + '<div class="ig-decision">' + script.decisionQ + '</div>'
          + '<button class="ig-edit-toggle-btn" type="button" onclick="igOpenBranchWindow(\'' + code + '\')" title="새 창에서 4갈래 질문을 편집합니다">✏ 질문 편집 (새 창)</button>'
        + '</div>'
        + '<div class="ig-arrow-down"></div>'
        + forkToggleRow
        + '<div class="ig-fork' + (forkExpanded ? '' : ' ig-fork-collapsed') + '">'
          + branchHtml('yes', '✅', 'YES·검증형', script.verify, script.verifyEnd)
          + branchHtml('partial', '🟡', '부분이행·경계확인형', script.partial, script.partialEnd)
          + branchHtml('no', '🚩', 'NO·원인규명형', script.rootcause, script.rootcauseEnd)
          + branchHtml('na', '⬜', 'N/A·타당성확인형', script.na, script.naEnd)
        + '</div>'
      + '</div>'
      + '<div class="ig-footer">'
      + ownerHint
      + evidenceHint
      + igEvidenceChecklistHtml(code, eviChecklistItems)
      + (isMultiDept ? ('<div class="ig-meta-scope-note">📝 아래 메모·인터뷰 정보는 <b>' + esc(activeDept) + '</b> 세션 기준입니다 — 위 드롭다운에서 팀을 바꾸면 그 팀만의 별도 기록을 보고 적을 수 있습니다.</div>') : '')
      + '<div class="ig-footer-meta">'
        + (respondentDepts.length > 1
            ? ('<div class="ig-dept-done-group"><span class="ig-dept-done-label">🏢 부서별 인터뷰 완료 (' + deptDoneCount + '/' + respondentDepts.length + '):</span>'
                + respondentDepts.map(d => '<label class="ig-dept-done-item"><input type="checkbox" class="ig-dept-done-cb" data-code="' + code + '" data-dept="' + esc(d) + '"' + (st.deptDone[d] ? ' checked' : '') + '> ' + esc(d) + '</label>').join('')
              + '</div>')
            : ('<label class="ig-done-label"><input type="checkbox" class="ig-done-cb" data-code="' + code + '"' + (st.done ? ' checked' : '') + '> 인터뷰 완료</label>'))
        + '<input type="text" class="ig-meta-input ig-interviewer" data-code="' + code + '" data-dept="' + (isMultiDept ? esc(activeDept) : '') + '" placeholder="진행 감사자" list="knownAuditorDatalist" value="' + esc(sess.interviewer||'') + '">'
        + '<input type="text" class="ig-meta-input ig-interviewee" data-code="' + code + '" data-dept="' + (isMultiDept ? esc(activeDept) : '') + '" placeholder="면담자(수검자) 이름·직책" value="' + esc(sess.interviewee||'') + '">'
        + '<input type="datetime-local" class="ig-meta-input ig-interviewedat" data-code="' + code + '" data-dept="' + (isMultiDept ? esc(activeDept) : '') + '" value="' + esc(sess.interviewedAt||'') + '">'
        + '<input type="text" class="ig-meta-input ig-location" data-code="' + code + '" data-dept="' + (isMultiDept ? esc(activeDept) : '') + '" placeholder="장소(선택)" value="' + esc(sess.location||'') + '">'
        + '<select class="ig-meta-input ig-evidence-status" data-code="' + code + '" data-dept="' + (isMultiDept ? esc(activeDept) : '') + '" title="증빙자료 확인 결과">'
          + '<option value=""' + (!sess.evidenceStatus ? ' selected' : '') + '>📎 증빙 확인 상태…</option>'
          + '<option value="received_ok"' + (sess.evidenceStatus==='received_ok' ? ' selected' : '') + '>✅ 수령·확인됨(적절)</option>'
          + '<option value="received_issue"' + (sess.evidenceStatus==='received_issue' ? ' selected' : '') + '>⚠ 수령·미흡·보완필요</option>'
          + '<option value="not_received"' + (sess.evidenceStatus==='not_received' ? ' selected' : '') + '>🚫 미제출·미수령</option>'
        + '</select>'
      + '</div>'
      + '<textarea class="ig-note" data-code="' + code + '" data-dept="' + (isMultiDept ? esc(activeDept) : '') + '" placeholder="인터뷰 결과 메모 (확인된 사실, 결함 내용, 개선 약속 등)">' + (sess.note || '').replace(/</g,'&lt;') + '</textarea>'
    + '</div>'
    + '</div>'
    + '</div>'
  );
}

export function renderIgSourceBanner(){
  const el = document.getElementById('ig-source-banner');
  if(!el) return;
  const rounds = loadRoundsFromStorage();
  const distinctDepts = new Set(aggRows.map(r => r.dept).filter(Boolean));
  const distinctFiles = new Set(aggRows.map(r => r.file).filter(Boolean));
  let html = '';
  if(aggRows.length > 0){
    html += '<div class="ig-source-current">📌 현재 보고 있는 데이터: '
      + (activeRoundLabel ? '<b>"' + esc(activeRoundLabel) + '"</b> 회차 · ' : '<b>(저장되지 않은 작업 중 데이터)</b> · ')
      + distinctDepts.size + '개 부서 · ' + distinctFiles.size + '개 파일'
      + (distinctFiles.size ? ' (' + Array.from(distinctFiles).slice(0,4).map(esc).join(', ') + (distinctFiles.size>4?' 외':'') + ')' : '')
      + '</div>';
  }
  if(rounds.length > 0){
    html += '<div class="ig-source-rounds">💾 저장된 회차 이력 ' + rounds.length + '개 — 클릭해서 다른 회차로 전환: '
      + rounds.slice().reverse().map(r =>
          '<button class="ig-round-chip' + (r.label===activeRoundLabel ? ' active' : '') + '" onclick="loadRoundById(\'' + r.id + '\')">'
          + esc(r.label) + ' (' + (r.rows?r.rows.length:0) + '행)</button>'
        ).join(' ')
      + '</div>';
  } else if(aggRows.length > 0){
    html += '<div class="ig-source-rounds">⚠ 이 데이터는 아직 회차로 저장되지 않았습니다 — ③ 응답 집계 탭에서 저장해 두면 나중에 다시 불러올 수 있습니다.</div>';
  }
  el.innerHTML = html;
}

export function wireIgCardMetaInputs(container){
  const ensure = (code) => {
    interviewState[code] = interviewState[code] || {done:false, note:'', interviewee:'', interviewer:'', interviewedAt:'', location:'', evidenceStatus:''};
    return interviewState[code];
  };
  container.querySelectorAll('.ig-team-select').forEach(sel => {
    sel.addEventListener('change', () => {
      igSwitchCardDept(sel, sel.dataset.code, sel.value);
    });
  });
  container.querySelectorAll('.ig-done-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      ensure(cb.dataset.code).done = cb.checked;
      saveInterviewState();
      igUpdateDoneCount();
    });
  });
  container.querySelectorAll('.ig-dept-done-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const st = ensure(cb.dataset.code);
      st.deptDone = st.deptDone || {};
      st.deptDone[cb.dataset.dept] = cb.checked;
      igRecomputeMultiDeptDone(cb.dataset.code);
      saveInterviewState();
      igUpdateDoneCount();
      igRefreshCardDoneBadge(cb.closest('.ig-card'), cb.dataset.code);
    });
  });
  container.querySelectorAll('.ig-note').forEach(ta => {
    ta.addEventListener('input', () => {
      igMetaTarget(ta.dataset.code, ta.dataset.dept).note = ta.value;
      saveInterviewState();
    });
  });
  container.querySelectorAll('.ig-interviewer').forEach(el => {
    el.addEventListener('input', () => {
      const meta = igMetaTarget(el.dataset.code, el.dataset.dept);
      meta.interviewer = el.value;
      meta.interviewerAutoFilled = false; // 감사역이 직접 입력했으니, 이후 "현재 작업자" 변경에도 이 값은 유지
      saveInterviewState();
      const card = el.closest('.ig-card');
      if(card) card.dataset.igInterviewer = el.value;
    });
    el.addEventListener('change', () => addKnownAuditor(el.value));
  });
  container.querySelectorAll('.ig-interviewee').forEach(el => {
    el.addEventListener('input', () => {
      igMetaTarget(el.dataset.code, el.dataset.dept).interviewee = el.value;
      saveInterviewState();
    });
  });
  container.querySelectorAll('.ig-interviewedat').forEach(el => {
    el.addEventListener('input', () => {
      igMetaTarget(el.dataset.code, el.dataset.dept).interviewedAt = el.value;
      saveInterviewState();
    });
  });
  container.querySelectorAll('.ig-location').forEach(el => {
    el.addEventListener('input', () => {
      igMetaTarget(el.dataset.code, el.dataset.dept).location = el.value;
      saveInterviewState();
    });
  });
  container.querySelectorAll('.ig-evidence-status').forEach(el => {
    el.addEventListener('change', () => {
      igMetaTarget(el.dataset.code, el.dataset.dept).evidenceStatus = el.value;
      saveInterviewState();
    });
  });

  wireIgCpOverrideControls(container);
}

export function wireIgCpOverrideControls(scope){
  const ensure = (code) => {
    interviewState[code] = interviewState[code] || {done:false, note:'', interviewee:'', interviewer:'', interviewedAt:'', location:'', evidenceStatus:''};
    return interviewState[code];
  };
  scope.querySelectorAll('.ig-cp-override-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const li = btn.closest('.ig-detail-cp');
      const form = li ? li.querySelector('.ig-cp-override-form[data-cp-key="' + CSS.escape(btn.dataset.cpKey) + '"]') : null;
      if(!form) return;
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
  });
  scope.querySelectorAll('.ig-cp-override-save-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      const key = btn.dataset.cpKey;
      const li = btn.closest('.ig-detail-cp');
      const select = li ? li.querySelector('.ig-cp-override-select[data-cp-key="' + CSS.escape(key) + '"]') : null;
      const reasonInput = li ? li.querySelector('.ig-cp-override-reason[data-cp-key="' + CSS.escape(key) + '"]') : null;
      const newTier = select ? select.value : 'neutral';
      const reason = reasonInput ? reasonInput.value.trim() : '';
      const st = ensure(code);
      if(!st.cpOverrides) st.cpOverrides = {};
      const ov = {
        dept: btn.dataset.dept, author: btn.dataset.author, cptext: btn.dataset.cptext,
        originalTier: btn.dataset.originalTier, originalResp: btn.dataset.originalResp,
        newTier, reason, changedBy: getCurrentAuditor() || '', changedAt: kstISOString()
      };
      st.cpOverrides[key] = ov;
      saveInterviewState();
      if(typeof renderInterviewOverridesTable === 'function') renderInterviewOverridesTable();
      if(li){
        const newHtml = igRenderCpRowHtml(code, key, btn.dataset.dept, btn.dataset.author, btn.dataset.cptext, btn.dataset.originalResp, btn.dataset.originalTier, ov);
        const parent = li.parentNode;
        li.outerHTML = newHtml;
        if(parent){
          const newLi = parent.querySelector('.ig-detail-cp[data-cp-key="' + CSS.escape(key) + '"]');
          if(newLi) wireIgCpOverrideControls(newLi);
        }
      }
    });
  });
  scope.querySelectorAll('.ig-cp-override-clear-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if(!confirm('이 체크포인트의 재검토 기록을 지우고 원래 응답으로 되돌리시겠습니까?')) return;
      const code = btn.dataset.code;
      const key = btn.dataset.cpKey;
      const st = ensure(code);
      if(st.cpOverrides) delete st.cpOverrides[key];
      saveInterviewState();
      if(typeof renderInterviewOverridesTable === 'function') renderInterviewOverridesTable();
      const li = btn.closest('.ig-detail-cp');
      const saveBtn = li ? li.querySelector('.ig-cp-override-save-btn') : null;
      if(li && saveBtn){
        const newHtml = igRenderCpRowHtml(code, key, saveBtn.dataset.dept, saveBtn.dataset.author, saveBtn.dataset.cptext, saveBtn.dataset.originalResp, saveBtn.dataset.originalTier, null);
        const parent = li.parentNode;
        li.outerHTML = newHtml;
        if(parent){
          const newLi = parent.querySelector('.ig-detail-cp[data-cp-key="' + CSS.escape(key) + '"]');
          if(newLi) wireIgCpOverrideControls(newLi);
        }
      }
    });
  });
}

export function renderInterviewGuide(){
  const container = document.getElementById('interviewGuideContainer');
  const toolbarWrap = document.getElementById('ig-toolbar-wrap');
  if(!container) return;
  renderIgSourceBanner();

  const modeToggleHtml = '<div class="ig-mode-toggle">'
    + '<button class="ig-mode-btn' + (igViewMode==='data'?' active':'') + '" data-mode="data">📊 응답 데이터 기준</button>'
    + '<button class="ig-mode-btn' + (igViewMode==='all'?' active':'') + '" data-mode="all">📋 전체 항목 검토·편집(응답 무관)</button>'
    + '<button type="button" id="igManualRefreshBtn" class="ig-mode-btn" style="margin-left:auto;" title="① 설문지 생성 탭에서 체크리스트를 새로 업로드/변경한 뒤에도 이 화면이 그대로면 눌러주세요 — 지금 등록된 체크리스트 기준으로 다시 그립니다.">🔄 체크리스트 최신 반영</button>'
    + '</div>';

  if(igViewMode === 'data' && aggRows.length === 0){
    toolbarWrap.innerHTML = modeToggleHtml;
    container.innerHTML = '<div class="ig-empty">아직 취합된 응답 CSV/JSON이 없습니다.<br>③ 응답 집계 탭에서 회수된 파일을 업로드하면(또는 저장된 회차를 불러오면) 실제 응답이 있는 항목에 대해 인터뷰 순서도가 자동 생성됩니다.'
      + '<br>회수 전이라도 질문 내용을 미리 검토·수정하고 싶으시면 위 <b>"전체 항목 검토·편집"</b>을 눌러 주세요.'
      + '<br><button id="igGoCollectBtn">③ 응답 집계 탭으로 이동</button></div>';
    const btn = document.getElementById('igGoCollectBtn');
    if(btn) btn.addEventListener('click', () => document.querySelector('.tabbtn[data-tab="collect"]').click());
    wireIgModeToggle();
    return;
  }

  try {
  let codes;
  if(igViewMode === 'all'){
    // 응답 유무와 무관하게, 현재 체크리스트(커스텀 업로드 반영)의 전 항목을 대상으로 함.
    const applied = applyOverrides(DOMAINS);
    codes = [];
    applied.forEach(d => d.items.forEach(it => codes.push(d.code + '-' + it.no)));
  } else {
    // Build the code list dynamically from whatever domains/items were actually surveyed —
    // this scales to all 25 domains, not just D-25, without hardcoding a universe of codes.
    const codeSet = new Set(aggRows.map(r => r.code).filter(Boolean));
    codes = Array.from(codeSet).filter(c => c.includes('-'));
  }
  codes = codes.sort((a,b) => {
    const [ad, an] = a.split('-'); const [bd, bn] = b.split('-');
    if(ad !== bd) return ad.localeCompare(bd);
    return Number(an) - Number(bn);
  });

  // 영역(도메인)별 필터 — "전체 설문 인터뷰"를 통으로 보여주지 않고 D-01처럼 선택한 영역만 보고 싶을 때 사용.
  // 필터용 도메인 목록·건수는 필터 적용 전 전체 codes 기준으로 계산해서, 드롭다운 자체는 항상 전체 영역을 보여준다.
  const domainCountMap = {};
  codes.forEach(c => { const dc = c.split('-')[0]; domainCountMap[dc] = (domainCountMap[dc]||0) + 1; });
  const domainFilterOptions = Object.keys(domainCountMap).sort();
  if(igDomainFilter && !domainFilterOptions.includes(igDomainFilter)) setIgDomainFilter('');
  if(igDomainFilter) codes = codes.filter(c => c.split('-')[0] === igDomainFilter);

  // 아직 아무도 손대지 않은(진행 감사자 미기재) 항목은, "현재 작업자"가 바뀌면 그 최신 이름을
  // 계속 따라가도록 갱신한다. interviewerAutoFilled 플래그로 "자동 채움"과 "감사역이 직접 적은 값"을
  // 구분한다 — 직접 입력란에 뭔가 타이핑하면(ig-interviewer의 input 이벤트) 이 플래그가 꺼져서,
  // 이후 이름을 바꿔도 그 항목에 이미 적힌 이름은 덮어쓰지 않는다(여러 감사역 협업 시 보호).
  // [v7.01] ①설문지 생성 단계에서 이미 "영역별 담당 감사자"(domainAuditorMap)를 정해뒀다면 그걸
  // "현재 작업자"보다 우선한다 — 책임 감사역이 미리 배정해둔 값이 있는데도 매번 로그인한 사람
  // 이름으로 덮어써지면 배정이 무의미해지기 때문. 사전배정이 없는 영역만 기존처럼 현재 작업자를 따른다.
  const curAuditor = getCurrentAuditor();
  const igResolveDefaultInterviewer = (code) => {
    const domCode = code.split('-')[0];
    // [v7.03] 우선순위: ① 항목별로 직접 배정한 감사역(itemAuditorMap) → ② 영역에 감사역이 1명뿐이면 그 이름
    // → ③ 현재 작업자. 영역에 감사역이 2명 이상인데 항목별 배정이 아직 없으면, 예전처럼 콤마로 뭉친
    // 문자열을 채우지 않고 현재 작업자로 남겨 둔다 — 뭉친 값은 인터뷰 가이드 필터·사람별 정렬을 무의미하게
    // 만들기 때문에(v7.02 이전 버그), 배정이 끝나기 전까지는 차라리 명확한 단일 값을 쓰는 편이 안전하다.
    const itemAssigned = (itemAuditorMap[code] || '').trim();
    if(itemAssigned) return itemAssigned;
    const domCandidates = domainAuditorCandidates(domCode);
    if(domCandidates.length === 1) return domCandidates[0];
    return curAuditor;
  };
  let interviewerRefreshed = false;
  codes.forEach(c => {
    const defaultInterviewer = igResolveDefaultInterviewer(c);
    if(!interviewState[c]){
      interviewState[c] = {done:false, note:'', interviewee:'', interviewer:defaultInterviewer, interviewerAutoFilled:true, interviewedAt:'', location:'', evidenceStatus:''};
      interviewerRefreshed = true;
    } else if((interviewState[c].interviewerAutoFilled || !interviewState[c].interviewer) && defaultInterviewer && interviewState[c].interviewer !== defaultInterviewer){
      interviewState[c].interviewer = defaultInterviewer;
      interviewState[c].interviewerAutoFilled = true;
      interviewerRefreshed = true;
    }
  });
  if(interviewerRefreshed) saveInterviewState();

  const interviewerSet = new Set();
  codes.forEach(c => { const st = interviewState[c]; if(st && st.interviewer) interviewerSet.add(st.interviewer); });
  const interviewerOptions = Array.from(interviewerSet).sort();

  toolbarWrap.innerHTML = modeToggleHtml + '<div class="ig-toolbar-panel">'
    + '<div class="ig-toolbar-group ig-tbg-view">'
    + '<div class="ig-toolbar-group-title">🔎 보기·필터 설정</div>'
    + '<div class="ig-toolbar-row">'
      + '<span class="ig-toolbar-label">🔎 필터</span>'
      + '<div class="ig-stat">' + (igViewMode==='all' ? '전체 ' : '집계된 ') + '항목 <b>' + codes.length + '</b>개 (도메인 <b>' + new Set(codes.map(c=>c.split('-')[0])).size + '</b>개) · 완료 표시 <b id="igDoneCount">0</b>개' + (codes.filter(c => aiNoContextCodes.has(c)).length > 0 ? ' · 🧪 AI 초안(미반영) <b style="color:#8a3b1f;">' + codes.filter(c => aiNoContextCodes.has(c)).length + '</b>개' : '') + '</div>'
      + '<select id="igDomainFilter" style="min-width:170px;padding:5px 7px;border-radius:5px;border:1px solid #c9d0e0;">'
        + '<option value="">전체 영역</option>'
        + domainFilterOptions.map(dc => { const dom = igFindDomain(dc); return '<option value="' + dc + '"' + (igDomainFilter===dc?' selected':'') + '>D-' + dc + (dom ? ' ' + esc(dom.title) : '') + ' (' + domainCountMap[dc] + '개)</option>'; }).join('')
      + '</select>'
      + '<select id="igAuditorFilter" style="min-width:150px;padding:5px 7px;border-radius:5px;border:1px solid #c9d0e0;">'
        + '<option value="">진행 감사자: 전체</option>'
        + interviewerOptions.map(a => '<option value="' + esc(a) + '">진행 감사자: ' + esc(a) + '</option>').join('')
      + '</select>'
      + '<label style="display:flex;align-items:center;gap:5px;color:var(--ink-soft);cursor:pointer;"><input type="checkbox" id="igPackCompletedOnly"> 완료된 인터뷰만</label>'
      + '<label style="display:flex;align-items:center;gap:5px;color:#8a3b1f;cursor:pointer;" title="사실·우려사항 없이 AI 프롬프트를 돌려 받은 항목만 모아 보여줍니다 — 사실·우려사항을 파악한 뒤 다시 돌릴 대상을 고를 때 씁니다."><input type="checkbox" id="igNoContextOnly"> 🧪 AI 초안(미반영)만</label>'
    + '</div>'
    + '<div class="ig-toolbar-row">'
      + '<span class="ig-toolbar-label">🧭 화면·팩 그룹 기준</span>'
      + '<select id="igPackSortMode" style="min-width:180px;padding:5px 7px;border-radius:5px;border:1px solid #c9d0e0;">'
        + '<option value="domain"' + (igGroupMode==='domain'?' selected':'') + '>영역순 (기본)</option>'
        + '<option value="risk"' + (igGroupMode==='risk'?' selected':'') + '>위험도순</option>'
        + '<option value="interviewer"' + (igGroupMode==='interviewer'?' selected':'') + '>담당 감사역순</option>'
        + '<option value="person"' + (igGroupMode==='person'?' selected':'') + '>인터뷰 대상자별(사람별)</option>'
      + '</select>'
      + '<span id="igGroupFilterSlot"></span>'
      + '<span style="font-size:10.5px;color:var(--ink-faint,#8a93a3);">— 화면 카드 묶음과 인터뷰 팩 내보내기 정렬에 함께 적용됩니다</span>'
    + '</div>'
    + '</div>'
    + '<div class="ig-toolbar-group ig-tbg-export">'
    + '<div class="ig-toolbar-group-title">📤 내보내기·협업</div>'
    + '<div class="ig-toolbar-row">'
      + '<span class="ig-toolbar-label">📤 내보내기·협업</span>'
      + '<button class="ig-dl-btn" id="igDownloadBtn">⬇ 인터뷰 기록 CSV 다운로드</button>'
      + '<button class="ig-dl-btn" id="igPackBtn" style="background:var(--good);" title="인쇄·휴대용 읽기 전용 사본입니다 — 입력은 이 인터뷰 가이드 화면에서 해 주세요">📦 인터뷰 팩 내보내기</button>'
      + '<span class="ig-toolbar-sep"></span>'
      + '<button class="ig-dl-btn" id="igExportPacketBtn" style="background:var(--indigo);" title="협동 감사 시, 내 인터뷰 기록을 동료 감사역에게 전달할 파일로 내보냅니다">📤 내 기록 내보내기(협업용)</button>'
      + '<button class="ig-dl-btn" id="igImportPacketBtn" style="background:var(--indigo);" title="동료 감사역이 내보낸 인터뷰 기록을 지금 화면과 합칩니다(자동 덮어쓰기 없음)">📥 동료 기록 불러와 합치기</button>'
      + '<span class="ig-toolbar-sep"></span>'
      + '<button class="ig-dl-btn" id="igAssignExportBtn" style="background:#7a5a28;" title="진행 감사자가 지정된 항목을 사람별로 나눠, 각자에게 보낼 배정 파일(질문 스크립트 포함)을 한 번에 만듭니다 — 작업 시작 전 배정용입니다">🗂 감사역별로 나눠 배정 내보내기</button>'
      + '<input type="file" id="igPacketFileInput" accept=".json" style="display:none;">'
    + '</div>'
    + '</div>'
    + '<div class="ig-toolbar-group ig-tbg-ai">'
    + '<div class="ig-toolbar-group-title">🤖 AI 생성·대량 편집</div>'
    + '<div class="ig-toolbar-row">'
      + '<span class="ig-toolbar-label">🗺 순서도·분기형 대량 편집</span>'
      + '<button class="ig-dl-btn" id="igFlowXlsxExportBtn" style="background:#7a5a28;" title="전 항목의 ②순서도·③분기형 질문·결함 시나리오를 엑셀로 내보냅니다 — 여러 항목을 한 번에 작성할 때 편리합니다">📤 순서도·분기형 엑셀로 내보내기</button>'
      + '<button class="ig-dl-btn" id="igFlowXlsxImportBtn" style="background:#7a5a28;" title="위에서 받은 엑셀 서식을 채워서 다시 올리면, 항목 코드가 일치하는 내용을 한 번에 반영합니다">📥 엑셀에서 순서도·분기형 가져오기</button>'
      + '<input type="file" id="igFlowXlsxFileInput" accept=".xlsx,.xls" style="display:none;">'
      + '<span style="font-size:10.5px;color:var(--ink-faint,#8a93a3);">— 항목 하나만 빠르게 손볼 때는 카드의 "🗺✏ 순서도 보기·편집 (새 창)"이 더 편합니다</span>'
    + '</div>'
    + '<div class="ig-toolbar-row">'
      + '<span class="ig-toolbar-label">🤖 AI로 인터뷰 콘텐츠 만들기</span>'
      + '<select id="igAiPromptDomainSelect" style="min-width:220px;padding:5px 7px;border-radius:5px;border:1px solid #c9d0e0;">'
        + Array.from(new Set(codes.map(c => c.split('-')[0]))).sort().map(dc => { const dom = igFindDomain(dc); return '<option value="' + dc + '"' + (igDomainFilter === dc ? ' selected' : '') + '>D-' + dc + (dom ? ' ' + esc(dom.title) : '') + '</option>'; }).join('')
      + '</select>'
      + '<select id="igAiPromptItemSelect" style="min-width:260px;padding:5px 7px;border-radius:5px;border:1px solid #c9d0e0;">'
        + igAiPromptItemOptionsHtml(igDomainFilter || Array.from(new Set(codes.map(c => c.split('-')[0]))).sort()[0] || '', '')
      + '</select>'
      + '<button class="ig-dl-btn" id="igAiPromptBtn" style="background:#4a5a8a;" title="항목 선택을 \'전체 항목\'으로 두면 도메인 전체를, 특정 항목을 고르면 그 항목 하나만 대상으로, 어떤 AI에게든 붙여넣어 ①기존형·②순서도 콘텐츠를 받아올 수 있는 프롬프트를 새 창으로 만듭니다 — 받은 JSON 응답은 같은 창에서 바로 가져오기 할 수 있습니다">🤖 AI 프롬프트 제작기 (새 창)</button>'
      + '<span style="font-size:10.5px;color:var(--ink-faint,#8a93a3);">— 도메인만 고르면 전체 항목, 항목까지 고르면 그 항목 하나만 대상으로 프롬프트가 만들어집니다</span>'
    + '</div>'
    + '</div>'
    // [v8.25] "인터뷰 질문 편집 내역"·"순서도·분기형 편집 내역"이 데이터 관리 탭에 각각 따로만
    // 있어서, AI로 채운 ①②를 한 번에 다 빠짐없이 백업하려는 건지 헷갈린다는 지적에 따라, 인터뷰
    // 가이드 화면 자체에 "①+② 통째로, AI 응답까지 전부 포함"이라는 것이 이름에서 바로 드러나는
    // 전용 백업/복원 버튼을 추가했다. 데이터 관리 탭의 개별 백업(scriptOverrides/flowOverrides)은
    // 항목 하나만 골라 다루고 싶을 때를 위해 그대로 남겨두었다.
    + '<div class="ig-toolbar-group ig-tbg-backup">'
    + '<div class="ig-toolbar-group-title">🗄 백업·검토</div>'
    + '<div class="ig-toolbar-row">'
      + '<span class="ig-toolbar-label">🗄 인터뷰 가이드 전체 백업</span>'
      + '<button class="ig-dl-btn" id="igGuideBundleExportBtn" style="background:#2e5a4a;" title="①기존형 질문 편집 내역 + ②순서도·분기형 편집 내역을 하나의 파일로 함께 내보냅니다. AI 프롬프트 제작기로 채운 내용도 전부 포함됩니다.">📤 인터뷰 가이드 전체 백업 (①+②, AI 응답 포함)</button>'
      + '<button class="ig-dl-btn" id="igGuideBundleImportBtn" style="background:#2e5a4a;" title="위 버튼으로 받은 파일을 불러와 ①②를 한 번에 복원합니다.">📥 인터뷰 가이드 전체 복원</button>'
      + '<input type="file" id="igGuideBundleFileInput" accept=".json" style="display:none;">'
      + '<span style="font-size:10.5px;color:var(--ink-faint,#8a93a3);">— 이 도구에서 AI로 채운 인터뷰 가이드 내용을 다른 사람(감사역·개발 담당)에게 통째로 넘길 때는 이 버튼을 쓰세요. \"⚙ 데이터 관리\"의 개별 백업(①만/②만)과는 별개로, 여기서는 항상 ①②를 함께 다룹니다.</span>'
    + '</div>'
    + '</div>'
  + '</div>';

  // 화면에 카드를 어떻게 묶어 보여줄지 — igGroupMode에 따라 그룹 키·정렬·제목이 달라진다.
  // 'person' 모드는 항목(code) 하나가 여러 사람의 응답을 담을 수 있어 다른 모드처럼
  // code당 그룹 1개로 단순 매핑할 수 없다 — "인터뷰 대상자 현황"·인터뷰 팩과 동일한
  // (부서|||작성자) 키 규칙을 재사용해, 그 사람이 응답을 남긴 모든 항목을 그 사람 그룹에 채운다.
  const RISK_ORDER_SCREEN = ['상','중','하'];
  const byDomain = {};
  const domainOrder = [];
  const personPriorityScreen = {}; // person 모드에서만 채워짐 — 위험도 상 미흡 우선순위 정렬용
  const igGroupLockedDept = {}; // [v8.40] 'interviewer'/'person' 모드에서 'gKey|||code' -> 이 그룹에서 고정해서 보여줄 팀

  if(igGroupMode === 'person'){
    const codeSet3 = new Set(codes);
    aggRows.forEach(r => {
      if(!codeSet3.has(r.code)) return;
      const gKey = (r.dept || '(부서 미입력)') + '|||' + (r.author || '(작성자 미입력)');
      if(!byDomain[gKey]){ byDomain[gKey] = []; domainOrder.push(gKey); personPriorityScreen[gKey] = {hiBad:0, bad:0}; }
      if(!byDomain[gKey].includes(r.code)) byDomain[gKey].push(r.code);
      const cls = igClassifyRow(r);
      if(cls === 'no'){
        personPriorityScreen[gKey].bad++;
        if(r.risk === '상') personPriorityScreen[gKey].hiBad++;
      }
    });
    domainOrder.sort((a,b) => personPriorityScreen[b].hiBad - personPriorityScreen[a].hiBad || personPriorityScreen[b].bad - personPriorityScreen[a].bad || a.localeCompare(b));
  } else if(igGroupMode === 'risk'){
    codes.forEach(c => {
      const item = igFindItem(c);
      const gKey = item ? (item.risk || '중') : '중';
      if(!byDomain[gKey]){ byDomain[gKey] = []; domainOrder.push(gKey); }
      byDomain[gKey].push(c);
    });
    domainOrder.sort((a,b) => RISK_ORDER_SCREEN.indexOf(a) - RISK_ORDER_SCREEN.indexOf(b));
  } else if(igGroupMode === 'interviewer'){
    // [v8.39] v8.38부터 응답 부서가 2개 이상인 항목은 진행 감사자가 st.interviewer가 아니라
    // st.deptMeta[부서].interviewer에 팀별로 따로 저장된다 — 이 그룹 기준도 그에 맞춰, 그런
    // 항목은 실제로 진행 감사자가 기록된 팀 각각의 이름으로 나눠 넣는다(양쪽 다 비어 있으면
    // 기존처럼 "(담당 미지정)" 한 곳에 넣는다). igGroupLockedDept는 "이 그룹(담당자)에서 이
    // 항목을 열면 어느 팀 세션으로 고정해서 보여줄지"를 기억해, 카드에 불필요한 팀 선택
    // 드롭다운 대신 이미 정해진 팀 라벨만 보이게 한다([v8.40]).
    codes.forEach(c => {
      const st = interviewState[c];
      const depts = igOwnerDepts(c);
      if(st && st.deptMeta && depts.length > 1){
        const pairs = depts.map(d => ({d, name: st.deptMeta[d] && st.deptMeta[d].interviewer})).filter(p => p.name);
        if(pairs.length > 0){
          pairs.forEach(({d, name}) => {
            if(!byDomain[name]){ byDomain[name] = []; domainOrder.push(name); }
            if(!byDomain[name].includes(c)) byDomain[name].push(c);
            if(igGroupLockedDept[name + '|||' + c] === undefined) igGroupLockedDept[name + '|||' + c] = d;
          });
          return;
        }
      }
      const gKey = (st && st.interviewer) ? st.interviewer : '(담당 미지정)';
      if(!byDomain[gKey]){ byDomain[gKey] = []; domainOrder.push(gKey); }
      if(!byDomain[gKey].includes(c)) byDomain[gKey].push(c);
    });
    domainOrder.sort();
  } else {
    codes.forEach(c => {
      const domCode = c.split('-')[0];
      if(!byDomain[domCode]){ byDomain[domCode] = []; domainOrder.push(domCode); }
      byDomain[domCode].push(c);
    });
  }

  function igScreenGroupTitle(key){
    if(igGroupMode === 'risk') return '🚩 위험도: ' + esc(key);
    if(igGroupMode === 'interviewer') return '👤 담당 감사역: ' + esc(key);
    if(igGroupMode === 'person'){
      const parts = key.split('|||');
      const p = personPriorityScreen[key] || {hiBad:0, bad:0};
      const flag = p.hiBad > 0 ? (' · 🚩 위험도 상 미흡 ' + p.hiBad + '건') : (p.bad > 0 ? (' · 미흡 ' + p.bad + '건') : '');
      return '👤 ' + esc(parts[0]) + ' · ' + esc(parts[1]) + flag;
    }
    const dom = igFindDomain(key);
    return dom ? ('D-' + key + ' ' + dom.title) : ('D-' + key);
  }
  function igScreenGroupShortLabel(key){
    // 필터 드롭다운 옵션용 — 그룹 제목보다 짧게. person 모드에서는 이름만 뽑아 쓰고,
    // 나머지 모드는 이모지 접두사(🚩·👤)만 뗀 igScreenGroupTitle 결과를 그대로 쓴다.
    if(igGroupMode === 'person'){
      const parts = key.split('|||');
      const p = personPriorityScreen[key] || {hiBad:0, bad:0};
      return parts[0] + ' · ' + parts[1] + (p.hiBad > 0 ? (' (🚩' + p.hiBad + ')') : '');
    }
    if(igGroupMode === 'risk' || igGroupMode === 'interviewer') return igScreenGroupTitle(key).replace(/^[^\s]+\s/, '');
    return igScreenGroupTitle(key); // 영역(도메인) 모드는 'D-04 제목' 그대로 유지
  }

  // 여러 그룹을 한꺼번에 펼치면 화면이 길어져 지금 인터뷰 중인 대상을 놓치기 쉽다는 지적에 따라,
  // "이 그룹만 보기" 필터를 신설했다 — 그룹 기준이 바뀌면 이전 필터 값이 새 목록에 없을 수 있으니
  // 매 렌더마다 유효성을 재확인해 조용히 초기화한다.
  if(igGroupFilter && !domainOrder.includes(igGroupFilter)) setIgGroupFilter('');
  const filterSlot = document.getElementById('igGroupFilterSlot');
  if(filterSlot){
    const filterLabel = igGroupMode === 'person' ? '이 대상자만 보기' : '이 그룹만 보기';
    filterSlot.innerHTML = '<select id="igGroupFilterSelect" style="min-width:170px;padding:5px 7px;border-radius:5px;border:1px solid #c9d0e0;">'
      + '<option value="">' + esc(filterLabel) + ': 전체(' + domainOrder.length + ')</option>'
      + domainOrder.map(k => '<option value="' + esc(k) + '"' + (igGroupFilter===k?' selected':'') + '>' + esc(igScreenGroupShortLabel(k)) + ' (' + byDomain[k].length + '개)</option>').join('')
    + '</select>';
    const filterSelectEl = document.getElementById('igGroupFilterSelect');
    if(filterSelectEl){
      filterSelectEl.addEventListener('change', () => {
        setIgGroupFilter(filterSelectEl.value);
        renderInterviewGuide();
      });
    }
  }

  let html = '';
  domainOrder.forEach((domCode, gIdx) => {
    if(igGroupFilter && igGroupFilter !== domCode) return;
    const domTitle = igScreenGroupTitle(domCode);
    html += '<div class="ig-domain-group" data-ig-domain-group="g' + gIdx + '"><div class="ig-domain-head">' + domTitle
      + '<span style="display:flex;align-items:center;gap:8px;">'
        + '<button class="ig-domain-bulk-btn" type="button" onclick="igBulkExpandDomain(\'g' + gIdx + '\', true)">▼ 전체 펼치기</button>'
        + '<button class="ig-domain-bulk-btn" type="button" onclick="igBulkExpandDomain(\'g' + gIdx + '\', false)">▲ 전체 접기</button>'
        + '<span class="ig-domain-count">' + byDomain[domCode].length + '개 항목</span>'
      + '</span></div>';
    // [v8.26] 항목 하나(igRenderCard)라도 저장된 편집 내용이 손상돼 예외를 던지면 이전에는
    // html 문자열 조립 전체가 중단되어 container.innerHTML이 갱신되지 않고(화면에 목록이 안 보임),
    // 그 뒤에 이어지던 툴바 버튼 wiring(백업/복원 포함)까지 통째로 건너뛰어져 버튼이 눌러도
    // 반응이 없는 것처럼 보였다. 항목 단위로 감싸 한 항목이 깨져도 나머지 항목·버튼은 정상 동작하게 한다.
    html += byDomain[domCode].map(code => {
      // [v8.40] 'person' 모드는 그룹 키 자체가 '부서|||작성자'라 부서를 바로 뽑을 수 있고,
      // 'interviewer' 모드는 위에서 미리 기록해둔 igGroupLockedDept에서 찾는다. 둘 다 아니면
      // (도메인·위험도 모드) 잠금 없이 기존처럼 카드 자체의 팀 선택 드롭다운을 그대로 쓴다.
      const lockedDept = igGroupMode === 'person' ? domCode.split('|||')[0]
        : igGroupMode === 'interviewer' ? igGroupLockedDept[domCode + '|||' + code]
        : undefined;
      try{ return igRenderCard(code, lockedDept); }
      catch(cardErr){
        console.error('igRenderCard 실패:', code, cardErr);
        return '<div class="ig-card" style="border:2px solid var(--risk-hi);background:var(--risk-hi-bg);padding:14px 16px;margin-bottom:14px;">'
          + '<b style="color:var(--risk-hi);">⚠ ' + esc(code) + ' 항목을 표시하는 중 오류가 발생했습니다.</b>'
          + '<div style="font-size:11px;color:var(--ink-soft);margin-top:6px;">오류 내용: ' + esc(cardErr && cardErr.message ? cardErr.message : String(cardErr)) + '</div>'
          + '<div style="font-size:11px;color:var(--ink-soft);margin-top:4px;">이 항목의 저장된 순서도·질문 편집 내용이 손상되었을 수 있습니다. 데이터 관리 탭에서 "인터뷰 순서도·분기형 편집 내역"을 이 항목만 초기화하거나, 이 화면을 캡처해 전달해 주세요.</div>'
        + '</div>';
      }
    }).join('');
    html += '</div>';
  });
  container.innerHTML = html;

  wireIgCardMetaInputs(container);
  wireIgEvidenceChecklist(container);
  igUpdateDoneCount();

  const dlBtn = document.getElementById('igDownloadBtn');
  if(dlBtn) dlBtn.addEventListener('click', downloadInterviewCSV);
  const packBtn = document.getElementById('igPackBtn');
  if(packBtn) packBtn.addEventListener('click', () => {
    const auditorFilterEl2 = document.getElementById('igAuditorFilter');
    const completedOnlyEl = document.getElementById('igPackCompletedOnly');
    const sortModeEl = document.getElementById('igPackSortMode');
    const targetCodes = (completedOnlyEl && completedOnlyEl.checked)
      ? codes.filter(c => interviewState[c] && interviewState[c].done)
      : codes;
    downloadInterviewPack(auditorFilterEl2 ? auditorFilterEl2.value : '', targetCodes, sortModeEl ? sortModeEl.value : 'domain');
  });
  const exportPacketBtn = document.getElementById('igExportPacketBtn');
  if(exportPacketBtn) exportPacketBtn.addEventListener('click', exportInterviewPacket);
  const assignExportBtn = document.getElementById('igAssignExportBtn');
  if(assignExportBtn) assignExportBtn.addEventListener('click', exportAssignedPacketsByAuditor);
  const importPacketBtn = document.getElementById('igImportPacketBtn');
  const packetFileInput = document.getElementById('igPacketFileInput');
  if(importPacketBtn && packetFileInput){
    importPacketBtn.addEventListener('click', () => packetFileInput.click());
    packetFileInput.addEventListener('change', (e) => {
      if(e.target.files && e.target.files[0]) handleInterviewPacketFile(e.target.files[0]);
      e.target.value = '';
    });
  }
  const flowXlsxExportBtn = document.getElementById('igFlowXlsxExportBtn');
  if(flowXlsxExportBtn) flowXlsxExportBtn.addEventListener('click', () => downloadFlowSpecXlsx(codes));
  const flowXlsxImportBtn = document.getElementById('igFlowXlsxImportBtn');
  const flowXlsxFileInput = document.getElementById('igFlowXlsxFileInput');
  if(flowXlsxImportBtn && flowXlsxFileInput){
    flowXlsxImportBtn.addEventListener('click', () => flowXlsxFileInput.click());
    flowXlsxFileInput.addEventListener('change', (e) => {
      if(e.target.files && e.target.files[0]) handleFlowSpecXlsxFile(e.target.files[0]);
      e.target.value = '';
    });
  }
  const aiPromptBtn = document.getElementById('igAiPromptBtn');
  const aiPromptDomainSelect = document.getElementById('igAiPromptDomainSelect');
  const aiPromptItemSelect = document.getElementById('igAiPromptItemSelect');
  if(aiPromptDomainSelect && aiPromptItemSelect){
    aiPromptDomainSelect.addEventListener('change', () => {
      // 도메인을 바꾸면 항목 목록도 그 도메인 것으로 다시 채우고, "전체 항목"으로 리셋한다.
      aiPromptItemSelect.innerHTML = igAiPromptItemOptionsHtml(aiPromptDomainSelect.value, '');
    });
  }
  if(aiPromptBtn && aiPromptDomainSelect) aiPromptBtn.addEventListener('click', () => igOpenAiToolsWindow(aiPromptDomainSelect.value, aiPromptItemSelect ? aiPromptItemSelect.value : ''));
  const guideBundleExportBtn = document.getElementById('igGuideBundleExportBtn');
  if(guideBundleExportBtn) guideBundleExportBtn.addEventListener('click', exportInterviewGuideBundle);
  const guideBundleImportBtn = document.getElementById('igGuideBundleImportBtn');
  const guideBundleFileInput = document.getElementById('igGuideBundleFileInput');
  if(guideBundleImportBtn && guideBundleFileInput){
    guideBundleImportBtn.addEventListener('click', () => guideBundleFileInput.click());
    guideBundleFileInput.addEventListener('change', (e) => {
      if(e.target.files && e.target.files[0]) importInterviewGuideBundle(e.target.files[0]);
      e.target.value = '';
    });
  }
  const auditorFilterEl = document.getElementById('igAuditorFilter');
  if(auditorFilterEl){
    auditorFilterEl.addEventListener('change', () => {
      const val = auditorFilterEl.value;
      container.querySelectorAll('.ig-card').forEach(card => {
        card.style.display = (!val || card.dataset.igInterviewer === val) ? '' : 'none';
      });
      container.querySelectorAll('.ig-domain-group').forEach(group => {
        const anyVisible = Array.from(group.querySelectorAll('.ig-card')).some(card => card.style.display !== 'none');
        group.style.display = anyVisible ? '' : 'none';
      });
    });
  }
  const noContextOnlyEl = document.getElementById('igNoContextOnly');
  if(noContextOnlyEl){
    noContextOnlyEl.addEventListener('change', () => {
      const onlyNoCtx = noContextOnlyEl.checked;
      container.querySelectorAll('.ig-card').forEach(card => {
        if(onlyNoCtx && card.dataset.igNoctx !== '1') card.style.display = 'none';
        else if(!onlyNoCtx){
          // 다른 필터(진행 감사자 등)와 충돌하지 않도록, 여기서는 숨기기만 하고 되돌릴 때는
          // 진행 감사자 필터가 다시 계산해줄 수 있도록 일단 보이는 상태로 되돌린다.
          card.style.display = '';
        }
      });
      // 진행 감사자 필터가 걸려 있다면 그 조건도 함께 적용되도록 다시 실행한다.
      if(auditorFilterEl && auditorFilterEl.value){
        container.querySelectorAll('.ig-card').forEach(card => {
          if(card.dataset.igInterviewer !== auditorFilterEl.value) card.style.display = 'none';
        });
      }
      container.querySelectorAll('.ig-domain-group').forEach(group => {
        const anyVisible = Array.from(group.querySelectorAll('.ig-card')).some(card => card.style.display !== 'none');
        group.style.display = anyVisible ? '' : 'none';
      });
    });
  }
  const domainFilterEl = document.getElementById('igDomainFilter');
  if(domainFilterEl){
    domainFilterEl.addEventListener('change', () => {
      setIgDomainFilter(domainFilterEl.value);
      renderInterviewGuide();
    });
  }
  const groupModeEl = document.getElementById('igPackSortMode');
  if(groupModeEl){
    groupModeEl.addEventListener('change', () => {
      setIgGroupMode(groupModeEl.value);
      renderInterviewGuide();
    });
  }
  wireIgModeToggle();
  wireIgEditForms(container);
  } catch(igRenderErr){
    // [v8.26] 이 함수 어디서든(카드 하나 처리 실패로 위에서 이미 막은 것 이외의 예외 포함) 오류가
    // 나면, 예전에는 화면이 이전 상태(보통 "아직 취합된 응답이 없습니다" 빈 화면) 그대로 멈춰버리고
    // 툴바 버튼(백업/복원 포함)에 이벤트가 하나도 안 걸려 버튼을 눌러도 반응이 없는 것처럼 보였다.
    // 최소한 무엇이 문제인지 화면에 바로 보여주고, 모드 전환만이라도 계속 쓸 수 있게 한다.
    console.error('renderInterviewGuide 오류:', igRenderErr);
    toolbarWrap.innerHTML = modeToggleHtml;
    container.innerHTML = '<div class="ig-empty" style="border:2px solid var(--risk-hi);background:var(--risk-hi-bg);text-align:left;padding:16px 18px;">'
      + '<b style="color:var(--risk-hi);">⚠ 인터뷰 가이드 화면을 그리는 중 오류가 발생했습니다.</b>'
      + '<div style="font-size:12px;color:var(--ink);margin-top:8px;">오류 내용: ' + esc(igRenderErr && igRenderErr.message ? igRenderErr.message : String(igRenderErr)) + '</div>'
      + '<div style="font-size:11.5px;color:var(--ink-soft);margin-top:10px;line-height:1.6;">저장된 편집 내용(순서도·질문·발견사항 등) 중 일부가 손상되었을 수 있습니다. 브라우저 개발자 도구(F12) 콘솔 탭에 자세한 오류가 기록되어 있으니, 이 화면을 캡처해 전달해 주시면 원인을 확인할 수 있습니다.</div>'
    + '</div>';
    wireIgModeToggle();
  }
}

export function wireIgModeToggle(){
  document.querySelectorAll('.ig-mode-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      setIgViewMode(btn.dataset.mode);
      renderInterviewGuide();
    });
  });
  const manualRefreshBtn = document.getElementById('igManualRefreshBtn');
  if(manualRefreshBtn){
    manualRefreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderInterviewGuide();
    });
  }
}

export function igReadEditForm(form){
  const splitLines = (v) => v.split('\n').map(s => s.trim()).filter(Boolean);
  return {
    decisionQ: form.querySelector('.ige-decisionQ').value.trim(),
    verify: splitLines(form.querySelector('.ige-verify').value),
    verifyEnd: form.querySelector('.ige-verifyEnd').value.trim(),
    partial: splitLines(form.querySelector('.ige-partial').value),
    partialEnd: form.querySelector('.ige-partialEnd').value.trim(),
    rootcause: splitLines(form.querySelector('.ige-rootcause').value),
    rootcauseEnd: form.querySelector('.ige-rootcauseEnd').value.trim(),
    na: splitLines(form.querySelector('.ige-na').value),
    naEnd: form.querySelector('.ige-naEnd').value.trim(),
  };
}

export function wireIgEditForms(container){
  const closeFormWithConfirm = (form) => {
    if(form.dataset.dirty === '1'){
      if(!confirm('저장하지 않은 수정 내용이 있습니다. 저장하지 않고 닫으면 방금 고친 내용은 사라집니다.\n\n그래도 닫을까요? ([취소]를 누르면 계속 편집할 수 있습니다)')) return false;
    }
    form.style.display = 'none';
    form.dataset.dirty = '0';
    return true;
  };

  container.querySelectorAll('.ig-goto-finding-btn').forEach(btn => {
    btn.addEventListener('click', () => scrollToFindingCard(btn.dataset.code));
  });

  container.querySelectorAll('.ig-add-finding-btn').forEach(btn => {
    btn.addEventListener('click', () => registerFindingFromInterviewCode(btn.dataset.code));
  });

  container.querySelectorAll('.ig-edit-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      const form = container.querySelector('.ig-edit-form[data-code="' + CSS.escape(code) + '"]');
      if(!form) return;
      if(form.style.display === 'none'){
        form.style.display = 'block';
      } else {
        closeFormWithConfirm(form);
      }
    });
  });
  // v8.12 — ②순서도·③분기형 편집 패널: 토글 버튼은 igfTogglePanel이 열고/닫고, 카드가 통째로
  // 다시 그려질 때(igRenderCard) 이미 열려 있던 패널은 내용까지 함께 렌더되어 들어오므로
  // 여기서는 그 안의 입력요소에 이벤트만 다시 걸어주면 된다.
  container.querySelectorAll('.igf-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => igfTogglePanel(btn.dataset.code));
  });
  container.querySelectorAll('.igf-edit-form').forEach(panel => {
    const code = panel.dataset.code;
    if(igfOpenCodes.has(code) && panel.innerHTML.trim() !== ''){
      igfWirePanel(code, panel);
    }
  });
  container.querySelectorAll('.ig-edit-form').forEach(form => {
    form.querySelectorAll('textarea').forEach(ta => {
      ta.addEventListener('input', () => { form.dataset.dirty = '1'; });
    });
  });
  container.querySelectorAll('.ig-edit-save-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      const form = container.querySelector('.ig-edit-form[data-code="' + CSS.escape(code) + '"]');
      if(!form) return;
      scriptOverrides[code] = igReadEditForm(form);
      saveScriptOverrides();
      form.dataset.dirty = '0';
      const flash = container.querySelector('.ig-edit-saved-flash[data-code="' + CSS.escape(code) + '"]');
      if(flash){
        flash.style.display = 'inline';
        setTimeout(() => { flash.style.display = 'none'; }, 2500);
      }
      // 카드 상단의 "✏ 감사역 편집됨" 배지·질문 미리보기는 즉시 갱신하되, 방금 연 편집창은 그대로 열어둔다
      // (전체 재렌더링을 하면 편집 폼이 닫혀버려 "저장했는데 왜 닫히지" 하는 혼란이 또 생기므로).
      const card = container.querySelector('.ig-card[data-ig-code="' + CSS.escape(code) + '"]');
      if(card){
        const titleEl = card.querySelector('.ig-card-title');
        if(titleEl && !titleEl.querySelector('.ig-edited-badge')){
          titleEl.insertAdjacentHTML('beforeend', ' <span class="ig-edited-badge">✏ 감사역 편집됨</span>');
        }
        // 저장 직후 실제로 눈에 보이는 확인질문·4갈래 분기 질문·종결판단까지 전부 다시 그린다.
        // (예전에는 카드 제목·확인질문만 갱신하고 분기 질문 본문은 그대로 남아있어서,
        //  "저장했는데 반응이 없다"는 오해를 일으켰다 — 실제로는 저장은 됐지만 화면만 안 바뀐 것.)
        const savedScript = scriptOverrides[code];
        const bodyEl = card.querySelector('.ig-body');
        if(bodyEl && savedScript){
          const stats2 = igComputeStats(code);
          const rec2 = igBranchClass(stats2);
          const recClass2 = (name) => rec2 === name ? ' recommend' : '';
          const branchHtml2 = (cls, icon, label, questions, endText) =>
            '<div class="ig-branch ' + cls + recClass2(cls) + '">'
              + '<div class="ig-branch-head">' + icon + ' ' + label + '<span class="ig-rec-badge">📍 응답 결과상 이 질문으로 진행하세요</span></div>'
              + igStepsHtml(questions)
              + '<div class="ig-end">→ ' + endText + '</div>'
            + '</div>';
          // v6.76 — 카드 구조가 "확인질문+편집버튼" / "분기 접기 토글" / "4갈래 분기"로 나뉜 뒤에도,
          // 저장 직후 다시 그리는 이 부분이 예전 구조(편집버튼·접기 없이 통짜로) 그대로 남아있으면
          // 저장할 때마다 방금 펼쳐둔 분기가 다시 4개 전부 펼쳐진 것처럼 보이는 불일치가 생긴다.
          // 최신 렌더링과 똑같이 분기 접기 상태(igForkExpandedCodes)를 그대로 반영해 다시 그린다.
          const hasRec2 = rec2 !== 'unknown';
          const forkExpanded2 = !hasRec2 || igForkExpandedCodes.has(code);
          const forkToggleRow2 = hasRec2
            ? ('<div class="ig-fork-toggle-row"><button class="ig-fork-toggle-btn" type="button" onclick="igToggleForkExpand(this, \'' + code + '\')">'
                + (forkExpanded2 ? '▲ 추천 분기만 보기' : '▸ 다른 분기도 보기 (전체 4가지 시나리오)') + '</button></div>')
            : '';
          bodyEl.innerHTML = '<div class="ig-decision-row">'
              + '<div class="ig-decision">' + savedScript.decisionQ + '</div>'
              + '<button class="ig-edit-toggle-btn ig-edit-toggle-inline" data-code="' + code + '" type="button">✏ 질문 편집</button>'
            + '</div>'
            + '<div class="ig-arrow-down"></div>'
            + forkToggleRow2
            + '<div class="ig-fork' + (forkExpanded2 ? '' : ' ig-fork-collapsed') + '">'
              + branchHtml2('yes', '✅', 'YES·검증형', savedScript.verify, savedScript.verifyEnd)
              + branchHtml2('partial', '🟡', '부분이행·경계확인형', savedScript.partial, savedScript.partialEnd)
              + branchHtml2('no', '🚩', 'NO·원인규명형', savedScript.rootcause, savedScript.rootcauseEnd)
              + branchHtml2('na', '⬜', 'N/A·타당성확인형', savedScript.na, savedScript.naEnd)
            + '</div>';
          // 새로 그려진 확인질문 옆 "✏ 질문 편집" 버튼과 "다른 분기도 보기" 버튼도 다시 이벤트를 걸어준다
          // (innerHTML 교체로 기존에 걸려 있던 리스너가 사라지므로).
          const newEditBtn = bodyEl.querySelector('.ig-edit-toggle-inline[data-code="' + CSS.escape(code) + '"]');
          if(newEditBtn){
            newEditBtn.addEventListener('click', () => {
              const editForm = container.querySelector('.ig-edit-form[data-code="' + CSS.escape(code) + '"]');
              if(!editForm) return;
              if(editForm.style.display === 'none'){ editForm.style.display = 'block'; }
              else { closeFormWithConfirm(editForm); }
            });
          }
        }
      }
    });
  });
  container.querySelectorAll('.ig-edit-reset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      if(!confirm('"' + code + '" 항목의 질문을 편집 전 기본값으로 되돌립니다. 계속할까요?')) return;
      delete scriptOverrides[code];
      saveScriptOverrides();
      renderInterviewGuide();
    });
  });
  container.querySelectorAll('.ig-edit-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      const form = container.querySelector('.ig-edit-form[data-code="' + CSS.escape(code) + '"]');
      if(form) closeFormWithConfirm(form);
    });
  });
}

export function igUpdateDoneCount(){
  const el = document.getElementById('igDoneCount');
  if(!el) return;
  el.textContent = Object.values(interviewState).filter(s => s.done).length;
}

export function exportInterviewPacket(){
  const exporter = getCurrentAuditor() || '(이름 미설정)';
  const payload = {
    exportedBy: exporter,
    exportedAt: kstISOString(),
    interviewState: interviewState,
    customInterviewItems: customInterviewItems
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const namePart = exporter.replace(/[\\/:*?"<>|\s]+/g,'_');
  a.href = url; a.download = 'IT감사_인터뷰기록_' + namePart + (typeof versionSuffix === 'function' ? versionSuffix() : '') + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function mergeInterviewPacket(imported){
  const importedBy = imported.exportedBy || '(이름 미상)';
  const importedState = imported.interviewState || {};
  let addedCount = 0, mergedCount = 0, sameCount = 0, skippedEmptyCount = 0;
  const mergeLog = [];

  function isSubstantive(rec){
    if(!rec) return false;
    return !!(rec.done || (rec.deptDone && Object.values(rec.deptDone).some(Boolean)) || (rec.note && rec.note.trim()) || rec.interviewee || rec.interviewedAt || rec.location
      || (rec.interviewer && !rec.interviewerAutoFilled));
  }

  Object.keys(importedState).forEach(code => {
    const inc = importedState[code];
    // 아직 아무 작업도 안 한 항목(자동 채움 이름 외에 실제 내용이 없는 항목)은 "그 감사역이
    // 실제로 작업한 게 아니므로" 병합 대상에서 제외한다. 이걸 빼먹으면 렌더링 시점에
    // 자동으로 깔린 이름값 때문에 손도 안 댄 항목까지 "다른 기록"으로 오인해 계속 끼어든다.
    if(!isSubstantive(inc)){ skippedEmptyCount++; return; }

    const cur = interviewState[code];

    if(!cur || (!cur.done && !cur.note && !cur.interviewer && !cur.interviewee && !(cur.deptDone && Object.values(cur.deptDone).some(Boolean)))){
      interviewState[code] = Object.assign({}, inc);
      igRecomputeMultiDeptDone(code);
      addedCount++;
      return;
    }

    const same = cur.done === inc.done && (cur.note||'') === (inc.note||'') && (cur.interviewer||'') === (inc.interviewer||'')
      && JSON.stringify(cur.deptDone||{}) === JSON.stringify(inc.deptDone||{});
    if(same){ sameCount++; return; }

    const curLabel = cur.interviewer || '(로컬)';
    const incLabel = inc.interviewer || importedBy;
    let combinedNote = cur.note || '';
    // 같은 내용을 두 번 이어붙이지 않도록(같은 파일을 실수로 다시 불러온 경우 대비) 이미
    // 포함되어 있는 내용이면 건너뛴다.
    if(inc.note && inc.note.trim() && !combinedNote.includes(inc.note.trim())){
      combinedNote = (combinedNote ? combinedNote + '\n\n' : '')
        + '--- [' + incLabel + ' · 가져온 기록] ---\n' + inc.note;
    }
    const mergedInterviewer = (cur.interviewer && inc.interviewer && cur.interviewer !== inc.interviewer
        && !cur.interviewer.split(', ').includes(inc.interviewer))
      ? (cur.interviewer + ', ' + inc.interviewer)
      : (cur.interviewer || inc.interviewer);
    // [v8.34] 응답 부서가 여러 곳인 항목은 각자 담당한 부서만 체크했을 가능성이 높으므로,
    // done을 그냥 OR로 합치면(예전 방식) 한쪽 부서만 끝났는데도 전체가 "완료"로 잘못 표시되는
    // 문제가 있었다. deptDone을 두 기록의 합집합(둘 중 하나라도 완료 표시했으면 완료)으로 합친
    // 뒤, 응답 부서가 여럿이면 "그 부서 전부"가 완료됐을 때만 done을 true로 다시 계산한다.
    const mergedDeptDone = Object.assign({}, cur.deptDone || {}, inc.deptDone || {});
    interviewState[code] = Object.assign({}, cur, {
      note: combinedNote,
      done: cur.done || inc.done,
      deptDone: mergedDeptDone,
      interviewer: mergedInterviewer,
      interviewerAutoFilled: false
    });
    igRecomputeMultiDeptDone(code);
    mergeLog.push(code + ' (' + curLabel + ' + ' + incLabel + ')');
    mergedCount++;
  });

  const importedCustom = imported.customInterviewItems || [];
  let customAdded = 0;
  importedCustom.forEach(item => {
    if(!customInterviewItems.some(it => it.id === item.id)){
      customInterviewItems.push(item);
      customAdded++;
    }
  });

  saveInterviewState();
  saveCustomInterviewItems();
  return {addedCount, mergedCount, sameCount, skippedEmptyCount, customAdded, mergeLog, importedBy};
}

export function handleInterviewPacketFile(file){
  const reader = new FileReader();
  reader.onload = (e) => {
    let imported;
    try { imported = JSON.parse(e.target.result); }
    catch(err){ alert('JSON 파일을 읽지 못했습니다: ' + err.message); return; }
    if(!imported.interviewState){ alert('올바른 인터뷰 기록 파일이 아닙니다. (📤 인터뷰 기록 내보내기로 만든 파일을 선택해 주세요)'); return; }

    const importedCount = Object.keys(imported.interviewState).length;
    if(!confirm('"' + (imported.exportedBy || '(이름 미상)') + '" 감사역이 내보낸 인터뷰 기록(' + importedCount + '건)을 지금 화면과 합칩니다.\n\n같은 항목에 서로 다른 기록이 있으면 둘 다 보존하고 라벨을 붙여 이어붙입니다(자동으로 한쪽을 지우지 않습니다). 계속할까요?')) return;

    const result = mergeInterviewPacket(imported);
    renderInterviewGuide();
    renderCustomInterviewSection();
    alert('병합 완료\n\n· 새로 추가됨: ' + result.addedCount + '건\n· 겹쳐서 이어붙임: ' + result.mergedCount + '건\n· 완전히 동일해서 그대로 둠: ' + result.sameCount + '건\n· 아직 작업 안 한 항목이라 건너뜀: ' + result.skippedEmptyCount + '건\n· 별도 인터뷰 항목 추가: ' + result.customAdded + '건'
      + (result.mergeLog.length ? ('\n\n이어붙인 항목: ' + result.mergeLog.slice(0,10).join(', ') + (result.mergeLog.length > 10 ? ' 외 ' + (result.mergeLog.length-10) + '건' : '')) : ''));
  };
  reader.readAsText(file);
}

export function downloadInterviewCSV(){
  const header = ['도메인','항목코드','항목명','관련법령','이행응답수','부분이행응답수','미흡응답수','해당없음수','권장분기','자동생성여부','인터뷰완료','인터뷰완료(부서별)','진행 감사자','면담자(수검자)','관련 담당자(설문응답)','인터뷰일시','장소','제출예정증빙(부서별)','증빙확인상태','인터뷰메모'];
  const EVID_LABEL = {received_ok:'수령·확인됨(적절)', received_issue:'수령·미흡·보완필요', not_received:'미제출·미수령', '':'(미확인)'};
  const rows = [header];
  const RECLABEL = {yes:'검증형(YES)', partial:'부분이행형', no:'원인규명형(NO)', na:'N/A타당성확인형', unknown:'미집계'};
  const codeSet = new Set(aggRows.map(r => r.code).filter(Boolean));
  const codes = Array.from(codeSet).sort((a,b) => {
    const [ad, an] = a.split('-'); const [bd, bn] = b.split('-');
    if(ad !== bd) return ad.localeCompare(bd);
    return Number(an) - Number(bn);
  });
  codes.forEach(code => {
    const meta = igItemMeta(code);
    const script = igGetScript(code);
    const stats = igComputeStats(code);
    const rec = igBranchClass(stats);
    const st = interviewState[code] || {done:false, note:'', interviewee:'', interviewer:'', interviewedAt:'', location:'', evidenceStatus:''};
    const evidenceSummary = igEvidenceList(code).map(g => g.dept + ':' + g.items.join('·')).join(' / ');
    // 응답 부서가 2개 이상인 항목은 부서별 완료 여부를 별도 칸에 "부서명:완료/미완료" 형태로 펼쳐,
    // 전체 완료(Y/N) 칸만으로는 안 보이던 "어느 부서가 아직 안 끝났는지"를 그대로 확인할 수 있게 한다.
    const respondentDepts = igOwnerDepts(code);
    const deptDoneSummary = respondentDepts.length > 1
      ? respondentDepts.map(d => d + ':' + ((st.deptDone && st.deptDone[d]) ? '완료' : '미완료')).join(' / ')
      : '';
    // [v8.38] 진행 감사자·면담자·일시·장소·증빙확인상태·메모는 팀이 여럿인 항목이면 팀별로 따로
    // 저장되므로(deptMeta), CSV에도 "부서명:값" 형태로 팀별로 펼쳐서 담아야 실제 기록과 일치한다.
    const byTeamField = (field) => {
      if(respondentDepts.length <= 1) return st[field] || '';
      return respondentDepts.map(d => {
        const m = (st.deptMeta && st.deptMeta[d]) || {};
        return m[field] ? (d + ':' + m[field]) : '';
      }).filter(Boolean).join(' / ');
    };
    rows.push([
      code.split('-')[0], code, meta.title, (meta.law||'').replace(/\n/g,' / '),
      stats.yes, stats.partial, stats.no, stats.na,
      RECLABEL[rec] || '미집계',
      (script && script._generic) ? 'Y(자동생성)' : 'N(수기작성)',
      st.done ? 'Y' : 'N',
      deptDoneSummary,
      byTeamField('interviewer'),
      byTeamField('interviewee'),
      igOwnerPersons(code).join(' / '),
      byTeamField('interviewedAt'),
      byTeamField('location'),
      evidenceSummary,
      respondentDepts.length > 1
        ? respondentDepts.map(d => { const m = (st.deptMeta && st.deptMeta[d]) || {}; return m.evidenceStatus ? (d + ':' + (EVID_LABEL[m.evidenceStatus] || '')) : ''; }).filter(Boolean).join(' / ')
        : (EVID_LABEL[st.evidenceStatus || ''] || ''),
      respondentDepts.length > 1
        ? respondentDepts.map(d => { const m = (st.deptMeta && st.deptMeta[d]) || {}; return m.note ? (d + ':' + m.note.replace(/\n/g,' ')) : ''; }).filter(Boolean).join(' / ')
        : (st.note || '').replace(/\n/g,' ')
    ]);
  });
  customInterviewItems.forEach(item => {
    const st = interviewState[item.id] || {done:false, note:'', interviewee:'', interviewer:'', interviewedAt:'', location:'', evidenceStatus:''};
    rows.push([
      '(별도)', item.id, item.title, item.background||'',
      '', '', '', '', '', '해당없음(자유양식)',
      st.done ? 'Y' : 'N',
      '',
      st.interviewer || '', st.interviewee || '', '',
      st.interviewedAt || '', st.location || '', '', '',
      (st.note || '').replace(/\n/g,' ')
    ]);
  });
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IT외주용역감사_인터뷰기록' + (typeof versionSuffix === 'function' ? versionSuffix() : '') + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildInterviewPackHtml(filterAuditor, allCodes, sortMode){
  sortMode = sortMode || 'domain';
  const codes = filterAuditor
    ? allCodes.filter(c => { const st = interviewState[c]; return st && st.interviewer === filterAuditor; })
    : allCodes.slice();

  const RECLABEL = {yes:'✅ 검증형(YES)', partial:'🟡 부분이행형', no:'🚩 원인규명형(NO)', na:'⬜ N/A타당성확인형', unknown:'미집계'};
  let counts = {yes:0, partial:0, no:0, na:0, unknown:0, done:0};

  // [수정] 예전에는 항상 영역(도메인) 순으로만 묶였는데, "담당 감사역별로·위험도별로도 정렬해서
  // 보고 싶다"는 요청에 따라 정렬 기준을 고를 수 있게 일반화했다. byDomain/domainOrder라는 이름은
  // 그대로 두되(아래 카드 본문·좌측 바로가기 두 곳이 이 두 변수만 참조하므로), 실제로는
  // "영역"이 아니라 정렬 기준에 따른 그룹을 담는다.
  const RISK_ORDER = ['상','중','하'];
  const personPriority = {}; // gKey -> {hiBad, bad} — 'person' 모드에서만 채워지며, 라벨에도 그대로 노출
  function igPackGroupKey(code){
    if(sortMode === 'risk'){
      const item = igFindItem(code);
      return item ? (item.risk || '중') : '중';
    }
    if(sortMode === 'interviewer'){
      const st = interviewState[code];
      return (st && st.interviewer) ? st.interviewer : '(담당 미지정)';
    }
    return code.split('-')[0];
  }
  function igPackGroupLabel(key){
    if(sortMode === 'risk') return '🚩 위험도: ' + esc2(key);
    if(sortMode === 'interviewer') return '👤 담당 감사역: ' + esc2(key);
    if(sortMode === 'person'){
      const parts = key.split('|||');
      const p = personPriority[key] || {hiBad:0, bad:0};
      const flag = p.hiBad > 0 ? (' · 🚩 위험도 상 미흡 ' + p.hiBad + '건') : (p.bad > 0 ? (' · 미흡 ' + p.bad + '건') : '');
      return '👤 인터뷰 대상자: ' + esc2(parts[0]) + ' · ' + esc2(parts[1]) + flag;
    }
    const domItem = igFindDomain(key);
    return 'D-' + esc2(key) + (domItem ? ' ' + esc2(domItem.title) : '');
  }

  // "인터뷰 대상자별" 모드는 항목(code) 1개가 여러 사람(여러 부서·작성자)의 응답을 담고 있을 수 있어
  // 다른 모드처럼 code당 그룹 1개로 단순 매핑할 수 없다. 그래서 이 모드만 별도로,
  // "인터뷰 대상자 현황"(byTarget) 표와 동일한 (부서|||작성자) 키 규칙을 그대로 재사용해
  // 그 사람이 실제로 응답을 남긴 모든 항목을 그 사람의 그룹에 채운다(같은 항목이 여러 사람
  // 그룹에 중복으로 들어갈 수 있음 — 인터뷰 현장에서는 "그 사람에게 물어볼 목록"이 우선이므로 의도된 동작).
  const byDomain = {};
  const domainOrder = [];
  if(sortMode === 'person'){
    const codeSet2 = new Set(codes);
    aggRows.forEach(r => {
      if(!codeSet2.has(r.code)) return;
      const gKey = (r.dept || '(부서 미입력)') + '|||' + (r.author || '(작성자 미입력)');
      if(!byDomain[gKey]){ byDomain[gKey] = []; domainOrder.push(gKey); personPriority[gKey] = {hiBad:0, bad:0}; }
      if(!byDomain[gKey].includes(r.code)) byDomain[gKey].push(r.code);
      const c = igClassifyRow(r);
      if(c === 'no'){
        personPriority[gKey].bad++;
        if(r.risk === '상') personPriority[gKey].hiBad++;
      }
    });
    // 위험도 상 미흡 건수가 많은 사람부터, 그다음 전체 미흡 건수 순 — "인터뷰 대상자 현황" 표의
    // 우선순위 정렬(hiBad desc, bad desc)과 동일한 기준을 인터뷰 팩에도 그대로 적용한다.
    domainOrder.sort((a,b) => personPriority[b].hiBad - personPriority[a].hiBad || personPriority[b].bad - personPriority[a].bad || a.localeCompare(b));
  } else {
    codes.forEach(c => {
      const gKey = igPackGroupKey(c);
      if(!byDomain[gKey]){ byDomain[gKey] = []; domainOrder.push(gKey); }
      byDomain[gKey].push(c);
    });
    if(sortMode === 'risk'){
      domainOrder.sort((a,b) => RISK_ORDER.indexOf(a) - RISK_ORDER.indexOf(b));
    } else {
      domainOrder.sort();
    }
  }

  let cardsHtml = '';
  domainOrder.forEach(domCode => {
    cardsHtml += '<div class="pack-domain-head">' + igPackGroupLabel(domCode) + '</div>';
    byDomain[domCode].sort((a,b) => Number(a.split('-')[1]) - Number(b.split('-')[1])).forEach(code => {
      const script = igGetScript(code);
      if(!script) return;
      const meta = igItemMeta(code);
      const stats = igComputeStats(code);
      const rec = igBranchClass(stats);
      counts[rec] = (counts[rec] || 0) + 1;
      const st = interviewState[code] || {done:false, note:'', interviewee:'', interviewer:'', interviewedAt:'', location:'', evidenceStatus:''};
      if(st.done) counts.done++;
      const ownerPersons = igOwnerPersons(code);
      const evidenceByDept = igEvidenceList(code);
      const EVID_LABEL = {received_ok:'✅ 수령·확인됨(적절)', received_issue:'⚠ 수령·미흡·보완필요', not_received:'🚫 미제출·미수령', '':'⏳ 미확인'};

      const branchHtml = (icon, label, questions, endText, active) =>
        '<div class="pack-branch' + (active ? ' pack-branch-active' : '') + '">'
          + '<div class="pack-branch-head">' + icon + ' ' + label + (active ? ' <span class="pack-rec">← 권장</span>' : '') + '</div>'
          + (questions || []).map((q,i) => '<div class="pack-q">Q' + (i+1) + '. ' + esc2(q) + '</div>').join('')
          + '<div class="pack-end">→ ' + esc2(endText) + '</div>'
        + '</div>';

      const respRows = itemLevelRows().filter(r => r.code === code);
      const respDetailHtml = respRows.length === 0 ? '' : (
        '<table class="pack-resp-tbl">'
          + '<colgroup><col style="width:13%"><col style="width:11%"><col style="width:11%"><col style="width:24%"><col style="width:11%"><col style="width:30%"></colgroup>'
          + '<tr><th>제출 부서</th><th>작성자</th><th>담당여부</th><th>지목 담당부서/담당자</th><th>업무숙지도</th><th>자체평가</th></tr>'
          + respRows.map(r =>
              '<tr><td>' + esc2(r.dept) + '</td><td>' + esc2(r.author||'-') + '</td><td>' + esc2(r.own||'-') + '</td>'
              + '<td class="prt-wrap">' + esc2([r.ownDept, r.ownPerson].filter(Boolean).join(' / ') || '-') + '</td>'
              + '<td>' + esc2(r.fam||'-') + '</td><td class="prt-wrap">' + esc2(r.sr||'-') + (r.srNote ? ' (' + esc2(r.srNote) + ')' : '') + '</td></tr>'
            ).join('')
        + '</table>'
      );

      // 체크포인트 단위 상세 — 허브 화면의 "응답 상세"와 동일한 정보를, 현장에서 인쇄해 들고 다니는
      // 이 인터뷰 팩에도 반영. 부서·작성자별로 묶어 각 체크포인트의 실제 응답(이행/부분이행/미흡/
      // 해당없음)과 비고를 그대로 보여준다. 허브 화면과 눈에 보이는 정보 수준이 어긋나지 않도록.
      const cpRows = aggRows.filter(r => r.code === code);
      const cpByGroup = {};
      const cpGroupOrder = [];
      cpRows.forEach(r => {
        const key = (r.dept||'') + '::' + (r.author||'');
        if(!cpByGroup[key]){ cpByGroup[key] = {dept:r.dept||'(부서미상)', author:r.author||'', note:r.note||'', rows:[]}; cpGroupOrder.push(key); }
        cpByGroup[key].rows.push(r);
      });
      const PACK_TIER_ICON = {good:'✅', neutral:'🟡', bad:'🚩', na:'⬜'};
      const PACK_TIER_LABEL = {good:'이행', neutral:'부분이행', bad:'미흡', na:'해당없음'};
      const cpDetailHtml = cpRows.length === 0 ? '' : (
        '<div class="pack-cp-detail">'
        + cpGroupOrder.map(key => {
            const g = cpByGroup[key];
            return '<div class="pack-cp-group"><div class="pack-cp-group-head">' + esc2(g.dept) + (g.author ? ' · ' + esc2(g.author) : '') + '</div>'
              + (g.note ? '<div class="pack-cp-note">📝 ' + esc2(g.note) + '</div>' : '')
              + '<ul class="pack-cp-list">'
                + g.rows.map(r => {
                    const t = r.tier || 'neutral';
                    return '<li class="pack-cp-item"><span class="pack-cp-badge ' + t + '">' + (PACK_TIER_ICON[t]||'') + ' ' + (PACK_TIER_LABEL[t]||r.resp||'') + '</span>' + esc2(r.cptext||'') + '</li>';
                  }).join('')
              + '</ul></div>';
          }).join('')
        + '</div>'
      );


      cardsHtml += '<div class="pack-card" id="pack-item-' + esc2(code) + '">'
        + '<div class="pack-card-head">'
          + '<span class="pack-code">' + esc2(code) + '</span>'
          + '<span class="pack-title">' + esc2(meta.title) + '</span>'
          + '<span class="pack-tally">' + (stats.total === 0 ? '<span class="pt-pill na">집계 없음</span>' : (
              '<span class="pt-pill good">이행 ' + stats.yes + '</span>'
              + (stats.partial ? '<span class="pt-pill partial">부분이행 ' + stats.partial + '</span>' : '')
              + (stats.no ? '<span class="pt-pill bad">미흡 ' + stats.no + '</span>' : '')
              + (stats.na ? '<span class="pt-pill na">해당없음 ' + stats.na + '</span>' : '')
            )) + '</span>'
        + '</div>'
        + (meta.law ? '<div class="pack-law">' + esc2(meta.law.replace(/\n/g,' · ')) + '</div>' : '')
        + (ownerPersons.length ? '<div class="pack-hint">📇 관련 담당자: ' + esc2(ownerPersons.join(', ')) + '</div>' : '')
        + (evidenceByDept.length ? '<div class="pack-hint">📎 제출 예정 증빙: ' + evidenceByDept.map(g => esc2(g.dept) + '(' + g.items.map(esc2).join(', ') + ')').join(' · ') + '</div>' : '')
        + (respDetailHtml ? ('<div class="pack-resp-head">📋 설문 응답 상세</div>' + respDetailHtml) : '')
        + (cpDetailHtml ? ('<div class="pack-resp-head">🔍 체크포인트별 실제 응답</div>' + cpDetailHtml) : '')
        + '<div class="pack-decision">' + esc2(script.decisionQ) + '</div>'
        + '<div class="pack-branches">'
          + branchHtml('✅', 'YES·검증형', script.verify, script.verifyEnd, rec === 'yes')
          + branchHtml('🟡', '부분이행·경계확인형', script.partial, script.partialEnd, rec === 'partial')
          + branchHtml('🚩', 'NO·원인규명형', script.rootcause, script.rootcauseEnd, rec === 'no')
          + branchHtml('⬜', 'N/A·타당성확인형', script.na, script.naEnd, rec === 'na')
        + '</div>'
        + '<div class="pack-record">'
          + '<div class="pack-record-row"><span>진행 감사자</span><b>' + esc2(st.interviewer || '__________') + '</b></div>'
          + '<div class="pack-record-row"><span>면담자(수검자)</span><b>' + esc2(st.interviewee || '__________') + '</b></div>'
          + '<div class="pack-record-row"><span>일시·장소</span><b>' + esc2((st.interviewedAt || '____-__-__ __:__') + (st.location ? ' · ' + esc2(st.location) : '')) + '</b></div>'
          + '<div class="pack-record-row"><span>증빙 확인</span><b>' + esc2(EVID_LABEL[st.evidenceStatus || '']) + '</b></div>'
          + '<div class="pack-record-note"><span>메모</span><div class="pack-note-box">' + esc2(st.note || '') + '</div></div>'
        + '</div>'
      + '</div>';
    });
  });

  const totalItems = codes.length;
  const relevantCustomItems = customInterviewItems.filter(item => {
    if(!filterAuditor) return true;
    const st = interviewState[item.id];
    return st && st.interviewer === filterAuditor;
  });
  if(relevantCustomItems.length > 0){
    cardsHtml += '<div class="pack-domain-head">🆕 체크리스트 외 별도 인터뷰 항목</div>';
    relevantCustomItems.forEach(item => {
      const st = interviewState[item.id] || {done:false, note:'', interviewee:'', interviewer:'', interviewedAt:'', location:'', evidenceStatus:''};
      if(st.done) counts.done++;
      cardsHtml += '<div class="pack-card" id="pack-item-' + esc2(item.id) + '">'
        + '<div class="pack-card-head">'
          + '<span class="pack-code">CUSTOM</span>'
          + '<span class="pack-title">' + esc2(item.title) + '</span>'
        + '</div>'
        + (item.background ? '<div class="pack-law">' + esc2(item.background) + '</div>' : '')
        + '<div class="pack-decision">확인이 필요한 사항입니다.</div>'
        + '<div class="pack-branches" style="grid-template-columns:1fr;">'
          + '<div class="pack-branch pack-branch-active"><div class="pack-branch-head">📋 확인 질문</div>'
          + (item.questions || []).map((q,i) => '<div class="pack-q">Q' + (i+1) + '. ' + esc2(q) + '</div>').join('')
          + '</div>'
        + '</div>'
        + '<div class="pack-record">'
          + '<div class="pack-record-row"><span>진행 감사자</span><b>' + esc2(st.interviewer || '__________') + '</b></div>'
          + '<div class="pack-record-row"><span>면담자(수검자)</span><b>' + esc2(st.interviewee || '__________') + '</b></div>'
          + '<div class="pack-record-row"><span>일시·장소</span><b>' + esc2((st.interviewedAt || '____-__-__ __:__') + (st.location ? ' · ' + esc2(st.location) : '')) + '</b></div>'
          + '<div class="pack-record-note"><span>메모</span><div class="pack-note-box">' + esc2(st.note || '') + '</div></div>'
        + '</div>'
      + '</div>';
    });
  }
  const totalWithCustom = totalItems + relevantCustomItems.length;
  const summaryHtml = '<table class="pack-summary-tbl">'
    + '<tr><th>대상 항목</th><th>YES(검증형)</th><th>부분이행</th><th>NO(원인규명)</th><th>N/A</th><th>인터뷰 완료</th></tr>'
    + '<tr><td>' + totalWithCustom + '개' + (relevantCustomItems.length ? (' (별도 ' + relevantCustomItems.length + '건 포함)') : '') + '</td><td>' + (counts.yes||0) + '</td><td>' + (counts.partial||0) + '</td><td>' + (counts.no||0) + '</td><td>' + (counts.na||0) + '</td><td>' + (counts.done||0) + ' / ' + totalWithCustom + '</td></tr>'
  + '</table>';

  let navHtml = '<div class="pack-nav no-print" id="packNav"><h5>바로가기</h5>';
  domainOrder.forEach(domCode => {
    navHtml += '<div class="pn-domain">' + igPackGroupLabel(domCode) + '</div>';
    byDomain[domCode].sort((a,b) => Number(a.split('-')[1]) - Number(b.split('-')[1])).forEach(code => {
      const meta = igItemMeta(code);
      navHtml += '<a class="pn-item" href="#pack-item-' + esc2(code) + '"><span class="pn-code">' + esc2(code) + '</span>' + esc2(meta.title) + '</a>';
    });
  });
  if(relevantCustomItems.length > 0){
    navHtml += '<div class="pn-domain">🆕 별도 항목</div>';
    relevantCustomItems.forEach(item => {
      navHtml += '<a class="pn-item" href="#pack-item-' + esc2(item.id) + '"><span class="pn-code">CUSTOM</span>' + esc2(item.title) + '</a>';
    });
  }
  navHtml += '</div>';

  const genDate = kstDateStr();
  const title = filterAuditor ? (filterAuditor + ' 감사자 담당 인터뷰 팩') : '전체 인터뷰 팩';

  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>' + esc2(title) + '</title><style>'
    + ':root{--navy:#132845;--navy-2:#1d3a63;--gold:#b8863b;--paper:#f6f3ec;--card:#fff;--ink:#1b2330;--ink-soft:#5a6472;--line:#dcd6c8;--good:#2e7d5b;--good-bg:#e5f2ea;--risk-hi:#a23b2e;--risk-hi-bg:#f7e6e2;--risk-mid:#b8863b;--risk-mid-bg:#f7edd9;}'
    + '*{box-sizing:border-box;}body{margin:0;background:#dcd5c4;font-family:"Pretendard","Noto Sans KR",sans-serif;color:var(--ink);}'
    + '.pack-shell{max-width:900px;margin:24px auto;background:var(--paper);box-shadow:0 10px 40px rgba(19,40,69,.25);padding-bottom:30px;}'
    + '.pack-hero{background:linear-gradient(155deg,var(--navy) 0%,var(--navy-2) 62%,#24406b 100%);color:#f4efe2;padding:30px 40px;}'
    + '.pack-hero h1{margin:0 0 6px;font-size:24px;}'
    + '.pack-hero .sub{font-size:12.5px;color:#c9d2e2;}'
    + '.pack-print-btn{position:fixed;right:20px;bottom:20px;background:var(--navy);color:#f4efe2;border:none;padding:10px 16px;border-radius:24px;cursor:pointer;font-size:12.5px;box-shadow:0 4px 14px rgba(19,40,69,.4);}'
    + '.pack-summary{padding:20px 40px;}'
    + '.pack-summary-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}'
    + '.pack-summary-tbl th,.pack-summary-tbl td{border:1px solid var(--line);padding:8px 10px;text-align:center;}'
    + '.pack-summary-tbl th{background:#f1ede1;}'
    + '.pack-domain-head{margin:26px 40px 12px;padding-bottom:8px;border-bottom:2px solid var(--navy);font-size:16px;font-weight:800;color:var(--navy);}'
    + '.pack-card{background:var(--card);border:1px solid var(--line);margin:0 40px 16px;break-inside:avoid;page-break-inside:avoid;}'
    + '.pack-card-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap;}'
    + '.pack-code{font-family:"IBM Plex Mono",monospace;font-size:12.5px;font-weight:700;color:#fff;background:var(--navy);padding:4px 9px;}'
    + '.pack-title{font-weight:700;font-size:15.5px;flex:1;}'
    + '.pack-tally{font-size:12px;font-weight:700;font-family:"IBM Plex Mono",monospace;display:flex;gap:5px;flex-wrap:wrap;}'
    + '.pack-tally .pt-pill{padding:3px 8px;border-radius:4px;border:1.5px solid var(--line);white-space:nowrap;}'
    + '.pack-tally .pt-pill.good{background:var(--good-bg);color:var(--good);border-color:var(--good);}'
    + '.pack-tally .pt-pill.partial{background:var(--risk-mid-bg);color:var(--risk-mid);border-color:var(--risk-mid);}'
    + '.pack-tally .pt-pill.bad{background:var(--risk-hi-bg);color:var(--risk-hi);border-color:var(--risk-hi);}'
    + '.pack-tally .pt-pill.na{background:#eee;color:var(--ink-soft);border-color:#c7c1b1;}'
    + '.pack-law{padding:0 16px;font-size:11.5px;color:var(--ink-soft);font-family:"IBM Plex Mono",monospace;}'
    + '.pack-hint{padding:6px 16px 0;font-size:12.5px;color:var(--navy-2);font-weight:600;}'
    + '.pack-resp-head{padding:10px 16px 4px;font-size:12.5px;font-weight:700;color:var(--navy);}'
    + '.pack-resp-tbl{width:calc(100% - 32px);margin:0 16px 6px;border-collapse:collapse;font-size:12px;table-layout:fixed;}'
    + '.pack-resp-tbl th,.pack-resp-tbl td{border:1px solid var(--line);padding:5px 7px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.pack-resp-tbl td.prt-wrap{white-space:normal;word-break:break-word;overflow:visible;text-overflow:clip;}'
    + '.pack-resp-tbl th{background:#f1ede1;font-weight:700;}'
    + '.pack-cp-detail{padding:0 16px 8px;display:flex;flex-direction:column;gap:8px;}'
    + '.pack-cp-group{border:1px solid var(--line);border-radius:5px;padding:8px 10px;background:#fbfaf5;}'
    + '.pack-cp-group-head{font-size:12px;font-weight:700;color:var(--indigo);margin-bottom:4px;}'
    + '.pack-cp-note{font-size:11.5px;color:var(--ink);background:#f5f1e6;border-left:3px solid var(--gold);padding:4px 8px;margin-bottom:5px;}'
    + '.pack-cp-list{list-style:none;margin:0;padding:0;}'
    + '.pack-cp-item{display:flex;align-items:flex-start;gap:7px;padding:4px 2px;font-size:12px;border-top:1px dashed var(--line);}'
    + '.pack-cp-item:first-child{border-top:none;}'
    + '.pack-cp-badge{flex:none;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:9px;white-space:nowrap;}'
    + '.pack-cp-badge.good{background:var(--good-bg);color:var(--good);}'
    + '.pack-cp-badge.neutral{background:var(--risk-mid-bg);color:var(--risk-mid);}'
    + '.pack-cp-badge.bad{background:var(--risk-hi-bg);color:var(--risk-hi);}'
    + '.pack-cp-badge.na{background:#eee;color:var(--ink-soft);}'
    + '.pack-decision{padding:12px 16px;font-weight:700;font-size:14px;background:#eef0f6;margin:10px 16px;border-radius:5px;}'
    + '.pack-branches{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 16px;}'
    + '.pack-branch{border:1px solid var(--line);border-radius:5px;padding:8px 10px;font-size:12.5px;}'
    + '.pack-branch-active{border-color:var(--good);background:var(--good-bg);}'
    + '.pack-branch-head{font-weight:700;margin-bottom:5px;}'
    + '.pack-rec{font-size:10.5px;font-weight:700;color:var(--good);}'
    + '.pack-q{margin-bottom:3px;color:var(--ink);}'
    + '.pack-end{margin-top:5px;padding-top:5px;border-top:1px dashed var(--line);color:var(--ink-soft);}'
    + '.pack-record{margin:12px 16px 14px;padding:10px 12px;background:#faf8f0;border:1px solid var(--line);border-radius:5px;font-size:13px;}'
    + '.pack-record-row{display:flex;gap:8px;margin-bottom:5px;}'
    + '.pack-record-row span{width:100px;flex:none;color:var(--ink-soft);font-family:"IBM Plex Mono",monospace;font-size:10px;}'
    + '.pack-record-note{display:flex;gap:8px;margin-top:6px;}'
    + '.pack-record-note span{width:100px;flex:none;color:var(--ink-soft);font-family:"IBM Plex Mono",monospace;font-size:10px;}'
    + '.pack-note-box{flex:1;min-height:40px;border:1px solid var(--line);background:#fff;padding:6px 8px;}'
    + '.pack-nav{position:fixed;left:12px;top:20px;width:230px;max-height:88vh;overflow-y:auto;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:14px;font-size:12px;box-shadow:0 4px 14px rgba(19,40,69,.15);z-index:40;}'
    + '.pack-nav h5{margin:0 0 10px;font-size:10.5px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.05em;font-family:monospace;}'
    + '.pn-domain{font-weight:700;color:var(--navy);margin:12px 0 6px;font-size:12.5px;}'
    + '.pn-domain:first-of-type{margin-top:0;}'
    + '.pn-item{display:block;padding:4px 6px 4px 8px;color:var(--ink-soft);text-decoration:none;font-size:12px;border-left:2px solid transparent;border-radius:3px;line-height:1.45;}'
    + '.pn-item:hover{color:var(--navy-2);border-left-color:var(--gold);background:#f7f4ea;}'
    + '.pn-code{display:block;font-family:monospace;font-size:10px;color:var(--ink-soft);font-weight:700;}'
    + '@media (max-width:1400px){.pack-nav{display:none;}}'
    + '@media print{.pack-nav{display:none;}}'
    + '@media print{'
      + 'body{background:#fff;}.pack-shell{box-shadow:none;margin:0;max-width:none;}.pack-print-btn{display:none;}'
      + '.pack-domain-head{page-break-before:auto;page-break-after:avoid;break-after:avoid;}'
      + '@page{size:A4;margin:14mm 12mm;}'
    + '}'
    + '@media (max-width:640px){.pack-branches{grid-template-columns:1fr;}}'
    + '</style></head><body>'
    + navHtml
    + '<div class="pack-shell">'
      + '<div class="pack-hero"><h1>🎤 ' + esc2(title) + '</h1><div class="sub">생성일 ' + genDate + ' · 총 ' + totalItems + '개 항목 · 화면 열람 및 A4 인쇄 겸용 (우측 하단 [인쇄] 버튼 또는 Ctrl+P)</div>'
        + '<div class="sub" style="margin-top:6px;color:var(--gold);">📖 읽기 전용 사본입니다 — 면담기록·메모는 관리도구의 🎤 인터뷰 가이드 화면에 입력해야 저장됩니다.</div></div>'
      + '<div class="pack-summary">' + summaryHtml + '</div>'
      + cardsHtml
    + '</div>'
    + '<button class="pack-print-btn" onclick="window.print()">🖨 인쇄 / PDF로 저장</button>'
    + '</body></html>';
}

export function downloadInterviewPack(filterAuditor, allCodes, sortMode){
  if(!allCodes || allCodes.length === 0){ alert('내보낼 항목이 없습니다. 먼저 ③ 응답 집계에서 데이터를 불러오거나, "전체 항목 검토" 모드를 사용해 주세요.'); return; }
  const html = buildInterviewPackHtml(filterAuditor, allCodes, sortMode || 'domain');
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const namePart = filterAuditor ? filterAuditor.replace(/[\\/:*?"<>|\s]+/g,'_') : '전체';
  a.href = url; a.download = 'IT감사_인터뷰팩_' + namePart + (typeof versionSuffix === 'function' ? versionSuffix() : '') + '.html';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert((filterAuditor ? ('"' + filterAuditor + '" 감사자용') : '전체') + ' 인터뷰 팩을 내려받았습니다. 이 파일은 독립 실행되는 HTML이라 이 관리도구 없이도 다른 감사자가 열어서 화면으로 보거나 인쇄(A4)할 수 있습니다.');
}
