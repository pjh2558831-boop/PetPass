# Kakao 부산 카탈로그 v1

이 문서는 `kakao-busan-query-registry-v1`을 사용하는 로컬 전수 수집기의 운영 계약을 설명한다. 전체 검색어와 16개 구·군 목록은 [Kakao query registry v1](./kakao-query-registry-v1.md)에 단일 원본으로 유지한다.

## 수집 범위와 실행 계획

- 전체 계획은 16개 구·군, 7개 query family, 총 496개 query다.
- `--plan`은 자격 증명이나 네트워크 없이 계획만 출력한다. 현재 전체 계획의 이론상 최대 호출 수는 `496 × 3 = 1,488`회다.
- `--dry-run`은 전체 계획을 먼저 한도 검증한 뒤 각 `district × family`의 첫 query만 실행한다. 전체 필터가 없으면 정확히 112개 표본 query, 최대 336회이며 DB를 쓰지 않는다.
- `--district <code|공식명>`과 `--kind pet_travel_candidate|veterinary|pet_shop`을 모든 모드의 범위 필터로 사용할 수 있다.
- `--resume`은 반드시 기존 run ID를 받는다. 완료 checkpoint는 건너뛴다.

```text
npm run kakao:collect:plan
npm run kakao:collect:dry-run
npm run kakao:collect:apply
npm run kakao:collect:resume -- <run-id>

# 예: 한 구·군 또는 한 종류의 계획만 확인
npm run kakao:collect:plan -- --district 500
npm run kakao:collect:plan -- --kind veterinary
```

`--apply`와 `--resume`은 스키마가 적용된 뒤 운영자가 명시적으로 실행하는 명령이다. 이 저장소 변경 자체는 migration 적용, 원격 수집 또는 배포를 수행하지 않는다.

기존 `npm run ingest:kakao-busan` 명령은 예전 writer를 실행하지 않고 v1 계획 확인으로 안전하게 전환된다. 실제 쓰기는 반드시 `kakao:collect:apply`를 명시해야 한다.

## migration 전 백업

현재 PetPass의 `NEXT_PUBLIC_SUPABASE_URL`과 `SUPABASE_SECRET_KEY`를 승인된 로컬 환경에 직접 설정한 뒤, migration을 적용하기 전에 다음 명령을 실행한다.

```text
npm run kakao:catalog:backup
```

명령은 Supabase origin의 project ref가 `inucorualcworpzqxjiu`와 정확히 일치하는지 먼저 확인한다. `map_places`와 `map_ingest_runs`를 ID 순서로 전부 페이지 조회하고, 각 페이지가 보고한 DB count와 실제 수집 행 수가 일치할 때만 다음 ignored 경로에 결과를 기록한다.

```text
verification-evidence/kakao-busan-catalog-v1/backup/<UTC timestamp>/
  map_places.ndjson
  map_ingest_runs.ndjson
  manifest.json
```

NDJSON은 object key가 재귀적으로 정렬된 UTF-8 형식이다. manifest에는 각 파일명, 행 수, 정확한 파일 bytes의 SHA-256만 기록한다. key, Authorization header 또는 raw HTTP 오류는 파일이나 로그에 넣지 않는다. 백업이 성공하고 manifest count/hash를 확인하기 전에는 `20260812123000_add_provider_visibility.sql` 및 `20260814090000_kakao_busan_catalog_v1.sql`을 적용하지 않는다.

## 요청 및 pagination 계약

- 기존 서버 전용 Kakao Local client만 사용하고 상세 HTML을 스크래핑하지 않는다.
- `size=15`, `page=1`부터 시작해 `is_end=true` 또는 `pageable_count` 범위가 끝날 때까지 최대 3페이지를 읽는다.
- 동시 요청은 2개, 요청 timeout은 8초다.
- 429와 5xx/timeout만 재시도한다. 최초 요청 뒤 재시도는 최대 2회이며 지수 backoff를 사용하고 `Retry-After`가 더 길면 이를 지킨다.
- 물리적 요청 cap은 CLI 실행 1회당 1,500회이며 재시도도 한 번의 물리 요청으로 계산한다. resume은 새로운 1,500회 실행 예산을 받되 run의 누적 호출 수도 별도로 보고한다.
- 마지막 허용 페이지에도 `is_end=false`면 해당 query를 `saturated`로 기록한다. 공개 가능한 범위를 넘어 더 많은 결과를 얻었다고 주장하지 않는다.

## 검증, 분류, 중복 제거

결과는 원본 provider response를 저장하지 않고 다음 순서로 처리한다.

1. 유한하고 부산 경계 안의 좌표인지 확인한다.
2. 도로명/지번 주소의 공식 구·군 token이 query 구·군과 정확히 일치하는지 확인한다. 검색어에 구·군 이름이 있다는 이유만으로 통과시키지 않는다.
3. registry provenance와 Kakao category 문자열을 사용해 결정론적으로 분류한다.
4. query 안에서는 Kakao place ID로 중복 제거하고, DB에서는 `(provider, provider_place_id)` 유일성을 유지한다.
5. query hit에는 page와 페이지 내부 순위 `1..15`만 기록한다.

