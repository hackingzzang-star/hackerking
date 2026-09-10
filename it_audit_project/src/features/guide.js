// ============================================================
// 사용법 가이드/온보딩 (guide 탭) — v8.58에서 app.js로부터 물리적으로 분리
// ------------------------------------------------------------
// 사용법 가이드 아코디언, 최초 실행 시 온보딩 안내창. 외부 앱 상태 의존이 전혀 없는
// 완전히 독립적인 모듈입니다(브라우저 전역 API만 사용).
// ============================================================

export function scrollToGuideSection(el){
  if(!el) return;
  if(el.classList && el.classList.contains('guide-section')) el.classList.add('gs-open');
  const navWrap = document.querySelector('.sticky-nav-wrap');
  const offset = (navWrap ? navWrap.offsetHeight : 0) + 14;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({top: Math.max(top, 0), behavior:'smooth'});
}

export function goToGuideSection(anchorId){
  const guideBtn = document.querySelector('.tabbtn[data-tab="guide"]');
  if(guideBtn) guideBtn.click();
  setTimeout(() => {
    scrollToGuideSection(document.getElementById(anchorId));
  }, 30);
}

export function initGuideAccordion(){
  document.querySelectorAll('.guide-content .guide-section[id]').forEach(sec => {
    if(sec.dataset.accordionInit) return;
    sec.dataset.accordionInit = '1';
    const h2 = sec.querySelector('h2');
    if(!h2) return;
    const body = document.createElement('div');
    body.className = 'guide-section-body';
    let node = h2.nextSibling;
    while(node){
      const next = node.nextSibling;
      body.appendChild(node);
      node = next;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'guide-section-toggle';
    sec.insertBefore(btn, h2);
    btn.appendChild(h2);
    const chevron = document.createElement('span');
    chevron.className = 'gst-chevron';
    chevron.textContent = '▸';
    btn.appendChild(chevron);
    sec.appendChild(body);
    btn.addEventListener('click', () => sec.classList.toggle('gs-open'));
  });
}

export function openGuideWindowBtn_handler(){
  const styleEl = document.querySelector('head > style');
  const guideEl = document.getElementById('tab-guide');
  const clone = guideEl.cloneNode(true);
  clone.classList.add('active'); // 새 창에서는 항상 보이도록
  clone.style.display = 'block';
  // details(변경이력)는 기본 접힘 상태를 그대로 유지, 클릭해서 펼쳐볼 수 있음(정적 사본이라 여닫기는 됨)
  const openBtn = clone.querySelector('#openGuideWindowBtn');
  if(openBtn) openBtn.closest('.round-panel').remove(); // 새 창 안에 "새 창 열기" 버튼은 불필요
  // [v7.34] 목차·"📑 목차" 버튼의 HTML만 복제되고 그걸 동작시키는 스크립트(원본의 initGuideToc IIFE)는
  // 복제되지 않아 새 창에서 목차가 눌러도 반응이 없던 문제를 고쳤다.
  // [v7.35] 같은 이유로 아코디언 토글 버튼·"전체 펼치기"·검색창도 새 창에서는 정적 HTML만 있고 동작하는
  // 스크립트가 없었다. 새 창은 원본과 분리된 독립 문서(blob URL)라 원본 함수를 그대로 쓸 수 없으므로,
  // 목차·아코디언·검색에 필요한 최소 동작을 새 창 전용 스크립트로 함께 넣어준다.
  const guideTocScript = '<script>'
    + 'function ghOpenToc(){var t=document.getElementById("guideToc");if(t)t.classList.add("force-show");var c=document.getElementById("guideTocClickCatcher");if(c)c.classList.add("show");}'
    + 'function ghCloseToc(){var t=document.getElementById("guideToc");if(t)t.classList.remove("force-show");var c=document.getElementById("guideTocClickCatcher");if(c)c.classList.remove("show");}'
    + 'var ghFab=document.getElementById("guideTocFab"); if(ghFab) ghFab.addEventListener("click", ghOpenToc);'
    + 'var ghCloseBtn=document.getElementById("guideTocCloseBtn"); if(ghCloseBtn) ghCloseBtn.addEventListener("click", ghCloseToc);'
    + 'var ghCatcher=document.getElementById("guideTocClickCatcher"); if(ghCatcher) ghCatcher.addEventListener("click", ghCloseToc);'
    + 'document.addEventListener("keydown", function(e){ if(e.key==="Escape") ghCloseToc(); });'
    + 'document.querySelectorAll(".guide-section-toggle").forEach(function(btn){'
    + '  btn.addEventListener("click", function(){ btn.closest(".guide-section").classList.toggle("gs-open"); });'
    + '});'
    + 'document.querySelectorAll(".guide-toc a").forEach(function(a){'
    + '  a.addEventListener("click", function(e){'
    + '    e.preventDefault();'
    + '    ghCloseToc();'
    + '    var el = document.getElementById(a.getAttribute("href").slice(1));'
    + '    if(el){ el.classList.add("gs-open"); setTimeout(function(){ window.scrollTo({top: el.getBoundingClientRect().top + window.scrollY - 14, behavior:"smooth"}); }, 60); }'
    + '  });'
    + '});'
    + 'var ghExpandBtn=document.getElementById("guideExpandAllBtn"); var ghAllOpen=false;'
    + 'if(ghExpandBtn) ghExpandBtn.addEventListener("click", function(){'
    + '  ghAllOpen=!ghAllOpen;'
    + '  document.querySelectorAll(".guide-section[id]").forEach(function(s){ s.classList.toggle("gs-open", ghAllOpen); });'
    + '  ghExpandBtn.textContent = ghAllOpen ? "전체 접기" : "전체 펼치기";'
    + '});'
    + 'var ghSearch=document.getElementById("guideSearchInput"); var ghCount=document.getElementById("guideSearchCount");'
    + 'if(ghSearch) ghSearch.addEventListener("input", function(){'
    + '  var term = ghSearch.value.trim().toLowerCase(); var n=0;'
    + '  document.querySelectorAll(".guide-section[id]").forEach(function(sec){'
    + '    var match = !term || sec.textContent.toLowerCase().indexOf(term) !== -1;'
    + '    sec.classList.toggle("gs-search-hidden", !match);'
    + '    if(match){ n++; if(term) sec.classList.add("gs-open"); }'
    + '  });'
    + '  if(ghCount) ghCount.textContent = term ? (n + "개 섹션에서 찾음") : "";'
    + '});'
    + '<\/script>';
  const html = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>사용법 가이드 — IT감사 라이프사이클 플랫폼</title><style>'
    + (styleEl ? styleEl.innerHTML : '')
    + 'body{padding:0;} .tabpanel{padding:26px 34px 46px !important;}'
    + '</style></head><body style="background:var(--paper);">'
    + '<div style="max-width:920px;margin:0 auto;background:var(--paper);">' + clone.outerHTML + '</div>'
    + guideTocScript
    + '</body></html>';
  const blob = new Blob([html], {type:'text/html;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=980,height=920');
}

export function showOnboardingWindow(){
  const win = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');
  if(!win){ alert('팝업이 차단되었습니다. 브라우저의 팝업 허용 설정 후 다시 시도해 주세요.'); return; }
  const html = '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>처음 사용자 안내</title><style>'
    + '*{box-sizing:border-box;}'
    + 'body{font-family:-apple-system,"Malgun Gothic","Pretendard",sans-serif;max-width:760px;margin:0 auto;padding:26px 26px 34px;color:#1b2330;background:#f6f3ec;}'
    + 'h4{margin:0 0 18px;font-size:17px;color:#132845;font-weight:800;display:flex;align-items:center;gap:8px;}'
    // [수정] 4개 카드+화살표 3개의 flex 최소폭 합이 창 폭(720px)을 근소하게 넘어서면서
    // 카드 하나(④)만 다음 줄로 떨어져 1~4단계 흐름이 끊겨 보이던 문제. flex-wrap의 우발적
    // 줄바꿈에 기대지 않도록 CSS Grid로 4칸을 고정하고, 화살표는 레이아웃 폭을 차지하지 않는
    // ::after 의사요소로 카드 사이에 겹쳐 그려 넣어 계산 오차 자체가 생길 수 없게 했다.
    + '.ob-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;}'
    + '.ob-step{background:#fff;border:1.5px solid #132845;border-radius:8px;padding:14px 13px 13px;position:relative;box-shadow:0 2px 6px rgba(19,40,69,.10);}'
    + '.ob-step:not(:last-child)::after{content:"→";position:absolute;top:16px;right:-15px;color:#b8863b;font-size:18px;font-weight:800;z-index:2;}'
    + '.ob-step b{display:block;font-size:13.5px;color:#132845;margin-bottom:5px;font-weight:700;}'
    // [수정] .ob-num도 <span>이라, 뒤에 오는 ".ob-step span" 규칙(명시도 0,0,1,1)이 앞의
    // ".ob-num" 단독 규칙(명시도 0,0,1,0)을 덮어써 흰 숫자가 안 보이던 문제 — v6.29에서 겪은
    // 것과 동일한 유형의 충돌이라 같은 방식(선택자 명시도를 더 높여 고정)으로 수정했다.
    + '.ob-step span{font-size:11.8px;color:#3a4150;line-height:1.6;display:block;}'
    + '.ob-step .ob-num{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#132845;color:#fff !important;font-size:13px;font-weight:800;margin-bottom:9px;font-family:monospace;}'
    + '.ob-foot{margin-top:20px;font-size:12px;color:#3a4150;line-height:1.75;background:#efe8d4;border-left:4px solid #b8863b;padding:12px 16px;border-radius:0 6px 6px 0;}'
    // 720px 팝업창 자체가 좁아지는 경우(브라우저 확대 등)에는 우발적 줄바꿈 대신, 2×2 그리드로
    // 명시적으로 전환해 항상 "짝이 맞게" 보이도록 한다(④ 하나만 떨어지는 모양이 다시 생기지 않음).
    + '@media(max-width:620px){'
      + '.ob-steps{grid-template-columns:repeat(2,1fr);row-gap:30px;}'
      + '.ob-step:nth-child(1)::after,.ob-step:nth-child(3)::after{content:"→";top:50%;right:-15px;transform:translateY(-50%);}'
      + '.ob-step:nth-child(2)::after{content:"↓";top:auto;bottom:-24px;left:50%;right:auto;transform:translateX(-50%);}'
    + '}'
    + '@media(max-width:420px){'
      + '.ob-steps{grid-template-columns:1fr;row-gap:26px;}'
      + '.ob-step:not(:last-child)::after{content:"↓";top:auto;bottom:-22px;left:50%;right:auto;transform:translateX(-50%);}'
    + '}'
    + '</style></head><body>'
    + '<h4>👋 처음 사용하시나요? 4단계로 요약했습니다</h4>'
    + '<div class="ob-steps">'
      + '<div class="ob-step"><span class="ob-num">1</span><b>설문지 생성</b><span>영역·부서를 선택해 설문지(HTML)를 만들어 배포합니다</span></div>'
      + '<div class="ob-step"><span class="ob-num">2</span><b>배포·회신 관리</b><span>대상 부서·기한을 등록하고 회신 현황을 추적합니다</span></div>'
      + '<div class="ob-step"><span class="ob-num">3</span><b>응답 집계</b><span>회수된 CSV/JSON을 올리면 여기서 통계·인터뷰 대상자가 자동 집계됩니다</span></div>'
      + '<div class="ob-step"><span class="ob-num">4</span><b>인터뷰 가이드</b><span>도메인별 질문·응답 상세를 보며 인터뷰를 진행하고 발견사항을 등록합니다</span></div>'
    + '</div>'
    + '<div class="ob-foot">막히면 언제든 "사용법 가이드" 탭에서 더 자세히 확인할 수 있습니다. 처음이시라면 "사용법 가이드" 탭 맨 위의 <b>🧭 설문조사 기반 감사기법, 제대로 알고 쓰기</b>도 함께 읽어보시길 권합니다 — 이 방식의 장점·한계·보완법을 먼저 알고 쓰면 훨씬 체계적으로 감사를 진행할 수 있습니다.</div>'
    + '</body></html>';
  win.document.write(html);
  win.document.close();
}
