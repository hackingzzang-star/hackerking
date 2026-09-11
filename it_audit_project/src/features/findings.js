// ============================================================
// src/features/findings.js
// 📋 발견사항 관리 탭 — app.js에서 물리적으로 분리된 두 번째 기능 모듈입니다.
// 발견사항 등록·수정, 부서 매칭, 시행문 출력, 인터뷰→발견사항 연결 등을 다룹니다.
// 로직 자체는 원본과 동일하며(수정 없이 이동만 함), 외부(app.js)에서 필요한 공용 유틸/상태만
// import 해서 씁니다.
// ============================================================
import {
  loadRecipients,
  saveFindings,
  aggRows, findings, FINDING_TYPES, FINDING_TYPE_META, findingsStatusFilterValue,
  interviewState,
} from '../app.js';
import {
  esc, escFd, getCurrentAuditName, kstDateStr, kstISOString,
} from './common.js';
import {
  refreshGwTemplatePreview, renderGwTemplateDeptOptions,
} from './comm.js';
import {
  igBranchClass, igComputeStats, igFindItem, igItemMeta, igOwnerDepts, igOwnerPersons,
  scrollToInterviewCard,
} from './interview.js';
import {
  buildInterimReportHtml, logReportGenerated, renderInterimReportPicker,
} from './report.js';
import { kanbanSendFromFinding } from './kanban.js';

export let currentEditingFindingId = null;

// [v8.60 버그수정] .fd-edit-badge/.gen-small-btn/.fn-print-btn 등이 'IBM Plex Mono' 또는
// generic monospace 폰트를 쓰는데, 이 폰트엔 이모지 글리프가 없어서 폐쇄망 PC에서 컬러
// 이모지 폰트를 못 받아오면 브라우저가 엉뚱한 기호로 대체해 아이콘이 깨져 보이는 문제가
// 있었다. 이모지 문자만 별도 span으로 감싸 OS 내장 이모지·기호 전용 폰트로 렌더링을 강제해
// 해결(인터넷 연결·폰트 다운로드 불필요). interview.js/kanban.js에도 동일한 헬퍼가 있다.
function igIconSpan(ch){
  return '<span style="font-family:\'Segoe UI Emoji\',\'Segoe UI Symbol\',\'Noto Color Emoji\',\'Apple Color Emoji\',\'Malgun Gothic\',sans-serif;">' + ch + '</span>';
}

export function getFindingCandidates(showAll){
  const codeSet = new Set(aggRows.map(r => r.code).filter(Boolean));
  const registeredCodes = new Set(findings.map(f => f.code).filter(Boolean));
  return Array.from(codeSet).filter(code => {
    if(registeredCodes.has(code)) return false;
    if(showAll) return true;
    const stats = igComputeStats(code);
    return igBranchClass(stats) === 'no';
  }).sort((a,b) => {
    const [ad,an] = a.split('-'); const [bd,bn] = b.split('-');
    if(ad !== bd) return ad.localeCompare(bd);
    return Number(an) - Number(bn);
  });
}

export function findingTypeOptionsHtml(selected){
  return FINDING_TYPES.map(t =>
    '<option value="' + t + '"' + (selected === t ? ' selected' : '') + '>' + FINDING_TYPE_META[t].icon + ' ' + FINDING_TYPE_META[t].short + (t === '현장개선' ? '(즉시시정)' : '') + '</option>'
  ).join('');
}

