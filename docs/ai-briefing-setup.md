# AI 브리핑 기능 (Gemini API + Vercel Serverless Functions)

뉴스 카드를 클릭하면 외부 원문으로 바로 나가는 대신, `article.html`에서 Gemini가 생성한 AI 브리핑(핵심 요약 / 왜 중요한가 / 경제에 미치는 영향 / 키워드)을 먼저 보여주고, 하단 "원문 보기" 버튼으로 원문 이동을 제공합니다.

## 동작 방식

1. `assets/js/news-feed.js` — 뉴스 카드의 링크를 `article.html?link=<원문 URL 인코딩>`으로 바꿔서, 클릭 시 외부로 바로 나가지 않고 내부 브리핑 화면으로 이동시킵니다.
2. `assets/js/article-ai.js` — `link` 쿼리 파라미터로 `data/news.json`에서 해당 기사(title/description/source/category)를 찾아 헤더를 채우고, Vercel에 배포된 `/api/summarize`를 호출해 AI 브리핑을 받아 화면에 채웁니다. 같은 기사는 `localStorage`에 캐시되어 재호출하지 않습니다.
3. `api/summarize.js` — Vercel 서버리스 함수. `title`/`description`/`source`/`category`만 Gemini에 전달하고(기사 본문은 API에 없으므로 애초에 보내지 않음), "제공된 정보 밖의 사실을 지어내지 말라"는 규칙을 강제하는 프롬프트로 Gemini를 호출해 JSON을 돌려줍니다. Gemini API 키는 이 함수가 배포되는 Vercel 프로젝트의 환경변수에만 존재하며, 프론트엔드/GitHub 저장소 어디에도 포함되지 않습니다.

## 중요한 한계

이 프로젝트가 쓰는 구글 뉴스 RSS는 기사 본문은 물론 실제 요약문도 제공하지 않습니다(`description`은 "OO일보 보도"처럼 언론사명뿐). 그래서 AI 브리핑은 **기사 제목을 바탕으로 한 참고용 설명**이며, 화면 하단에 "이 브리핑은 현재 제공된 기사 정보를 바탕으로 AI가 생성했습니다"라는 안내 문구가 항상 함께 표시됩니다. 기사 본문 자체를 요약한 것처럼 보이지 않도록 서버 측 프롬프트에도 같은 제약이 들어가 있습니다.

## 배포 방법 (처음부터 끝까지)

### 1) Gemini API 키 발급 (이미 보유하고 계시면 생략)

[Google AI Studio](https://aistudio.google.com/app/apikey)에서 API 키를 발급받습니다.

### 2) Vercel 프로젝트 생성 및 GitHub 연동

1. [vercel.com](https://vercel.com)에 GitHub 계정으로 로그인합니다.
2. "Add New… → Project"를 선택하고, 이 저장소(`EconomyBrief_API`)를 Import합니다.
3. Framework Preset은 "Other"(정적 사이트) 그대로 두면 됩니다 — 빌드 명령 없이도 `/api/summarize.js`는 자동으로 서버리스 함수로 인식됩니다. Root Directory는 저장소 루트 그대로 둡니다.
4. 이 Vercel 프로젝트는 **API 호출 전용**으로만 씁니다. 기존 GitHub Pages 배포(프론트엔드)는 그대로 유지되고 전혀 변경되지 않습니다.

### 3) Vercel 환경변수 등록

Vercel 프로젝트 → Settings → Environment Variables에서 등록합니다.

| 변수명 | 값 | 필수 |
|---|---|---|
| `GEMINI_API_KEY` | 발급받은 Gemini API 키 | 필수 |
| `GEMINI_MODEL` | 예: `gemini-3.6-flash` (미설정 시 기본값 `gemini-3.6-flash` 사용) | 선택 |
| `ALLOWED_ORIGIN` | 예: `https://<github-user>.github.io` (미설정 시 모든 origin 허용) | 선택(권장) |

등록 후 "Deploy" 또는 "Redeploy"를 눌러 반영합니다.

### 4) 프론트엔드에 Vercel 주소 연결

배포가 끝나면 Vercel이 `https://<프로젝트명>.vercel.app` 같은 주소를 줍니다. 이 주소를 [assets/js/article-ai.js](../assets/js/article-ai.js) 상단의 `AI_API_BASE` 값으로 바꿔주세요.

```js
var AI_API_BASE = 'https://REPLACE-WITH-YOUR-VERCEL-PROJECT.vercel.app';
```

수정 후 GitHub에 커밋·푸시하면 GitHub Pages에도 반영됩니다.

### 5) 동작 확인

1. 배포된 GitHub Pages 사이트에서 뉴스 카드를 클릭합니다.
2. "AI가 뉴스를 분석하고 있어요…" 로딩이 잠깐 보인 뒤 AI 브리핑이 표시되는지 확인합니다.
3. 같은 기사를 다시 클릭했을 때 로딩 없이 바로 뜨는지(캐시 동작) 확인합니다.
4. 하단 "원문 보기" 버튼이 실제 원문으로 이동하는지 확인합니다.
5. Vercel 대시보드의 Functions 로그에서 호출/에러를 확인할 수 있습니다.

## 로컬에서 API 없이 확인하고 싶다면

`api/summarize.js`는 `GEMINI_API_KEY`가 없으면 500과 함께 `"GEMINI_API_KEY 환경변수가 설정되지 않았습니다."`를 반환하도록 만들어져 있습니다. 프론트(`article-ai.js`)는 이 경우에도 앱이 깨지지 않고 "AI 브리핑을 불러오지 못했어요" 에러 문구 + "원문 보기" 버튼은 계속 사용 가능한 상태로 표시됩니다.
