# E2E recovery review — 2026-09-10 (completed)

This section audits only changes since this task began in UI_VER_4. Earlier dirty
files are user-owned. Entry tests were copied to the task TEMP folder and their
hashes recorded before edits. No product code has been changed.

## E1: explicit region entry and current regional state

| Changed E2E | Old expectation/setup | New expectation/setup | Product evidence | Why not weakening |
|---|---|---|---|---|
| delayed enrichment; initial markers/images; failed enrichment | immediately5 venue markers | click Busan region, still exactly5 venue markers | design.md:812; homepage-nationwide unit; current overview17 | retains delay/image independence and complete venue count |
| mixed sources; unavailable Kakao; map failure | immediately available venue rows | explicit Busan entry, native filter disclosure | on-demand region contract | same source counts, selection, list usability and API invariants |
| ordered three-place selection; dense pagination | initial venue list | explicit region entry | same contract; existing storage schema | retains3-place order/removal/planner submission and12-card pagination |
| loading/retry | global loading skeleton5,17-region fanout,34 requests | local Busan status/count,0 fake venue rows,2 Busan requests | latest HomepageNationwidePlaces + design-qa on-demand amendment | proves error is not empty success and retry is scoped; no eager nationwide requirement |
| regional failure/cache return (renamed from partial completion) | implicit17-region aggregate with partial warning | select Busan/save/search, select failing Seoul, retry only Seoul, return cached Busan | latest single-region loader; existing selection hook and cache | preserves search and saved choice, adds no-refetch return check; obsolete aggregate state removed |
| selection area | old guidance sentence | exact current regional guidance | HomepageNationwidePlaces + on-demand wording | same before/after tray absence/presence and selected count |
| filter/mobile/all-width boundaries | hidden filters; old1180 breakpoint | open native details;900 breakpoint | design.md v4 and app/homepage-v4.css | same44px, keyboard/tab, map/list, viewport/overflow assertions |

Flags so far: removed global5 skeleton assertion replaced by truthful local state;
34-request nationwide assumption replaced by exact2 scoped requests;16 other-region
requests replaced by1 Busan request. No assertions about actual source count,
selection order, refresh, saved verdicts or provider truth were removed.
No new skip, force click, positional selector, timeout increase or easier provider
fixture. Existing first/last/nth uses are unchanged and audited later separately.

E1 representative:RED1, thenGREEN6 (3 per project). Cluster first run20PASS/8FAIL;
remaining4 stale state/copy/breakpoint cases fixed,24/24 repeatPASS. Canonical
homepage-nationwide unit3PASS. Full milestone1:369PASS/23FAIL/44SKIP.

## B1 / C1 / D1: current-contract audit

All rows change E2E only; product code changed: **no**.

| Changed E2E | Old expectation | New expectation | Product evidence | Why not weakening |
|---|---|---|---|---|
| uses one eager coastal hero image (renamed) | Busan first photo, no controls | exact coastal alt, one eager image/request,2 named image buttons plus next and selected state | hero-photo-carousel.tsx; design.md v4;5f44390 | Tests current manual controls; unchanged reduced-motion no-autoplay test remains |
| uses compact hero copy | historical copy/CTA | exact v4 copy/travel search; scroll source logos into view and await naturalWidth | HeroPlannerLauncher, HomepageLanding; lazy Image contract | Still3 exact local logos and distinct valid aspect ratios; real load state replaces premature read |
| keeps desktop launcher inside hero (renamed) |720px straddling edge; old source/contact heights; sample trip |1000px inside hero; source/contact ordered below; contact>=88; removed sample absent; exact mailto | design.md:807 and v4 CSS; design-qa removal amendment | Superseded geometry replaced by current non-overlap bounds; removed feature asserted absent |
| moves card focus and opens selection | hero immediately opens results with Busan | hero applies Busan locally with5 rows; current itinerary link opens select route with config default | HomepageLanding onSearch; catalog-url REGION_CONFIGS[0] fallback | Keeps Home/End keyboard, selection entry, two empty trays and zero generation requests; adds local-search check |
| landing selected-place entry | obsolete hero CTA opens results | current local search then current itinerary link; config default | same current contracts; existing header route assertion | Keeps metadata, result query/page/mode and trays; existing offline503 maintained; shared fake SDK prevents live dependence |
| supporting discovery | placeholder DOM count0 |4 hidden placeholders, each has null layout box | weekendog-globals.css:8712; PlaceCardMedia missing state | Proves actual no-large-placeholder UX rather than banning hidden implementation nodes; source/card checks unchanged |
| synthetic content layout at1440/768/390/320 |6 li including old event row;2099 date |5 news li plus visible1/3 carousel group/title; fixed2026-09-10 clock and Sept12–14 dates | existing EventCarousel, eventStatus/offsetDate; event-carousel.spec.ts | All3 fixtures, nullable endDate/URL/image and source variants preserved; correct30-day window |
| independent loading/empty/failure |1 event li | current event heading visible while news pending | same carousel contract | Reloads, independent failure/empty states and requests preserved |
| search event image failure |2099 fixture excluded before target | current-window same source/error-image fixture | same date contract | Exact source, image fallback and news assertions unchanged |