export function renderFindingEditForm(finding){
  renderFindingDeptDatalist();
  const wrap = document.getElementById('findingEditForm');
  // 동시 편집 충돌 방지: 편집을 시작하는 시점의 "현재 저장된 상태" 스냅샷을 남겨 둔다.
  // 저장 시점에 findings 배열의 실제 값과 이 스냅샷이 다르면(그 사이 백업 복원·동료 기록
  // 병합 등으로 다른 경로에서 값이 바뀐 것) 그냥 덮어쓰지 않고 먼저 경고한다.
  const _fdEditSnapshot = JSON.stringify(finding);
  const _fdIsNew = !findings.includes(finding);
  currentEditingFindingId = finding.id;
  wrap.style.display = 'block';
  wrap.innerHTML = '<div class="ig-edit-form" data-dirty="0" style="display:block;position:static;">'
    + '<div class="fd-edit-heading">'
      + (_fdIsNew ? '<span class="fd-edit-badge fd-edit-badge-new">' + igIconSpan('🆕') + ' 신규 등록</span>' : '<span class="fd-edit-badge">' + igIconSpan('✏') + ' 수정 중</span>')
      + (finding.code ? ('<span class="fd-edit-code">' + esc(finding.code) + '</span>') : '<span class="fd-edit-code fd-edit-code-free">자유등록</span>')
      + '<span class="fd-edit-heading-title" id="fdEditHeadingTitle">' + esc(finding.title || '(제목 없음)') + '</span>'
    + '</div>'
    + '<div class="ig-edit-hint">✏ 내용을 정리한 뒤 [💾 저장]을 눌러야 등록·반영됩니다.' + (finding.code ? (' 연결된 항목: <b>' + esc(finding.code) + '</b>') : ' 체크리스트와 연결되지 않은 자유 등록 항목입니다.') + '</div>'
    + '<label>제목</label><input type="text" id="fd-title" value="' + esc(finding.title||'') + '">'
    + '<label>현황 / 설명</label><textarea id="fd-desc" rows="3">' + esc(finding.description||'') + '</textarea>'
    + '<div class="edit-row-2col">'
      + '<div><label>위험도</label><select id="fd-risk"><option value="상"' + (finding.riskLevel==='상'?' selected':'') + '>상</option><option value="중"' + (finding.riskLevel==='중'?' selected':'') + '>중</option><option value="하"' + (finding.riskLevel==='하'?' selected':'') + '>하</option></select></div>'
      + '<div><label>관련 부서</label><input type="text" id="fd-dept" list="findingDeptDatalist" placeholder="목록에서 선택하거나 직접 입력" value="' + esc(finding.department||'') + '"></div>'
    + '</div>'
    + '<label>권고사항</label><textarea id="fd-rec" rows="3">' + esc(finding.recommendation||'') + '</textarea>'
    + '<div class="edit-row-2col">'
      + '<div><label>감사결과 구분 (통보용)</label><select id="fd-actiontype">' + findingTypeOptionsHtml(finding.actionType) + '</select></div>'
      + '<div><label>조치기한</label><input type="date" id="fd-duedate" value="' + esc(finding.dueDate||'') + '"></div>'
    + '</div>'
    + '<label>조치계획(액션플랜) — 담당자와 합의된 개선 계획을 단계별로 적어주세요</label><textarea id="fd-actionplan" rows="3">' + esc(finding.actionPlan||'') + '</textarea>'
    + '<label>담당자 성명 (시행문 서명란에 표기)</label><input type="text" id="fd-assignee" value="' + esc(finding.assignee||'') + '">'
    + '<label>담당자 서명</label>'
    + '<div class="fd-sig-wrap" style="border:1px solid var(--line);border-radius:6px;padding:10px;background:#fffdf8;">'
      + '<div style="font-size:11px;color:var(--ink-soft);margin-bottom:6px;">아래 칸에 마우스/터치로 직접 서명하거나, 서명 사진 파일을 올려주세요. 시행문 인쇄 시 이 서명이 함께 출력됩니다.</div>'
      + '<canvas id="fd-sig-canvas" width="360" height="120" style="border:1px dashed var(--line);border-radius:4px;background:#fff;touch-action:none;cursor:crosshair;display:block;max-width:100%;"></canvas>'
      + '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
        + '<button type="button" class="gen-small-btn" id="fdSigClearBtn" style="margin:0;">지우기</button>'
        + '<label class="gen-small-btn" style="margin:0;cursor:pointer;display:inline-block;">' + igIconSpan('📎') + ' 서명 사진 업로드<input type="file" id="fd-sig-file" accept="image/*" style="display:none;"></label>'
        + '<span id="fdSigStatus" style="font-size:11px;color:var(--ink-soft);"></span>'
      + '</div>'
    + '</div>'
    + '<label>상태</label><select id="fd-status"><option value="draft"' + (finding.status==='draft'?' selected':'') + '>📝 초안</option><option value="confirmed"' + (finding.status==='confirmed'?' selected':'') + '>✅ 확정(통보완료)</option><option value="in_progress"' + (finding.status==='in_progress'?' selected':'') + '>🔧 조치중</option><option value="remediated"' + (finding.status==='remediated'?' selected':'') + '>🛠 조치완료(검증대기)</option><option value="closed"' + (finding.status==='closed'?' selected':'') + '>🔒 종결</option></select>'
    + '<div class="fd-interim-box" style="border:1px solid var(--risk-hi);border-radius:6px;padding:12px 14px;margin-top:12px;background:#fdf4f2;">'
      + '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:700;color:var(--risk-hi);"><input type="checkbox" id="fd-interim-flag"' + (finding.interimFlagged ? ' checked' : '') + '> 🚨 이 건은 중간보고(Interim Report) 대상입니다</label>'
      + '<div style="font-size:11px;color:var(--ink-soft);margin:4px 0 10px;line-height:1.6;">체크하면 최종 결과보고를 기다리지 않고 이 건 하나만 별도로 즉시 보고할 수 있습니다 (아래 목록에서 "🚨 이 건만 중간보고서 생성" 버튼 사용, 또는 📑 보고서 → 중간보고서 탭에서 여러 건을 묶어 보고).</div>'
      + '<div id="fd-interim-detail" style="display:' + (finding.interimFlagged ? 'block' : 'none') + ';">'
        + '<label>중간보고 판단 유형</label>'
        + '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">'
          + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;font-size:12.5px;"><input type="radio" name="fd-interim-class" value="notdone"' + (( !finding.interimClass || finding.interimClass==='notdone') ? ' checked' : '') + '> 🔴 확인하려던 통제활동 자체가 이루어지지 않음</label>'
          + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;font-size:12.5px;"><input type="radio" name="fd-interim-class" value="worsens"' + (finding.interimClass==='worsens' ? ' checked' : '') + '> ⚠ 통제는 있으나 오히려 위험을 키우는 것으로 판단됨</label>'
          + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:700;font-size:12.5px;color:var(--risk-hi);"><input type="radio" name="fd-interim-class" value="fraud"' + (finding.interimClass==='fraud' ? ' checked' : '') + '> 🚨 부정(Fraud) 행위로 판단되거나 확인됨</label>'
          + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:400;font-size:12.5px;"><input type="radio" name="fd-interim-class" value="custom"' + (finding.interimClass==='custom' ? ' checked' : '') + '> ✍ 감사자가 직접 작성</label>'
        + '</div>'
        + '<div id="fd-interim-custom-wrap" style="display:' + (finding.interimClass==='custom' ? 'block' : 'none') + ';margin-bottom:10px;">'
          + '<label>판단 근거 (직접 작성)</label><input type="text" id="fd-interim-custom-text" value="' + esc(finding.interimCustomText||'') + '" placeholder="이 항목을 중간보고 대상으로 보는 이유를 직접 적어주세요">'
        + '</div>'
        + '<label>이 건의 경위·배경 (선택)</label><textarea id="fd-interim-bg" rows="2" placeholder="예) 현장점검 중 이 항목을 확인하는 과정에서 관련 통제활동 자체가 수행되지 않고 있음을 확인했습니다.">' + esc(finding.interimBackground||'') + '</textarea>'
        + '<label>이 건의 요청사항 (선택, 감사팀장 결재·승인 요청)</label><textarea id="fd-interim-req" rows="2" placeholder="예) 해당 부서에 즉시 시정을 지시하고, 재발방지를 위한 임시 통제조치 시행 여부를 결재해 주시기 바랍니다.">' + esc(finding.interimRequest||'') + '</textarea>'
        + (finding.interimReportedAt ? ('<div style="font-size:11px;color:var(--risk-hi);font-weight:700;margin-top:4px;">🕐 마지막 중간보고 생성: ' + esc(String(finding.interimReportedAt).replace('T',' ').slice(0,16)) + ' (KST)</div>') : '<div style="font-size:11px;color:var(--ink-soft);margin-top:4px;">아직 이 건으로 중간보고서를 생성한 적이 없습니다.</div>')
      + '</div>'
    + '</div>'
    + '<div class="ig-edit-actions">'
      + '<button class="gen-small-btn" id="fdSaveBtn" style="margin:0;background:var(--navy);color:#f4efe2;">' + igIconSpan('💾') + ' 저장</button>'
      + '<button class="gen-small-btn" id="fdCancelBtn" style="margin:0;">' + igIconSpan('✕') + ' 취소</button>'
    + '</div>'
  + '</div>';

  /* ---------- 입력 변경 시 dirty 플래그 설정 (다른 항목으로 이동 시 저장 확인용) ---------- */
  const _fdFormEl = wrap.querySelector('.ig-edit-form');
  _fdFormEl.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', () => { _fdFormEl.dataset.dirty = '1'; });
    el.addEventListener('change', () => { _fdFormEl.dataset.dirty = '1'; });
  });
  const _fdTitleInput = document.getElementById('fd-title');
  const _fdHeadingTitleEl = document.getElementById('fdEditHeadingTitle');
  if(_fdTitleInput && _fdHeadingTitleEl){
    _fdTitleInput.addEventListener('input', () => {
      _fdHeadingTitleEl.textContent = _fdTitleInput.value.trim() || '(제목 없음)';
    });
  }

  /* ---------- 🚨 중간보고(Interim) 체크박스·판단유형 라디오 반응 ---------- */
  const _fdInterimFlagEl = document.getElementById('fd-interim-flag');
  const _fdInterimDetailEl = document.getElementById('fd-interim-detail');
  if(_fdInterimFlagEl && _fdInterimDetailEl){
    _fdInterimFlagEl.addEventListener('change', () => {
      _fdInterimDetailEl.style.display = _fdInterimFlagEl.checked ? 'block' : 'none';
    });
  }
  const _fdInterimCustomWrapEl = document.getElementById('fd-interim-custom-wrap');
  document.querySelectorAll('input[name="fd-interim-class"]').forEach(r => {
    r.addEventListener('change', () => {
      if(_fdInterimCustomWrapEl) _fdInterimCustomWrapEl.style.display = (r.value === 'custom' && r.checked) ? 'block' : 'none';
    });
  });

  /* ---------- 서명 캔버스 초기화 ---------- */
  const sigCanvas = document.getElementById('fd-sig-canvas');
  const sigCtx = sigCanvas.getContext('2d');
  sigCtx.fillStyle = '#fff';
  sigCtx.fillRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigCtx.strokeStyle = '#1b2330';
  sigCtx.lineWidth = 2;
  sigCtx.lineCap = 'round';
  let sigDataUrl = finding.signatureDataUrl || '';
  const sigStatusEl = document.getElementById('fdSigStatus');
  function updateSigStatus(){
    if(sigStatusEl) sigStatusEl.textContent = sigDataUrl ? '✅ 서명 저장됨' : '';
  }
  if(sigDataUrl){
    const img = new Image();
    img.onload = () => { sigCtx.drawImage(img, 0, 0, sigCanvas.width, sigCanvas.height); };
    img.src = sigDataUrl;
  }
  updateSigStatus();
  let sigDrawing = false;
  function sigPos(e){
    const rect = sigCanvas.getBoundingClientRect();
    const scaleX = sigCanvas.width / rect.width;
    const scaleY = sigCanvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY};
  }
  function sigStart(e){ e.preventDefault(); sigDrawing = true; const p = sigPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); }
  function sigMove(e){ if(!sigDrawing) return; e.preventDefault(); const p = sigPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); }
  function sigEnd(){
    if(!sigDrawing) return;
    sigDrawing = false;
    sigDataUrl = sigCanvas.toDataURL('image/png');
    updateSigStatus();
    _fdFormEl.dataset.dirty = '1';
  }
  sigCanvas.addEventListener('mousedown', sigStart);
  sigCanvas.addEventListener('mousemove', sigMove);
  window.addEventListener('mouseup', sigEnd);
  sigCanvas.addEventListener('touchstart', sigStart, {passive:false});
  sigCanvas.addEventListener('touchmove', sigMove, {passive:false});
  sigCanvas.addEventListener('touchend', sigEnd);

  document.getElementById('fdSigClearBtn').addEventListener('click', () => {
    sigCtx.fillStyle = '#fff';
    sigCtx.fillRect(0, 0, sigCanvas.width, sigCanvas.height);
    sigDataUrl = '';
    updateSigStatus();
    _fdFormEl.dataset.dirty = '1';
  });

  document.getElementById('fd-sig-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    if(!file.type.startsWith('image/')){ alert('이미지 파일만 업로드할 수 있습니다.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // 용량 절약을 위해 서명 캔버스 크기(360x120)에 맞춰 자동 축소해서 저장합니다.
        sigCtx.fillStyle = '#fff';
        sigCtx.fillRect(0, 0, sigCanvas.width, sigCanvas.height);
        const scale = Math.min(sigCanvas.width / img.width, sigCanvas.height / img.height);
        const w = img.width * scale, h = img.height * scale;
        const ox = (sigCanvas.width - w) / 2, oy = (sigCanvas.height - h) / 2;
        sigCtx.drawImage(img, ox, oy, w, h);
        sigDataUrl = sigCanvas.toDataURL('image/png');
        updateSigStatus();
        _fdFormEl.dataset.dirty = '1';
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  document.getElementById('fdSaveBtn').addEventListener('click', () => {
    // 저장 직전, 이 항목이 편집을 시작한 이후 다른 경로(백업 복원·동료 인터뷰 기록 병합 등)에서
    // 바뀌지 않았는지 확인한다. finding.id가 findings 배열에 이미 있는데 내용이 스냅샷과 다르면
    // 충돌로 간주하고, 사용자에게 최신 내용을 먼저 보여줄지 그대로 덮어쓸지 선택하게 한다.
    const liveIdx = finding.id ? findings.findIndex(f => f.id === finding.id) : -1;
    if(liveIdx >= 0 && JSON.stringify(findings[liveIdx]) !== _fdEditSnapshot){
      const proceed = confirm(
        '⚠ 이 발견사항은 편집을 시작한 이후 다른 곳(백업 복원, 동료 감사역 기록 병합 등)에서 이미 변경된 것으로 보입니다.\n\n'
        + '[확인] = 지금 화면에 입력한 내용으로 그대로 덮어씁니다 (그 사이의 다른 변경 내용은 사라집니다)\n'
        + '[취소] = 저장하지 않고, 최신 내용을 다시 불러와 확인합니다'
      );
      if(!proceed){
        renderFindingEditForm(findings[liveIdx]);
        return;
      }
    }
    finding.title = document.getElementById('fd-title').value.trim() || '(제목 없음)';
    finding.description = document.getElementById('fd-desc').value;
    finding.riskLevel = document.getElementById('fd-risk').value;
    finding.department = document.getElementById('fd-dept').value;
    finding.recommendation = document.getElementById('fd-rec').value;
    finding.actionType = document.getElementById('fd-actiontype').value;
    finding.dueDate = document.getElementById('fd-duedate').value;
    finding.actionPlan = document.getElementById('fd-actionplan').value;
    finding.assignee = document.getElementById('fd-assignee').value;
    const interimFlagChecked = document.getElementById('fd-interim-flag').checked;
    let interimClassVal = 'notdone';
    const interimClassCheckedEl = document.querySelector('input[name="fd-interim-class"]:checked');
    if(interimClassCheckedEl) interimClassVal = interimClassCheckedEl.value;
    const interimCustomTextVal = (document.getElementById('fd-interim-custom-text') || {}).value || '';
    if(interimFlagChecked && interimClassVal === 'custom' && !interimCustomTextVal.trim()){
      alert('🚨 중간보고 대상으로 표시했고 "감사자가 직접 작성"을 선택했는데, 판단 근거를 입력하지 않았습니다. 입력 후 다시 저장해 주세요.');
      return;
    }
    finding.interimFlagged = interimFlagChecked;
    finding.interimClass = interimClassVal;
    finding.interimCustomText = interimCustomTextVal;
    finding.interimBackground = (document.getElementById('fd-interim-bg') || {}).value || '';
    finding.interimRequest = (document.getElementById('fd-interim-req') || {}).value || '';
    const newStatus = document.getElementById('fd-status').value;
    // 조치완료/종결로 처음 바뀌는 순간의 시각을 남겨, 종합보고서에서 "평균 조치소요기간"을 계산하는 데 쓴다.
    // (이미 한 번 기록된 뒤 다시 같은 상태로 저장해도 최초 시각을 덮어쓰지 않는다 — 되돌렸다가 다시 완료해도 값이 남아있으면 그대로 둠)
    if((newStatus === 'remediated' || newStatus === 'closed') && !finding.closedAt){
      finding.closedAt = kstISOString();
    }
    if(newStatus !== 'remediated' && newStatus !== 'closed'){
      finding.closedAt = ''; // 다시 미완료 상태로 되돌리면 완료시각도 초기화
    }
    finding.status = newStatus;
    finding.signatureDataUrl = sigDataUrl || '';
    finding.signatureSignedAt = sigDataUrl ? kstISOString() : '';
    if(!findings.includes(finding)) findings.push(finding);
    try{
      saveFindings();
    }catch(err){
      alert('저장 중 오류가 발생했습니다 (브라우저 저장공간이 부족할 수 있습니다). 서명 이미지를 지우고 다시 시도해 보세요.\n\n' + err.message);
      return;
    }
    wrap.style.display = 'none';
    currentEditingFindingId = null;
    renderFindingsTab();
  });
  document.getElementById('fdCancelBtn').addEventListener('click', () => {
    if(_fdFormEl.dataset.dirty === '1'){
      if(!confirm('저장하지 않은 수정 내용이 있습니다. 저장하지 않고 닫으면 방금 고친 내용은 사라집니다.\n\n그래도 닫을까요? ([취소]를 누르면 계속 편집할 수 있습니다)')) return;
    }
    wrap.style.display = 'none';
    currentEditingFindingId = null;
    renderFindingsList();
  });
}

