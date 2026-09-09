# Homepage news and events v1

Verified locally on 2026-09-09 KST. Result: **HOMEPAGE_NEWS_EVENTS_IMPLEMENTED_NAVER_BLOCKED**.
Implementation PASS; live authentication/schema PASS for both providers; operational
news display NO-GO pending the policy gate below. No deployment was performed.

## Placement and independent loading

`app/page.tsx` appends `HomepagePetContent` after data-trust/contact content and before
the existing shared footer. Other routes do not mount it. CSS is isolated in a module;
no shared footer/map/catalog/recommendation behavior is changed by this feature.
1440px uses two columns; 768/390/320px stack news then events. News has up to four rows,
events up to three. No thumbnails, fabricated admission badges or dead links.

Each panel observes its viewport independently (300px margin). A component-lifetime
promise deduplicates scrolling and React Strict Mode effects. No upstream work is
awaited by the root homepage render; initial map/catalog requests remain independent.
Unmounting releases the consumer; fetches have timeouts. There is no polling of either
endpoint, browser storage or new fetching library. Both endpoints use the existing
`apiSuccess`/`apiFailure` envelope and `Cache-Control: no-store`, reject query arguments,
and accept no upstream URLs. Successful empty and unavailable remain separate states.

## NAVER contract and policy gate

