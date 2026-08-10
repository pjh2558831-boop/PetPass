# PetPass data-coverage audit

Audit date: 2026-08-06 (Asia/Seoul)

Scope: existing repository and local application only. No deployment, promotion,
product-code change, source merge, or pet-access rule change was performed.

## A. Main conclusion

**Diagnosis: both provider and implementation limitations.**

The shortage of attractions, food/cafes, and accommodations is primarily a real
coverage characteristic of `KorPetTourService2`, while the perceived number on
screen is further reduced by explicit PetPass presentation and itinerary limits.

- The Busan provider total is 653, but 614 (94.0%) are content type 38 shopping.
  The default target categories contain only 39 records: 27 attractions, 1
  cultural facility, 0 festivals, 3 leisure places, 5 accommodations, and 3
  food places.
- The current catalog is **not page-1-only**. It paginates every selected content
  type to completion, deduplicates by content ID, then returns a 12-card client
  page. Busan's default catalog is all 39 records over four UI pages.
- The application is intentionally Busan-only. Haeundae is selectable but is not
  the default Tourism scope. Kakao Local search, however, is hardcoded to a
  Haeundae center and 20 km radius.
- The default catalog does not filter on coordinates, pet verdict, licensing,
  image, or hours. The itinerary path is much stricter: it considers at most 80
  catalog candidates, calls details for only the nearest 12, excludes unknown,
  not-allowed, and not-applicable pet assessments, then makes at most 6 Kakao
  route calls.
- A bounded Kakao sample produced 217 unique candidates (117 food/cafes, 55
  accommodations, 45 other), versus 39 default Tourism records, but none can be
  called verified pet-friendly from Kakao metadata alone.

The safest product direction is a two-lane model: authoritative verified Tourism
places and separately labeled Kakao discovery candidates, with source-specific
claims and a later verification workflow. Combining the counts without the trust
labels would be misleading.

## B. Provider findings

### Configuration and operations

`lib/tour-api/config.ts:getTourApiConfig` requires HTTPS, host
`apis.data.go.kr`, and a path ending in
`/B551011/KorPetTourService2`. The configured value was confirmed as:

```text
https://apis.data.go.kr/B551011/KorPetTourService2
```

`lib/tour-api/client.ts:buildTourRequestUrl` owns the server-only service key and
adds `MobileOS=ETC`, `MobileApp=PetPass`, and `_type=json`. The live contract
probe returned HTTP 200 / provider result code `0000`. The key matched the
exactly-once encoding and did not match double encoding. No key or complete URL
was printed or stored.

| Operation | Implemented | HTTP/path | Application parameters |
| --- | --- | --- | --- |
| `areaBasedList2` | Yes | `GET /B551011/KorPetTourService2/areaBasedList2` | `lDongRegnCd`, optional `lDongSignguCd`, optional `contentTypeId`, `pageNo`, `numOfRows`, `arrange=A`, plus common parameters |
| `locationBasedList2` | No | Not allowlisted | No coordinates or radius are sent to Tourism |
| `searchKeyword2` | No | Not allowlisted | No keyword query is implemented |
| `detailCommon2` | Yes | `GET .../detailCommon2` | `contentId`, plus common parameters |
| `detailIntro2` | Yes | `GET .../detailIntro2` | `contentId`, `contentTypeId`, plus common parameters |
| `detailPetTour2` | Yes | `GET .../detailPetTour2` | `contentId`, plus common parameters |

The public raw proxy `app/api/tour/route.ts:GET` is also GET-only and forwards
query values after removing `operation`; the client still rejects operations
outside the four-item allowlist.

### Pagination tests

Test A, direct first-page parameters used by `KoreaTourismService.listPlaces`
when called without a type:

| Field | Result |
| --- | ---: |
| `totalCount` | 653 |
| `numOfRows` | 20 |
| `pageNo` | 1 |
| Provider items | 20 |
| Parsed items | 20 |
| Default UI cards after the catalog service | 12 of 39 |

A consumer that stopped at that direct page would miss 633 provider records.
The current catalog does not do that. `lib/tour-api/catalog-service.ts` requests
each selected content type at 50 rows/page, calculates pages from `totalCount`,
and fetches all pages up to a bounded 20-page maximum.

Test B, complete Busan pagination:

