# Kakao 부산 검색어 레지스트리 v1

## 목적과 경계

`kakao-busan-query-registry-v1`은 Kakao Local 키워드 검색으로 부산의 장소 후보를 수집하기 위한 고정 입력 집합이다. 이 레지스트리는 검색 후보를 만들 뿐이며, 반려동물 동반 가능 여부나 영업시간을 증명하지 않는다. 수집 결과는 자동 여행 추천 엔진의 입력으로 사용하지 않는다.

구·군 원본은 `BUSAN_REGION_CONFIG` 하나만 재사용한다. 등록 대상은 강서구, 금정구, 기장군, 남구, 동구, 동래구, 부산진구, 북구, 사상구, 사하구, 서구, 수영구, 연제구, 영도구, 중구, 해운대구의 16개 구·군이다.

## 버전과 안정적인 키

- 레지스트리 버전: `kakao-busan-query-registry-v1`
- query key: `kakao-busan-v1:{districtCode}:{family}:{templateIndex}`
- `templateIndex`는 각 family 안에서 0부터 시작하며, 템플릿의 순서를 바꾸지 않는다.
- 검색문은 `부산 {구·군 표시명} {suffix}` 형식으로 생성한다.

버전과 query key는 collection run 및 query hit의 provenance 식별자다. API 키, Authorization 헤더, 전체 요청 URL 또는 원본 provider payload는 provenance로 저장하지 않는다.

## 검색어 템플릿

구·군별 31개, 총 496개 query를 생성한다.

| Family | 후보 유형 | 카테고리 힌트 | 보조 그룹 | suffix |
| --- | --- | --- | --- | --- |
| `general` | `pet_travel_candidate` | `other` | 없음 | `애견동반` |
| `general` | `pet_travel_candidate` | `other` | 없음 | `반려견 동반` |
| `general` | `pet_travel_candidate` | `other` | 없음 | `반려동물 동반` |
| `general` | `pet_travel_candidate` | `other` | 없음 | `강아지 동반` |
| `general` | `pet_travel_candidate` | `other` | 없음 | `펫프렌들리` |
| `cafe` | `pet_travel_candidate` | `cafe` | `CE7` | `애견동반 카페` |
| `cafe` | `pet_travel_candidate` | `cafe` | `CE7` | `반려동물 동반 카페` |
| `cafe` | `pet_travel_candidate` | `cafe` | `CE7` | `애견카페` |
| `food` | `pet_travel_candidate` | `food` | `FD6` | `애견동반 식당` |
| `food` | `pet_travel_candidate` | `food` | `FD6` | `반려동물 동반 식당` |
| `food` | `pet_travel_candidate` | `food` | `FD6` | `애견동반 음식점` |
| `accommodation` | `pet_travel_candidate` | `accommodation` | `AD5` | `애견동반 숙소` |
| `accommodation` | `pet_travel_candidate` | `accommodation` | `AD5` | `반려동물 동반 숙소` |
| `accommodation` | `pet_travel_candidate` | `accommodation` | `AD5` | `애견펜션` |
| `accommodation` | `pet_travel_candidate` | `accommodation` | `AD5` | `애견동반 호텔` |
| `accommodation` | `pet_travel_candidate` | `camping` | 없음 | `애견동반 캠핑장` |
| `outdoor_leisure` | `pet_travel_candidate` | `attraction` | `AT4` | `애견동반 관광지` |
| `outdoor_leisure` | `pet_travel_candidate` | `park_walk` | 없음 | `반려견 동반 공원` |
| `outdoor_leisure` | `pet_travel_candidate` | `park_walk` | 없음 | `애견동반 공원` |
| `outdoor_leisure` | `pet_travel_candidate` | `park_walk` | 없음 | `애견동반 해수욕장` |
| `outdoor_leisure` | `pet_travel_candidate` | `park_walk` | 없음 | `반려견 산책` |
| `outdoor_leisure` | `pet_travel_candidate` | `leisure` | 없음 | `애견동반 레저` |
| `veterinary` | `veterinary` | 해당 없음 | 없음 | `동물병원` |
| `veterinary` | `veterinary` | 해당 없음 | 없음 | `24시 동물병원` |
| `veterinary` | `veterinary` | 해당 없음 | 없음 | `동물의료센터` |
| `veterinary` | `veterinary` | 해당 없음 | 없음 | `응급 동물병원` |
| `pet_shop` | `pet_shop` | 해당 없음 | 없음 | `펫샵` |
| `pet_shop` | `pet_shop` | 해당 없음 | 없음 | `애견용품` |
| `pet_shop` | `pet_shop` | 해당 없음 | 없음 | `반려동물용품` |
| `pet_shop` | `pet_shop` | 해당 없음 | 없음 | `펫용품` |
| `pet_shop` | `pet_shop` | 해당 없음 | 없음 | `애완동물용품` |

여행 후보는 22개, 동물병원은 4개, 펫샵은 5개 템플릿이다. 부산 16개 구·군에 적용하면 각각 352개, 64개, 80개 query가 된다.

## 페이지네이션 한계

- `size=15`, `page=1`부터 시작한다.
- Kakao가 노출하는 `pageable_count` 최대 45건을 기준으로 query당 데이터 페이지는 최대 3개다.
- 각 응답의 `is_end=true`이거나 누적 결과가 `pageable_count`에 도달하면 더 요청하지 않는다.
- 따라서 재시도 전 이론상 최대 provider call 수는 `496 × 3 = 1,488`이며 물리적 상한 1,500 이하다.
- Kakao가 공개하지 않는 결과나 45건을 넘는 결과를 수집했다고 주장하지 않는다.

