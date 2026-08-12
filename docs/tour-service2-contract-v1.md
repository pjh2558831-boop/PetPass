# Korea Tourism Organization Service2 contract V1

Status: Stage 1 provider contract, 2026-08-12

This document defines the server-side Korea Tourism Organization (KTO)
contract used by PetPass. The authoritative tourism-place and pet-access source
is `KorPetTourService2`; a provider failure must never fall back to fixtures or
demo data.

## Service boundary

PetPass canonicalizes the allowlisted configuration forms to exactly this base
URL:

```text
https://apis.data.go.kr/B551011/KorPetTourService2
```

The service key is server-only. Request URLs are constructed by
`lib/tour-api/client.ts`, which preserves an already percent-encoded key and
encodes any remaining unsafe characters exactly once. Callers cannot provide a
`serviceKey` parameter. Keys, authorization data, complete keyed URLs, and full
raw responses must not be logged or persisted.

Every implemented operation uses HTTP `GET` and these common parameters:

| Parameter | PetPass value | Notes |
| --- | --- | --- |
| `serviceKey` | Server configuration | Added exactly once by the client |
| `MobileOS` | `ETC` | Fixed server configuration |
| `MobileApp` | `PetPass` | Fixed server configuration |
| `_type` | `json` | Fixed by the client |

## Operation matrix

The parameters below are the parameters PetPass sends, not an attempt to
reproduce every optional filter in the provider manual.

| Operation | PetPass status | Path | PetPass operation parameters |
| --- | --- | --- | --- |
| `areaBasedList2` | Implemented | `/areaBasedList2` | `lDongRegnCd`, optional `lDongSignguCd`, optional `contentTypeId`, `pageNo`, `numOfRows`, `arrange=A` |
| `locationBasedList2` | Intentionally unimplemented | `/locationBasedList2` is not allowlisted | The client rejects the operation before a request is made |
| `searchKeyword2` | Intentionally unimplemented | `/searchKeyword2` is not allowlisted | The client rejects the operation before a request is made |
| `detailCommon2` | Implemented | `/detailCommon2` | `contentId` |
| `detailIntro2` | Implemented | `/detailIntro2` | `contentId`, `contentTypeId` |
| `detailPetTour2` | Implemented | `/detailPetTour2` | `contentId` |
| `petTourSyncList2` | Implemented | `/petTourSyncList2` | `lDongRegnCd`, optional `lDongSignguCd`, optional `contentTypeId`, optional `showflag`, `pageNo`, `numOfRows`, `arrange=A` |

`areaCode` and `sigunguCode` are not sent by this Service2 integration. PetPass
uses the legal-dong parameters `lDongRegnCd` and `lDongSignguCd`. List and sync
operations use `pageNo` and `numOfRows`; detail operations do not. `contentId`
is used only by detail operations, while `contentTypeId` is used by the area
list, intro detail, and sync visibility queries shown above.

Unimplemented operations are not silently rewritten to a different Service2
path. `locationBasedList2` and `searchKeyword2` therefore have no PetPass cache,
parser, or fallback behavior in V1.

## Response parsing and failure behavior

All implemented operations enter through
`lib/tour-api/parser.ts:parseTourResponse`. The parser:

- accepts provider success codes `0`, `00`, and `0000`;
- validates the response envelope and every returned item;
- normalizes a single item and an item array to one item array;
- treats a valid empty item container as an empty result;
- rejects blank, HTML/XML, non-JSON, malformed-envelope, and malformed-item
responses; and
- preserves provider strings for later domain normalization instead of
  manufacturing missing policy values.

Normalized source references retain the provider, operation, retrieval time,
and, where applicable, content ID and provider modification time.

A malformed item fails its provider response; it is not silently dropped.
Provider result failures and HTTP failures are normalized as typed
`TourProviderError` values. Route Handlers then map configuration failures to
503, invalid requests or operations to 400, provider authentication/forbidden
or invalid responses to 502, quota exhaustion to 503, timeouts to 504, and
missing detail records to 404. Error messages are credential-redacted.

Provider fetches use `cache: no-store`, an 8-second default timeout, and at most
one retry for an HTTP 5xx response. Authentication, authorization, quota,
provider-result, parse, timeout, and ordinary network failures are not changed
into successful or demo responses.

Caching occurs above the raw fetch boundary:

| Layer | Duration/directive |
| --- | --- |
| In-process list and sync cache | 5 minutes |
| In-process detail cache | 15 minutes |
| Catalog Route Handler | `s-maxage=300, stale-while-revalidate=60` |
| Detail Route Handler | `s-maxage=900, stale-while-revalidate=120` |

Cache keys include the operation and sorted parameters. There is no persisted
partial-response cache and no fixture fallback in production.

## Current content types

These are the Service2 content types supported by the PetPass provider and
Phase 3 boundaries:

| `contentTypeId` | Normalized category |
| --- | --- |
| `12` | attraction |
| `14` | culture |
| `15` | festival |
| `28` | leisure |
| `32` | accommodation |
| `38` | shopping |
| `39` | food |

A record with one of these IDs must not be rejected merely as an unsupported
record. Support only permits the record to continue to visibility and
pet-detail inspection; it does not establish pet access or automatic-route
eligibility. Legacy content-type IDs, including `75`, are not coerced into
current types. They remain unsupported or not applicable unless a future
authoritative contract explicitly maps them.

Shopping (`38`) is a supported provider type but is excluded from the default
trip categories. It is considered for a trip only when the request explicitly
selects and enables shopping.

## Provider visibility

The official Service2 manual and the live sync response identify the exact
content-display field as `showflag`.

| Provider result | Normalized status | Meaning |
| --- | --- | --- |
| `showflag="1"` | `exposed` | Provider confirms public display |
| `showflag="0"` | `not_exposed` | Provider confirms the record is not for public display |
| Missing or blank `showflag` in a successful response | `unknown` | Visibility cannot be established |
| Any undocumented value | `unknown` | No public meaning is invented |
| Sync request failure or timeout | `provider_unavailable` | Provider state could not be obtained |

`provider_unavailable` is an application result, not a `showflag` value.
Each normalized result records `providerField`, `providerValue`, `checkedAt`,
and deterministic `reasonCodes`.

Visibility joins use bounded, cached `petTourSyncList2` pages and a content-ID
lookup rather than one sync request per detail record. Catalog collection asks
for exposed sync records and retains only exact content-ID and content-type
matches. A detail request independently confirms exposure. The behavior is
fail closed:

- `not_exposed` is omitted from catalogs, map markers, automatic routes,
  popularity aggregation, and user-facing route explanations;
- `unknown` is never interpreted as exposed; and
- `provider_unavailable` prevents user-visible use rather than becoming a
  pet-access denial.

Non-exposed records may appear only in credential-free, redacted diagnostics.

## Pet-detail evidence

`detailPetTour2` exposes nine optional policy fields. PetPass retains their
normalized values and the exact field names consumed by Phase 3:

| Field | Provider subject |
| --- | --- |
| `acmpyTypeCd` | Companion-access type code (`동반유형코드` / `동반구분`) |
| `acmpyPsblCpam` | Allowed companion animals (`동반가능동물`) |
| `acmpyNeedMtr` | Required items or preparations |
| `etcAcmpyInfo` | Other companion information |
| `relaAcdntRiskMtr` | Related accident-risk information |
| `relaPosesFclty` | Related available facilities |
| `relaFrnshPrdlst` | Related furnished items |
| `relaPurcPrdlst` | Related purchasable items |
| `relaRntlPrdlst` | Related rental items |

Every field is optional. Missing optional values are not a provider failure and
must not be replaced by assumptions. Whitespace-only values normalize to empty
while meaningful provider text remains source evidence.

`NormalizedPetEvidence.availability` has these meanings:

| Availability | Meaning |
| --- | --- |
| `usable` | A response item is present and all nine normalized fields are non-empty |
| `partial` | A response item is present and one through eight fields are non-empty |
| `empty` | A response item is present but none of the nine fields contains meaningful text |
| `absent` | The provider response succeeded but contains no pet-detail item |
| `provider_unavailable` | The pet-detail request failed or timed out |

The normalized result separately lists non-empty source fields, present-but-
empty field names, absent field names, and warning codes. A partial record can
still supply meaningful primary evidence; empty, absent, and unavailable
records cannot enter an automatic route. Neither a title nor a Kakao keyword
can create an `allowed` assessment. `detailIntro2` evidence remains separately
identified and cannot conceal an empty or unavailable primary
`detailPetTour2` result.

## Sanitized live evidence

Live counts and per-content observations are deliberately not copied into this
static contract before the bounded audit completes. The generated, sanitized
artifacts under `verification-evidence/tour-service2-contract/` are the
authoritative run evidence. They contain content IDs and field/status metadata,
not keys, keyed URLs, authorization headers, full raw payloads, or unnecessary
provider prose.

Any record that is confirmed `showflag="1"` but has an absent or completely
empty `detailPetTour2` result must be listed separately in the sanitized
provider-support report in that directory. PetPass does not automatically send
that report.

## Unresolved provider cases

The following conditions remain explicit provider cases rather than guessed
application meanings:

- a successful sync item with a missing or undocumented `showflag` remains
  `unknown`;
- an exposed record with absent or completely empty pet detail is a
  provider-support case and is not automatically eligible;
- a useful category with too few live Busan records is reported as provider
  coverage, not filled with shopping or fixtures; and
- provider availability, visibility, pet evidence, and pet-access assessment
  are reported independently.

The bounded live-audit artifact determines whether any such cases exist in a
particular run. This document does not invent a count or resolve one by relaxing
the contract.