- All seven types: 653/653 rows, 653 unique content IDs, 0 duplicate IDs.
- Default six types: 39/39 rows, all completed in one page per type.
- Type 38: 614/614 rows over 13 pages.
- No repeated pages and no items lost between pages.
- Default application catalog: 39 unique records; API page 1 returns 12 and the
  UI exposes 1/4 pagination.

The 614-record difference between provider total and default catalog is an
intentional content-type decision: shopping is opt-in. The 27-record difference
between the default catalog and the first rendered page is client pagination,
not silent loss.

The 20-page bound is safe for Busan. It would make a future Seoul type-38 query
fail because the provider advertises 3,092 shopping records (62 pages at 50).
The audit stopped that non-Busan query at 20 pages and recorded it as incomplete;
current production routes reject Seoul before this code path.

### Content-type coverage

| Type | Provider total / retrieved | Coordinates | Normalized | Pet-detail/evaluation evidence | Catalog display behavior |
| --- | ---: | ---: | ---: | --- | --- |
| 12 attractions | 27 / 27 | 27 | 27 | 26 pet items; 1 allowed, 25 conditional, 1 unknown/unavailable | 27 total, 12/page |
| 14 culture | 1 / 1 | 1 | 1 | 1 pet item; conditional | 1 |
| 15 festivals | 0 / 0 | 0 | 0 | None to inspect | 0 |
| 28 leisure | 3 / 3 | 3 | 3 | 3 pet items; all conditional | 3 |
| 32 accommodations | 5 / 5 | 5 | 5 | 5 pet items; 1 allowed, 4 conditional | 5 |
| 38 shopping | 614 / 614 | 614 | 614 | First 12 alphabetical UI records: 12/12 pet items, all allowed | Excluded from “all”; 614 and 12/page when explicitly selected |
| 39 food | 3 / 3 | 3 | 3 | 3 pet items; 1 allowed, 2 conditional | 3 |

For the complete 39-record default catalog, 38 records had a non-empty
`detailPetTour2` item and an allowed/conditional verdict. One attraction lacked
the pet item and remained unknown. There were five missing photos and one missing
hours record; neither condition removes a catalog card.

Type 38 is not misclassified as food or tourism attraction. It is normalized as
shopping and deliberately separated into the `TOUR_OPT_IN_CATALOG_CONTENT_TYPE_IDS`
allowlist. All Service2 types 12, 14, 15, 28, 32, 38, and 39 are provider-compatible
and Phase-3-support-compatible. Unsupported IDs cannot enter the typed catalog.

### Coordinate quality

For all 653 complete Busan records:

- Valid `mapx`/`mapy`: 653.
- Missing, zero, reversed, outside South Korea, or outside requested region: 0.
- Normalizer rejection: 0.
- Geocoded later or removed after geocoding: 0; Tourism coordinates are used
  directly.
- Duplicate content IDs: 0.
- Duplicate-coordinate extra records: 340, all in type 38. They are retained
  because the current deduplicator uses content ID, not coordinates.

The conversion is correct end to end:

```text
TourAPI mapx -> longitude
TourAPI mapy -> latitude
Kakao maps.LatLng(latitude, longitude)
```

`lib/tour-api/normalizers.ts:normalizeCoordinates` produces longitude from
`mapx` and latitude from `mapy`. `lib/kakao/maps.ts:updateData` passes them to
Kakao in latitude/longitude order. In browser verification, 12 page-one records
produced 12 markers at plausible Busan locations and map bounds included the
accepted page markers.

### Regional totals

These are provider totals from the same seven typed queries. “Default relevant”
excludes opt-in shopping. The application-rendered column reflects current
product support, not hypothetical nationwide support.

| Scope | All provider types | Default relevant | Current first UI page |
| --- | ---: | ---: | ---: |
| Busan citywide | 653 | 39 | 12 |
| Haeundae (350) | 102 | 11 | 11 when selected |
| Suyeong (500) | 18 | 6 | 6 when selected |
| Seoul | 3,170 advertised | 78 | 0; route rejects non-Busan |
| Jeju | 331 | 55 | 0; route rejects non-Busan |

