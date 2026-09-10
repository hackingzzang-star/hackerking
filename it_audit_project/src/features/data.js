// ============================================================
// ⚙ 데이터 관리(백업/복원/초기화, data 탭) — v8.55에서 app.js로부터 물리적으로 분리
// ------------------------------------------------------------
// 모듈별/전체 백업·복원, 데이터 초기화, 저장 용량 현황 등.
// 재할당되는 공유 가변 상태가 없어(전부 읽기 전용 참조) 세터가 필요 없었습니다.
// 이 탭은 "전체 백업/복원"이 목적이라 사실상 다른 모든 기능 모듈의 load*/save*/render*
// 함수를 한데 모아 쓰는 허브 성격이라, import가 8개 모듈에 걸쳐 있습니다.
// ============================================================
import {
  COMM_TEMPLATE_STORAGE_KEY,
  SYSTEM_VERSION,
  aggRows,
  aiNoContextCodes,
  customInterviewItems,
  findings,
  flowOverrides,
  interviewSchedule,
  interviewState,
  loadFindings,
  saveFindings,
  scriptOverrides,
  AI_NO_CONTEXT_KEY,
  MODULE_DEFS,
  STORAGE_ITEMS,
} from '../app.js';
import {
  escFd, getCurrentAuditName, kstDateStr, kstISOString, kstDateTimeStr, versionSuffix, safeAssign,
} from './common.js';
import {
  renderDistDomainChecks,
} from './generate.js';
import {
  buildAssignmentPacketJson,
  loadDistributions,
  loadRecipients,
  renderDistRecipientChecks,
  renderDistributionList,
  renderRecipientsTable,
  saveDistributions,
  saveRecipients,
} from './dist.js';
import {
  buildAggRowFromRecord,
  collectAssignedCodesByInterviewer,
  loadRoundsFromStorage,
  renderRoundHistory,
  saveRoundsToStorage,
  upsertAggRows,
} from './collect.js';
import {
  igFindItem,
  igItemMeta,
  loadCustomInterviewItems,
  loadFlowOverrides,
  loadInterviewState,
  loadScriptOverrides,
  renderCustomInterviewSection,
  renderIgSourceBanner,
  renderInterviewGuide,
  saveCustomInterviewItems,
  saveFlowOverrides,
  saveInterviewSchedule,
  saveInterviewState,
  saveScriptOverrides,
} from './interview.js';
import {
  renderCommDistSelect,
  renderCommTemplateTypeOptions,
} from './comm.js';
import {
  loadReportLog,
  renderReportLog,
  saveReportLog,
} from './report.js';
import {
  loadKanbanArchive,
  loadKanbanCards,
  renderKanbanArchive,
  renderKanbanBoard,
  saveKanbanArchive,
  saveKanbanCards,
} from './kanban.js';
import {
  renderFindingsTab,
} from './findings.js';

