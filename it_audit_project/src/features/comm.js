// ============================================================
// 📨 커뮤니케이션 문구 (commDist/commInterview/commNotice 탭) — v8.53에서 app.js로부터 분리
// ------------------------------------------------------------
// 배포·독촉/인터뷰조율/결과통보용 정형 문구 생성 및 템플릿 편집.
// 재할당되는 공유 가변 상태가 없어 세터가 필요 없었습니다(전부 읽기 전용 참조).
// ============================================================
import {
  FINDING_TYPES,
  FINDING_TYPE_META,
  activeRoundLabel,
  aggRows,
  findings,
  loadFindings,
  COMM_TEMPLATE_STORAGE_KEY,
  COMM_TEMPLATE_TOKENS,
  DEFAULT_COMM_TEMPLATES,
} from '../app.js';
import {
  esc, kstDateStr,
} from './common.js';
import {
  domainListText,
} from './generate.js';
import {
  loadDistributions,
} from './dist.js';
import {
  itemLevelRows,
  loadRoundsFromStorage,
} from './collect.js';

export function loadCommTemplates(){
  let overrides = {};
  try{ overrides = JSON.parse(localStorage.getItem(COMM_TEMPLATE_STORAGE_KEY) || '{}'); }catch(e){ overrides = {}; }
  const merged = {};
  Object.keys(DEFAULT_COMM_TEMPLATES).forEach(k => {
    merged[k] = {label: DEFAULT_COMM_TEMPLATES[k].label, body: (overrides[k] && typeof overrides[k].body === 'string') ? overrides[k].body : DEFAULT_COMM_TEMPLATES[k].body};
  });
  return merged;
}

export function saveCommTemplateOverrides(templates){
  const overrides = {};
  Object.keys(templates).forEach(k => { overrides[k] = {body: templates[k].body}; });
  try{ localStorage.setItem(COMM_TEMPLATE_STORAGE_KEY, JSON.stringify(overrides)); }
  catch(e){ alert('템플릿 저장 실패: ' + e.message); }
}

export function fillCommTemplate(body, r, dist){
  return body
    .split('{{이름}}').join(r.name)
    .split('{{회차명}}').join(dist.roundLabel)
    .split('{{도메인목록}}').join(domainListText(dist))
    .split('{{배포일}}').join(dist.distributedAt)
    .split('{{회신기한}}').join(dist.dueDate || '별도 안내 예정')
    .split('{{기안번호}}').join(dist.groupwareNo || '(기안번호 미입력)');
}

export function renderCommTemplateTypeOptions(){
  const sel = document.getElementById('commTemplateType');
  if(!sel) return;
  const templates = loadCommTemplates();
  const prev = sel.value;
  sel.innerHTML = Object.keys(templates).map(k => '<option value="' + k + '">' + templates[k].label + '</option>').join('');
  if(prev && templates[prev]) sel.value = prev;
}

export function toggleCommTemplateEditor(){
  const box = document.getElementById('commTemplateEditor');
  if(!box) return;
  if(box.style.display === 'none' || !box.style.display){
    renderCommTemplateEditor();
    box.style.display = 'block';
  } else {
    box.style.display = 'none';
  }
}

export function renderCommTemplateEditor(){
  const templates = loadCommTemplates();
  const box = document.getElementById('commTemplateEditor');
  box.innerHTML = '<div class="comm-editor-box">'
    + '<div style="font-size:11px;color:var(--ink-soft);margin-bottom:10px;">사용 가능한 자리표시자(그대로 입력하면 자동 치환됩니다): '
      + COMM_TEMPLATE_TOKENS.map(t => '<code class="comm-token">' + t + '</code>').join(' ') + '</div>'
    + Object.keys(templates).map(k =>
        '<div style="margin-bottom:14px;">'
        + '<div style="font-weight:700;font-size:12px;margin-bottom:4px;color:var(--navy);">' + templates[k].label + '</div>'
        + '<textarea class="comm-editor-textarea" data-type="' + k + '" rows="7">' + esc(templates[k].body) + '</textarea>'
        + '</div>'
      ).join('')
    + '<div style="display:flex;gap:8px;">'
      + '<button class="gen-small-btn" id="saveCommTemplatesBtn" style="margin:0;background:var(--navy);color:#f4efe2;">💾 저장</button>'
      + '<button class="gen-small-btn" id="resetCommTemplatesBtn" style="margin:0;">↺ 기본 문구로 초기화</button>'
    + '</div>'
    + '</div>';
  document.getElementById('saveCommTemplatesBtn').addEventListener('click', () => {
    const updated = {};
    document.querySelectorAll('.comm-editor-textarea').forEach(ta => {
      updated[ta.dataset.type] = {label: DEFAULT_COMM_TEMPLATES[ta.dataset.type].label, body: ta.value};
    });
    saveCommTemplateOverrides(updated);
    renderCommTemplateTypeOptions();
    alert('템플릿 문구를 저장했습니다. 다음 메시지 생성부터 바로 적용됩니다.');
  });
  document.getElementById('resetCommTemplatesBtn').addEventListener('click', () => {
    if(!confirm('모든 템플릿을 기본 문구로 되돌릴까요? 직접 수정한 내용은 사라집니다.')) return;
    localStorage.removeItem(COMM_TEMPLATE_STORAGE_KEY);
    renderCommTemplateEditor();
    renderCommTemplateTypeOptions();
  });
}