Busan is hardcoded in `app/api/tour/places/route.ts:querySchema`,
`components/places/results-explorer.tsx`, and
`lib/itinerary/request-schema.ts`. A valid saved Busan district can become the
initial district; otherwise the default is all Busan. The results URL only
honors `tab`, so region or district URL parameters are ignored. There is no
Tourism radius or bounding-box filter.

Phase 1 supersedes the generic Kakao Local search described in this dated
audit. `GET /api/places/discovery` now accepts one supported catalog category
and exactly one district or bounded current-map rectangle. Its keywords,
pagination, category groups, subdivision, and call budget are server-owned;
returned candidates are temporary, require verification, and cannot enter
itinerary recommendation.

The itinerary has a default origin of Busan Station (35.1151, 129.0414), but the
user may edit it or use current location. Destinations are dynamically selected;
there are no fixed live destination IDs. The home page remains an explicitly
labeled three-marker demo and links to demo detail content.

### Cache behavior

- List provider cache: in-memory, per process, 5 minutes.
- Detail provider cache: in-memory, per process, 15 minutes.
- Catalog Route Handler: CDN `s-maxage=300`, stale 60 seconds.
- Detail Route Handler: CDN `s-maxage=900`, stale 120 seconds.
- Kakao Local Route Handler: CDN `s-maxage=300`, stale 600 seconds.
- Provider fetches themselves use `no-store`.

There is no persisted partial cache or fixture fallback. No stale-partial-cache
behavior was observed in the live run.

## C. PetPass pipeline losses

### Pipeline map

```text
Tourism provider response
-> lib/tour-api/parser.ts:parseTourResponse
-> lib/tour-api/normalizers.ts:normalizeTourPlaceSummaries
-> lib/tour-api/catalog-service.ts:collectContentType
-> lib/itinerary/generation-service.ts:isEligibleCatalogSummary (route only)
-> lib/pet-access/tourism/evaluator.ts:isSupportedProviderContentType
-> lib/pet-access/tourism/evaluator.ts:evaluateTourPetAccess
-> lib/licenses/service.ts:LicenseMatchingService.matchTourPlace (detail only)
-> lib/tour-api/catalog-service.ts:deduplicateAndSort (content ID only)
-> lib/tour-api/service.ts:listPlaces (legal region/district request)
-> lib/itinerary/generation-service.ts:compareByStartDistance (route only)
-> app/api/tour/places/route.ts:GET / app/api/itineraries/generate/route.ts:POST
-> components/places/results-explorer.tsx (district/category/page state)
-> components/places/place-card.tsx + components/map/map-panel.tsx
```

Stage responsibilities:

| Stage | File/function | Actual behavior |
| --- | --- | --- |
| Provider request | `lib/tour-api/client.ts:TourApiClient.request` | GET, 8 s default timeout, one transient retry, no-store |
| Parser | `parseTourResponse` | Validates envelope and every item; malformed item fails the response rather than being silently dropped |
| Normalization | `normalizeTourPlaceSummary` | Requires content ID; title, image, address, phone, and coordinates may remain null |
| Content filtering | `collectContentType` / catalog allowlists | Default types 12/14/15/28/32/39; type 38 opt-in |
| Coordinate filtering | `isEligibleCatalogSummary` | No catalog drop; route rejects unusable coordinates |
| Support detection | `isSupportedProviderContentType` | Accepts only the seven current Service2 types |
| Pet assessment | `evaluateTourPetAccess` | Detail and route only; catalog explicitly says “not yet assessed” |
| Licensing | `matchTourPlace` | Detail-only enrichment for food/accommodation; never used by route generation |
| Deduplication | `deduplicateAndSort` | Exact `contentId` only, first occurrence kept |
| Region/radius | Route schemas and provider params | Busan/legal district for Tourism; no Tourism radius; 20 km Haeundae radius only for Kakao search |
| Ranking | `compareByStartDistance` | Route candidates ordered from editable start coordinate |
| API result limit | `listTourCatalog` / generation limits | Catalog page requested by caller; itinerary 80/12/6 limits |
| Client filter | `ResultsExplorer` | District, category, 12/page; saved Busan district may hydrate |
| Cards/markers | `PlaceCard`, `MapPanel`, `createKakaoMapController.updateData` | One card per API row; one marker per valid coordinate on the current page |

### Busan catalog funnel

This funnel follows the current default user journey. “Removed” at ranking means
excluded from the default category set, not deleted from the source catalog.

