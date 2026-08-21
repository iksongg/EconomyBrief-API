// 구글 뉴스 RSS(https://news.google.com/rss/search)로 경제 뉴스를 가져와 data/news.json으로 저장한다.
// API 키/가입/카드등록이 전혀 필요 없다 — 그냥 공개 RSS 주소를 fetch할 뿐이다.
// 실행: node scripts/fetch-news.js
// GitHub Actions가 하루 3번(아침/점심/저녁) 이 스크립트를 실행하고 결과를 커밋한다.

const fs = require('fs');
const path = require('path');

// main.html의 스토리 카테고리(반도체/금리/환율/부동산/AI)와 대응.
const CATEGORIES = [
  { key: 'semiconductor', query: '반도체', label: '반도체' },
  { key: 'interest-rate', query: '금리', label: '금리' },
  { key: 'exchange-rate', query: '환율', label: '환율' },
  { key: 'realestate', query: '부동산', label: '부동산' },
  { key: 'ai', query: 'AI 경제', label: 'AI' },
  { key: 'general', query: '경제', label: '경제 일반' },
];

const PER_CATEGORY = 10;

function decodeEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripHtml(str) {
  return decodeEntities(str.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '')).trim();
}

function extractTag(block, tag) {
  const m = block.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>'));
  return m ? m[1] : '';
}

function parseItems(xml) {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return blocks.map((block) => {
    const rawTitle = stripHtml(extractTag(block, 'title'));
    const source = stripHtml(extractTag(block, 'source'));
    // 구글 뉴스 제목은 보통 "기사 제목 - 언론사명" 형태라 언론사명 접미사를 떼어낸다.
    const title = source && rawTitle.endsWith(' - ' + source)
      ? rawTitle.slice(0, -(' - ' + source).length)
      : rawTitle;
    const link = stripHtml(extractTag(block, 'link'));
    const pubDate = stripHtml(extractTag(block, 'pubDate'));
    return { title, source, link, pubDate };
  });
}

async function fetchCategory({ key, query, label }) {
  const url =
    'https://news.google.com/rss/search' +
    `?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`구글 뉴스 RSS 호출 실패 (${label}): ${res.status}`);
  }

  const xml = await res.text();
  const items = parseItems(xml).slice(0, PER_CATEGORY);

  return items.map((item) => ({
    category: key,
    categoryLabel: label,
    title: item.title,
    description: item.source ? `${item.source} 보도` : '',
    link: item.link,
    source: item.source,
    pubDate: item.pubDate,
  }));
}

async function main() {
  const results = await Promise.all(CATEGORIES.map(fetchCategory));
  const articles = results
    .flat()
    // 같은 기사(제목 중복) 제거 — 여러 카테고리 검색어에 동시에 걸리는 기사가 있다.
    .filter((a, i, arr) => arr.findIndex((b) => b.title === a.title) === i)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const payload = {
    generatedAt: new Date().toISOString(),
    count: articles.length,
    articles,
  };

  const outPath = path.join(__dirname, '..', 'data', 'news.json');
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`news.json 업데이트 완료: 기사 ${articles.length}건 (${outPath})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