export function renderCommDistSelect(){
  const sel = document.getElementById('commDistSelect');
  if(!sel) return;
  const distributions = loadDistributions();
  if(distributions.length === 0){
    sel.innerHTML = '<option value="">등록된 배포 기록이 없습니다 — 위 ②에서 먼저 배포를 등록하세요</option>';
    return;
  }
  const prevValue = sel.value;
  sel.innerHTML = distributions.slice().reverse().map(d =>
    '<option value="' + d.id + '">' + esc(d.roundLabel) + ' (배포 ' + esc(d.distributedAt) + ', ' + d.recipients.length + '명)</option>'
  ).join('');
  if(prevValue && distributions.some(d => d.id === prevValue)) sel.value = prevValue;
}

export function generateCommMessages(){
  const distId = document.getElementById('commDistSelect').value;
  const type = document.getElementById('commTemplateType').value;
  const scope = document.getElementById('commScope').value;
  const distributions = loadDistributions();
  const dist = distributions.find(d => d.id === distId);
  const container = document.getElementById('commOutputContainer');
  if(!dist){ alert('배포 기록을 선택해 주세요.'); return; }
  let recipients = dist.recipients;
  if(scope === 'pending') recipients = recipients.filter(r => !r.received);
  if(recipients.length === 0){
    container.innerHTML = '<div class="ig-empty">' + (scope === 'pending' ? '미회신자가 없습니다. (전원 회신 완료)' : '대상자가 없습니다.') + '</div>';
    return;
  }
  const templates = loadCommTemplates();
  const tmpl = templates[type] || Object.values(templates)[0];
  container.innerHTML = recipients.map((r, i) => {
    const text = fillCommTemplate(tmpl.body, r, dist);
    return '<div class="comm-msg-card">'
      + '<div class="comm-msg-head"><span class="comm-msg-name">' + esc(r.name) + ' (' + esc(r.dept) + ')</span>'
      + '<button class="gen-small-btn" style="margin:0;" onclick="copyCommMessage(\'commMsg' + i + '\')">📋 복사</button></div>'
      + '<div class="comm-msg-text" id="commMsg' + i + '">' + esc(text) + '</div>'
      + '</div>';
  }).join('');
}

export function copyCommMessage(elId){
  const el = document.getElementById(elId);
  if(!el) return;
  const text = el.textContent;
  try{
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert('클립보드에 복사했습니다. 메신저에 붙여넣기 하세요.');
  }catch(e){
    alert('클립보드 복사에 실패했습니다. 아래 표시된 텍스트를 직접 선택해 복사해 주세요.');
  }
}

