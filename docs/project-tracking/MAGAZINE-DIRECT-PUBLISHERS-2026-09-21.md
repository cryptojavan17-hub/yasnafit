# Direct Persian publisher replacement — 2026-09-21

**Code implemented; real article delivery in the coach screen NOT VERIFIED.** This report does not count Google News, fixtures, manually staged article metadata or web-tool results as queued articles.

## Sources actually configured by migration 039

| Publisher | Exact endpoint | Reader | Independent live web retrieval |
|---|---|---|---|
| علم ورزش — علم تمرین | https://www.elmevarzesh.com/category/sports-physiology/exercise-science/feed/ | Direct RSS | Persian RSS, `fa-IR`; recent exercise articles observed |
| ایران بدن — بدنسازی و فیتنس | https://www.iranbadan.com/category/bodybuilding-fitness/feed/ | Direct RSS | Persian RSS, `fa-IR`; fitness/rehabilitation articles observed; some promotional/older entries remain for coach judgment |
| بدن فیت — مقالات آموزشی | https://badanfit.ir/blog.html | HTML article list | Real article cards observed; `/feed/` returned a 404 page so it is NOT configured |
| فیتامین — مجله ورزشی و تغذیه | https://fitamin.ir/mag/ | HTML article list | Real article links, images and Persian dates observed; RSS could not be fetched so the listing is configured instead |

The six migration-038 Persian Google queries are disabled, not deleted. History and articles remain intact. No Google fallback is configured. Custom sources remain untouched. No new source/article/queue system: migration 039 only adds `magazine_sources.fetch_format` (`feed` or `html`) and seeds the four endpoints above. `feed_url` remains the endpoint field; legacy `source_type` is retained for compatibility.

## Real titles observed on the publisher websites

These are **web-tool observations, NOT titles claimed to have entered the queue**:

- علم ورزش: [آیا تمرین تا ناتوانی در بدنسازی برای عضله‌سازی لازم است؟فواید و عوارض](https://www.elmevarzesh.com/training-to-failure/) — feed publication time 2026-09-21T09:00:46Z.
- علم ورزش: «چگونه بدن در برابر تمرینات سخت سازگار می‌شود؟» — feed date 2026-05-25 (within the new 180-day trial window at test time).
- بدن فیت: [نقش درصد چربی بدن در سلامتی](https://badanfit.ir/blog/body-fat-percentage-health.html) — article and its own image `https://badanfit.ir/img/body-fat-percentage-health.webp` observed. Visible date is month-only; no exact publication day is invented.
- بدن فیت: [نقش تمرین با وزنه در سلامت میانسالی و پیری](https://badanfit.ir/blog/resistance-training-healthy-aging.html).
- فیتامین: [روغن زیتون برای بدنسازی خوب است؟ + مقدار و زمان مصرف](https://fitamin.ir/mag/benefits-of-olive-and-olive-oil-for-athletes/) — listing date corresponds to 2026-09-19.
- فیتامین: [تکنیک نگاتیو در بدنسازی چیست؟ نحوه اجرا و فواید سیستم تمرینی منفی](https://fitamin.ir/mag/what-is-negative-training-system/).

This confirms that these are real Persian publishing endpoints rather than Google language-search guesses. It does NOT prove that this sandbox's application can reach them, that live HTML selectors are verified against their raw markup, or that a browser rendered their images.

## Actual application discovery run

Evidence: [machine-readable report](evidence/magazine-direct-publishers-live-2026-09-21.json).

- Run ID: `ba4c59ce-f9c9-4381-9732-aa7a35674ac9`.
- Real authenticated `POST /api/magazine/admin/discover`, normal request using the temporary **180-day** policy, not the unlimited diagnostic bypass.
- Sources used: exactly the four URLs above. No endpoint substitution and no mocked transport.
- Each source failed before TLS with `ECONNRESET`, including retry. No HTTP feed/list body was received by Node.
- **Items received: 0. Filtered: 0. Drafted: 0. Source errors: 4.** Remote item counts are unknown through this network path, not “empty feeds.”
- Authenticated `GET /api/magazine/admin/queue`: **HTTP 200, 0 rows, 0 ready cards**.
- **Example titles that actually appeared in this application's queue: none.** The web-tool observations above are kept separate deliberately.

Direct HTTP (non-TLS) attempts also failed with `UND_ERR_SOCKET`; curl HTTPS failed during SSL setup. This is evidence about this environment, not the owner's connection. A separate real-network check was attempted via GitHub Actions to avoid relying on this blocked environment, but GitHub rejected workflow creation because the connected app has no `workflows` permission. That workflow was removed before delivery; no independent runner result is claimed.

## Implementation details

- `src/magazine-html-source.js`: bounded, non-executing HTML listing reader; same-publisher article links only, navigation/category links excluded, duplicate thumbnail/title anchors merged, original Persian title retained, lazy image attributes supported. No JS execution or pagination crawl.
- Existing `public/jalali.js` converter is now also importable by Node; no duplicate calendar algorithm. Listing dates support ISO, numeric Jalali and Persian month names. Month-only/unknown dates remain null.
- Existing service uses RSS or HTML according to `fetch_format`. WordPress `content:encoded` can supply the article image when the description has none.
- Owner-requested testing policy: 180-day cutoff. Known older items remain excluded. An undated direct-publisher candidate reaches page inspection to find `article:published_time`, JSON-LD `datePublished` or a time element. If still unknown, it enters review with an explicit unknown-date warning, never today's date or a false “fresh” mark.
- A valid direct publisher link is sufficient. Missing, invalid or off-site canonical metadata is not an admission gate; if enrichment fails, preserve that original link. Legacy unresolved Google records remain outside the ready queue, and retired inactive-source failures are no longer retried as source candidates.
- Missing image is allowed: the existing card shows **تصویر پیدا نشد** and the image picker. No shared fallback/AI image is supplied.
- Source main-image fallback avoids header/nav/footer images and supports lazy-loading attributes. New drafts without images are not immediately fetched a second time by backfill in the same run.
- Existing article creation, queue, coach actions and publication remain the only workflow. No AI processing and no automatic publication.

## Tests (code behavior, not live acceptance)

- `npm test`: **21 suites passed** after removing the temporary isolated test copy from the repository scan. One intermediate scan had failed because that copy contained duplicated deployment-test text; product code was not the cause.
- `npm run test:magazine-direct`: covers upgrade from 038, idempotency, preserving a custom source, disabling Google defaults, HTML links/title/image/date parsing, Jalali conversion, 180-day boundary, failed page/invalid canonical/no image/unknown date admission, >180-day rejection, actual persisted DRAFT rows in the queue, duplicate prevention and no publication. Controlled fixture data is explicitly NOT live evidence.
- `npm run test:e2e`: passed on an isolated current-code copy with fresh standard-layout data; schema assertion is now 039.
- `scripts/check-live-magazine.js`: opt-in real-network check using a temporary database and the authenticated HTTP pipeline. It exits nonzero when no ready articles arrive and writes `logs/magazine-live/report.json`. Optional browser verification uses Playwright only when explicitly enabled; Playwright is not a production dependency. Local run correctly failed its live acceptance gate due to TLS failures.

## Owner verification

Pull and launch normally: migration 039 automatically swaps the default sources. Use the existing **بررسی مطالب جدید** button (the normal run already uses 180 days). Then **عیب‌یابی دریافت مطالب → دریافت گزارش دقیق اجرا** exports the actual source responses, per-item decisions and queue IDs. No coach source setup is required.

**Open acceptance gate:** real Persian articles must be visible in the actual coach screen. The source replacement is implemented, but that gate has not been met or claimed in this environment.