export function exportRoundById(id){
  const rounds = loadRoundsFromStorage();
  const r = rounds.find(x => x.id === id);
  if(!r) return;
  const blob = new Blob([JSON.stringify(r, null, 2)], {type:'application/json;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeLabel = String(r.label||'회차').replace(/[\\/:*?"<>|\s]+/g,'_');
  a.href = url; a.download = 'IT감사_회차_' + safeLabel + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importRoundFile(file){
  const reader = new FileReader();
  reader.onload = (e) => {
    try{
      const parsed = JSON.parse(e.target.result);
      // Accept: (a) our own round-snapshot format {label, savedAt, rows:[internal-shape...]}
      //         (b) a raw survey export {수검부서, 작성자, 작성일, 문항:[Korean-key...]}
      //         (c) a bare array of either shape
      let rawList = Array.isArray(parsed.rows) ? parsed.rows
                  : Array.isArray(parsed['문항']) ? parsed['문항']
                  : Array.isArray(parsed) ? parsed
                  : null;
      if(!rawList){ alert(file.name + ': 인식 가능한 회차 파일 구조가 아닙니다.'); return; }
      const isKoreanKeyed = rawList.length > 0 && Object.prototype.hasOwnProperty.call(rawList[0], '항목코드');
      const fallback = {dept: parsed['수검부서'] || '', author: parsed['작성자'] || '', date: parsed['작성일'] || ''};
      const rows = isKoreanKeyed
        ? rawList.map(rec => buildAggRowFromRecord(rec, fallback, file.name)).filter(Boolean)
        : rawList;

      const label = parsed.label || fallback.dept || file.name.replace(/\.json$/i,'');
      const rounds = loadRoundsFromStorage();
      const existingIdx = rounds.findIndex(r => r.label === label);

      if(existingIdx === -1){
        rounds.push({id: 'r' + Date.now(), label, savedAt: parsed.savedAt || kstISOString(), rows, auditName: parsed.auditName || getCurrentAuditName()});
        saveRoundsToStorage(rounds);
        renderRoundHistory();
        alert('회차를 이력 목록에 추가했습니다 (' + rows.length + '행). 목록에서 [불러오기]를 눌러 화면에 표시할 수 있습니다.');
        return;
      }

      // 같은 회차명이 이미 있으면 (수검자 여러 명이 시간차를 두고 회신하는 경우 흔함) 병합할지 물어본다.
      const existing = rounds[existingIdx];
      const mergedRows = JSON.parse(JSON.stringify(existing.rows || []));
      const {added, updated} = upsertAggRows(mergedRows, rows);
      const wantMerge = confirm(
        '"' + label + '" 회차가 이미 이력에 있습니다 (' + (existing.rows||[]).length + '행).\n\n' +
        '불러온 파일을 병합(Upsert)하면: 신규 ' + added + '건 추가, 겹치는 문항 ' + updated + '건은 이번 파일 값으로 갱신됩니다.\n\n' +
        '[확인] = 병합\n[취소] = 별도의 새 회차 항목으로 추가'
      );
      if(wantMerge){
        rounds[existingIdx] = {id: existing.id, label, savedAt: kstISOString(), rows: mergedRows, auditName: existing.auditName || parsed.auditName || getCurrentAuditName()};
        saveRoundsToStorage(rounds);
        renderRoundHistory();
        alert('병합 완료: 신규 ' + added + '건, 갱신 ' + updated + '건. (총 ' + mergedRows.length + '행)');
      } else {
        rounds.push({id: 'r' + Date.now(), label, savedAt: parsed.savedAt || kstISOString(), rows, auditName: parsed.auditName || getCurrentAuditName()});
        saveRoundsToStorage(rounds);
        renderRoundHistory();
        alert('별도의 새 회차 항목으로 추가했습니다 (' + rows.length + '행).');
      }
    }catch(err){
      alert(file.name + ' 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

export function exportAllData(){
  const bundle = {
    exportedAt: kstISOString(),
    systemVersion: SYSTEM_VERSION,
    recipients: loadRecipients(),
    distributions: loadDistributions(),
    rounds: loadRoundsFromStorage(),
    commTemplates: (() => { try{ return JSON.parse(localStorage.getItem(COMM_TEMPLATE_STORAGE_KEY) || '{}'); }catch(e){ return {}; } })(),
    interviewState: loadInterviewState(),
    findings: loadFindings(),
    scriptOverrides: loadScriptOverrides(),
    flowOverrides: loadFlowOverrides(),
    customInterviewItems: loadCustomInterviewItems(),
    kanban: loadKanbanCards(),
    kanbanArchive: loadKanbanArchive(),
    reportLog: loadReportLog(),
    interviewSchedule: { ...interviewSchedule },
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {type:'application/json;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IT감사_전체데이터_백업' + versionSuffix() + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importAllData(file){
  const reader = new FileReader();
  reader.onload = (e) => {
    try{
      const bundle = JSON.parse(e.target.result);
      const cur = {
        recipients: loadRecipients().length,
        distributions: loadDistributions().length,
        rounds: loadRoundsFromStorage().length,
        interviews: Object.keys(loadInterviewState()).length,
        findings: loadFindings().length,
        kanban: loadKanbanCards().length,
        kanbanArchive: loadKanbanArchive().length,
        reportLog: loadReportLog().length,
      };
      const inc = {
        recipients: Array.isArray(bundle.recipients) ? bundle.recipients.length : 0,
        distributions: Array.isArray(bundle.distributions) ? bundle.distributions.length : 0,
        rounds: Array.isArray(bundle.rounds) ? bundle.rounds.length : 0,
        interviews: bundle.interviewState ? Object.keys(bundle.interviewState).length : 0,
        findings: Array.isArray(bundle.findings) ? bundle.findings.length : 0,
        kanban: Array.isArray(bundle.kanban) ? bundle.kanban.length : 0,
        kanbanArchive: Array.isArray(bundle.kanbanArchive) ? bundle.kanbanArchive.length : 0,
        reportLog: Array.isArray(bundle.reportLog) ? bundle.reportLog.length : 0,
      };
      const msg = '백업 파일을 확인했습니다 (' + (bundle.exportedAt ? new Date(bundle.exportedAt).toLocaleString('ko-KR') : '날짜 미상') + ' 저장분).\n\n'
        + '현재 → 백업 파일 기준으로 아래 항목이 전부 교체됩니다:\n'
        + '· 수검자 명부: ' + cur.recipients + '명 → ' + inc.recipients + '명\n'
        + '· 배포 기록: ' + cur.distributions + '건 → ' + inc.distributions + '건\n'
        + '· 설문 회차 이력: ' + cur.rounds + '개 → ' + inc.rounds + '개\n'
        + '· 인터뷰 기록: ' + cur.interviews + '건 → ' + inc.interviews + '건\n'
        + '· 발견사항: ' + cur.findings + '건 → ' + inc.findings + '건\n'
        + '· 🗂 칸반보드: ' + cur.kanban + '건 → ' + inc.kanban + '건\n'
        + '· 🗄 칸반 보관함: ' + cur.kanbanArchive + '건 → ' + inc.kanbanArchive + '건\n'
        + '· 📜 보고서 생성 이력: ' + cur.reportLog + '건 → ' + inc.reportLog + '건\n'
        + (bundle.commTemplates ? '· 메시지 템플릿도 함께 교체됩니다.\n' : '')
        + (bundle.scriptOverrides ? '· 인터뷰 질문 편집 내역도 함께 교체됩니다.\n' : '')
        + (bundle.flowOverrides ? '· 인터뷰 순서도·분기형 편집 내역도 함께 교체됩니다.\n' : '')
        + (bundle.customInterviewItems ? '· 체크리스트 외 별도 확인사항도 함께 교체됩니다.\n' : '')
        + (bundle.interviewSchedule ? '· 인터뷰 일정도 함께 교체됩니다.\n' : '')
        + '\n현재 작업 중인(미저장) 응답 데이터에는 영향이 없습니다.\n\n계속할까요?';
      if(!confirm(msg)) return;
      if(Array.isArray(bundle.recipients)) saveRecipients(bundle.recipients);
      if(Array.isArray(bundle.distributions)) saveDistributions(bundle.distributions);
      if(Array.isArray(bundle.rounds)) saveRoundsToStorage(bundle.rounds);
      if(bundle.commTemplates) localStorage.setItem(COMM_TEMPLATE_STORAGE_KEY, JSON.stringify(bundle.commTemplates));
      if(bundle.interviewState){
        Object.keys(interviewState).forEach(k => delete interviewState[k]);
        safeAssign(interviewState, bundle.interviewState);
        saveInterviewState();
      }
      if(Array.isArray(bundle.findings)){
        findings.length = 0;
        findings.push(...bundle.findings);
        saveFindings();
      }
      if(bundle.scriptOverrides){
        Object.keys(scriptOverrides).forEach(k => delete scriptOverrides[k]);
        safeAssign(scriptOverrides, bundle.scriptOverrides);
        saveScriptOverrides();
      }
      if(bundle.flowOverrides){
        Object.keys(flowOverrides).forEach(k => delete flowOverrides[k]);
        safeAssign(flowOverrides, bundle.flowOverrides);
        saveFlowOverrides();
      }
      if(Array.isArray(bundle.customInterviewItems)){
        customInterviewItems.length = 0;
        customInterviewItems.push(...bundle.customInterviewItems);
        saveCustomInterviewItems();
      }
      if(Array.isArray(bundle.kanban)){
        saveKanbanCards(bundle.kanban);
      }
      if(Array.isArray(bundle.kanbanArchive)){
        saveKanbanArchive(bundle.kanbanArchive);
      }
      if(Array.isArray(bundle.reportLog)){
        saveReportLog(bundle.reportLog);
      }
      if(bundle.interviewSchedule){
        Object.keys(interviewSchedule).forEach(k => delete interviewSchedule[k]);
        safeAssign(interviewSchedule, bundle.interviewSchedule);
        saveInterviewSchedule();
      }
      renderRecipientsTable();
      renderDistDomainChecks();
      renderDistRecipientChecks();
      renderDistributionList();
      renderCommDistSelect();
      renderCommTemplateTypeOptions();
      renderRoundHistory();
      renderIgSourceBanner();
      renderInterviewGuide();
      if(typeof renderFindingsTab === 'function') renderFindingsTab();
      if(typeof renderCustomInterviewSection === 'function') renderCustomInterviewSection();
      if(typeof renderKanbanBoard === 'function') renderKanbanBoard();
      if(typeof renderKanbanArchive === 'function') renderKanbanArchive();
      if(typeof renderReportLog === 'function') renderReportLog();
      const scheduleTbl = document.getElementById('interviewScheduleTable');
      if(scheduleTbl) scheduleTbl.innerHTML = '';
      alert('전체 데이터를 복원했습니다.');
    }catch(err){
      alert(file.name + ' 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

export function moduleCount(defType, data){
  if(defType === 'array') return Array.isArray(data) ? data.length : 0;
  return data ? Object.keys(data).length : 0;
}

export function exportModuleData(){
  const key = document.getElementById('moduleSelect').value;
  const def = MODULE_DEFS[key];
  if(!def) return;
  const data = def.load();
  if(moduleCount(def.type, data) === 0){
    if(!confirm('"' + def.label + '"에 저장된 데이터가 없습니다. 빈 백업 파일을 그래도 내려받을까요?')) return;
  }
  const bundle = { exportedAt: kstISOString(), systemVersion: SYSTEM_VERSION, module: key, moduleLabel: def.label, data: data };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {type:'application/json;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeLabel = def.label.replace(/[\\/:*?"<>|\s]+/g, '_');
  a.href = url; a.download = 'IT감사_' + safeLabel + '_백업' + versionSuffix() + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importModuleData(file){
  const reader = new FileReader();
  reader.onload = (e) => {
    try{
      const bundle = JSON.parse(e.target.result);
      const key = document.getElementById('moduleSelect').value;
      const def = MODULE_DEFS[key];
      if(!def) return;

      if(bundle.module && bundle.module !== key){
        const proceed = confirm(
          '지금 선택된 항목은 "' + def.label + '"인데, 이 백업 파일은 "' + (bundle.moduleLabel || bundle.module) + '" 백업으로 보입니다.\n\n' +
          '항목이 서로 다르면 복원 후 데이터가 깨질 수 있습니다. 그래도 진행할까요?\n\n' +
          '[취소]를 누르고 위 드롭다운을 "' + (bundle.moduleLabel || bundle.module) + '"(으)로 바꾼 뒤 다시 시도하는 것을 권장합니다.'
        );
        if(!proceed) return;
      }

      const incomingData = ('data' in bundle) ? bundle.data : bundle; // 구버전/직접 배열·객체 파일도 호환
      const curData = def.load();
      const curCount = moduleCount(def.type, curData);
      const incCount = moduleCount(def.type, incomingData);

      const strategy = prompt(
        '"' + def.label + '" 복원 방식을 선택해 주세요.\n\n' +
        '1 = 병합 (겹치는 항목은 백업 내용으로 갱신, 새 항목은 추가, 그 외 기존 항목은 그대로 유지)\n' +
        '2 = 완전 교체 (이 항목 전체를 백업 파일 내용으로 바꿈 — 기존의 다른 데이터는 그대로 유지됨)\n\n' +
        '현재 ' + curCount + '건 / 백업 파일 ' + incCount + '건\n\n숫자 1 또는 2를 입력하세요.',
        '1'
      );
      if(strategy !== '1' && strategy !== '2') return;

      let finalData, summaryMsg;
      if(def.type === 'array'){
        const incomingArr = Array.isArray(incomingData) ? incomingData : [];
        if(strategy === '2'){
          finalData = incomingArr;
          summaryMsg = '완전 교체: ' + curCount + '건 → ' + incomingArr.length + '건';
        } else {
          const merged = Array.isArray(curData) ? JSON.parse(JSON.stringify(curData)) : [];
          let added = 0, updated = 0;
          incomingArr.forEach(item => {
            const idVal = def.idKey ? item[def.idKey] : undefined;
            const idx = (idVal !== undefined) ? merged.findIndex(x => x[def.idKey] === idVal) : -1;
            if(idx === -1){ merged.push(item); added++; }
            else { merged[idx] = item; updated++; }
          });
          finalData = merged;
          summaryMsg = '병합: 신규 ' + added + '건 추가, ' + updated + '건 갱신 (기존 ' + curCount + '건 → 총 ' + finalData.length + '건)';
        }
      } else {
        const incomingObj = (incomingData && typeof incomingData === 'object') ? incomingData : {};
        if(strategy === '2'){
          finalData = incomingObj;
          summaryMsg = '완전 교체: ' + curCount + '개 항목 → ' + Object.keys(incomingObj).length + '개 항목';
        } else {
          finalData = Object.assign({}, (curData && typeof curData === 'object') ? curData : {}, incomingObj);
          summaryMsg = '병합: 기존 ' + curCount + '개 + 백업 ' + Object.keys(incomingObj).length + '개 → 총 ' + Object.keys(finalData).length + '개 항목';
        }
      }

      if(!confirm('"' + def.label + '" 복원을 진행합니다.\n\n' + summaryMsg + '\n\n계속할까요?')) return;

      def.save(finalData);
      if(def.after) def.after();

      const previewEl = document.getElementById('moduleImportPreview');
      if(previewEl){
        previewEl.style.display = 'block';
        previewEl.textContent = '✓ "' + def.label + '" 복원 완료 (' + kstDateTimeStr() + ') — ' + summaryMsg;
      }
      alert('"' + def.label + '"을(를) 복원했습니다.\n' + summaryMsg);
    }catch(err){
      alert(file.name + ' 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

export function exportIndividualSubmission(dept, author){
  // 여러 부서 응답을 한 번에 취합해서 보는 것 외에, "이 사람 하나만" 명확하게 보고 인쇄해
  // 인터뷰 전에 지참·검토할 수 있도록 하는 개별 응답지 출력 기능.
  const isMissingDept = dept === '(부서 미입력)';
  const isMissingAuthor = author === '(작성자 미입력)';
  const rows = aggRows.filter(r =>
    (isMissingDept ? !r.dept : r.dept === dept) && (isMissingAuthor ? !r.author : r.author === author)
  );
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
  const interviewNote = rows.find(r => r.interviewNote)?.interviewNote || '';
  const interviewContact = rows.find(r => r.interviewContact)?.interviewContact || '';
  const TIER_ICON5 = {good:'✅', neutral:'🟡', bad:'🚩', na:'⬜'};
  const TIER_LABEL6 = {good:'이행', neutral:'부분이행', bad:'미흡', na:'해당없음'};

  const itemBlocks = order.map(code => {
    const itemRows = byCode[code];
    const meta = igItemMeta(code);
    const note = itemRows.find(r => r.note)?.note || '';
    const sr = itemRows.find(r => r.sr)?.sr || '';
    const srNote = itemRows.find(r => r.srNote)?.srNote || '';
    const evidence = itemRows.find(r => r.evidence)?.evidence || '';
    return '<div class="is2-item">'
      + '<div class="is2-item-head"><span class="is2-code">' + escFd(code) + '</span>' + escFd(meta.title)
        + (sr ? '<span class="is2-sr">자체평가: ' + escFd(sr) + '</span>' : '') + '</div>'
      + '<ul class="is2-cp-list">'
        + itemRows.map(r => '<li><span class="is2-badge ' + (r.tier||'neutral') + '">' + (TIER_ICON5[r.tier]||'') + ' ' + (TIER_LABEL6[r.tier]||r.resp||'') + '</span>' + escFd(r.cptext||'') + '</li>').join('')
      + '</ul>'
      + (note ? '<div class="is2-note">📝 비고: ' + escFd(note) + '</div>' : '')
      + (srNote ? '<div class="is2-note">🗒 자체평가 근거: ' + escFd(srNote) + '</div>' : '')
      + (evidence ? '<div class="is2-note" style="border-left-color:var(--good, #2e7d5b);">📎 증빙: ' + escFd(evidence) + '</div>' : '')
    + '</div>';
  }).join('');

  const html = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>개별 응답지 — ' + escFd(dept) + ' ' + escFd(author) + '</title><style>'
    + 'body{font-family:"Pretendard","Noto Sans KR",sans-serif;color:#1b2330;max-width:820px;margin:24px auto;padding:0 20px;}'
    + '.is2-hero{background:#132845;color:#f4efe2;padding:22px 28px;border-radius:6px 6px 0 0;}'
    + '.is2-hero .eyebrow{font-family:monospace;letter-spacing:.15em;font-size:11px;color:#e4c78a;text-transform:uppercase;margin-bottom:6px;}'
    + '.is2-hero h1{margin:0;font-size:20px;}'
    + '.is2-hero .sub{font-size:12px;color:#c9d2e2;margin-top:6px;}'
    + '.is2-body{border:1px solid #dcd6c8;border-top:none;padding:20px 24px;}'
    + '.is2-meta{background:#fdf2e9;border:1px solid #edcba8;border-radius:6px;padding:10px 14px;font-size:12.5px;margin-bottom:18px;line-height:1.7;}'
    + '.is2-item{border:1px solid #dcd6c8;border-radius:6px;padding:12px 16px;margin-bottom:12px;page-break-inside:avoid;}'
    + '.is2-item-head{font-weight:700;font-size:13.5px;color:#132845;margin-bottom:8px;}'
    + '.is2-code{font-family:monospace;font-size:11px;color:#4a6187;margin-right:8px;}'
    + '.is2-sr{float:right;font-size:11px;font-weight:400;background:#eeecf7;color:#463b8a;padding:2px 8px;border-radius:10px;}'
    + '.is2-cp-list{list-style:none;margin:0;padding:0;}'
    + '.is2-cp-list li{display:flex;gap:8px;padding:5px 2px;font-size:12.5px;border-top:1px dashed #dcd6c8;}'
    + '.is2-cp-list li:first-child{border-top:none;}'
    + '.is2-badge{flex:none;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:9px;white-space:nowrap;}'
    + '.is2-badge.good{background:#e5f2ea;color:#2e7d5b;}.is2-badge.neutral{background:#f7edd9;color:#b8863b;}'
    + '.is2-badge.bad{background:#f7e6e2;color:#a23b2e;}.is2-badge.na{background:#eee;color:#5a6472;}'
    + '.is2-note{font-size:11.5px;color:#1b2330;background:#f5f1e6;border-left:3px solid #b8863b;padding:5px 10px;margin-top:6px;}'
    + '.is2-print-btn{margin:14px 0;font-family:monospace;font-size:12px;background:#132845;color:#f4efe2;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;}'
    + '@media print{ .is2-print-btn{display:none;} body{margin:0;max-width:none;} @page{size:A4;margin:14mm 12mm;} }'
    + '</style></head><body>'
    + '<button class="is2-print-btn" onclick="window.print()">🖨 인쇄 / PDF 저장</button>'
    + '<div class="is2-hero"><div class="eyebrow">IT AUDIT · 개별 응답지</div><h1>' + escFd(dept) + ' — ' + escFd(author) + '</h1><div class="sub">작성일: ' + kstDateStr() + ' (KST) 기준 취합 · 총 ' + order.length + '개 항목</div></div>'
    + '<div class="is2-body">'
      + ((interviewContact || interviewNote) ? ('<div class="is2-meta">'
          + (interviewContact ? '<b>👤 인터뷰 담당자:</b> ' + escFd(interviewContact) + '<br>' : '')
          + (interviewNote ? '<b>🗓 조율 참고사항:</b> ' + escFd(interviewNote) : '')
        + '</div>') : '')
      + itemBlocks
    + '</div>'
    + '</body></html>';
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=860,height=1000');
}

export function loadAiNoContextCodes(){ try{ const arr = JSON.parse(localStorage.getItem(AI_NO_CONTEXT_KEY) || '[]'); return new Set(Array.isArray(arr) ? arr : []); }catch(e){ return new Set(); } }

export function saveAiNoContextCodes(){ try{ localStorage.setItem(AI_NO_CONTEXT_KEY, JSON.stringify(Array.from(aiNoContextCodes))); }catch(e){ /* non-fatal */ } }

export function getStorageItemCount(key){
  let raw = null;
  try{ raw = localStorage.getItem(key); }catch(e){ return 0; }
  if(!raw) return 0;
  try{
    const parsed = JSON.parse(raw);
    if(Array.isArray(parsed)) return parsed.length;
    if(parsed && typeof parsed === 'object') return Object.keys(parsed).length;
    return 1;
  }catch(e){
    return raw ? 1 : 0; // 값이 순수 문자열(예: 현재 작업자 이름)인 저장 항목
  }
}

export function renderStorageStatusTable(){
  const tbl = document.getElementById('storageStatusTable');
  if(!tbl) return;
  const GROUP_BADGE = {
    audit: '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;background:var(--indigo-bg);color:var(--indigo);white-space:nowrap;">🧑‍💼 감사자 작업 데이터</span>',
    response: '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;background:var(--good-bg);color:var(--good);white-space:nowrap;">📋 응답 취합 데이터(설문자 원본 기반)</span>',
  };
  let rows = '<tr><th>저장 항목</th><th style="width:180px;">구분</th><th style="width:70px;">건수</th><th style="width:100px;white-space:nowrap;"></th></tr>';
  STORAGE_ITEMS.forEach((item, idx) => {
    const count = getStorageItemCount(item.key);
    rows += '<tr' + (count === 0 ? ' style="color:var(--ink-soft);"' : '') + '>'
      + '<td>' + item.label + '</td>'
      + '<td>' + (GROUP_BADGE[item.group] || '') + '</td>'
      + '<td class="mono" style="text-align:center;">' + count + '</td>'
      + '<td style="white-space:nowrap;"><button type="button" class="assign-dept-reset-btn storage-clear-btn" data-idx="' + idx + '" style="width:auto;padding:3px 10px;font-size:10.5px;white-space:nowrap;"' + (count === 0 ? ' disabled' : '') + '>🗑️ 지우기</button></td>'
    + '</tr>';
  });
  tbl.innerHTML = rows;
  tbl.querySelectorAll('.storage-clear-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = STORAGE_ITEMS[Number(btn.dataset.idx)];
      if(!item) return;
      if(!confirm('"' + item.label + '" 데이터를 지웁니다. 필요하면 지우기 전에 위에서 먼저 백업하세요.\n\n계속할까요?')) return;
      item.clear();
      renderStorageStatusTable();
    });
  });
}

export function handleAiJsonImportText(text, hasContext){
  let raw = String(text || '').trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if(first === -1 || last === -1 || last <= first){
    return {error: 'JSON 객체를 찾지 못했습니다. { 로 시작해서 } 로 끝나는 AI 응답을 그대로 붙여넣어 주세요.'};
  }
  raw = raw.slice(first, last + 1);
  let data;
  try { data = JSON.parse(raw); } catch(e){ return {error: 'JSON 파싱 실패: ' + e.message}; }
  if(!data || typeof data !== 'object' || Array.isArray(data)) return {error: '최상위가 객체(JSON object)가 아닙니다.'};

  let scriptUpdated = 0, flowUpdated = 0, skippedUnknown = 0;
  const warnings = [];
  let noContextChanged = false;
  Object.keys(data).forEach(code => {
    const entry = data[code];
    if(!entry || typeof entry !== 'object') return;
    if(!igFindItem(code)){ skippedUnknown++; return; }

    let thisCodeUpdated = false;

    if(entry.script && typeof entry.script === 'object'){
      const s = entry.script;
      const ov = {};
      ['decisionQ','verify','verifyEnd','partial','partialEnd','rootcause','rootcauseEnd','na','naEnd'].forEach(k => {
        if(s[k] !== undefined) ov[k] = s[k];
      });
      if(Object.keys(ov).length){
        scriptOverrides[code] = Object.assign({}, scriptOverrides[code] || {}, ov);
        scriptUpdated++;
        thisCodeUpdated = true;
      }
    }

    if(entry.flow && typeof entry.flow === 'object' && Array.isArray(entry.flow.steps)){
      const steps = entry.flow.steps;
      if(steps.length === 0 || !steps.every(st => st && typeof st.q === 'string' && st.q.trim())){
        warnings.push(code + ' (flow.steps에 질문(q)이 빠진 항목이 있어 ②순서도 반영을 건너뜀)');
      } else {
        flowOverrides[code] = {
          steps: steps.map(st => ({
            q: st.q || '', label1: st.label1 || '', label2: st.label2 || '', guide: st.guide || '',
            downLabel: st.downLabel || '',
            fails: Array.isArray(st.fails) ? st.fails.map(f => ({label: f.label || '', title: f.title || '', sub: f.sub || '', text: f.text || ''})) : [],
            holdLabel: st.holdLabel || null
          })),
          goodText: entry.flow.goodText || '',
          holdEnd: (entry.flow.holdEnd && (entry.flow.holdEnd.title || entry.flow.holdEnd.text)) ? {title: entry.flow.holdEnd.title || '', text: entry.flow.holdEnd.text || ''} : null
        };
        flowUpdated++;
        thisCodeUpdated = true;
      }
    }

    // [v8.44] 이번 가져오기로 실제 반영된 항목만 "사실·우려사항 유무" 표시를 갱신한다 — 반영이 없으면
    // 건너뛴 항목이므로 이전 표시 상태를 그대로 둔다.
    if(thisCodeUpdated){
      const wasNoContext = aiNoContextCodes.has(code);
      if(hasContext){
        if(wasNoContext){ aiNoContextCodes.delete(code); noContextChanged = true; }
      } else {
        if(!wasNoContext){ aiNoContextCodes.add(code); noContextChanged = true; }
      }
    }
  });

  if(scriptUpdated) saveScriptOverrides();
  if(flowUpdated) saveFlowOverrides();
  if(noContextChanged) saveAiNoContextCodes();
  if((scriptUpdated || flowUpdated) && typeof renderInterviewGuide === 'function') renderInterviewGuide();

  return {scriptUpdated, flowUpdated, skippedUnknown, warnings};
}

export function exportAssignedPacketsByAuditor(){
  const byPerson = collectAssignedCodesByInterviewer();
  const names = Object.keys(byPerson).sort();
  if(names.length === 0){
    alert('아직 "진행 감사자"가 지정된 항목이 없습니다.\n\n영역별 담당 감사자를 ①설문지 생성 단계에서 미리 배정해두었다면 🎤인터뷰 가이드를 한 번 열어 반영한 뒤 다시 시도해 주세요. 그게 아니라면 각 항목 카드의 "진행 감사자" 칸에 이름을 먼저 입력해 주세요.');
    return;
  }
  if(!confirm(names.length + '명에게 배정된 항목을 사람별로 나눠 파일 ' + names.length + '개를 내려받습니다.\n\n' + names.map(n => '· ' + n + ' (' + byPerson[n].length + '건)').join('\n') + '\n\n계속할까요?')) return;

  names.forEach((name, idx) => {
    const payload = buildAssignmentPacketJson(name, byPerson[name]);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const namePart = name.replace(/[\\\/:*?"<>|\s]+/g,'_');
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = url; a.download = 'IT감사_인터뷰배정_' + namePart + (typeof versionSuffix === 'function' ? versionSuffix() : '') + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, idx * 250); // 여러 파일을 한꺼번에 트리거하면 브라우저가 일부를 막을 수 있어 약간씩 간격을 둔다
  });
}
