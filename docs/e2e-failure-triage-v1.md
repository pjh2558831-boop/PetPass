# E2E recovery — 2026-09-10 (completed)

Baseline: clean canonical localhost:3000 dev server, CI=1, retries=0.
341 PASS /51 FAIL /44 intentional SKIP,436 total,9.0min. Full non-E2E baseline:
typecheck/lint/1585 unit tests/build PASS. The prior3195 run294/92/44 predates
six additional cases and used a different server configuration; it is historical,
not this baseline. Actual report counts override subtraction from old totals.

| Cluster | Fail count | Representative tests | Root cause | Current contract | Product bug? | Test stale? | Fix target |
|---|---:|---|---|---|---|---|---|
| E1 NAVIGATION_OR_STATE_SETUP_DRIFT |28| delayed enrichment; three-place selection; dense list | Tests assume region data on initial nationwide overview; filter disclosure closed | design.md current region-loading amendment; homepage-nationwide unit/E2E:17 region pins, load selected region only | No; corrected-entry flows pass | Setup stale | Explicit region intent and current loading/retry surfaces |
| B1 STALE_PRODUCT_EXPECTATION |9| static Busan hero; launcher geometry; landing selected entry | v4 image/manual controls/copy/in-hero launcher/local search superseded old launcher | design.md ui_ver_4 section; design-qa.md;5f44390,e5a2700; homepage-v4 E2E | No | Yes | Current exact copy/layout/navigation assertions |
| C1 STALE_OR_AMBIGUOUS_LOCATOR |2| supporting discovery | Counts CSS-hidden placeholder DOM as visible large media | Typed image rules, existing missing-only CSS and card unit contracts | No | Locator measures DOM existence instead of layout | Assert missing state and zero rendered area |
| D1 FIXTURE_DRIFT + STALE_PRODUCT_EXPECTATION |12| synthetic content layouts; independent feed failure |2099 dates outside current30-day window; event is accessible carousel, not li | Existing event-carousel E2E; eventStatus/offsetDate; current user-owned EventCarousel | No; fixture dates outside current window | Yes | Fixed test clock/current-window fixtures and semantic slide assertions |

A ACTUAL_PRODUCT_REGRESSION and G RESPONSIVE_ONLY_REGRESSION: none established.
F TIMING_OR_RACE: no initial-baseline cluster; F1 surfaced at milestone3 below. H ENVIRONMENT_OR_LIVE_PROVIDER_GATING: previous3195
provider502/port assertion failures do not reproduce on clean canonical server.
I duplicate project failures are counted in their root clusters, not separate bugs.
J unknown remains the fallback until representative reproduction confirms each fix.

Contracts are checked against their latest explicit amendment and current canonical
unit/config. Historical Busan-only/Tourism-only prose below newer amendments is not
restored. Assessment verdicts, source labels, stored evidence, engine eligibility,
map loader/clusterer/registry and provider truth are untouched.

E1 representative: independent RED (expected5, actual17), then only actual Busan
button selection added;3 repeats in each project PASS6. Full milestone1/half-count
checkpoint:369 PASS /23 FAIL /44 SKIP (7.2min).28 failures removed. No product change.
B1: representative6PASS; remaining cases35PASS/5 existing SKIP over5 repeats.
C1:6PASS across3 repeats. D1:70PASS across5 repeats including existing event-carousel.
Milestone3:391 PASS /1 FAIL /44 SKIP,5.5min. All51 original failures resolved;
one previously intermittent saved-route console503 surfaced (F1 below).

Baseline failure manifest:verification-evidence/e2e-recovery-2026-09-10.
Canonical reporter did not capture actual URL/viewport for every failure; null
means unmeasured, not guessed. Reproductions supply targeted screenshots.

## Previously reported examples, checked against this baseline

- Historical pet-access labels: no canonical-baseline failure. Current label unit
  contracts distinguish public label from internal verdict. No assertion changed.
- Homepage5 versus15: not the current reproduction. Initial overview has17 region
  pins; explicit Busan loads exactly5 fixture venues. Neither marker cap nor
  fixture place count changed.
- Busan versus Seoul: config/URL fallback is REGION_CONFIGS[0]; selected homepage
  search is local state. Tests now verify Busan search locally and config-derived
  separate selection entry. Planner region submission tests remain unchanged.
- Duplicate check-in / district options / itinerary evidence / refresh: no failure
  on canonical clean-server baseline. Existing tests pass, so no speculative fix.
- Marker preview / delayed results / request race / cache / Back: canonical baseline
  passes these cases. Dedicated unchanged repeats and final suite remain the gate.
- Homepage content: current30-day presentation intentionally excludes2099 fixture;
  only test dates/selectors changed. No news/event/NAVER integration changed.

No new product decision, provider configuration, schema migration, or live-provider
call is necessary for these deterministic repairs.

## F1: missing deterministic photo fixture, exposed by request cancellation timing

