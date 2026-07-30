# Decision log

## 2026-07-30 — Account-free local persistence

Use versioned, Zod-validated localStorage for the latest profile, preferences,
and draft itinerary. This meets the required account-free phase and leaves a
clean future repository boundary for authenticated storage.

## 2026-07-30 — Explicit demo fixture

Use one local Busan fixture for the first supported scenario. Every affected
screen and record is visibly labeled as demo data. Live provider errors do not
activate it.

## 2026-07-30 — Conservative policy evaluation

Rules may only transform facts present in the original text. Ambiguous or missing
facts produce `NEEDS_CONFIRMATION`; explicit conflicts produce `NOT_MATCHED`.
No runtime AI dependency is introduced.

## 2026-07-30 — License integration deferred at the endpoint

The local administrative dataset has not been selected. Keep a provider
interface, conservative matcher, domain model, and Route Handler, but return a
configuration error rather than inventing a production response.

## 2026-07-30 — Kakao map visualization boundary

The current UI uses a clearly labeled non-geographic demo canvas. Kakao Maps owns
future rendering, Kakao Local owns address search, and Kakao Mobility owns road
directions.