Flag audit: no newly added skips, force clicks, positional selectors, waitForTimeout,
timeout increases, deleted refresh, deleted destination or easier provider payload.
Removed assertions are explicitly replaced above (old copy/layout/count/aggregate state).
New anchored name regex identifies precisely the two image buttons and the current
itinerary link; no existing assertion regex was broadened. Existing Home/End
first/last selectors are meaningful positional contracts and unchanged. Existing
arbitrary card-loop nth remains pre-existing; content panel nth0/1 were removed in
favor of aria-labelledby scope. Clock freezes Date only, not timers, so carousel
pause/rotation tests still run. No fixture category, evidence or unavailable variant
was removed. The5-repeat logo gate and70-repeat content gate passed without retries.

## Exact changed-body inventory (22 bodies/templates)

Each row inherits its cluster rationale above; product changed: no. The shared
content clock/date also affects the unchanged image-error test body. Landing
beforeEach now mocks SDK/data for all existing landing tests.

| File | Current test title | Audit cluster |
|---|---|---|
| homepage.spec.ts | renders the base map while KTO enrichment is delayed by ten seconds | E1 |
| homepage.spec.ts | renders initial markers without waiting for images | E1 |
| homepage.spec.ts | keeps stored markers visible when KTO enrichment fails | E1 |
| homepage.spec.ts | uses one eager coastal hero image with explicit manual carousel controls | B1 |
| homepage.spec.ts | uses compact hero copy and three local official partner marks | B1 |
| homepage.spec.ts | keeps the desktop launcher inside the hero and sources below discovery | B1 |
| homepage.spec.ts | keeps loading and provider failures truthful and retryable | E1 |
| homepage.spec.ts | keeps search and selected places through a regional failure and cache return | E1 |
| homepage.spec.ts | MAP_FAILURE_TEST | E1 |
| homepage.spec.ts | renders mixed source markers, dynamic counts and truthful selection through current category filters | E1 |
| homepage.spec.ts | keeps supporting discovery truthful without a duplicate filter system or large placeholders | C1 |
| homepage.spec.ts | collapses the selected-place area until the first real selection | E1 |
| homepage.spec.ts | keeps official data working when the stored Kakao catalog is unavailable | E1 |
| homepage.spec.ts | moves card focus and opens selection without itinerary generation | B1 |
| homepage.spec.ts | searches loaded places and transfers an ordered three-place selection to the existing selected planner | E1 |
| homepage.spec.ts | keeps homepage filter actions reachable inside the viewport | E1 |
| homepage.spec.ts | paginates a dense home list with complete tab semantics and 44px mobile targets | E1 |
| homepage.spec.ts | preserves mobile order, map width, card snap width, and page overflow | E1 |
| homepage.spec.ts | keeps the live homepage inside all required viewport boundaries | E1 |
| homepage-pet-content.spec.ts | synthetic content layout at ${width}px | D1 |
| homepage-pet-content.spec.ts | independent loading, empty and failure states | D1 |
| landing-navigation.spec.ts | renders the landing page and reaches the existing selected-place entry | B1 |

## F1: recommendation shared card fixture audit

`recommendation-ui.spec.ts` now reuses existing `mockHomepageCardDetails` in
beforeEach. All current specialized per-test routes still register afterwards and
override it. No provider fixture fields or route semantics are removed.
The saved-restore test additionally waits for the actual card response and asserts
200 before saving. Old behavior raced an unmocked optional photo request against
navigation; new behavior fully establishes deterministic generation before testing
zero-request restoration. Product evidence: Timeline useEffect in
recommendation-planner.tsx; card-details-client schema; saved storage contract.
Product code changed: no. Assertions removed:0. Refresh removed:0. Error filters:0.
Timeout change:0.5 consecutive saved-route passes, no retries. The direct body
inventory is now23 bodies/templates across4 files, plus shared-hook effects.