| Pipeline stage | Remaining | Removed at stage | Main removal reasons |
| --- | ---: | ---: | --- |
| Provider total | 653 | - | Seven Service2 content types |
| Parsed | 653 | 0 | All responses valid |
| Unique IDs | 653 | 0 | Deduplication by content ID |
| Valid coordinates | 653 | 0 | All valid; catalog would retain null coordinates anyway |
| Supported content types | 653 | 0 | All seven values supported |
| Phase 3 supported | 653 | 0 | Content-type support only; assessment is not run in catalog |
| Licensing matched | 653 | 0 | Not a catalog filter; only detail enrichment |
| Region/radius accepted | 653 | 0 | All Busan; no Tourism radius |
| Default ranking candidate | 39 | 614 | Type 38 shopping is opt-in |
| API returned | 12 | 27 | Requested client page 1 at 12/page |
| UI rendered | 12 | 0 | All API rows become cards |
| Map markers shown | 12 | 0 | All page-one coordinates valid |

### Live itinerary funnel

The default UI selects attractions, leisure, and food: 27 + 3 + 3 = 33
provider candidates.

| Stage | Remaining | Removed | Reason |
| --- | ---: | ---: | --- |
| Selected-category catalog | 33 | - | Current default category checkboxes |
| Valid/supported catalog | 33 | 0 | Titles, coordinates, types all valid |
| Bounded catalog | 33 | 0 | Below 80-candidate limit |
| Detail shortlist | 12 | 21 | `maxDetailCalls=12`, nearest from Busan Station |
| Pet-eligible candidates | 12 | 0 | Live shortlist: no unknown/not-allowed/not-applicable result |
| Directions proposals | 3 | - | 3 calls, below max 6 |
| Rendered itineraries | 3 | 0 | Each route had 3 stops |

The 21 `candidate_limit` count is the most important route-density loss. Records
outside the nearest 12 are never pet-assessed for that request, even though the
complete default detail audit found 38/39 default records route-eligible by pet
verdict.

### Rule-by-rule loss findings

| Rule | Catalog effect | Itinerary effect |
| --- | --- | --- |
| `not_applicable` | None | Excluded; 0 in the live default run |
| `unknown` | None | Excluded; 0 in live shortlist, 1 in complete 39-record audit |
| Provider unavailable | Visible error, no demo fallback | Typed provider-unavailable or detail exclusion |
| Missing pet details | Card retained | Usually unknown and therefore excluded |
| Licensing mismatch/unknown | No effect | No effect; licensing is not read by itinerary |
| Missing photos | Missing-image component | No effect |
| Missing hours | Card retained | Candidate retained with warning unless explicitly closed |
| Missing coordinates | Card retained, marker omitted | Candidate excluded |
| Duplicate titles | Retained | Retained unless content ID repeats |
| Duplicate coordinates | Retained | Retained |
| Route-distance limit | None | No fixed radius; nearest-order shortlist and final duration can remove candidates |
| Maximum card count | 12 per page | Not applicable |
| Maximum marker count | Same as current page/route | 3 selected route stops in live default |
| Default filters | All Busan, six non-shopping types | Attractions + leisure + food; shopping off |
| Itinerary slot limit | None | User chooses 1-5 stops; current default 3 |

### Browser measurements

| Viewport | API total | Cards | Markers | Pagination | Notes |
| --- | ---: | ---: | ---: | --- | --- |
| 1440 x 1000 | 39 | 12 | 12 | 1/4 visible | All filter active |
| 768 x 1024 | 39 | 12 | 12 | Visible | No virtualization |
| 390 x 844 | 39 | 12 | 12 | Visible | Same markers/cards; vertical layout |

Individual filter results were exact and marker/card counts matched:

| Filter | Total | Cards | Markers |
| --- | ---: | ---: | ---: |
| All | 39 | 12 | 12 |
| Attractions | 27 | 12 | 12 |
| Culture | 1 | 1 | 1 |
| Festivals | 0 | 0 | 0 |
| Leisure | 3 | 3 | 3 |
| Accommodations | 5 | 5 | 5 |
| Food | 3 | 3 | 3 |
| Shopping (opt-in) | 614 | 12 | 12 |