export function buildGroupwareTableHtml(){
  const rounds = loadRoundsFromStorage();
  const roundLabel = activeRoundLabel || '(저장되지 않은 작업 중 데이터)';
  const today = kstDateStr();

  // 부서별 집계
  const byDept = {};
  aggRows.forEach(r => {
    if(!r.dept) return;
    if(!byDept[r.dept]) byDept[r.dept] = {total:0, yes:0, partial:0, no:0, na:0};
    const d = byDept[r.dept];
    d.total++;
    if(r.tier === 'good') d.yes++;
    else if(r.tier === 'neutral') d.partial++;
    else if(r.tier === 'na') d.na++;
    else d.no++;
  });
  const depts = Object.keys(byDept).sort();

  // 위험도 상 미흡 항목 목록 (item-level, 중복 제거)
  const items = itemLevelRows();
  const highRiskIssues = items.filter(it => it.risk === '상' && it.hasIssue)
    .sort((a,b) => a.code.localeCompare(b.code));

  const deptRows = depts.map(dep => {
    const d = byDept[dep];
    const rate = d.total ? Math.round(d.yes/d.total*100) : 0;
    return '<tr><td style="padding:6px 10px;border:1px solid #ccc;">' + esc(dep) + '</td>'
      + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + d.total + '</td>'
      + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + d.yes + '</td>'
      + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + d.partial + '</td>'
      + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + d.no + '</td>'
      + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + d.na + '</td>'
      + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + rate + '%</td></tr>';
  }).join('');

  const issueRows = highRiskIssues.length === 0
    ? '<tr><td colspan="4" style="padding:8px 10px;border:1px solid #ccc;text-align:center;color:#777;">위험도 상 미흡 항목 없음</td></tr>'
    : highRiskIssues.map(it =>
        '<tr><td style="padding:6px 10px;border:1px solid #ccc;">' + esc(it.code) + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #ccc;">' + esc(it.title) + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #ccc;">' + esc(it.dept||'') + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #ccc;">' + esc(it.ownDept||'-') + '</td></tr>'
      ).join('');

  // 이 표는 감사부서 내부 종합보고·경영진 보고용입니다 (설문지 자체의 그룹웨어 요약표는 회신부서가
  // 자신의 응답만 보고하는 용도로 별도 존재 — 역할이 다르므로 담는 정보도 다릅니다).
  const totalAll = depts.reduce((s,d) => s + byDept[d].total, 0);
  const yesAll = depts.reduce((s,d) => s + byDept[d].yes, 0);
  const partialAll = depts.reduce((s,d) => s + byDept[d].partial, 0);
  const noAll = depts.reduce((s,d) => s + byDept[d].no, 0);
  const naAll = depts.reduce((s,d) => s + byDept[d].na, 0);
  const applicableAll = totalAll - naAll;
  const overallRate = applicableAll > 0 ? Math.round(yesAll/applicableAll*100) : 0;
  const deptsNeedingFollowup = depts.filter(d => highRiskIssues.some(it => it.dept === d));

  const followupRows = deptsNeedingFollowup.length === 0
    ? '<tr><td colspan="3" style="padding:8px 10px;border:1px solid #ccc;text-align:center;color:#777;">위험도 상 이슈로 후속조치가 필요한 부서 없음</td></tr>'
    : deptsNeedingFollowup.map(d => {
        const n = highRiskIssues.filter(it => it.dept === d).length;
        return '<tr><td style="padding:6px 10px;border:1px solid #ccc;">' + esc(d) + '</td>'
          + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + n + '</td>'
          + '<td style="padding:6px 10px;border:1px solid #ccc;">인터뷰·소명 요청 필요</td></tr>';
      }).join('');

  return '<div style="font-family:Pretendard,sans-serif;font-size:13px;color:#1b2330;">'
    + '<p style="margin:0 0 4px;color:#777;font-size:11.5px;">※ 이 표는 감사부서 내부 종합보고·경영진 보고용입니다. 회신부서가 자신의 협조문에 넣을 요약표는 각 설문지 화면의 [📋 그룹웨어 협조문용 요약표]를 이용하세요.</p>'
    + '<p style="margin:0 0 10px;"><b>회차:</b> ' + esc(roundLabel) + ' &nbsp;·&nbsp; <b>작성일:</b> ' + today + ' &nbsp;·&nbsp; <b>총 응답 건수:</b> ' + aggRows.length + '건</p>'
    + '<h4 style="margin:14px 0 6px;">0. 종합 현황</h4>'
    + '<table style="border-collapse:collapse;width:100%;font-size:12.5px;margin-bottom:6px;">'
      + '<tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;">참여 부서</th><th style="padding:6px 10px;border:1px solid #ccc;">이행</th><th style="padding:6px 10px;border:1px solid #ccc;">부분이행</th><th style="padding:6px 10px;border:1px solid #ccc;">미흡</th><th style="padding:6px 10px;border:1px solid #ccc;">해당없음</th><th style="padding:6px 10px;border:1px solid #ccc;">전체 이행률</th><th style="padding:6px 10px;border:1px solid #ccc;">위험상 미흡</th></tr>'
      + '<tr><td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + depts.length + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + yesAll + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + partialAll + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + noAll + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">' + naAll + '</td>'
        + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;font-weight:700;">' + overallRate + '%</td>'
        + '<td style="padding:6px 10px;border:1px solid #ccc;text-align:center;font-weight:700;color:#a23b2e;">' + highRiskIssues.length + '</td></tr>'
    + '</table>'
    + '<h4 style="margin:16px 0 6px;">1. 부서별 응답 현황</h4>'
    + '<table style="border-collapse:collapse;width:100%;font-size:12.5px;">'
      + '<tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;">부서</th><th style="padding:6px 10px;border:1px solid #ccc;">총 응답</th><th style="padding:6px 10px;border:1px solid #ccc;">이행</th><th style="padding:6px 10px;border:1px solid #ccc;">부분이행</th><th style="padding:6px 10px;border:1px solid #ccc;">미흡</th><th style="padding:6px 10px;border:1px solid #ccc;">해당없음</th><th style="padding:6px 10px;border:1px solid #ccc;">이행률</th></tr>'
      + deptRows
    + '</table>'
    + '<h4 style="margin:16px 0 6px;">2. 위험도 "상" 미흡 항목 목록</h4>'
    + '<table style="border-collapse:collapse;width:100%;font-size:12.5px;">'
      + '<tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;">항목코드</th><th style="padding:6px 10px;border:1px solid #ccc;">항목명</th><th style="padding:6px 10px;border:1px solid #ccc;">응답 부서</th><th style="padding:6px 10px;border:1px solid #ccc;">지목된 담당부서</th></tr>'
      + issueRows
    + '</table>'
    + '<h4 style="margin:16px 0 6px;">3. 후속조치(인터뷰·소명 요청) 필요 부서</h4>'
    + '<table style="border-collapse:collapse;width:100%;font-size:12.5px;">'
      + '<tr style="background:#f1ede1;"><th style="padding:6px 10px;border:1px solid #ccc;">부서</th><th style="padding:6px 10px;border:1px solid #ccc;">위험상 미흡 건수</th><th style="padding:6px 10px;border:1px solid #ccc;">조치</th></tr>'
      + followupRows
    + '</table>'
  + '</div>';
}