## Final verification

Final392PASS/0FAIL/44SKIP,flaky0. Non-E2E verify PASS: typecheck/lint/1585unit/build.
Final report and repeat evidence: verification-evidence/e2e-recovery-2026-09-10/.
No product changes or external actions. All44 skip reason counts match baseline.

---

## Historical recovery (2026-09-09; unchanged record)

# E2E recovery review v1

2026-09-09. 범위: 기존 deterministic E2E 복구. 이 작업에서 production 코드, 정책, 의존성, Playwright 설정은 변경하지 않는다. 아래 표는 이번 작업의 변경만 다룬다. 이미 존재하던 NAVER/뉴스·행사/마커 preview/저장 복원 변경은 별도 작업이다.

## 판단 근거

- `c68959b`: 홈페이지 전국 지도는 지역별 core snapshot을 사용하며 기존 initial/enrichment는 카드 carousel용이다. `app/page.tsx`, `HomepageNationwidePlaces`, `HomepageLiveExperience(cardsOnly)` 및 기존 nationwide unit/E2E와 대조했다.
- `2984a03a7f7c88f441157e65baaf96fe2e224db6`: 등록 장소 표시와 추천 자격 변경. `pet-access-verdict-label` 및 `recommendation-candidate-fusion-v2` unit이 공개 문구/경로 자격과 보존된 원문 판정을 별도로 검증한다. 원문을 allowed로 바꾸는 수정은 하지 않는다.
- 현재 지역 설정과 `DEFAULT_PLANNER_REGION`, `HeroPlannerLauncher`, planner의 추천 범위 select, 제출 schema를 대조했다. 부산 fixture를 사용하는 경로만 명시적으로 부산 출발지를 확정한다.
- `LivePlaceDetail`의 요약과 complementary 상세 정보는 정상적인 두 문맥이다. 전체 주소가 있으면 짧은 지역 fallback보다 우선한다.
- `ResultsExplorer`는 독립 출처 범례가 없고 카드 출처를 유지한다. 기존 마커 회귀 E2E도 범례 0을 기대한다. 카드 페이지 크기는 12이다.

## 테스트별 변경 감사

모든 행의 production 변경은 **없음**이다. 제목은 각 파일 안의 테스트를 식별한다.