export function scrollAndFlashFindingEditForm(){
  const wrap = document.getElementById('findingEditForm');
  if(!wrap) return;
  wrap.scrollIntoView({behavior:'smooth', block:'start'});
  wrap.classList.remove('js-highlight');
  void wrap.offsetWidth; // 리플로우를 강제해 같은 항목을 연달아 클릭해도 애니메이션이 다시 재생되게 함
  wrap.classList.add('js-highlight');
  setTimeout(() => wrap.classList.remove('js-highlight'), 1800);
}

export function renderFindingDeptDatalist(){
  // "관련 부서"를 자유입력만 시키지 않고, 실제로 이 감사에서 응답을 제출한 부서(수검부서)와
  // 수검자 명부에 등록된 부서를 모아 드롭다운으로 골라 쓸 수 있게 한다. 목록에 없는 부서명을
  // 직접 입력하는 것도 계속 가능하다(datalist는 강제 목록이 아니라 추천 목록).
  const dl = document.getElementById('findingDeptDatalist');
  if(!dl) return;
  const depts = new Set();
  (typeof aggRows !== 'undefined' ? aggRows : []).forEach(r => { if(r.dept) depts.add(r.dept); });
  try{ loadRecipients().forEach(r => { if(r.dept) depts.add(r.dept); }); }catch(e){ /* non-fatal */ }
  dl.innerHTML = Array.from(depts).sort().map(d => '<option value="' + String(d).replace(/"/g,'&quot;') + '">').join('');
}

export function openFindingEditGuarded(finding){
  const wrap = document.getElementById('findingEditForm');
  const openFormEl = (wrap && wrap.style.display === 'block') ? wrap.querySelector('.ig-edit-form') : null;
  if(openFormEl){
    if(currentEditingFindingId === finding.id){
      // 지금 편집 중인 바로 그 항목을 다시 클릭한 경우 — 새로 열 필요 없이 그 위치로만 이동
      scrollAndFlashFindingEditForm();
      return;
    }
    if(openFormEl.dataset.dirty === '1'){
      const cur = findings.find(f => f.id === currentEditingFindingId);
      const curLabel = cur ? ((cur.code ? ('[' + cur.code + '] ') : '') + (cur.title || '(제목 없음)')) : '다른 발견사항';
      const proceed = confirm(
        '⚠ 현재 "' + curLabel + '" 항목을 수정 중이며, 저장하지 않은 변경 내용이 있습니다.\n\n'
        + '[확인] = 저장하지 않고 다른 항목 열기 (지금까지 고친 내용은 사라집니다)\n'
        + '[취소] = 계속 수정 (수정 중인 화면으로 이동합니다)'
      );
      if(!proceed){
        scrollAndFlashFindingEditForm();
        return;
      }
    }
  }
  renderFindingEditForm(finding);
  renderFindingsList();
  scrollAndFlashFindingEditForm();
}

export function buildFindingNoticeHtml(finding){
  const today = kstDateStr();
  const ACTION_LABEL = Object.fromEntries(FINDING_TYPES.map(t => [t, FINDING_TYPE_META[t].icon + ' ' + FINDING_TYPE_META[t].full]));
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>감사결과 통보서 — ' + escFd(finding.title) + '</title><style>'
    + 'body{font-family:"Pretendard","Noto Sans KR",sans-serif;color:#1b2330;max-width:760px;margin:24px auto;padding:0 20px;}'
    + '.fn-hero{background:#132845;color:#f4efe2;padding:22px 28px;border-radius:6px 6px 0 0;}'
    + '.fn-hero .eyebrow{font-family:monospace;letter-spacing:.15em;font-size:11px;color:#e4c78a;text-transform:uppercase;margin-bottom:6px;}'
    + '.fn-hero h1{margin:0;font-size:20px;}'
    + '.fn-body{border:1px solid #dcd6c8;border-top:none;padding:24px 28px;}'
    + '.fn-row{display:grid;grid-template-columns:130px 1fr;border-bottom:1px solid #ece7d9;padding:9px 0;font-size:13px;}'
    + '.fn-row b{color:#5a6472;font-weight:600;font-size:11.5px;font-family:monospace;text-transform:uppercase;}'
    + '.fn-section{margin-top:18px;}'
    + '.fn-section h3{font-size:13.5px;color:#132845;border-bottom:2px solid #132845;padding-bottom:6px;margin-bottom:10px;}'
    + '.fn-section p{font-size:13px;line-height:1.75;white-space:pre-wrap;margin:0;}'
    + '.fn-badge{display:inline-block;font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:4px;background:#f7e6e2;color:#a23b2e;}'
    + '.fn-sign{margin-top:28px;border:1px solid #dcd6c8;}'
    + '.fn-sign-head{background:#efe8d4;padding:8px 16px;font-size:12px;font-weight:700;color:#132845;}'
    + '.fn-sign-grid{display:grid;grid-template-columns:1fr 1fr;}'
    + '.fn-sign-cell{padding:16px;border-right:1px solid #dcd6c8;}'
    + '.fn-sign-cell:last-child{border-right:none;}'
    + '.fn-sign-cell label{display:block;font-size:11px;color:#5a6472;font-family:monospace;margin-bottom:6px;}'
    + '.fn-sign-space{height:50px;border-bottom:1px solid #9aa3b0;margin-top:30px;}'
    + '.fn-note{font-size:11.5px;color:#5a6472;background:#f5f1e6;border-radius:6px;padding:10px 14px;margin-top:16px;line-height:1.7;}'
    + '.fn-print-btn{margin:16px 0;font-family:monospace;font-size:12px;background:#132845;color:#f4efe2;border:none;padding:9px 18px;border-radius:6px;cursor:pointer;}'
    + '@media print{ .fn-print-btn{display:none;} body{margin:0;max-width:none;} @page{size:A4;margin:16mm 14mm;} }'
    + '</style></head><body>'
    + '<button class="fn-print-btn" onclick="window.print()">' + igIconSpan('🖨') + ' 인쇄 / PDF 저장</button>'
    + '<div class="fn-hero"><div class="eyebrow">IT AUDIT · 감사결과 통보서</div><h1>' + escFd(finding.title) + '</h1></div>'
    + '<div class="fn-body">'
      + '<div class="fn-row"><b>통보일자</b><span>' + today + '</span></div>'
      + '<div class="fn-row"><b>관련부서</b><span>' + escFd(finding.department || '-') + '</span></div>'
      + '<div class="fn-row"><b>관련항목</b><span>' + escFd(finding.code || '(체크리스트 외 별도 등록)') + '</span></div>'
      + '<div class="fn-row"><b>위험도</b><span>' + escFd(finding.riskLevel || '-') + '</span></div>'
      + '<div class="fn-row"><b>감사결과 구분</b><span class="fn-badge" style="background:' + (FINDING_TYPE_META[finding.actionType]?.bg || '#f7edd9') + ';color:' + (FINDING_TYPE_META[finding.actionType]?.fg || '#b8863b') + ';">' + escFd(ACTION_LABEL[finding.actionType] || '🛠 개선요청') + '</span></div>'
      + '<div class="fn-row"><b>조치기한</b><span>' + escFd(finding.dueDate || '(미지정)') + '</span></div>'
      + '<div class="fn-section"><h3>1. 발견사항 현황</h3><p>' + escFd(finding.description || '(작성 필요)') + '</p></div>'
      + '<div class="fn-section"><h3>2. 권고사항</h3><p>' + escFd(finding.recommendation || '(작성 필요)') + '</p></div>'
      + '<div class="fn-section"><h3>3. 조치계획(액션플랜)</h3><p>' + escFd(finding.actionPlan || '(담당부서와 협의하여 작성)') + '</p></div>'
      + '<div class="fn-sign">'
        + '<div class="fn-sign-head">4. 통보 확인 서명 — 위 발견사항 및 조치기한을 인지하였음을 확인합니다</div>'
        + '<div class="fn-sign-grid">'
          + '<div class="fn-sign-cell"><label>담당자 (' + escFd(finding.assignee || '________') + ')</label>'
            + (finding.signatureDataUrl
                ? ('<img src="' + escFd(finding.signatureDataUrl) + '" alt="담당자 서명" style="height:60px;margin-top:20px;display:block;">' + (finding.signatureSignedAt ? ('<div style="font-size:10px;color:#5a6472;margin-top:4px;">서명일시: ' + escFd(new Date(finding.signatureSignedAt).toLocaleString('ko-KR')) + '</div>') : ''))
                : '<div class="fn-sign-space"></div>')
            + '</div>'
          + '<div class="fn-sign-cell"><label>감사역</label><div class="fn-sign-space"></div></div>'
        + '</div>'
      + '</div>'
      + '<div class="fn-note">💡 이 문서는 IPPF 감사 커뮤니케이션(종료회의 등) 산출물로, 담당자에게 발견사항을 통보하고 인지·서명을 받는 용도입니다. 인쇄 후 서명받거나, PDF로 저장해 전자결재·그룹웨어에 첨부하세요.</div>'
    + '</div>'
    + '</body></html>';
}

export function printFindingNotice(finding){
  const html = buildFindingNoticeHtml(finding);
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=860,height=1000');
  logReportGenerated('notice', '🖨 통보서', (finding.code ? (finding.code + ' · ') : '') + finding.title);
}

export let findingsCandidatesShowAll = false;

export let findingsCandidatesSearch = '';

export function renderFindingsCandidates(){
  const wrap = document.getElementById('findingsCandidatesList');
  if(!wrap) return;
  let candidates = getFindingCandidates(findingsCandidatesShowAll);
  const term = findingsCandidatesSearch.trim().toLowerCase();
  if(term){
    candidates = candidates.filter(code => {
      const meta = igItemMeta(code);
      return code.toLowerCase().includes(term) || (meta.title||'').toLowerCase().includes(term);
    });
  }
  const toggleHtml = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">'
    + '<label style="font-size:11.5px;color:var(--ink-soft);display:flex;align-items:center;gap:5px;cursor:pointer;">'
      + '<input type="checkbox" id="findingsCandidatesShowAllChk"' + (findingsCandidatesShowAll ? ' checked' : '') + '> 전체 항목 보기 (기본은 미흡·원인규명형만)'
    + '</label>'
    + '<input type="text" id="findingsCandidatesSearchInput" placeholder="🔍 항목코드·항목명 검색" value="' + esc(findingsCandidatesSearch) + '" style="border:1px solid var(--line);border-radius:6px;padding:5px 9px;font-size:11.5px;flex:1;min-width:160px;">'
    + '</div>'
    + (findingsCandidatesShowAll ? '<p style="font-size:11px;color:var(--ink-soft);margin:0 0 10px;">💡 인터뷰 중 예상치 못하게 새로 발견한 사항은, 원래 응답이 "이행"이었던 항목이라도 여기서 바로 등록할 수 있습니다.</p>' : '');

  if(candidates.length === 0){
    wrap.innerHTML = toggleHtml + '<div class="assign-empty">' + (findingsCandidatesShowAll ? '표시할 항목이 없습니다.' : '현재 원인규명형으로 분류된(미등록) 항목이 없습니다. 응답을 업로드하고 인터뷰가 진행되면 여기 후보가 나타납니다.') + '</div>';
    wireFindingsCandidatesToolbar();
    return;
  }
  const RECLABEL2 = {yes:'✅ 이행(검증형)', partial:'🟡 부분이행', no:'🚩 미흡(원인규명형)', na:'⬜ 해당없음', unknown:'미집계'};
  wrap.innerHTML = toggleHtml + '<table class="assign-tbl"><tr><th>항목코드</th><th>항목명</th><th>위험도</th>' + (findingsCandidatesShowAll ? '<th>응답 분류</th>' : '') + '<th style="width:100px;"></th></tr>'
    + candidates.map(code => {
        const meta = igItemMeta(code);
        const item = igFindItem(code);
        const branchCell = findingsCandidatesShowAll ? ('<td>' + RECLABEL2[igBranchClass(igComputeStats(code))] + '</td>') : '';
        return '<tr><td class="mono">' + esc(code) + '</td><td>' + esc(meta.title) + '</td><td>' + esc(item ? item.risk : '-') + '</td>' + branchCell
          + '<td><button type="button" class="assign-dept-reset-btn fd-register-btn" data-code="' + esc(code) + '" style="width:auto;padding:4px 10px;font-size:10.5px;">+ 등록</button></td></tr>';
      }).join('')
    + '</table>';
  wrap.querySelectorAll('.fd-register-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      const meta = igItemMeta(code);
      const item = igFindItem(code);
      const st = interviewState[code];
      openFindingEditGuarded({
        id: 'F-' + Date.now(), code, title: meta.title, description: (st && st.note) || '',
        riskLevel: item ? item.risk : '중', department: igOwnerDepts(code).join(', '), assignee: igOwnerPersons(code).join(', '),
        recommendation: '', status: 'draft', createdAt: kstISOString(), auditName: getCurrentAuditName()
      });
    });
  });
  wireFindingsCandidatesToolbar();
}

