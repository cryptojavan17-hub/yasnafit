# Magazine: live-source diagnosis — 2026-09-21

**Acceptance status: BLOCKED / NOT COMPLETE. No real Persian article with a verified rendered image has been delivered to the coach screen in this environment.** Mock-feed regression checks are not acceptance evidence.

## Exact configured sources

Read from migration `038_magazine_persian_sources` and this environment's active database. These are six Google News searches, **not six independent Persian publishers**. No source URLs were substituted in the live runs. The owner's local configuration/database is not accessible here.

### منبع فارسی: بدنسازی بانوان

```text
https://news.google.com/rss/search?q=%D8%A8%D8%AF%D9%86%D8%B3%D8%A7%D8%B2%DB%8C%20%D8%A8%D8%A7%D9%86%D9%88%D8%A7%D9%86&hl=fa&gl=IR&ceid=IR:fa
```

### منبع فارسی: تغذیه ورزشی

```text
https://news.google.com/rss/search?q=%D8%AA%D8%BA%D8%B0%DB%8C%D9%87%20%D9%88%D8%B1%D8%B2%D8%B4%DB%8C&hl=fa&gl=IR&ceid=IR:fa
```

### منبع فارسی: علم تمرین

```text
https://news.google.com/rss/search?q=%D8%B9%D9%84%D9%85%20%D8%AA%D9%85%D8%B1%DB%8C%D9%86&hl=fa&gl=IR&ceid=IR:fa
```

### منبع فارسی: تناسب اندام زنان

```text
https://news.google.com/rss/search?q=%D8%AA%D9%86%D8%A7%D8%B3%D8%A8%20%D8%A7%D9%86%D8%AF%D8%A7%D9%85%20%D8%B2%D9%86%D8%A7%D9%86&hl=fa&gl=IR&ceid=IR:fa
```

### منبع فارسی: مکمل‌های ورزشی

```text
https://news.google.com/rss/search?q=%D9%85%DA%A9%D9%85%D9%84%E2%80%8C%D9%87%D8%A7%DB%8C%20%D9%88%D8%B1%D8%B2%D8%B4%DB%8C&hl=fa&gl=IR&ceid=IR:fa
```

### منبع فارسی: سلامت زنان و ورزش

```text
https://news.google.com/rss/search?q=%D8%B3%D9%84%D8%A7%D9%85%D8%AA%20%D8%B2%D9%86%D8%A7%D9%86%20%D9%88%20%D9%88%D8%B1%D8%B2%D8%B4&hl=fa&gl=IR&ceid=IR:fa
```

## Two distinct live network paths

### A. Application runtime (Node fetch)

Each of the six URLs was requested directly. Then the real discovery service was invoked once in unfiltered mode via the CLI and once via the coach-authenticated application HTTP API, on separate local databases. The latter is the primary evidence below. Both used the original source URLs, real network calls, existing article service and queue; no fixtures or `fetch` replacements.

| Source | Reachable by app? | Items actually received | Example titles | Images extracted |
|---|---|---|---|---|
| منبع فارسی: بدنسازی بانوان | No — ECONNRESET before TLS | 0 received; remote count unknown | None received | No; publisher stage never reached |
| منبع فارسی: تغذیه ورزشی | No — ECONNRESET before TLS | 0 received; remote count unknown | None received | No; publisher stage never reached |
| منبع فارسی: علم تمرین | No — ECONNRESET before TLS | 0 received; remote count unknown | None received | No; publisher stage never reached |
| منبع فارسی: تناسب اندام زنان | No — ECONNRESET before TLS | 0 received; remote count unknown | None received | No; publisher stage never reached |
| منبع فارسی: مکمل‌های ورزشی | No — ECONNRESET before TLS | 0 received; remote count unknown | None received | No; publisher stage never reached |
| منبع فارسی: سلامت زنان و ورزش | No — ECONNRESET before TLS | 0 received; remote count unknown | None received | No; publisher stage never reached |

Exact transport error (each source, including the retry):

```text
fetch failed | ECONNRESET | Client network socket disconnected before secure TLS connection was established
```

This is evidence about this runtime, NOT proof of the owner's network error. It is also not a server HTTP 403: no HTTP response was obtained. The earlier browser User-Agent/retry change is not proof of a fix.

### B. Separate web retrieval tool

All six exact URLs were also retrieved live through `fetch_page` around 11:11 UTC. That tool uses a different network path, not the app's Node runtime. All returned a final URL with `hl=en-US&gl=US&ceid=US:en`, despite the requested `hl=fa&gl=IR&ceid=IR:fa`. This falsifies the earlier assumption that the requested locale guaranteed Persian-source results. It does not prove that the owner's responses are identical.

Counts below are entries visible in the complete, non-chunked retrieved feed text, **before application parsing or filters**, not queue counts:

| Configured search | Reachable through web tool? | Returned entries | Actual example titles |
|---|---|---:|---|
| منبع فارسی: بدنسازی بانوان | Yes, but returned US English locale | 4 | Female bodybuilders try to lift sport's profile in Iran (2014); ورزش بانوان (2012) |
| منبع فارسی: تغذیه ورزشی | Yes, but returned US English locale | 2 | از بدنسازی دختران تا نجوای رباب دختر ایرانی (2026-05-01); سریال پاورچین 77 - مردان چاق - جعبه (2019) |
| منبع فارسی: علم تمرین | Yes, but returned US English locale | 0 | — |
| منبع فارسی: تناسب اندام زنان | Yes, but returned US English locale | 1 | این بازیگر زن در سن ۵۱ سالگی اندام خیره‌کننده‌اش را به نمایش می‌گذارد. (2026-03-31) |
| منبع فارسی: مکمل‌های ورزشی | Yes, but returned US English locale | 3 | What is creatine: the most studied sports supplement (2021); Researchers find 89% of sports supplement labels false… (2023); one blank title (2026-07-14) |
| منبع فارسی: سلامت زنان و ورزش | Yes, but returned US English locale | 0 | — |