No cards existed without markers in the inspected data, no markers existed
without cards, scrolling did not hide records, and browser console warnings/errors
were empty.

One definite presentation bug was found: live detail pages do not pass
`locationLabel` to `MapPanel`, whose default is “부산 · 해운대구”. Consequently,
Dong-gu and Seo-gu live records were visibly labeled Haeundae even though their
addresses and marker coordinates were correct. Exact cause:

- `components/map/map-panel.tsx:MapPanel` default `locationLabel`.
- `components/places/live-place-detail.tsx` calls `MapPanel` without a label.
- Affected count: every live detail map outside Haeundae; it does not remove data.
- Smallest safe fix: derive a neutral label (for example, “부산”) or pass the
  provider address/legal district name.
- Regression test: open a non-Haeundae detail and assert the map label never says
  Haeundae unless its legal district code is 350.

Per audit policy, this bug was not fixed.

## D. Kakao feasibility

The bounded audit used the same Haeundae center/radius as the server route, but
requested up to 15 records over at most three pages to inspect Kakao's full
45-record pageable window. Kakao's reported `total_count` may be much larger than
its 45-record pageable count.

| Query | Reported total | Pageable / retrieved | Unique | Phone | Tourism overlap |
| --- | ---: | ---: | ---: | ---: | ---: |
| 반려동물 동반 카페 | 0 | 0 / 0 | 0 | 0 | 0 |
| 반려견 동반 식당 | 117 | 45 / 45 | 45 | 39 | 0 |
| 반려동물 동반 숙소 | 0 | 0 / 0 | 0 | 0 | 0 |
| 애견펜션 | 10 | 10 / 10 | 10 | 5 | 0 |
| 반려견 운동장 | 0 | 0 / 0 | 0 | 0 | 0 |
| 동물병원 | 237 | 45 / 45 | 45 | 37 | 0 |
| 카페 | 7,735 | 45 / 45 | 45 | 22 | 0 |
| 음식점 | 40,278 | 45 / 45 | 45 | 24 | 0 |
| 숙박 | 2,112 | 45 / 45 | 45 | 29 | 1 |

All 217 bounded unique Kakao candidates had valid coordinates, addresses, and
place URLs. Classification after cross-query deduplication:

- `verified_pet_friendly`: 0.
- `provider_claimed_pet_friendly`: 0.
- `keyword_candidate`: 55.
- `generic_place`: 160.
- `not_relevant`: 2.

Broad categories were 117 food/cafes, 55 accommodations, 45 other (primarily
animal hospitals), and 0 attractions in this bounded query set. One accommodation
overlapped the Tourism default catalog under the audit's conservative identity
rule.

Safe Kakao uses and required evidence:

| Use | Safe? | Required threshold |
| --- | --- | --- |
| Map-density candidates | Yes, in a visually separate candidate layer | Valid ID/coordinates and “카카오 검색 후보” label |
| Search-only supplement | Yes | Preserve category, address, phone, URL; never show a pet verdict |
| Route-supporting places | Only after verification | An authoritative/current pet-access claim; generic Kakao metadata is insufficient |
| Fallback requiring confirmation | Yes | Explicit “추가 확인 필요”; no allowed/conditional badge |
| Verified pet-friendly place | Not from Kakao alone | Tourism evidence, direct business confirmation, or administrator verification |

Kakao materially improves discovery density, especially for ordinary restaurants,
cafes, accommodations, and animal hospitals. It does not by itself improve the
verified pet-friendly total.

## E. Diagnosis of the three suspected causes

### Cause 1: Tourism API coverage limitation — confirmed

The provider has only 39 non-shopping Busan records and only 3 food plus 5
accommodation records. Complete pagination, normalization, and coordinate checks
did not lose any of them. Pet-specific detail was strong for 38/39, so the problem
is not mainly missing pet text among retrieved target records; it is the small
number of target records supplied in the first place.

### Cause 2: PetPass fetches only a subset — partially confirmed