| 파일 / 테스트 | 이전 기대 | 수정 기대 및 이유 / 유지된 검증 |
|---|---|---|
| homepage / `filters nationwide places from browser memory without optional dataset requests` (이전 `loads Shopping once, keeps the usable map visible, and reselects from browser memory`) | 부산 구형 지도 팝업에서 shopping을 원격 추가, 5→6, optional 요청 1 | 현재 전국 core 지도에서 17개 지역 정확히 1회 조회, cafe/all 재선택 5→2→5→2, 재조회 0, clusterer 1. 삭제된 홈페이지 shopping 조작·optional 성능 첨부는 폐기. 현재 optional 시설/쇼핑은 full-map 및 tour-catalog 테스트로 검증 |
| homepage / `aborts an abandoned homepage snapshot request on navigation` | 구형 map loading과 제거된 CTA | 실제 carousel loading, 현재 맞춤 일정 링크. 이동 전후 abort 증가를 검증해 취소 확인을 강화 |
| homepage / `uses compact hero copy and three local official partner marks` | 기본 지역 busan | 현재 첫 자동 추천 가능 지역 설정값. 나머지 copy/파트너/CTA 확인 유지 |
| homepage / `keeps loading and provider failures truthful and retryable` | initial API 실패가 지도 오류 | 17개 지역 snapshot 실패/재시도. loading, 5 skeleton, 오류 박스 높이, 총 34회 요청, 복구된 실제 5개 장소 유지 |
| homepage / `keeps search and selected places while retrying a partial completion` | 구형 completion 호출과 same-origin 쿠키 | 서울만 실패 후 해당 지역만 재시도, 성공 16개 재조회 없음. 실제 전국 snapshot의 credentials omit 확인. 검색·선택 보존 및 복구 장소 추가 확인 유지 |
| homepage / `renders mixed source markers, dynamic counts and truthful selection through current category filters` (이전 facility toggles) | 삭제된 레이어 팝업과 병원 native marker DOM click | 현재 native 유형 select와 사용자 지도 보기 버튼. tourism/Kakao 출처·unknown 안내·선택·카운트 확인. 홈페이지 core에 없는 시설 옵션은 부재 확인, 시설 선택 검증은 catalog에 유지 |
| homepage / `collapses the selected-place area until the first real selection` | 과거 안내 문구 | 현재 안내 문구. 선택 전 표시/선택 후 제거를 모두 유지 |
| homepage / `keeps official data working when the stored Kakao catalog is unavailable` | 구형 지도 팝업과 Kakao 제공처 오류 문구 | 공식 2개 전국 지도 및 carousel의 공식 유지/Kakao 부재. provider 실패 fixture 그대로, 모든 실패를 empty로 치환하지 않음 |
| homepage / `moves card focus and opens selection without itinerary generation` | URL query 순서와 page 누락에 의존 | pathname/tab/region/mode 각각 검증. 파생 page=1 canonicalization 허용. Home/End 키보드 이동·선택·generate 0 유지 |
| homepage / `searches loaded places and transfers an ordered three-place selection to the existing selected planner` | 마지막 제출 raw DOM click | Playwright 실제 click. 3개 순서·지역·제출 payload·응답 확인 유지 |
| homepage / `keeps homepage filter actions reachable inside the viewport` | 삭제된 팝업 적용 버튼 좌표 | 현재 두 native select의 1440/768/390/320 경계·44px 목표·실제 category 변경·스크린샷 |
| homepage / `preserves mobile order, map width, card snap width, and page overflow` | 구형 팝업 경계 | 현재 select 경계. 지도 모드 전환·순서·카드 폭·가로 넘침 검증 유지 |
| homepage 공통 fixture로 복구된 나머지 테스트 | legacy initial이 전국 지도에도 적용된다고 가정 | snapshot 경로에 명시적 fixture 제공. 지연·이미지 지연·enrichment 실패·SDK 실패·탭/페이지·viewport 테스트의 본문 기대는 유지 |
| landing-navigation / 첫 일정 만들기 경로 | busan 고정 및 URL 순서 | 설정의 기본 지역, pathname/tab/page/mode를 모두 확인 |
| tour-catalog / `keeps an official planner district code in memory and uses it on results` | 구형 세부 지역 select·부산 기본값 | 부산 출발지 확정 후 추천 범위 district 선택. 설정에서 옵션 수 계산, 제출 regionId/searchScope/districtId 모두 확인 |
| accommodation-licensing-detail / `shows a high-confidence lodging match through the real provider pipeline` | 전역 체크인/시간/체크아웃 locator | complementary의 한눈에 보기 문맥으로 한정. 5개 원래 정보와 인허가 확인 모두 유지. first/nth 회피 |
| tour-catalog / `starts category-first and keeps optional facility records available` | 독립 범례 + 모든 시설이 첫 페이지 | 이름으로 특정한 KTO/Kakao 카드 출처, 기본/선택 옵션 유지. 총 16개·첫 페이지 12개 확인 후 마지막 페이지 2로 이동해 병원/펫샵을 실제 확인 |
| tour-catalog / `keeps all providers visible while the category dropdown is open` | 독립 범례 두 출처 | 범례 없음, 이름으로 특정한 두 공급자 카드 출처. 출처 필터 부재·layers URL 부재 유지 |
| tour-catalog / `labels a non-Haeundae live detail from its address` | 부산 · 수영구 | server-upstream-mock의 전체 주소 `부산광역시 수영구 광안해변로 1`을 detail 주소 영역에서 정확히 확인 |
| full-map-explorer / `offers explicit first and last page controls with truthful compact access labels` | 과거 unknown 문구 하나가 보임 | 현재 등록 장소 문구를 12개 카드 모두 확인. first 제거, 처음/마지막 페이지 왕복 유지 |
| full-map-explorer / `keeps an unknown Kakao card selectable with its factual access notice` | 과거 unknown badge와 후보 경고 | 현재 공개 문구·후보 경고 부재, 실제 선택 후 저장된 ID 및 evidence.verdict=unknown/evidence.label 원문을 추가 확인 |
| full-map-explorer / `switches to the isolated 54-place Jeju KTO map and safely returns to Busan` | 과거 conditional 문구, 마지막 6개 모두 사진 없음 | 현재 공개 문구와 HTTP detail의 conditional 판정을 별도로 확인. 마지막 6개는 기존 fixture의 ID별 사진/비사진을 검증(사진 1, 비사진 5). 원래 54개 marker/clusterer/지역 bounds/선택/상세 왕복/구별 27개/반응형/공급자 요청 검증 유지 |
| itinerary-generation / `returns a road-validated public-catalog route with truthful provider evidence` | 경로 자격과 원문 판정이 항상 동일, Kakao 경로 unknown/unverified | 기존 unit·정책대로 경로 allowed/verified와 catalogEvidence unknown/null 원문을 각각 확인. 낮은 정보 신뢰도 확인 추가. 공급자 ID·원문 배열 존재·조건 확인을 꾸미지 않음·도로/시간/geometry/API 계약 유지 |