기존 서버 전용 Kakao Local 클라이언트만 사용한다. 장소 상세 HTML 크롤링과 상세 태그 추출은 하지 않는다.

## 결과 수용 게이트

`validateKakaoBusanCollectionResult`가 분류보다 먼저 다음을 결정적으로 검사한다.

1. `roadAddressName`, `addressName` 중 실제 제공된 주소를 NFKC 및 공백 정규화한다.
2. 주소에서 부산 16개 구·군 토큰을 경계 단위로 판독한다. 예를 들어 `강서구`를 `서구`로 오인하지 않는다.
3. 판독 구·군이 query의 `districtCode`와 정확히 일치해야 한다. 두 주소가 서로 다른 구·군을 가리키면 거부한다.
4. 경도와 위도는 유한한 숫자여야 하고, 전 세계 좌표 범위와 부산 안전 사각형을 모두 통과해야 한다.

검색문에 구·군명이 있다는 사실은 지역 근거가 아니다. 누락 주소, 미등록 구·군, 외부 지역, 구·군 불일치, 상충 주소, 잘못된 좌표는 각각 명시적인 reason code로 거부한다.

## 결정적 분류

`classifyKakaoCollectionCandidate`는 Kakao 결과의 카테고리 문자열과 registry 항목만 사용한다.

- 모든 여행 query는 Kakao `categoryGroupCode`를 먼저 적용하고, 인식 가능한 그룹이 없으면 `categoryName` 문자열을 정규화하며, 두 근거가 모두 없을 때만 query registry의 category hint를 사용한다. 이 순서는 일반·카페·음식점·숙박·관광·야외·레저 family에 동일하다.
- 여행 category 문자열은 카페, 음식점, 숙박, 관광, 공원·산책, 레저, 캠핑 근거를 순서가 고정된 규칙으로 정규화하고, provider 근거와 query hint가 모두 없으면 `other`로 둔다.
- 동물병원은 이름 또는 카테고리에 `동물`/`반려동물`과 병원·의료센터·클리닉·진료소가 함께 있는 경우에만 분류한다. `HP8`만으로는 분류하지 않는다.
- 펫샵은 펫샵 또는 반려동물용품 소매 근거가 있어야 한다. 미용 근거만 있는 장소는 제외하지만, 용품 소매 근거와 미용 근거가 함께 있으면 펫샵 후보로 유지할 수 있다.
- 장례·장묘·화장·추모, 보호소·유기동물, 분양, 브리더·번식은 그 자체로 제외 근거다. 판매·유통·도매는 동물·애견·애묘·반려·애완·펫 또는 관련 용품 업종 문맥과 결합한 경우에만 동물병원과 펫샵 양쪽의 자동 분류에서 제외한다. 따라서 `유통단지 애견동반 카페`처럼 지명에만 `유통`이 있거나, `애견용품 판매`처럼 용품 소매 근거와 미용 근거가 함께 있는 장소를 단순 토큰 하나로 제외하지 않는다.
- 근거 우선순위는 동물 의료, 펫 소매, 여행 후보 순이다. 동물 의료 근거가 있는 결과를 펫샵이나 여행 후보로, 펫 소매 근거가 있는 결과를 여행 후보로 낮춰 분류하지 않는다.

장소명에 `24시`가 있어도 24시간 운영이라고 판정하거나 저장하지 않는다. 카카오 여행 후보는 언제나 검수 전 후보이며 `동반 가능`으로 확정하지 않는다.

## 중복 제거와 검수 상태

`deduplicateKakaoSearchResults`와 `deduplicateKakaoCandidateRecords`는 trim한 Kakao place ID를 유일 키로 사용하며 먼저 나온 결과를 보존한다.

신규 후보 상태는 다음과 같다.

```text
review_status = unreviewed
public_visibility = true
lifecycle_status = current
```

업데이트 시 `review_status`, `reviewed_at`, `reviewed_by`, `review_note`, `verification_evidence`는 provider 데이터로 덮어쓰지 않는다. 재발견된 `unreviewed`/`needs_review` 후보는 current/public으로 복원하고, `rejected`는 계속 숨기며, `confirmed`는 기존 공개 상태를 보존한다.

stale 조정은 전체 run이 `completed`일 때만 수행한다.

- 미발견 `unreviewed`/`needs_review`: stale/hidden
- 미발견 `confirmed`: stale/public이며 재확인 필요
- 미발견 `rejected`: stale/hidden
- `partial` 또는 `failed`: 기존 lifecycle/visibility를 변경하지 않음

하드 삭제는 이 도메인의 동작이 아니다.

## 공개 및 추천 경계

이 레지스트리와 분류 결과는 저장 전 순수 도메인 입력이다. 브라우저에 API 키, service-role 정보, reviewer 정보, 검수 evidence, raw provider payload 또는 collection diagnostics를 노출하지 않는다. 공개 지도에서는 서버가 허용 목록 DTO로 변환한 current/public 행만 반환해야 한다.

`pet_travel_candidate`, `veterinary`, `pet_shop`은 모두 기존 Tourism-only 자동 추천 적격성 경계 밖에 둔다. 카카오 여행 후보의 공개 라벨은 검수 상태에 맞춰 반드시 `동반 여부 확인 필요` 의미를 유지한다.