export function renderGwTemplateDeptOptions(){
  const sel = document.getElementById('gwTemplateDept');
  if(!sel) return;
  const depts = Array.from(new Set(findings.map(f => f.department).filter(Boolean))).sort();
  const cur = sel.value;
  sel.innerHTML = '<option value="">— 대상 부서 선택 —</option>' + depts.map(d => '<option value="' + esc(d) + '">' + esc(d) + '</option>').join('');
  if(depts.includes(cur)) sel.value = cur;
}

export function buildGwNoticeText(dept, tone){
  const deptFindings = findings.filter(f => f.department === dept);
  const today = kstDateStr();
  const greet = tone === 'formal'
    ? ('수신: ' + dept + ' 귀중\n발신: IT감사팀\n제목: [' + dept + '] IT 자체감사 결과 통보의 건\n\n1. 귀 부서의 업무 발전을 기원합니다.\n2. 금번 IT 자체감사(작성일: ' + today + ') 결과를 아래와 같이 통보하오니, 조치계획을 회신하여 주시기 바랍니다.\n')
    : ('안녕하세요, ' + dept + '입니다.\nIT감사팀입니다. 금번 IT 자체감사 결과를 아래와 같이 안내드립니다.\n');

  if(deptFindings.length === 0){
    const body = tone === 'formal'
      ? '\n3. 귀 부서는 금번 감사 결과 지적·개선사항이 확인되지 않았습니다. 앞으로도 관련 통제를 지속적으로 이행하여 주시기 바랍니다.\n\n끝.'
      : '\n금번 감사에서 귀 부서와 관련해 별도로 지적하거나 개선을 요청드릴 사항은 확인되지 않았습니다. 협조해 주셔서 감사합니다.\n\n앞으로도 잘 부탁드립니다.';
    return greet + body;
  }

  const ACTION_LABEL = Object.fromEntries(FINDING_TYPES.map(t => [t, FINDING_TYPE_META[t].full]));
  const byType = Object.fromEntries(FINDING_TYPES.map(t => [t, []]));
  byType[''] = [];
  deptFindings.forEach(f => { (byType[f.actionType || ''] = byType[f.actionType || ''] || []).push(f); });

  const listBlock = (label, arr) => {
    if(!arr || arr.length === 0) return '';
    return '\n■ ' + label + ' (' + arr.length + '건)\n' + arr.map((f,i) =>
      '  ' + (i+1) + ') ' + f.title + (f.riskLevel ? ' [위험도 ' + f.riskLevel + ']' : '') + (f.dueDate ? ' — 조치기한: ' + f.dueDate : '')
    ).join('\n') + '\n';
  };
  const allListBlocks = () => FINDING_TYPES.map(t => listBlock(ACTION_LABEL[t], byType[t])).join('');

  const hasHigh = deptFindings.some(f => f.riskLevel === '상');
  const urgentNote = hasHigh
    ? (tone === 'formal' ? '\n※ 위험도 "상" 항목이 포함되어 있어 우선적인 조치가 필요합니다.\n' : '\n⚠ 이 중 위험도 "상" 항목은 우선적으로 확인·조치 부탁드립니다.\n')
    : '';

  let body = '\n3. 귀 부서와 관련하여 아래와 같이 총 ' + deptFindings.length + '건의 사항이 확인되어 통보드립니다.\n'
    + allListBlocks()
    + urgentNote
    + (tone === 'formal'
      ? '\n4. 상기 사항에 대한 조치계획을 ' + '5영업일 이내 회신하여 주시기 바라며, 세부 내용은 첨부한 감사결과 통보서를 참고하여 주시기 바랍니다.\n\n끝.'
      : '\n첨부한 통보서에 세부 내용과 조치기한을 정리했으니 확인 부탁드리며, 조치계획 회신 부탁드립니다.\n\n궁금하신 점 있으시면 언제든 편하게 연락 주세요. 감사합니다.');

  if(tone !== 'formal'){
    body = '\n금번 감사에서 귀 부서와 관련해 아래와 같은 사항이 확인되었습니다 (총 ' + deptFindings.length + '건).\n'
      + allListBlocks()
      + urgentNote
      + '\n첨부한 통보서에 세부 내용과 조치기한을 정리했으니 확인 부탁드리며, 조치계획 회신 부탁드립니다.\n\n궁금하신 점 있으시면 언제든 편하게 연락 주세요. 감사합니다.';
  }

  return greet + body;
}