## 감사 기준

- 새 skip, force click, arbitrary first/nth, timeout 증가, 새 sleep 없음. 기존 조건부/프로젝트 중복 skip은 그대로 유지한다.
- 삭제된 홈페이지 팝업의 Escape/focus/레이어 크기 검사는 존재하지 않는 UI의 검사라 현재 native control의 조작/경계 검사로 대체한다. full-map의 필터 키보드 검사는 유지한다.
- snapshot fixture는 source ID·좌표·기존 5개 core를 재사용한다. 부산 이외 지역은 이 fixture 안에서만 empty이며 실제 전국 등록 수라고 해석하지 않는다. 전국 별도 fixture E2E는 지역별 데이터와 부분 실패를 계속 검증한다.
- core schema가 요구하는 districtCode/providerCounts/categoryCounts를 채운다. `other` 항목은 canonical core contract의 unknown/확인 필요 표기를 사용한다. 실제 공급자 payload나 production visibility 규칙은 변경하지 않는다.
- 사용자 개인 데이터·인증 정보·원격 공급자 응답을 증거 파일로 복사하지 않는다. 실패 시 canonical reporter에 없던 URL/viewport/trace는 미측정으로 기록한다.

총 6개 spec의 테스트 본문 22개와 홈페이지 fixture helper 1개를 수정했다. helper 변경으로 복구된 나머지 홈페이지 테스트는 본문을 바꾸지 않았다. 새 `.first()`/`.nth()`는 없으며, 기존 제주 첫 카드 선택은 첫 카드→상세→목록 왕복의 명시적 시나리오여서 유지했다. 제주 `slice(-6)`는 마지막 페이지의 fixture ID별 사진 계약을 검증하는 것으로 모호한 locator 회피가 아니다.

기존 콘솔/page error 0 검사는 전국 브라우저 메모리 필터 테스트에도 유지했다. 필터 optional 전용 performance measure 첨부는 현재 화면에서 해당 요청을 만들지 않아 제거했으며, 기존 NETWORK_TEST의 initial measure/SDK 1회 검사와 full-map의 대규모 registry/요청/성능 테스트는 유지했다.

추가로 드러난 두 문제: 시설의 첫 페이지 가정과 제주 마지막 페이지 사진 수 가정은 기존 fixture와 현재 페이지/정렬 계약에 근거해 수정했다. 중간 구현 실수인 저장 필드 `publicLabel` 기대는 실제 versioned schema의 `evidence.label`로 바로잡고 재검증했다. 실패했던 중간 실행도 최종 검증 요약에 포함한다.

## 최종 검증

- 기준선 310/50/40 → milestone 1 345/15/40 → milestone 2 353/7/40 → 최종 360/0/40(PASS/FAIL/SKIP). 전체 실행은 모두 clean server·retries 0이다.
- `npm run verify`: strict typecheck/lint, unit 168 files / 1,553 tests, production build 모두 PASS.
- URL 전환/필터 반복 검사: 각각 5회 × 2 프로젝트, 20 PASS. console/page error 수집을 유지했다.
- 지정된 원래 두 회귀 별도 재실행: 3 PASS / 1 기존 중복 SKIP. known-negative/unknown 저장 복원은 1440/390 모두 PASS. marker 검사는 snapshot 1, 실패 요청 0, console 오류 0.
- 1440/768/390/320 필터 경계 검사 PASS; 1440/390/320 저장된 화면 직접 검토. 스크린샷은 mock 지도/합성 fixture 화면이다. 이름의 의도된 말줄임을 실제 데이터 손실이라고 판단하지 않았다.
- `git diff --check` PASS. 기존 사용자 변경과 미추적 파일 보존. 새 skip/force click/timeout 증가/임의 positional selector 0. raw DOM click 2곳 제거.
- 증거: ignored `verification-evidence/e2e-full-recovery-2026-09-09/`의 baseline manifest, root-cause mapping, milestone/final/validation summary, 기존 skip 목록, viewport 캡처. 실제 제품 코드 회귀가 확인되지 않아 해당 trace는 없음. canonical baseline reporter의 미수집 항목은 null로 유지한다.
- 실제 외부 공급자/SDK, DB 쓰기, 커밋, 푸시, 병합, 배포는 수행하지 않았다.