export function wireFindingsCandidatesToolbar(){
  const chk = document.getElementById('findingsCandidatesShowAllChk');
  if(chk) chk.addEventListener('change', () => { findingsCandidatesShowAll = chk.checked; renderFindingsCandidates(); });
  const searchEl = document.getElementById('findingsCandidatesSearchInput');
  if(searchEl){
    searchEl.addEventListener('input', () => {
      findingsCandidatesSearch = searchEl.value;
      renderFindingsCandidates();
      const refocusEl = document.getElementById('findingsCandidatesSearchInput');
      if(refocusEl){ refocusEl.focus(); refocusEl.setSelectionRange(refocusEl.value.length, refocusEl.value.length); }
    });
  }
}

export function scrollToFindingCard(code){
  const targetBtn = document.querySelector('.tabbtn[data-tab="findings"]');
  if(targetBtn) targetBtn.click();
  setTimeout(() => {
    const card = document.querySelector('.finding-card[data-finding-code="' + CSS.escape(code) + '"]');
    if(card){
      card.scrollIntoView({behavior:'smooth', block:'start'});
      card.classList.add('js-highlight');
      setTimeout(() => card.classList.remove('js-highlight'), 1800);
    }
  }, 120);
}

export function renderFindingsStatusSummary(){
  const el = document.getElementById('findingsStatusSummary');
  if(!el) return;
  const STATUS_META = [
    {key:'draft', label:'📝 초안', color:'var(--risk-mid)'},
    {key:'confirmed', label:'✅ 확정(통보완료)', color:'var(--navy)'},
    {key:'in_progress', label:'🔧 조치중', color:'#b8863b'},
    {key:'remediated', label:'🛠 조치완료(검증대기)', color:'var(--good)'},
    {key:'closed', label:'🔒 종결', color:'var(--ink-soft)'},
  ];
  const counts = {};
  findings.forEach(f => { const k = f.status || 'draft'; counts[k] = (counts[k]||0) + 1; });
  el.innerHTML = STATUS_META.map(m =>
    '<div style="border:1px solid var(--line);border-radius:6px;padding:6px 12px;font-size:11.5px;background:#fff;">'
    + '<span style="color:' + m.color + ';font-weight:700;">' + m.label + '</span> <b>' + (counts[m.key]||0) + '</b>건</div>'
  ).join('');
}

