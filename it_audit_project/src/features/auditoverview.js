// ============================================================
// 📊 감사 개요·진행현황 (auditOverview 탭) — v8.57에서 app.js로부터 물리적으로 분리
// ------------------------------------------------------------
// 전체 진행률 대시보드, IPPF 단계별 상태 배지 등. 재할당되는 공유 가변 상태가 없어
// 세터가 필요 없었습니다.
// ============================================================
import {
  DOMAINS,
} from '../app.js';
import { esc } from './common.js';
import {
  collectAuditWideStats,
} from './collect.js';
import {
  renderIppfFlow,
} from './interview.js';
import {
  riskCounts,
} from './generate.js';

export function buildAuditOverviewGridHtml(stats){
  const ctx = stats.ctx || {};
  const domainList = (ctx.domainTitles || []);
  const subjectText = (ctx.auditName && ctx.auditName !== '(감사명 미입력)') ? ctx.auditName : '(① 감사 배경 단계에서 감사명을 입력하면 반영됩니다)';
  const objectiveText = (ctx.purpose && !String(ctx.purpose).startsWith('(')) ? ctx.purpose : '(① 감사 배경 단계에서 감사 목적을 입력하면 반영됩니다)';
  const groundsText = (ctx.grounds || '').trim();
  const scopeText = domainList.length > 0
    ? (domainList.length + '개 영역 · 총 ' + stats.totalItems + '개 항목')
    : '(③ 감사 영역 선택 단계에서 영역을 고르면 반영됩니다)';
  const scopeSub = domainList.length > 0 ? domainList.map(d => d.title).join(', ') : '';
  const resourceText = (ctx.participants && ctx.participants.trim()) ? ctx.participants : '(⑥ 담당부서·감사자 배정 또는 감사착수문서 참여자란에서 반영됩니다)';
  const schedParts = [];
  if(ctx.dueDate && ctx.dueDate !== '(미지정)') schedParts.push('설문 회신 ' + ctx.dueDate + '까지');
  if(ctx.fieldPeriodText && !String(ctx.fieldPeriodText).startsWith('(')) schedParts.push('현장점검 ' + ctx.fieldPeriodText);
  if(ctx.reportDate) schedParts.push('보고 예정 ' + ctx.reportDate);
  const scheduleText = schedParts.length > 0 ? schedParts.join(' · ') : '(⑤ 회신기한 또는 감사착수문서 단계에서 일정을 입력하면 반영됩니다)';

  return (
      '<div class="aop-row"><div class="aop-label">🏷 SUBJECT<br><span class="aop-label-kr">주제(감사명)</span></div>'
        + '<div class="aop-val">' + esc(subjectText) + '</div></div>'
    + '<div class="aop-row"><div class="aop-label">🎯 OBJECTIVE<br><span class="aop-label-kr">목적</span></div>'
        + '<div class="aop-val">' + esc(objectiveText) + (groundsText ? ('<div class="aop-sub">실시 사유: ' + esc(groundsText) + '</div>') : '') + '</div></div>'
    + '<div class="aop-row"><div class="aop-label">🗺 SCOPE<br><span class="aop-label-kr">범위</span></div>'
        + '<div class="aop-val">' + esc(scopeText) + (scopeSub ? ('<div class="aop-sub">' + esc(scopeSub) + '</div>') : '') + '</div></div>'
    + '<div class="aop-row"><div class="aop-label">👥 RESOURCE<br><span class="aop-label-kr">자원(감사역)</span></div>'
        + '<div class="aop-val">' + esc(resourceText) + '</div></div>'
    + '<div class="aop-row"><div class="aop-label">🗓 SCHEDULE<br><span class="aop-label-kr">일정</span></div>'
        + '<div class="aop-val">' + esc(scheduleText) + '</div></div>'
  );
}

export function renderAuditOverviewPanel(){
  const grid = document.getElementById('aopGrid');
  if(!grid) return;
  grid.innerHTML = buildAuditOverviewGridHtml(collectAuditWideStats());
}

