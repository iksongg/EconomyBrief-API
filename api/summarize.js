/*
  Vercel 서버리스 함수 — 뉴스 카드의 title/description 등 "실제로 확인 가능한 데이터"만 Gemini에 보내
  AI 브리핑(요약/중요성/경제적 영향/키워드)을 JSON으로 생성해 돌려준다.

  왜 별도 백엔드인가: GitHub Pages는 정적 파일만 서빙하므로 Gemini API 키를 프론트엔드 코드에
  둘 수 없다. 이 함수는 article.html 프론트에서 fetch로 호출되며, 키는 이 함수가 배포된 Vercel
  프로젝트의 환경변수(GEMINI_API_KEY)에만 존재한다.

  필요한 환경변수 (Vercel 프로젝트 설정에서 등록):
    GEMINI_API_KEY   (필수) Gemini API 키
    GEMINI_MODEL     (선택) 기본값 "gemini-2.5-flash"
    ALLOWED_ORIGIN   (선택) CORS 허용 origin. 미설정 시 모든 origin 허용("*")
*/

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    importance: { type: 'STRING' },
    impact: { type: 'STRING' },
    keywords: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['summary', 'importance', 'impact', 'keywords']
};

function setCors(res) {
  const origin = process.env.ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function truncate(value, max) {
  const str = typeof value === 'string' ? value.trim() : '';
  return str.length > max ? str.slice(0, max) : str;
}

function buildPrompt(article) {
  // 실제로 전달하는 데이터를 프롬프트에 명시해, 모델이 "본문을 읽은 것"처럼 서술하지 못하게 한다.
  // description은 실제 기사 요약문이 아니라 "OO 보도" 같은 언론사 표기에 불과할 수 있음을 알린다.
  return [
    '당신은 한국어 경제 뉴스 브리핑 작성자입니다.',
    '아래 [기사 정보]는 뉴스 API에서 제공된 전부이며, 기사 본문(전문)은 제공되지 않았습니다.',
    'description 필드는 실제 기사 요약이 아니라 단순히 "OO 보도"처럼 언론사명만 표기된 경우가 많습니다.',
    '',
    '규칙:',
    '1. [기사 정보]에 없는 구체적 수치, 인용, 사건 경위 등을 추측하거나 지어내지 마세요.',
    '2. 제목만으로 알 수 있는 범위 내에서 경제적 맥락과 일반적으로 통용되는 배경 지식만 설명하세요.',
    '3. 기사 본문을 읽은 것처럼 서술하지 말고, 확인할 수 없는 세부 사실은 "기사에서 확인되지 않음"이라고 쓰세요.',
    '4. summary는 경제 초보자도 이해할 수 있는 쉬운 문장 3줄 이내(줄바꿈으로 구분)로 작성하세요. 전문용어는 최소화하세요.',
    '5. importance는 이 뉴스가 경제적으로 왜 중요한지, 단순 요약이 아니라 의미와 맥락 위주로 설명하세요.',
    '6. impact는 산업/기업/소비자/금융시장 중 해당되는 항목을 중심으로 경제에 미치는 영향을 설명하세요. 해당 사항이 불확실하면 그렇게 명시하세요.',
    '7. keywords는 핵심 키워드 3~5개를 짧은 명사구로 제시하세요.',
    '8. 반드시 지정된 JSON 스키마 형식으로만 응답하세요.',
    '',
    '[기사 정보]',
    '제목: ' + article.title,
    '언론사: ' + (article.source || '확인되지 않음'),
    '카테고리: ' + (article.category || '확인되지 않음'),
    'description(참고용, 실제 요약이 아닐 수 있음): ' + (article.description || '(제공되지 않음)')
  ].join('\n');
}

async function callGemini(article) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    err.status = 500;
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(function () { controller.abort(); }, 15000);

  let res;
  try {
    res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(article) }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: RESPONSE_SCHEMA,
          temperature: 0.2
        }
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(function () { return ''; });
    const err = new Error('Gemini API 호출 실패 (' + res.status + '): ' + bodyText.slice(0, 300));
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  const text = data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

  if (!text) {
    const err = new Error('Gemini 응답에서 텍스트를 찾을 수 없습니다.');
    err.status = 502;
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const err = new Error('Gemini 응답이 유효한 JSON이 아닙니다.');
    err.status = 502;
    throw err;
  }

  return parsed;
}

function normalizeResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  const importance = typeof raw.importance === 'string' ? raw.importance.trim() : '';
  const impact = typeof raw.impact === 'string' ? raw.impact.trim() : '';
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.filter(function (k) { return typeof k === 'string' && k.trim(); }).slice(0, 5)
    : [];

  if (!summary || !importance || !impact) return null;
  return { summary: summary, importance: importance, impact: impact, keywords: keywords };
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  const article = {
    title: truncate(body.title, 300),
    description: truncate(body.description, 500),
    source: truncate(body.source, 100),
    category: truncate(body.category, 100),
    link: truncate(body.link, 1000)
  };

  if (!article.title) {
    res.status(400).json({ error: '기사 제목(title)이 필요합니다.' });
    return;
  }

  try {
    const raw = await callGemini(article);
    const result = normalizeResult(raw);
    if (!result) {
      res.status(502).json({ error: 'AI 응답 형식이 올바르지 않습니다.' });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    console.error('summarize error:', err);
    res.status(err.status || 500).json({ error: err.message || 'AI 브리핑 생성 중 오류가 발생했습니다.' });
  }
};
