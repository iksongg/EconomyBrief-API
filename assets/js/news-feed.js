/*
  data/news.json (네이버 뉴스 API, GitHub Actions가 하루 3번 갱신)을 읽어
  newsfeed.html의 .timeline-list 와 main.html의 .news-list 를 실제 기사로 채운다.
  fetch가 실패하면(fetch()는 file:// 로 직접 연 페이지에서는 브라우저 정책상 막힌다 —
  GitHub Pages 등 http(s)로 서빙해야 동작한다) 기존 정적 목업 카드를 그대로 둔다.
*/
(function () {
  var PLACEHOLDER = 'assets/img/news-thumb-placeholder.svg';

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatTime(pubDate) {
    var d = new Date(pubDate);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function formatMonthDay(pubDate) {
    var d = new Date(pubDate);
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  // 원문으로 바로 나가는 대신, 내부 AI 브리핑 화면(article.html)으로 보내고
  // 원본 기사 URL은 쿼리 파라미터로 전달한다. 원문 자체는 article.html의 "원문 보기" 버튼에서 연다.
  function articleHref(article) {
    return 'article.html?link=' + encodeURIComponent(article.link);
  }

  function renderTimelineCard(article, index) {
    var title = escapeHtml(article.title);
    var desc = escapeHtml(article.description);
    var tag = escapeHtml(article.categoryLabel || article.category || '');
    return (
      '<a class="timeline-card' + (index === 0 ? ' first' : '') + '" ' +
        'href="' + articleHref(article) + '">' +
        '<div class="tl-time">' + formatTime(article.pubDate) + '</div>' +
        '<div class="tl-body">' +
          '<div class="tl-text">' +
            '<div>' +
              '<div class="tl-title">' + title + '</div>' +
              '<div class="tl-desc">' + desc + '</div>' +
            '</div>' +
            (tag ? '<div class="tl-tags"><span>#' + tag + '</span></div>' : '') +
          '</div>' +
          '<img class="tl-thumb" src="' + PLACEHOLDER + '" alt="" />' +
        '</div>' +
      '</a>'
    );
  }

  function layoutTimelineLine() {
    var list = document.querySelector('.timeline-list');
    var line = list && list.querySelector('.timeline-line');
    var cards = document.querySelectorAll('.timeline-card');
    if (!list || !line || cards.length < 2) return;
    var DOT_CENTER = 24 + 11 / 2; // .timeline-card::before 의 top:24px, 11px 원과 맞춤
    var listTop = list.getBoundingClientRect().top;
    var firstY = cards[0].getBoundingClientRect().top - listTop + DOT_CENTER;
    var lastY = cards[cards.length - 1].getBoundingClientRect().top - listTop + DOT_CENTER;
    line.style.top = firstY + 'px';
    line.style.height = Math.max(0, lastY - firstY) + 'px';
  }

  function mountTimeline(articles) {
    var list = document.querySelector('.timeline-list');
    if (!list) return;
    var line = list.querySelector('.timeline-line');
    var items = articles.slice(0, 8);
    if (!items.length) return;
    list.innerHTML =
      (line ? line.outerHTML : '<div class="timeline-line"></div>') +
      items.map(renderTimelineCard).join('');
    layoutTimelineLine();
    window.addEventListener('resize', layoutTimelineLine);
  }

  function renderNewsListItem(article, isMore) {
    var title = escapeHtml(article.title);
    var desc = escapeHtml(article.description);
    var source = escapeHtml(article.source || '');
    return (
      '<a class="item' + (isMore ? ' more-item' : '') + '" ' +
        'href="' + articleHref(article) + '">' +
        '<div class="info">' +
          '<div>' +
            '<div class="title">' + title + '</div>' +
            '<div class="desc">' + desc + '</div>' +
          '</div>' +
          '<div class="byline">' +
            '<img class="source-logo" src="' + PLACEHOLDER + '" alt="" />' +
            '<span>' + source + ' · ' + formatMonthDay(article.pubDate) + '</span>' +
          '</div>' +
        '</div>' +
        '<img class="thumb" src="' + PLACEHOLDER + '" alt="" />' +
      '</a>'
    );
  }

  function mountNewsList(articles) {
    var list = document.querySelector('.news-list');
    if (!list) return;
    var items = articles.slice(0, 7);
    if (items.length < 4) return; // 데이터가 너무 적으면 기존 목업 유지
    var wasExpanded = list.classList.contains('expanded');
    list.innerHTML = items
      .map(function (a, i) { return renderNewsListItem(a, i >= 4); })
      .join('');
    if (wasExpanded) {
      list.querySelectorAll('.item.more-item').forEach(function (el) {
        el.classList.remove('more-item');
        el.classList.add('was-more-item');
      });
    }
  }

  function init() {
    fetch('data/news.json', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('news.json fetch failed: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.articles) || !data.articles.length) return;
        mountTimeline(data.articles);
        mountNewsList(data.articles);
      })
      .catch(function (err) {
        console.warn('실시간 뉴스 데이터를 불러오지 못해 기존 목업을 표시합니다.', err);
      });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