export function refreshGwTemplatePreview(){
  const dept = document.getElementById('gwTemplateDept').value;
  const tone = document.getElementById('gwTemplateTone').value;
  const preview = document.getElementById('gwTemplatePreview');
  if(!preview) return;
  if(!dept){
    // [v8.47] 대상 부서를 아직 안 고른 상태에서도 "뭐라고 써야 할지" 참고할 수 있도록,
    // 안내 한 줄 대신 실제 통보문 형식을 그대로 따른 예시 문구를 보여준다. 대상 부서를
    // 고르면 buildGwNoticeText()가 만든 실제 문구로 자동 교체된다.
    preview.value = '수신: ○○부 귀중\n발신: IT감사팀\n제목: [○○부] IT 자체감사 결과 통보의 건\n\n'
      + '1. 귀 부서의 업무 발전을 기원합니다.\n2. 금번 IT 자체감사 결과를 아래와 같이 통보하오니, 조치계획을 회신하여 주시기 바랍니다.\n\n'
      + '3. 귀 부서와 관련하여 아래와 같이 총 1건의 사항이 확인되어 통보드립니다.\n\n'
      + '■ 지적사항 (1건)\n  1) (예시) 계정 신청 시 이중 승인 절차 미준수 [위험도 중] — 조치기한: 2026-09-30\n\n'
      + '4. 상기 사항에 대한 조치계획을 5영업일 이내 회신하여 주시기 바라며, 세부 내용은 첨부한 감사결과 통보서를 참고하여 주시기 바랍니다.\n\n끝.';
    return;
  }
  preview.value = buildGwNoticeText(dept, tone);
}

export function renderCommOverviewSummary(){
  const box = document.getElementById('commOverviewSummary');
  if(!box) return;
  const name = (document.getElementById('auditNameInput') || {}).value || '(감사명 미입력 — ① 설문지 생성 탭에서 입력)';
  const purpose = (document.getElementById('auditPurposeInput') || {}).value || '(목적 미입력)';
  const dueDate = (document.getElementById('genDueDate') || {}).value || '(회신기한 미지정)';
  const findingsCount = (typeof loadFindings === 'function') ? loadFindings().length : 0;
  const distCount = (typeof loadDistributions === 'function') ? loadDistributions().length : 0;
  box.innerHTML =
    '<b style="color:var(--navy);">' + esc(name) + '</b><br>'
    + '목적: ' + esc(purpose) + '<br>'
    + '회신기한: ' + esc(dueDate) + ' · 배포 기록 ' + distCount + '건 · 발견사항 ' + findingsCount + '건';
}