| Suspected subset cause | Finding |
| --- | --- |
| Only first page | Not confirmed for current catalog |
| Fixed `numOfRows` | Not a loss: 50 provider rows/page, complete pagination |
| Early stop | Not in Busan; bounded error above 20 pages affects future large scopes |
| District restriction | Not default; saved/selected Busan district can restrict visibly |
| Radius restriction | No Tourism radius; confirmed 20 km Haeundae radius for Kakao Local |
| Content-type omission | Confirmed and intentional: type 38 shopping excluded from default |
| Coordinate rejection | Not confirmed in current Busan data |
| List/detail join loss | Not in catalog; route only details 12 nearest candidates |
| Stale partial cache | No evidence |
| Timeout/fallback | Errors are visible; no production fixture fallback |
| Client result limit | Confirmed: 12 cards/page with visible pagination |
| Marker limit | Confirmed indirectly: markers equal the current page, 12 |
| Itinerary limit | Confirmed: 80 catalog, 12 details, 6 directions; 21 current candidates not assessed |
| Busan-only support | Confirmed at API, UI, and itinerary schemas |

### Cause 3: Tourism alone cannot provide PetMap-level density — confirmed

| Category | Best discovery sources | Trust path |
| --- | --- | --- |
| Neighborhood pet-friendly cafes | Kakao, business registration, user reports | Business/admin verification before pet verdict |
| Ordinary restaurants | Kakao + MOIS food licensing | Pet rules still require business/admin/Tourism evidence |
| Pensions/guesthouses | Kakao + accommodation licensing + owner data | Cross-dataset identity, then verify pet rules |
| Dog parks/playgrounds | Kakao, municipal data, user reports | Admin/municipal verification |
| Veterinary hospitals | Kakao + veterinary licensing dataset | Operational category, not pet-access claim |
| Grooming shops | Kakao + relevant licensing/business data | Category verification; no pet-travel access inference |
| Small experiences | Kakao, business registration, user reports | Direct/admin verification |
| Newly opened businesses | Kakao, owner registration, user reports | Freshness checks and admin verification |

## F. Recommended solution

### 1. Immediate bug fixes

1. Fix the live-detail Haeundae label described above and add the district
   regression test.
2. Make the Kakao search boundary visible in the UI (“Haeundae-centered 20 km”) or
   accept a validated selected-region center later. This is a transparency fix,
   not authorization to add candidates to the verified catalog.
3. Preserve the existing page indicator and consider also saying “12 of 39 shown”
   near the headline so card-page density cannot be mistaken for source density.

### 2. Data-pipeline improvements

- Return explicit stage counts (`providerTotal`, `defaultCatalogTotal`,
  `verifiedCount`, `candidateCount`, `pageCount`) rather than one overloaded total.
- Keep the complete source catalog separate from route eligibility. Precompute or
  cache assessment summaries if wider route coverage is needed, but do not change
  unknown to allowed.
- Revisit the 12-detail shortlist with quota-aware batching or persisted verified
  assessments. The current nearest-first cap can omit otherwise eligible variety.
- Add structured observability for page counts, totalCount changes, detail misses,
  and assessment outcomes without logging source payloads or keys.
- For nationwide work, replace the hard error above 20 pages with a bounded,
  resumable regional/category sync design rather than increasing an online request
  limit without control.

### 3. Kakao supplementary-data architecture

Use a canonical place entity with source records kept intact:

```text
CanonicalPlace
  identity: canonical ID, normalized name, road address, coordinates, phone
  sourceRecords[]: provider, provider ID, original fields, retrievedAt
  discoveryClassification: verified | provider_claimed | keyword_candidate | generic
  petAccessClaims[]: claim, scope, restrictions, source, observedAt, confidence
  licensingRecords[]: dataset, match state, operating state, source evidence
  verification: status, verifier, verifiedAt, expiry/review date
```

Suggested user-facing labels:

- 관광공사 확인
- 업체 확인
- 관리자 확인
- 이용자 제보
- 카카오 검색 후보
- 추가 확인 필요

Cross-source deduplication rules:

1. Exact provider ID only deduplicates within that provider.
2. Exact normalized road address plus a compatible normalized name is strong.
3. Exact normalized phone plus compatible name/address is strong.
4. Coordinate distance <= 50 m plus compatible name/address is strong.
5. Distance 50-100 m requires name plus address or phone agreement.
6. Never merge on name alone or coordinates alone; type-38 duplicate coordinates
   demonstrate why.

Conflict rules:

- Tourism says allowed, current business says no: preserve both claims, mark the
  current access state blocked/pending administrator review, and do not route.