**Images, all six web-tool responses:** no article image was extracted into the application. The feed channel's shared Google News logo is not an article image. Publisher image availability and browser rendering were not established. Web-tool text was not repackaged as RSS or injected into the database.

## Exact rejected items in the last real run

- Authenticated API run ID: `1cc9bfb1-db84-4691-980c-f6d982167cde`.
- Started: `2026-09-21T11:18:03.174Z`; completed: `2026-09-21T11:18:08.071Z`.
- Mode: `unfiltered-once`; freshness (including missing dates) and source-quality gates disabled at both discovery and draft-processing stages. No global setting was disabled.
- Fetched: **0**. Filtered: **0**. Rejected: **0**. Drafted: **0**. Source fetch errors: **6**.
- Exact per-item decisions: `items: []`. There were no downloaded candidates to reject. Do not describe the six source errors as six rejected articles.
- `GET /api/magazine/admin/queue` with the coach session returned **HTTP 200**, **0 rows**, **0 visible review cards**. This checks the actual HTTP queue, not only counters.
- Machine-readable evidence: [magazine-live-2026-09-21.json](evidence/magazine-live-2026-09-21.json).

**The owner's last run:** inaccessible here. Older code saved aggregate last-run counts and historical `magazine_discoveries.ai_meta`, but did not assign run IDs or retain per-run source responses. It is not possible to honestly reconstruct exact membership of that last run from the local sandbox or aggregates. The new export preserves historical failures, their stored reasons/dates, and the old summary under an explicit “without run attribution” label; it does not guess.

## Confirmed code defects and changes

- Previously `findDuplicate` treated `FAILED` records (including previously age-filtered candidates) as successful prior discoveries. Loosening a filter could therefore still leave a candidate blocked as duplicate. Failed/unlinked historical duplicate rows now do not prevent retry; existing article records and real drafted/processing candidates still prevent duplication and reintroduction of coach-rejected articles.
- The ready-card UI filters using `audit_reasons`. A discovery-only age bypass would therefore not suffice. One-shot diagnostic drafts carry `diagnostic_unfiltered` metadata, remain in the existing queue and get an explicit “freshness not verified” warning. They are **not** marked fresh. New normal/scheduled runs still use normal filters; existing diagnostic drafts stay labeled for coach review.
- Old Google News IDs used in previous tests embedded the publisher URL. A modern opaque ID from the **actual live response** contains no publisher URL and does not decode with that helper. The current `fetchArticlePage` also declines Google hosts; its supposed Google redirect fallback cannot fetch those pages. This remains an unresolved source-resolution limitation, now explicitly recorded as `original-url-unresolved`; no fabricated publisher URL or Google logo is substituted.
- Per-run diagnostics record HTTP status, final URL/locale, network causes, feed language/count/examples, invalid items, filter reasons, duplicates, batch deferral, processing results, article IDs and the exact queue projection. Last and previous reports are retained in existing `settings`; no new schema/table or article system.
- Diagnostic image evidence distinguishes an extracted URL from an HTTP image response. Even a successful HTTP response does not claim a browser has rendered the image.
- Each drafted item is checked against `queueView`, the same view served by the queue API and consumed by the cards. Regression tests additionally call the authenticated HTTP queue and assert every newly drafted ID is visible. These controlled tests validate code behavior only, not real-source delivery.
- No AI call and no auto-publication path added. Coach-only publication still uses the existing article service.

## Run on the owner's machine without setup changes

After pulling, in the magazine review panel open **عیب‌یابی دریافت مطالب**:

1. Download **دریافت گزارش دقیق اجرا** before another run if the previous evidence is needed.
2. Click **آزمایش یک‌باره بدون فیلتر سن و کیفیت** and confirm. Persian titles, original publisher resolution, duplicate protection, the processing batch cap and coach-only publishing remain enforced. All returned entries considered by the pipeline have their decisions recorded; fetch caps are explicit.
3. Download **دریافت گزارش دقیق اجرا** again. This JSON contains no login cookies, passwords or AI keys; share this file, not the database.

Equivalent local CLI (stop the app first to avoid a simultaneous scheduler run):

```bat
node scripts/diagnose-magazine.js
node scripts/diagnose-magazine.js --run-unfiltered
```

Without the flag, the CLI only exports existing evidence. With the flag, it makes one real discovery request sequence using the configured sources. Output: `data/magazine-diagnostics.json` (or the configured data directory).

## Validation and limits

- `npm test`: 20 suites, exit 0, including the diagnostic/auth/queue regression assertions.
- General `npm run test:e2e`: exit 0 on a fresh, isolated copy of current code with the standard data layout; schema remains 038. A baseline copy at rev11.1 also passed. An initial custom-data-directory experiment stopped at a photo-access 403-vs-401 assertion; that experimental test-path change was removed, and the unmodified workflow test was rerun with the standard layout. No auth/photo implementation was changed.
- General E2E and controlled magazine fixtures are **not** proof of live Persian articles or rendered images.
- No live source replacement or modern Google decoder is claimed as implemented. Real-source delivery is still blocked; it would be misleading to declare this task complete.
