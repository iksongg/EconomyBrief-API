/*
  Vercel 서버리스 함수 — "AI 심층 분석" 전용 엔드포인트. api/summarize.js(일반 AI 핵심 요약)와는
  완전히 분리된 별도 API다. 같은 Gemini Flash 계열 모델을 generateContent로 동기 호출할 뿐,
  Interactions API/Deep Research Agent/Search Grounding 등 실제 웹 검색이나 유료 에이전트는
  전혀 사용하지 않는다. 그래서 화면에도 "웹을 조사했다"거나 "출처 n개를 분석했다" 같은 표현을
  절대 붙이면 안 된다 — 이 함수는 기사 제목/설명/카테고리만 보고 추론하는 것뿐이다.

  필요한 환경변수:
    GEMINI_API_KEY  (필수, api/summarize.js와 동일한 키 재사용)
    ANALYZE_MODEL   (선택) 기본값 "gemini-3.5-flash-lite" — summarize.js의 GEMINI_MODEL과
                     독립적으로 조정할 수 있게 별도 변수로 둔다.
    ALLOWED_ORIGIN  (선택) CORS 허용 origin. 미설정 시 모든 origin 허용("*")
*/

const ANALYZE_MODEL = process.env.ANALYZE_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/' + ANALYZE_MODEL + ':generateContent';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    conclusion: { type: 'STRING' },
    background: { type: 'STRING' },
    importance: { type: 'STRING' },
    economicImpact: { type: 'STRING' },
    industryImpact: { type: 'STRING' },
    futureVariables: { type: 'STRING' },
    risks: { type: 'STRING' }
  },
  required: ['conclusion', 'background', 'importance', 'economicImpact', 'industryImpact', 'futureVariables', 'risks']
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
  return [
    '당신은 한국어 경제 뉴스 심층 분석가입니다.',
    '아래 [기사 정보]가 당신이 가진 정보의 전부입니다. 기사 본문(전문)도, 실시간 웹 검색 결과도 없습니다.',
    'description 필드는 실제 기사 요약이 아니라 단순히 "OO 보도"처럼 언론사명만 표기된 경우가 많습니다.',
    '',
    '절대 규칙:',
    '1. 웹을 검색했다거나, 여러 출처/기사를 조사했다는 식으로 서술하지 마세요. 당신은 오직 아래 [기사 정보]만 보고 추론합니다.',
    '2. [기사 정보]에 없는 구체적 수치, 통계, 인용, 발언, 사건 경위를 지어내지 마세요.',
    '3. 일반적인 경제 배경지식으로 설명 가능한 범위를 벗어나 구체적 사실을 판단해야 하는 항목은,',
    '   "제공된 기사 정보만으로는 확인하기 어렵습니다." 또는 "추가 정보가 필요합니다." 라고 정직하게 쓰세요.',
    '4. 각 항목은 2~4문장의 한국어로, 경제 지식이 많지 않은 독자도 이해할 수 있게 쉬운 문장으로 쓰세요.',
    '',
    '다음 7개 항목을 각각 작성하세요:',
    '- conclusion: 이 이슈에 대한 핵심 결론 한 문단',
    '- background: 이 이슈가 나오게 된 배경',
    '- importance: 이 뉴스가 경제적으로 왜 중요한지, 의미와 맥락',
    '- economicImpact: 경제 전반(소비자, 금융시장 등)에 미치는 영향',
    '- industryImpact: 관련 산업/기업에 미치는 영향',
    '- futureVariables: 앞으로 주목해야 할 변수',
    '- risks: 리스크 및 불확실성 (반대 관점이나 위험 요소 포함)',
    '',
    '반드시 지정된 JSON 스키마 형식으로만 응답하세요.',
    '',
    '[기사 정보]',
    '제목: ' + article.title,
    '언론사: ' + (article.source || '확인되지 않음'),
    '카테고리: ' + (article.category || '확인되지 않음'),
    '핵심 키워드: ' + (article.keywords || '확인되지 않음'),
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
  const timeout = setTimeout(function () { controller.abort(); }, 25000);

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
          temperature: 0.3
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
  const fields = ['conclusion', 'background', 'importance', 'economicImpact', 'industryImpact', 'futureVariables', 'risks'];
  const result = {};
  for (const key of fields) {
    const value = typeof raw[key] === 'string' ? raw[key].trim() : '';
    if (!value) return null;
    result[key] = value;
  }
  return result;
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
    keywords: Array.isArray(body.keywords) ? truncate(body.keywords.join(', '), 200) : truncate(body.keywords, 200)
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
    console.error('analyze error:', err);
    res.status(err.status || 500).json({ error: err.message || 'AI 심층 분석 중 오류가 발생했습니다.' });
  }
};