- Kakao keyword implies pet-friendly without official evidence: retain only as a
  keyword candidate with no pet verdict.
- A confidently matched license says closed while Tourism is active: mark an
  operational-status conflict and remove from automatic routing pending review;
  do not call the business illegal and do not reinterpret pet policy.
- Provider coordinates differ: preserve originals. Prefer an administrator- or
  business-verified coordinate; otherwise flag conflicts over 100 m rather than
  silently averaging.

### 4. Verification and trust model

Maintain the hierarchy as separate claim types, not destructive precedence:

```text
Tourism API pet data -> authoritative public pet-travel evidence
Kakao Local -> broad discovery and location metadata
MOIS licensing -> operating/licensing evidence, separate from pet access
Business self-registration -> current owner-provided rules
User reports -> unverified recent observations
Administrator verification -> trusted resolution with timestamp
```

Every pet-access badge should be traceable to original evidence, source name, and
retrieval/verification time. User reports may trigger review but should not silently
override authoritative data.

### 5. Nationwide expansion considerations

- Generalize region schemas only after provider page budgeting, district code
  validation, and cache keys are made nationwide-safe.
- Use region/category background synchronization or scheduled bounded jobs rather
  than loading thousands of shopping records in an interactive request.
- Make map-density and verified-pet layers independently toggleable.
- Parameterize Kakao center/radius from validated scope; a Haeundae center cannot
  represent Busan citywide or national search.
- Keep licensing datasets region-neutral and preserve `NO_MATCH` semantics.

## Quantitative comparison (Busan)

“Attractions” groups types 12, 14, 15, and 28. Kakao numbers are a bounded
Haeundae-centered sample, not complete Busan totals.

| Source or stage | Attractions | Food/cafes | Accommodations | Other | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tourism provider raw (`totalCount`) | 31 | 3 | 5 | 614 shopping | 653 |
| Tourism complete pagination | 31 | 3 | 5 | 614 shopping | 653 |
| After coordinate validation | 31 | 3 | 5 | 614 shopping | 653 |
| After current default PetPass filters | 31 | 3 | 5 | 0 | 39 |
| Currently rendered, page 1 | 11 | 0 | 1 | 0 | 12 |
| Kakao candidate supplement | 0 | 117 | 55 | 45 | 217 |
| Tourism/Kakao overlap | 0 | 0 | 1 | 0 | 1 |
| Potential combined candidate pool | 31 | 120 | 59 | 45 | 255 |

Trust-qualified totals:

- Tourism default: 38 allowed/conditional evidence-backed records, 1 unknown.
- Kakao: 0 verified pet-friendly; 55 keyword candidates, 160 generic places, 2
  category-irrelevant results.
- The potential 255 pool is a discovery pool, not 255 pet-friendly places.

## G. Files added or changed

Diagnostic-only additions:

- `scripts/audit-tourism-pagination.ts`
- `scripts/audit-tourism-details.ts`
- `scripts/audit-kakao-candidates.ts`
- `docs/data-coverage-audit-2026-08-06.md`
- `package.json` script entries for the three audits

Ignored evidence artifacts:

- `verification-evidence/coverage-audit-2026-08-06/*.png`

Product/runtime behavior changes: **none**.

## H. Test and audit results

| Command/check | Result |
| --- | --- |
| `npm run diagnose:tour-service2-live` | Pass; 13-call cap, contract/key encoding/detail probes passed |
| `npm run audit:tourism-pagination` | Pass; 74 provider calls, Busan complete |
| `npm run audit:tourism-details` | Pass; 172 provider calls, all 39 default details + 12 shopping sample |
| `npm run audit:kakao-candidates` | Pass; 19 Kakao calls, 217 unique candidates |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run test` | Pass: 12 files, 230 tests |
| `npm run test:e2e` | Pass: 106 passed, 4 credential/production-gated skipped, 0 failed |
| In-app browser | Pass at 1440, 768, and 390; exact cards/markers counted; no console warnings/errors |
| `npm run build` | Pass; production Next.js build completed |

The first sandboxed unit-test attempt could not read the Vitest config; the same
command passed outside that filesystem restriction. The first sandboxed local
dev server could not reach the provider; the browser audit was repeated against
the network-enabled local server and returned the measured live data above.

## I. Deployment status

**No deployment or Vercel promotion was performed.**