export function renderAuditOverviewScreen(){
  const grid = document.getElementById('aopGridFull');
  if(!grid) return;
  const stats = collectAuditWideStats();
  grid.innerHTML = buildAuditOverviewGridHtml(stats);
  renderIppfFlow(stats);

  const progEl = document.getElementById('aopProgress');
  if(progEl){
    const respDeptCount = stats.respDepts ? stats.respDepts.size : 0;
    const t = stats.tierCounts || {good:0, neutral:0, bad:0, na:0};
    const interviewPct = stats.interviewTotal > 0 ? Math.round(stats.interviewDoneCount / stats.interviewTotal * 100) : null;
    const topBadHtml = (stats.topBadDomains && stats.topBadDomains.length > 0)
      ? stats.topBadDomains.map(d => '<span class="aop-pill risk">' + esc(d.title) + ' ' + d.count + '건</span>').join('')
      : '<span class="aop-pill-empty">미흡으로 집계된 응답 없음</span>';

    progEl.innerHTML =
        '<div class="dash-card"><h4>응답 현황</h4>'
          + '<div class="progress-num">' + stats.totalResp + '<span> / ' + (stats.totalItems > 0 ? stats.totalItems + '개 항목' : '?') + '</span></div>'
          + '<div class="resp-bar-row" style="margin-top:10px;"><span class="lbl">이행</span><span class="cnt mono">' + t.good + '</span></div>'
          + '<div class="resp-bar-row"><span class="lbl">부분이행</span><span class="cnt mono">' + t.neutral + '</span></div>'
          + '<div class="resp-bar-row"><span class="lbl">미흡</span><span class="cnt mono">' + t.bad + '</span></div>'
          + '<div class="resp-bar-row"><span class="lbl">해당없음</span><span class="cnt mono">' + t.na + '</span></div>'
          + '<div style="font-size:11.5px;color:var(--ink-soft);margin-top:6px;">응답 부서 ' + respDeptCount + '곳</div>'
        + '</div>'
        + '<div class="dash-card"><h4>인터뷰 수행률</h4>'
          + '<div class="progress-num">' + (interviewPct === null ? '—' : interviewPct + '%') + '<span>' + (stats.interviewTotal > 0 ? (' (' + stats.interviewDoneCount + '/' + stats.interviewTotal + ')') : ' (아직 진행된 인터뷰 없음)') + '</span></div>'
        + '</div>'
        + '<div class="dash-card"><h4>칸반보드 진행률</h4>'
          + '<div class="progress-num">' + (stats.kbPct === null ? '—' : stats.kbPct + '%') + '<span>' + (stats.kbAll.length > 0 ? (' (' + stats.kbDone + '/' + stats.kbAll.length + ')') : ' (등록된 카드 없음)') + '</span></div>'
        + '</div>'
        + '<div class="dash-card"><h4>위험도 상위 영역 (미흡 응답 기준)</h4><div style="margin-top:6px;">' + topBadHtml + '</div></div>';
  }
}

export function renderOverview(){
  const summaryBar = document.getElementById('overviewSummaryBar');
  const list = document.getElementById('overviewList');
  if(!list) return;
  let totItems=0, totCp=0, totHi=0, totMid=0, totLo=0;
  const riskBadgeStyle = {상:'background:var(--risk-hi-bg);color:var(--risk-hi);', 중:'background:var(--risk-mid-bg);color:var(--risk-mid);', 하:'background:#eceae4;color:var(--ink-soft);'};

  const domainBlocks = DOMAINS.map(dom => {
    const cp = dom.items.reduce((s,it) => s + it.checkpoints.length, 0);
    const rc = riskCounts(dom);
    totItems += dom.items.length; totCp += cp; totHi += rc['상']; totMid += rc['중']; totLo += rc['하'];
    const chips = ['상','중','하'].filter(k => rc[k] > 0).map(k => {
      const cls = k === '상' ? 'hi' : (k === '중' ? 'mid' : 'lo');
      return '<span class="rchip ' + cls + '">' + k + ' ' + rc[k] + '</span>';
    }).join('');
    const itemRows = dom.items.map(it =>
      '<div class="ov-item-row" data-domain="' + dom.code + '" data-no="' + it.no + '"><div class="ov-item-top"><span class="ov-ino">' + it.no + '.</span><span class="ov-irisk" style="' + (riskBadgeStyle[it.risk]||'') + '">' + esc(it.risk) + '</span></div><span class="ov-ititle" title="' + esc(it.title) + '">' + esc(it.title) + '</span></div>'
    ).join('');
    return '<details class="ov-domain">'
      + '<summary><span class="ov-dcode">D-' + dom.code + '</span><span class="ov-dtitle" title="' + esc(dom.title) + '">' + esc(dom.title) + '</span><span class="ov-dmeta">' + dom.items.length + '항목 · ' + cp + '체크포인트</span><span class="ov-drisk">' + chips + '</span></summary>'
      + '<div class="ov-item-list">' + itemRows + '</div>'
    + '</details>';
  }).join('');
  list.innerHTML = domainBlocks;

  if(summaryBar){
    summaryBar.innerHTML = [
      ['영역', DOMAINS.length + '개'],
      ['총 항목', totItems + '개'],
      ['총 체크포인트', totCp + '개'],
      ['위험도 상', totHi + '개'],
      ['위험도 중', totMid + '개'],
      ['위험도 하', totLo + '개']
    ].map(([label, val]) => '<div class="ov-stat"><b>' + val + '</b><span>' + label + '</span></div>').join('');
  }
}