| Cluster | Fail count | Representative tests | Root cause | Current contract | Product bug? | Test stale? | Fix target |
|---|---:|---|---|---|---|---|---|
| F1 TIMING_OR_RACE + FIXTURE_DRIFT |1 new milestone3 failure| recommendation-ui: restores a saved recommendation directly and after refresh without provider requests | Timeline requests optional card photos before saving; no route mock; fast save aborts request, slower save receives503 from offline provider | Timeline optional enrichment; strict card DTO; restoration must make0 provider requests | No | Deterministic fixture incomplete | Reuse mockHomepageCardDetails in recommendation beforeEach; wait for pre-save card response200 |

Unmodified isolated test passed5/5, which was not accepted as proof of stability.
Waiting for the actual pre-save card response reproduced503 and the original
console-error assertion failure. Diagnostic logged status/path only:
`503 /api/map/places/cards`. After shared fixture:5/5 saved-route repeats PASS,
existing viewport-only skips5 unchanged; card client/DTO units9PASS. Entire
recommendation cluster56PASS/2 existingSKIP; high-value gate72PASS/18 existingSKIP. No console error was filtered or ignored.
The zero-provider-request restore, refresh, evidence and storage parse checks remain.
This is a pre-save fixture boundary, not a change to saved-route persistence.

## Final verification

Final392PASS/0FAIL/44SKIP,flaky0. Non-E2E verify PASS: typecheck/lint/1585unit/build.
Final report and repeat evidence: verification-evidence/e2e-recovery-2026-09-10/.
No product changes or external actions. All44 skip reason counts match baseline.

---

## Historical recovery (2026-09-09; unchanged record)

# Full E2E failure triage v1

2026-09-09 기준선: canonical `playwright.config.ts`, 깨끗한 서버(`CI=1`), retries 0. 310 PASS / 50 FAIL / 40 SKIP, 8.1분. 변경 전 verify: 168 files / 1,553 unit PASS, typecheck/lint/build PASS.

| Cluster | Failing tests | Root cause | Current contract | Product bug? | Test stale? | Fix target |
|---|---:|---|---|---|---|---|
| D/A 홈페이지 데이터·화면 분리 | 29 | 이전 `/api/homepage/places/initial` fixture를 현재 전국 지도에도 적용된다고 가정. 실제 지도는 `/api/map/places/snapshot` 사용 | `c68959b`, `HomepageNationwidePlaces`, `HomepageLiveExperience(cardsOnly)`, homepage-nationwide unit/E2E | 아니오 | fixture 경로와 삭제된 필터/로딩 표면 | homepage fixture 및 각 흐름 |
| A 등록 장소 문구 | 5 | 과거 unknown/conditional 카드 문구 기대 | `2984a03a`, pet-access-verdict-label unit. 원문 verdict는 별도 보존 | 아니오 | 예 | full-map-explorer의 문구와 원문 확인 |
| C 숙박 정보 선택자 | 2 | 정상적인 상단 요약/상세 aside에 동일 dt 존재 | `LivePlaceDetail`; 실제 접근성 트리의 complementary 상세 정보 | 아니오 | 전역 getByText 모호함 | 숙박 E2E를 상세 정보 문맥으로 제한 |
| E 지역·추천 범위 초기화 | 6 | 고정 부산 기본값·이전 세부 지역 select 기대 | HeroPlannerLauncher의 config 기반 초기 지역/URL, 현재 추천 범위 select, 전국 planner config | 아니오 | 예 | hero/landing/planner 테스트 설정 및 제출 값 |
| A 출처 범례 | 4 | 삭제된 독립 범례 기대 | 현재 ResultsExplorer 원본 marker E2E는 범례 0, 카드는 출처 유지 | 아니오 | 예 | 범례 부재와 카드의 실제 출처 각각 검증 |
| A 상세 지역 표현 | 2 | 과거 짧은 지역 라벨 기대 | LivePlaceDetail은 전체 주소를 우선 표시, fallback만 regionLabel | 아니오 | 예 | 전체 주소와 올바른 구 검증 |
| A 경로 자격·원문 구분 | 2 | 경로 자격 결과와 catalogEvidence의 원문 판정이 같다고 가정 | `applyRegisteredPlacePolicy`, `2984a03a`, recommendation-candidate-fusion-v2 unit: 자격 allowed/verified, 원문 catalogEvidence 보존 | 아니오(의도적 기존 정책) | 예 | HTTP E2E의 두 값 별도 검증; 엔진 수정 없음 |

A=stale expectation, B=product regression, C=locator, D=fixture drift, E=navigation/state setup, F=responsive, G=timing, H=environment/provider gate, I=duplicate, J=unknown. 기준선 B/F/H/J는 확인되지 않았다. 복구 중 G에 해당하는 URL canonicalization 기대 경쟁(새 잠재 실패)도 확인해 query 의미값으로 검증했다. 동일 원인의 다른 project 실패는 I로 중복 집계되며 별도 버그로 세지 않는다.

원본 실패별 ID/기대/실제/선택자는 ignored `verification-evidence/e2e-full-recovery-2026-09-09/baseline-failures.json` 및 `.md`에 기록했다. canonical reporter가 최종 URL/viewport와 화면/trace를 제공하지 않은 경우 null로 명시했다. 추정값을 실측으로 기록하지 않는다.

