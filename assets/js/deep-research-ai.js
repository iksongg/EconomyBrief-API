/*
  deep-research.html의 "AI 심층 분석" 렌더링.
  article.html의 "AI 심층 분석" 버튼이 deep-research.html?link=<원문URL 인코딩>으로 이동시키면,
  이 스크립트가 data/news.json에서 해당 기사를 찾아 헤더를 채우고 api/analyze.js(일반 AI 핵심
  요약과는 별개의 엔드포인트)를 호출해 결과를 렌더링한다.

  api/analyze.js는 실제 웹 검색이나 Deep Research Agent를 쓰지 않는, generateContent 기반의
  일반 Gemini Flash 호출이다 — 그래서 이 화면 어디에도 "웹을 조사했다"/"출처 n개를 분석했다"
  같은 표현을 쓰지 않는다.
*/
(function () {
  var AI_API_BASE = 'https://economy-brief-api.vercel.app';
  var CACHE_PREFIX = 'eb-deep-analysis-v1:';
  var SUMMARY_CACHE_PREFIX = 'eb-ai-briefing-v1:';
  var SECTION_KEYS = ['conclusion', 'background', 'importance', 'economicImpact', 'industryImpact', 'futureVariables', 'risks'];
  var LOADING_MESSAGES = [
    'AI가 기사를 심층 분석하고 있어요',
    '배경과 맥락을 정리하고 있어요',
    '경제적 영향을 분석하고 있어요',
    '분석 결과를 정리하고 있어요'
  ];

  var params = new URLSearchParams(window.location.search);
  var link = params.get('link');

  function $(id) { return document.getElementById(id); }

  var articleHeaderEl = $('article-header');
  var titleEl = $('research-article-title');
  var sourceEl = $('research-article-source');
  var stateLoading = $('state-loading');
  var stateError = $('state-error');
  var errorDesc = $('error-desc');
  var retryBtn = $('retry-btn');
  var resultWrap = $('result-wrap');
  var disclaimerEl = $('disclaimer');
  var stateNoLink = $('state-no-link');
  var analyzeAgainBtn = $('analyze-again-btn');
  var loadingMessageEl = $('loading-message');

  if (!link) {
    stateNoLink.style.display = '';
    return;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getJson(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // localStorage 사용 불가(프라이빗 브라우징 등)여도 화면 표시에는 지장 없다.
    }
  }

  function validateResult(data) {
    if (!data) return false;
    for (var i = 0; i < SECTION_KEYS.length; i++) {
      if (typeof data[SECTION_KEYS[i]] !== 'string' || !data[SECTION_KEYS[i]].trim()) return false;
    }
    return true;
  }

  var loadingMessageTimer = null;
  function startLoadingMessages() {
    var i = 0;
    loadingMessageEl.textContent = LOADING_MESSAGES[0];
    loadingMessageTimer = setInterval(function () {
      i = (i + 1) % LOADING_MESSAGES.length;
      loadingMessageEl.textContent = LOADING_MESSAGES[i];
    }, 3000);
  }
  function stopLoadingMessages() {
    clearInterval(loadingMessageTimer);
  }

  function showLoading() {
    stateError.style.display = 'none';
    resultWrap.style.display = 'none';
    disclaimerEl.style.display = 'none';
    stateLoading.style.display = '';
    startLoadingMessages();
  }

  function showError(message) {
    stopLoadingMessages();
    stateLoading.style.display = 'none';
    resultWrap.style.display = 'none';
    disclaimerEl.style.display = 'none';
    stateError.style.display = '';
    errorDesc.textContent = message;
  }

  function showResult(data) {
    stopLoadingMessages();
    stateLoading.style.display = 'none';
    stateError.style.display = 'none';

    $('section-conclusion').textContent = data.conclusion;
    $('section-background').textContent = data.background;
    $('section-importance').textContent = data.importance;
    $('section-economic-impact').textContent = data.economicImpact;
    $('section-industry-impact').textContent = data.industryImpact;
    $('section-future-variables').textContent = data.futureVariables;
    $('section-risks').textContent = data.risks;

    resultWrap.style.display = '';
    disclaimerEl.style.display = '';
  }

  function renderHeader(article) {
    titleEl.textContent = article.title;
    sourceEl.textContent = article.source || '';
    articleHeaderEl.style.display = '';
  }

  var requestInFlight = false;

  function runAnalysis(article, forceRefresh) {
    if (requestInFlight) return;

    if (!forceRefresh) {
      var cached = getJson(CACHE_PREFIX + link);
      if (validateResult(cached)) {
        showResult(cached);
        return;
      }
    }

    var summaryCached = getJson(SUMMARY_CACHE_PREFIX + link);
    var keywords = summaryCached && Array.isArray(summaryCached.keywords) ? summaryCached.keywords : [];

    requestInFlight = true;
    analyzeAgainBtn.disabled = true;
    showLoading();

    fetch(AI_API_BASE + '/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: article.title,
        description: article.description || '',
        source: article.source || '',
        category: article.categoryLabel || article.category || '',
        keywords: keywords
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('AI 서버 응답 오류: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!validateResult(data)) throw new Error('AI 응답 형식이 올바르지 않습니다.');
        setJson(CACHE_PREFIX + link, data);
        showResult(data);
      })
      .catch(function (err) {
        console.warn('AI 심층 분석을 불러오지 못했습니다.', err);
        showError('AI 심층 분석을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      })
      .finally(function () {
        requestInFlight = false;
        analyzeAgainBtn.disabled = false;
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

      retryBtn.addEventListener('click', function () { runAnalysis(article, false); });
      analyzeAgainBtn.addEventListener('click', function () { runAnalysis(article, true); });

      runAnalysis(article, false);
    })
    .catch(function (err) {
      console.warn('기사 데이터를 불러오지 못했습니다.', err);
      showError('기사 정보를 불러오지 못했습니다.');
    });
})();