- [API HUB overview](https://api.ncloud-docs.com/docs/naver-api-hub-overview) and
  [News contract](https://api.ncloud-docs.com/docs/naver-api-hub-search-news) were read.
  Endpoint: `https://naverapihub.apigw.ntruss.com/search/v1/news`.
- Existing canonical names are retained: `NAVER_API_HUB_ACCESS_KEY_ID` maps to
  `X-NCP-APIGW-API-KEY-ID`; `NAVER_API_HUB_SECRET_KEY` maps to `X-NCP-APIGW-API-KEY`.
  These require matching Application Client ID/Secret, not account-management keys.
  Both variables are present. One News-specific request succeeded; Local/Image
  permissions were not tested or inferred. No values, masks, lengths or hashes logged.
- Fixed query `반려동물`, first page, `sort=date`, `format=json`. Normal boundary requests
  four results directly, avoiding fetching ten then editorial recombination. Smoke
  uses one. No second query, pagination, semantic filtering or duplicate removal.
  Unsafe/missing URLs are excluded. Original URL preferred, returned link fallback.
  No publisher field is invented: hostname is used. `pubDate` is the supplied news
  timestamp, not a claim about original publication. HTML highlights are removed and
  entities decoded using already-installed `entities` 6.0.1, now explicitly declared
  for runtime use. No new version was installed; existing lockfile entries preserved.
- [Revision notice 2243](https://www.ncloud.com/support/notice/all/2243) was read in the
  browser, including its before/after table (published August 20, updated September 1;
  effective September 20, 2026). Revised 2.1–2.4 require independent unmodified search
  display, BI attribution and source links, restrict repurposing/AI/advertising, and
  permit temporary retention only for stated purposes. A generic one-hour homepage
  cache is not treated as automatically covered by those exceptions.
- The [public terms index](https://www.ncloud.com/policy/terms/opapi) currently embeds
  a March 20, 2025 AI·Naver API PDF, whose general rights clauses were read. It does not
  establish the complete current API HUB search-specific agreement. The notice's
  former 2.1 also restricts modifying or combining results. Compatibility of the
  proposed compact title-only/normalized display and current BI requirements remains
  unresolved. This is a documented uncertainty, not a blanket prohibition finding.
- `NEWS_DISPLAY_POLICY=disabled_pending_terms` is a code-level closed boundary.
  `/api/content/pet-news` performs **zero** upstream calls and returns unavailable.
  Credentials cannot enable it. Reopening requires reviewing the applicable full
  agreement/BI conditions and compliant display, not merely changing an environment
  variable. No news result caching, CDN retention, stale reuse, article archive,
  scraping or AI content processing. Actual news titles were not output to the agent.

## Tourism contract, relevance and coverage

[Official general-service operation specification](https://www.data.go.kr/tcs/dss/selectApiDataDetailView.do?publicDataPk=15101578)
was inspected, including its embedded Swagger request and response fields.
`https://apis.data.go.kr/B551011/KorService2/searchFestival2` is fixed separately;
`KorPetTourService2` configuration, URL validation and supported operations are
unchanged. Reuse the existing service-key encoder, response parser and request cache.
`TOUR_API_SERVICE_KEY` is present. Historical successful smoke source was not located
in the repository searches; current bounded verification supplies fresh evidence.

Request: `MobileOS=ETC`, `MobileApp=PetPass`, `_type=json`, `arrange=A`, `numOfRows=100`,
`pageNo=1..8`, `eventStartDate=today-30`, `eventEndDate=today+90`. No regional parameters.
Official labels identify event start/end dates but do not precisely establish all
overlap semantics. The local filter therefore independently validates calendar dates
and overlap, limits known starts to that bounded window, and makes no exhaustive
ongoing-event claim. Long-running events starting more than 30 days ago can be missed.

`pet-event-relevance-v1` requires explicit title evidence: 반려동물/반려견/반려묘/애견/
펫페어/펫박람회 (including spacing). Generic animals, outdoor festivals and bare 펫
substrings do not qualify. Selection is deliberately title-only: events whose pet
topic appears only in detailed descriptions can be missed. No detail crawl is needed
in v1 (zero detail calls). Deduplicate content ID and sort dates deterministically.
Malformed dates, reversed intervals, ended events and explicit cancellation/postponement
are excluded. A future start without an end is retained with “종료일 확인 필요”; past
starts without an end are excluded. No unlimited ongoing assumption.

Region comes from the actual address; address is used when a venue is absent. Never
infer pet admission. No guessed VisitKorea links or use of `/places/[contentId]` for
general festivals. Without a supplied safe official URL, render information without
a button. The section says “반려동물 입장 조건과 일정 변경 여부는 행사 안내를 확인해 주세요.”

Maximum eight physical list requests, concurrency one, 8-second request timeout and
20-second overall refresh timeout; no automatic retries. Stop at totalCount or short
page; a budget/short-page truncation exposes `coverageLimited`. Six-hour request-triggered
process-local cache coalesces refreshes; it is neither shared across serverless instances
nor scheduled. Failures cool down for six hours, extended by a later Retry-After.
No stale fallback. Cached event status is recomputed on each response; visible status
is recomputed each minute in KST without fetching, and original checkedAt is preserved.

## Bounded live evidence

Command (explicitly gated):
`node --conditions=react-server --import tsx scripts/verify-homepage-content-live.ts --live`

| Provider | Physical requests | Result |
| --- | ---: | --- |
| NAVER News | 1 | Authentication/schema PASS, one valid item; normal refresh SKIPPED_POLICY |
| KorService2 | 4 | PASS, nationwide 2026-08-10 through 2026-12-08; zero relevant events; no pagination truncation |

No repeated authentication attempts. No raw upstream payloads or news titles were
saved in evidence/logs. Zero pet events is a legitimate successful result. The fresh
check validates the provider boundary, not a deployed endpoint or a live news-success
screenshot. All populated screenshots are visibly synthetic, not live evidence.

## Verification and external changes

Baseline typecheck/lint/build PASS. Baseline unit tests initially hit Windows sandbox
directory access restrictions; rerun with appropriate tool permission passed all
1,533 tests across 167 files. New deterministic tests cover provider authentication,
URL/entity safety, date/relevance filtering, pagination, cache coalescing and expired
events, Retry-After, policy closure and endpoint restrictions.

Focused Playwright checks cover 1440/768/390/320px, independent loading/failures,
empty states, request counts, external links, keyboard focus, 44px heights, homepage-only
placement and no horizontal overflow. Synthetic screenshots are in ignored
`verification-evidence/homepage-content/` (also excluded by Vercel). Final command
results are recorded in the completion report; unrun checks are never assumed.

Final verification: `npm run verify` PASS (strict typecheck, lint, 168 test files /
1,553 unit tests, production build). The total includes concurrent user-owned tests.
`npm run test:e2e -- tests/e2e/homepage-pet-content.spec.ts tests/e2e/homepage-nationwide.spec.ts`
PASS: 12 tests across Chromium and mobile Chrome. Existing nationwide map/filter/
selection flow passed in both profiles. The common homepage test helper now mocks
the new endpoints, keeping synthetic regressions from making live provider requests.
Playwright CLI also inspected `http://localhost:3000/` at 1440px and 390px with mocked
news unavailable/event empty responses; no horizontal overflow, no console errors,
and no footer clipping. CLI sessions were closed. Screenshots with `synthetic` in
their name must not be described as live provider screenshots. A real news-success
screenshot and populated live-event screenshot were not obtained (policy gate / zero
relevant events). No deployed or live Kakao SDK verification is claimed.

Skills used: petpass-project-context, using-agent-skills, context-engineering,
test-driven-development, security-and-hardening, petpass-ui-review, regression-check.
No remote DB writes/migrations, Vercel configuration changes, new cron, paid service,
commit, push, merge or deployment. Unrelated concurrent user edits are preserved.