각 군의 권위 판단: 현재 코드만으로 정당화하지 않고 명시된 커밋·설정·기존 unit/E2E 계약을 함께 대조한다. 오래된 문서의 Busan MVP/원문 판정 자동 제외는 이후 전국/등록 장소 정책으로 대체된 부분을 구분한다. 원격 작업·추천 점수·공급자 정책 변경 없음.

## 복구 진행과 추가 재현

| 실행 | PASS | FAIL | SKIP | 비고 |
|---|---:|---:|---:|---|
| 변경 전 전체 | 310 | 50 | 40 | 8.1분 |
| milestone 1 | 345 | 15 | 40 | 홈페이지/지역 군 수정, 5.5분 |
| milestone 2 | 353 | 7 | 40 | 숙박 locator/카드 출처/주소 수정, 5.3분 |
| milestone 3 / 최종 | 360 | 0 | 40 | 공개 문구/경로 원문 군 수정, 5.1분 |

중간 집중 검사의 실패도 숨기지 않는다. 홈페이지 fixture 최초 변환은 snapshot 필수 count/district 검증에서 거절되어 schema에 맞게 보완했다. 홈페이지 첫 군 실행은 23 PASS / 24 FAIL / 5 SKIP였고, 이후 작은 군별 재실행으로 해소했다. 관광 카탈로그는 범례 수정 후 시설이 첫 페이지에 없다는 잠재 실패 2건이 드러났다(12 PASS / 2 FAIL). 총 16개·12개 pagination 계약을 따라 2페이지로 이동한 뒤 14 PASS였다. 제주 문구 수정 후에는 마지막 페이지의 기존 사진 1개를 잘못 제외하던 잠재 기대값도 확인했다. 원본 fixture를 바꾸지 않고 각 ID의 사진 여부를 확인해 5 PASS / 1 기존 SKIP로 통과했다.

숙박 전체 군 24 PASS, 경로 HTTP 전체 군 12 PASS. 홈페이지 URL canonicalization 경쟁 및 메모리 필터/콘솔 검증은 두 프로젝트에서 각각 5회 연속, 총 20 PASS / 0 FAIL / 0 SKIP였다. 새 결정론적 skip이나 retry로 성공 처리한 테스트는 없다.

최종 `npm run verify`: typecheck/lint, 168 files / 1,553 unit, production build PASS. 최종 전체 E2E 360 PASS / 0 FAIL / 40 기존 SKIP, flaky 0. 마지막으로 지정된 두 회귀를 별도 재실행해 3 PASS / 0 FAIL / 1 기존 프로젝트 중복 SKIP를 확인했다. 마커 registry 테스트의 마지막 실측은 snapshot 요청 1, marker용 paged/fallback 요청 0, 실패 요청 0, console 오류 0이다. 저장 복원은 1440/390px 모두 통과했다. `git diff --check` PASS.

완료 상태: `FULL_E2E_SUITE_RECOVERED_WITH_INTENTIONAL_SKIPS`. 원격 DB/인증/공급자 설정 변경, 커밋/푸시/병합/배포 없음. 라이브 SDK 및 실제 외부 공급자는 SKIPPED(기존 opt-in 범위). mock SDK·합성 데이터를 실측 전국 서비스 결과로 표현하지 않는다. Next 개발 서버의 기존 이미지 LCP 권고/색상 환경 경고는 남아 있으며, 이를 runtime 오류 0과 혼동하지 않는다.

## Skills와 검토 범위

`using-agent-skills`를 먼저 읽고 `context-engineering`으로 관련 계약과 실패 군 중심으로 읽었다. `petpass-project-context`/AGENTS는 작업공간 변경 보존·provider/domain 경계·원격 변경 금지를 적용했다. `debugging-and-error-recovery`와 `test-driven-development`는 기준선 실패 재현→근거 확인→최소 수정→군별 재검증에 사용했다.

`petpass-ui-review`의 responsive/map 체크리스트와 `regression-check`의 browser matrix를 읽고 홈페이지/카탈로그/상세/선택/planner/저장 흐름, 키보드, 1440/768/390/320 경계를 검증했다. 설치된 `vercel:agent-browser` SKILL을 읽고 저장소 browser matrix의 Playwright CLI 세션으로 숙박 상세 접근성 트리와 console을 확인했다. `code-review-and-quality`의 correctness/readability/architecture/security/performance 축으로 테스트 변경을 검토했다. 실제 제품 UI나 성능 구현을 바꾸지 않아 추가 디자인/성능 스킬은 적용하지 않았다.

카카오/provider/storage 세부 계약은 이미 읽은 저장소 스킬 및 현재 원본 unit/코드와 대조했다. 체크리스트의 오래된 auth 부재 설명 등은 현재 코드보다 우선하지 않는다. 새 라이브 공급자 테스트로 전환하지 않았으며, 기존 mock 실패 상태는 오류 UI 테스트로 남겼다.