export function renderFindingsList(){
  const wrap = document.getElementById('findingsList');
  if(!wrap) return;
  renderFindingsStatusSummary();
  const visibleFindings = findingsStatusFilterValue ? findings.filter(f => (f.status || 'draft') === findingsStatusFilterValue) : findings;
  if(findings.length === 0){
    wrap.innerHTML = '<div class="assign-empty">아직 등록된 발견사항이 없습니다.</div>';
    return;
  }
  if(visibleFindings.length === 0){
    wrap.innerHTML = '<div class="assign-empty">이 상태에 해당하는 발견사항이 없습니다.</div>';
    return;
  }
  const riskColor = {상:'var(--risk-hi)', 중:'var(--risk-mid)', 하:'var(--good)'};
  const ACTION_LABEL2 = Object.fromEntries(FINDING_TYPES.map(t => [t, FINDING_TYPE_META[t].icon + ' ' + FINDING_TYPE_META[t].short]));
  const STATUS_LABEL = {
    draft: '<span style="color:var(--risk-mid);font-weight:700;">📝 초안</span>',
    confirmed: '<span style="color:var(--navy);font-weight:700;">✅ 확정(통보완료)</span>',
    in_progress: '<span style="color:#b8863b;font-weight:700;">🔧 조치중</span>',
    remediated: '<span style="color:var(--good);font-weight:700;">🛠 조치완료(검증대기)</span>',
    closed: '<span style="color:var(--ink-soft);font-weight:700;">🔒 종결</span>',
  };
  wrap.innerHTML = findings.map((f,idx) => {
    if(findingsStatusFilterValue && (f.status||'draft') !== findingsStatusFilterValue) return '';
    const statusBadge = STATUS_LABEL[f.status] || STATUS_LABEL.draft;
    const actionBadge = f.actionType ? ('<span style="color:var(--navy);font-weight:700;">' + esc(ACTION_LABEL2[f.actionType]||f.actionType) + '</span>') : '';
    const isEditing = !!(f.id && f.id === currentEditingFindingId);
    const interimBadge = f.interimFlagged
      ? (f.interimReportedAt
          ? (' · <span style="color:var(--ink-soft);font-weight:700;">🚨 중간보고 완료(' + esc(String(f.interimReportedAt).slice(0,10)) + ')</span>')
          : ' · <span style="color:var(--risk-hi);font-weight:700;">🚨 중간보고 대상 · 미보고</span>')
      : '';
    return '<div class="ig-card finding-card' + (isEditing ? ' fd-card-editing' : '') + (f.interimFlagged ? ' fd-card-interim' : '') + '" data-finding-code="' + esc(f.code||'') + '" style="border-left:4px solid ' + (riskColor[f.riskLevel]||'var(--line)') + ';">'
      + '<div class="ig-card-head">'
        + '<div class="ig-card-head-main">'
          + '<div class="ig-code">' + esc(f.code || '자유') + '</div>'
          + '<div style="flex:1;"><div class="ig-card-title">' + esc(f.title) + (isEditing ? ' <span class="fd-editing-badge">✏ 수정 중</span>' : '') + '</div>'
          + '<div class="ig-card-law">위험도 ' + esc(f.riskLevel) + ' · ' + esc(f.department||'-') + ' · ' + statusBadge + (actionBadge ? ' · ' + actionBadge : '') + (f.dueDate ? (' · 조치기한 ' + esc(f.dueDate)) : '') + (f.signatureDataUrl ? ' · <span style="color:var(--good);">✍️ 서명됨</span>' : '') + interimBadge + '</div></div>'
        + '</div>'
        + '<div class="ig-card-head-actions">'
          + (f.code ? ('<button class="assign-dept-reset-btn fd-goto-interview-btn" data-code="' + esc(f.code) + '" style="width:auto;padding:5px 10px;font-size:10.5px;">🎤 인터뷰로 이동</button>') : '')
          + (f.interimFlagged ? ('<button class="assign-dept-reset-btn fd-interim-quick-btn" data-idx="' + idx + '" style="width:auto;padding:5px 10px;font-size:10.5px;background:var(--risk-hi);color:#fff;font-weight:700;">🚨 이 건만 중간보고서 생성</button>') : '')
          + '<button class="assign-dept-reset-btn fd-kanban-btn" data-idx="' + idx + '" style="width:auto;padding:5px 10px;font-size:10.5px;">🗂 칸반 카드로 보내기</button>'
          + '<button class="assign-dept-reset-btn fd-notice-btn" data-idx="' + idx + '" style="width:auto;padding:5px 10px;font-size:10.5px;background:var(--navy);color:#f4efe2;">🖨 통보서 출력</button>'
          + '<button class="assign-dept-reset-btn fd-edit-btn" data-idx="' + idx + '" style="width:auto;padding:5px 10px;font-size:10.5px;' + (isEditing ? 'background:var(--gold);color:var(--navy);font-weight:700;' : '') + '">' + (isEditing ? '🔖 수정 화면으로 이동' : '✏ 수정') + '</button>'
          + '<button class="assign-dept-reset-btn fd-delete-btn" data-idx="' + idx + '"' + (isEditing ? ' disabled title="수정 중에는 삭제할 수 없습니다. 저장하거나 취소한 뒤 삭제해 주세요." style="width:auto;padding:5px 10px;font-size:10.5px;opacity:.5;cursor:not-allowed;"' : ' style="width:auto;padding:5px 10px;font-size:10.5px;"') + '>🗑️ 삭제</button>'
        + '</div>'
      + '</div>'
      + '<div class="ig-body"><div class="ig-decision">' + esc(f.description||'(현황 미작성)') + '</div>'
      + '<div class="pack-record" style="margin:10px 16px;"><div class="pack-record-row"><span>권고사항</span><b>' + esc(f.recommendation||'-') + '</b></div>'
      + (f.actionPlan ? ('<div class="pack-record-row"><span>조치계획</span><b>' + esc(f.actionPlan) + '</b></div>') : '')
      + '</div>'
      + '</div></div>';
  }).join('');
  wrap.querySelectorAll('.fd-notice-btn').forEach(btn => btn.addEventListener('click', () => printFindingNotice(findings[Number(btn.dataset.idx)])));
  wrap.querySelectorAll('.fd-kanban-btn').forEach(btn => btn.addEventListener('click', () => kanbanSendFromFinding(findings[Number(btn.dataset.idx)], btn)));
  wrap.querySelectorAll('.fd-goto-interview-btn').forEach(btn => btn.addEventListener('click', () => scrollToInterviewCard(btn.dataset.code)));
  wrap.querySelectorAll('.fd-interim-quick-btn').forEach(btn => btn.addEventListener('click', () => generateInterimReportForSingleFinding(findings[Number(btn.dataset.idx)])));
  wrap.querySelectorAll('.fd-edit-btn').forEach(btn => btn.addEventListener('click', () => openFindingEditGuarded(findings[Number(btn.dataset.idx)])));
  wrap.querySelectorAll('.fd-delete-btn').forEach(btn => btn.addEventListener('click', () => {
    if(!confirm('이 발견사항을 삭제할까요?')) return;
    findings.splice(Number(btn.dataset.idx), 1);
    saveFindings();
    renderFindingsTab();
  }));
}

