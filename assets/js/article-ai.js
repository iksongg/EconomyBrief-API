/*
  article.html의 "AI 브리핑" 동적 렌더링.
  main.html/newsfeed.html의 뉴스 카드가 article.html?link=<원문URL 인코딩>으로 이동시키면,
  이 스크립트가 data/news.json에서 해당 기사를 찾아 헤더를 채우고,
  별도 배포된 Vercel 서버리스 함수(/api/summarize)에 AI 브리핑을 요청한다.

  ?link= 파라미터가 없으면 (예: 목업 카드 클릭, 또는 article.html 직접 접속) 아무 것도 하지 않고
  article.html에 원래 있던 정적 데모 콘텐츠를 그대로 둔다.
*/
(function () {
  // 배포 후 실제 Vercel 프로젝트 주소로 교체해야 한다. (예: https://economybrief-ai-api.vercel.app)
  var AI_API_BASE = 'https://economy-brief-api.vercel.app';
  var CACHE_PREFIX = 'eb-ai-briefing-v1:';

  var params = new URLSearchParams(window.location.search);
  var link = params.get('link');
  if (!link) return;

  function $(id) { return document.getElementById(id); }

  var titleEl = $('article-title');
  var dateEl = $('article-date');
  var sourceNameEl = $('article-source-name');
  var sourceLogoEl = $('article-source-logo');
  var summaryCard = $('ai-summary-card');
  var summaryList = $('ai-summary-list');
  var loadingEl = $('ai-loading');
  var errorEl = $('ai-error');
  var disclaimerEl = $('ai-disclaimer');
  var qnaBlock = $('qna-block');
  var hashtagsEl = $('hashtags');
  var deepResearchBtn = $('deep-research-btn');

  // "AI 심층 분석" 버튼이 어떤 기사에 대해 분석을 요청해야 하는지 알 수 있도록,
  // 실제 기사 모드일 때만 원문 링크를 data-link로 넘겨준다 (article.html의 인라인 스크립트가 읽음).
  if (deepResearchBtn) deepResearchBtn.setAttribute('data-link', link);

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDate(pubDate) {
    var d = new Date(pubDate);
    if (isNaN(d)) return '';
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }

  function renderHeader(article) {
    if (titleEl) titleEl.textContent = article.title;
    if (dateEl) dateEl.textContent = formatDate(article.pubDate);
    if (sourceNameEl) sourceNameEl.textContent = article.source || '';
    // 언론사별 실제 로고 이미지가 데이터에 없으므로, 실제 기사 모드에서는 목업 로고를 숨긴다.
    if (sourceLogoEl) sourceLogoEl.style.display = 'none';
  }

  function showLoading() {
    loadingEl.style.display = '';
    errorEl.style.display = 'none';
    summaryCard.style.display = 'none';
    qnaBlock.style.display = 'none';
    hashtagsEl.style.display = 'none';
    disclaimerEl.style.display = 'none';
  }

  function showError(message) {
    loadingEl.style.display = 'none';
    summaryCard.style.display = 'none';
    qnaBlock.style.display = 'none';
    hashtagsEl.style.display = 'none';
    disclaimerEl.style.display = 'none';
    errorEl.style.display = '';
    errorEl.textContent = message;
  }

  function validateAiResult(data) {
    return (
      data &&
      typeof data.summary === 'string' && data.summary.trim() &&
      typeof data.importance === 'string' &&
      typeof data.impact === 'string' &&
      Array.isArray(data.keywords)
    );
  }

  function showResult(ai) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'none';
    summaryCard.style.display = '';
    qnaBlock.style.display = '';
    hashtagsEl.style.display = '';
    disclaimerEl.style.display = '';

    var lines = String(ai.summary).split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!lines.length) lines = [String(ai.summary)];
    summaryList.innerHTML = lines.map(function (l) { return '<li>' + escapeHtml(l) + '</li>'; }).join('');

    qnaBlock.innerHTML =
      '<div class="qna-item">' +
        '<div class="qna-q"><span class="gicon" role="img" aria-label="">check</span><span>왜 중요한가요?</span></div>' +
        '<p class="qna-a">' + escapeHtml(ai.importance || '기사에서 확인되지 않음') + '</p>' +
      '</div>' +
      '<div class="qna-item">' +
        '<div class="qna-q"><span class="gicon" role="img" aria-label="">check</span><span>경제에 미치는 영향</span></div>' +
        '<p class="qna-a">' + escapeHtml(ai.impact || '기사에서 확인되지 않음') + '</p>' +
      '</div>';

    var keywords = Array.isArray(ai.keywords) ? ai.keywords.slice(0, 5) : [];
    hashtagsEl.innerHTML = keywords.map(function (k) { return '<span>#' + escapeHtml(k) + '</span>'; }).join('');
  }

  function getCache(key) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setCache(key, value) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
    } catch (e) {
      // localStorage 사용 불가(프라이빗 브라우징 등)여도 화면 표시에는 지장 없다.
    }
  }

  function requestAiBriefing(article) {
    var cached = getCache(link);
    if (cached && validateAiResult(cached)) {
      showResult(cached);
      return;
    }

    showLoading();

    fetch(AI_API_BASE + '/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: article.title,
        description: article.description || '',
        source: article.source || '',
        category: article.categoryLabel || article.category || '',
        link: article.link
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('AI 서버 응답 오류: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!validateAiResult(data)) throw new Error('AI 응답 형식이 올바르지 않습니다.');
        setCache(link, data);
        showResult(data);
      })
      .catch(function (err) {
        console.warn('AI 브리핑을 불러오지 못했습니다.', err);
        showError('AI 브리핑을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      });
  }

  fetch('data/news.json', { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('news.json fetch failed: ' + res.status);
      return res.json();
    })
    .then(function (data) {
      var article = Array.isArray(data && data.articles)
        ? data.articles.find(function (a) { return a.link === link; })
        : null;
      if (!article) {
        showError('기사 정보를 찾을 수 없습니다.');
        return;
      }
      renderHeader(article);
      requestAiBriefing(article);
    })
    .catch(function (err) {
      console.warn('기사 데이터를 불러오지 못했습니다.', err);
      showError('기사 정보를 불러오지 못했습니다.');
    });
})();