공급 유형은 `pet_travel_candidate`, `veterinary`, `pet_shop` 세 가지다. 여행 후보만 `cafe`, `food`, `accommodation`, `attraction`, `park_walk`, `leisure`, `camping`, `other` 중 하나의 정규화 category를 가진다. 동물병원과 펫샵은 전용 근거가 있어야 하며 정규화 여행 category는 `null`이다. 일반 병원, 미용 전용점, 장례·보호소·분양 업종은 각 전용 유형으로 추정하지 않는다.

## checkpoint와 reconciliation

- run 생성 시 전체 query 계획을 `map_ingest_run_queries`에 먼저 등록한다.
- 한 query의 모든 공개 페이지 처리가 성공한 다음에만 후보 upsert, query hit, query별 통계를 하나의 `commit_kakao_catalog_query_v1` RPC로 commit한다.
- 0건 query도 page/call 통계와 함께 completed checkpoint를 남긴다.
- checkpoint 통계의 `provider_call_count`는 누적값이 아니라 해당 query의 재시도 포함 호출 수다.
- partial/failed run은 기존 공개 행을 stale 또는 hidden으로 바꾸지 않는다. 새 후보도 completed publication 전까지 pending 상태다.
- 모든 계획 query가 completed인 run만 `finalize_kakao_catalog_run_v1(..., 'completed')`로 publish한다. 전체 496-query run이 완결된 경우에만 미발견 기존 행을 stale로 조정한다.
- 재수집 upsert payload에는 `review_status`, `reviewed_at`, `reviewed_by`, `review_note`, `verification_evidence`가 없으므로 수동 검토 상태가 보존된다. rejected 행은 자동 재공개하지 않고 confirmed 행의 공개 결정도 보존한다.
- 완료·부분 보고서는 DB의 전체 run 집계에서 신규 insert, 갱신 update, stale/deactivated, 기존 검토 상태 보존, saturated query 수를 읽는다. dry-run의 DB 변경 수는 항상 0이고 saturated 수만 실제 표본 응답에서 계산한다.

## 공개 지도와 추천 경계

- Kakao 여행 후보는 `Kakao 검색 후보`, `동반 여부 확인 필요`로 표시하며 동반 가능을 확정하지 않는다.
- 동물병원과 펫샵은 여행 후보와 별도 레이어 및 아이콘으로 노출한다.
- Kakao 후보, 미검토 후보, 동물병원, 펫샵은 자동 여행 추천 엔진 입력에서 제외한다. 추천은 기존의 엄격한 공식 관광 데이터 규칙을 유지한다.
- 공개 API는 정제된 DTO만 반환해야 하며 collection diagnostics, reviewer 정보, evidence 원문, service key, raw payload를 반환하지 않는다.

## 보안 경계

필요한 환경 변수 이름은 다음과 같다.

```text
KAKAO_REST_API_KEY
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SECRET_KEY
```

- Kakao REST key와 Supabase secret key는 서버/로컬 CLI 전용이다. `NEXT_PUBLIC_KAKAO_REST_API_KEY`나 `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`를 만들지 않는다.
- `SUPABASE_SECRET_KEY`에는 현재 PetPass 프로젝트가 이미 사용하는 기존 backend key만 설정한다. 이 작업을 위해 key를 새로 만들거나 재발급·이름 변경·scope 변경하지 않는다. 값은 승인된 secret 전달 경로에서 `.env.local`/프로세스 환경에 직접 설정하고 채팅, 이슈, 로그, 명령 인자, 스크린샷에 복사하지 않는다.
- 수집기는 key 값, Authorization, 전체 요청 URL, 장소명/주소 sample, raw provider payload를 출력하지 않는다. 보고서는 숫자, candidate kind/category/district 집계와 안전한 오류 코드만 포함한다.
- 기존 secret key는 RLS를 우회할 수 있으므로 브라우저 번들·Route Handler 응답에 절대 포함하지 않는다. 수집기는 key를 생성·교체·회전하지 않으며 값 자체를 출력하거나 복사하지 않는다.
- backup 또는 verification evidence에는 key, Authorization, raw payload를 저장하지 않는다. `verification-evidence/kakao-busan-catalog-v1/backup/`은 Git과 Vercel 업로드 대상에서 제외해야 한다.

## 안전한 검증 순서

```text
npm run kakao:collect:plan
npm run typecheck
npm run lint
npm run test
npm run build
```

실제 DB 작업 전에는 대상 Supabase project ref/조직, migration 적용 상태, service-only grants와 RLS, 기존 Kakao 데이터 backup 성공을 별도로 확인한다. `--dry-run`이 성공하고 분류/제외 집계가 검토된 뒤에만 `--apply`를 실행한다.