export function renderFindingsTab(){
  renderFindingsCandidates();
  renderFindingsList();
  renderGwTemplateDeptOptions();
  refreshGwTemplatePreview();
}

export function generateInterimReportForSingleFinding(finding){
  if(!finding){ return; }
  if(!finding.interimFlagged){
    alert('이 건은 아직 "🚨 중간보고(Interim Report) 대상"으로 표시되지 않았습니다. 먼저 ✏ 수정에서 체크해 주세요.');
    return;
  }
  const classification = finding.interimClass || 'notdone';
  const customText = finding.interimCustomText || '';
  if(classification === 'custom' && !customText.trim()){
    alert('"' + finding.title + '" 건은 "감사자가 직접 작성"을 선택했는데 판단 근거가 비어 있습니다. ✏ 수정에서 입력한 뒤 다시 시도해 주세요.');
    return;
  }
  const selected = [{finding, classification, customText}];
  const html = buildInterimReportHtml(selected, (finding.interimBackground||'').trim(), (finding.interimRequest||'').trim());
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=900,height=1000');
  logReportGenerated('interim', '🚨 중간보고서(개별)', finding.title);
  finding.interimReportedAt = kstISOString();
  saveFindings();
  renderFindingsList();
  if(typeof renderInterimReportPicker === 'function') renderInterimReportPicker();
}
