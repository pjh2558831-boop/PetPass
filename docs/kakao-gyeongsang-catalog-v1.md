# 경북·경남 Kakao 카탈로그 v1

기존 PetPass `inucorualcworpzqxjiu` 및 현재 키를 사용한다. 새 프로젝트·키 변경·Git push·배포 없음.

## 수집 계약

- 경북 22개 시·군 682 query, 경남 18개 시·군 558 query. 기존 31개 검색 템플릿/ID dedupe/검수 보존/완료 시 공개를 재사용한다.
- 경북 registry에서 군위는 이미 대구로 분리되어 있다. 경남 옛 마산시(006)/진해시(014)는 신규 Kakao 검색에서 제외하고 창원시(016)로 수집한다. 기존 KTO district/evidence는 보존한다.
- 경북/경상북도 및 경남/경상남도 + 정확한 시·군명과 기존 좌표 경계를 함께 검증한다. 인접 부산·대구·울산은 포함하지 않는다.
- 기존 `scripts/collect-kakao-capital-v1.ts <gyeongbuk|gyeongnam> --plan|--dry-run|--apply|--resume <runId>` 사용.
- 검색 최대 45건/query, 실행당 물리 호출 cap 1,500, 재시도 포함. 모든 시설 전수 목록을 보장하지 않는다.

## 백업·schema

- 경북: `verification-evidence/kakao-gyeongbuk-catalog-v1/backup/20260907T144959Z/`, 장소 37행/run 2행.
- 경남: `verification-evidence/kakao-gyeongnam-catalog-v1/backup/20260907T145000Z/`, 장소 23행/run 2행.
- normalized NDJSON 건수/SHA-256 manifest 검증 완료, 비밀 키 저장 없음.
- Migration `20260907145211_add_gyeongsang_kakao_catalog.sql`: 두 지역 제약 분기, 전용 start/commit, collection flag만 추가. 네 함수 모두 service_role 전용, anon/authenticated 호출 불가.
- schema 적용 전후 기존 20,358행 fingerprint `1f6ba385787b1ce9a8a1b2fe00b57551` 동일.
- 복구는 별도 승인 후 해당 run 신규 후보만 가역적 비공개 처리. 하드 삭제/타 지역 reconciliation 금지.
- dry-run: 경북 154query/246호출/1,071후보, 경남 126query/218호출/1,142후보. DB 쓰기·provider 오류·429·timeout·재시도 모두 0.

## 검증 방식

| 지역 | run | 완료 query | 호출 | 신규 | 여행 후보 | 병원 | 펫샵 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 경북 | 48 | 682/682 | 874 | 1,122 | 684 | 259 | 179 |
| 경남 | 49 | 558/558 | 751 | 1,209 | 728 | 276 | 205 |

- 경북 여행 후보: 카페 378, 식당 128, 숙소 175, 기타 2, 공원·산책 1.
- 경남 여행 후보: 카페 417, 식당 122, 숙소 181, 기타 6, 공원·산책 2.
- 경북 raw 5,033/분류 통과 3,202/중복 결과 2,080/외부구역 1,771/좌표 제외 40/분류 제외 20/상한 query 43.
- 경남 raw 5,171/분류 통과 3,467/중복 결과 2,258/외부구역 1,676/좌표 제외 0/분류 제외 28/상한 query 55.
- 두 지역 provider 오류·429·timeout·재시도 0. 기존 갱신·비활성화 0.
- 신규 2,331개 모두 unique ID, current/public/active/pending 없음. 기존 20,358행 fingerprint 수집 후에도 동일.
- 수집 후 DB 100,535,443 bytes. KTO/검수/타지역/키 보존.

- 지역 계획·주소 경계 테스트 RED(3실패) → GREEN. 지도 공급자 테스트 RED(2실패) 확인.
- 사용 Skills: petpass-project-context, map-catalog-pipeline, Kakao integrations, Supabase, TDD, regression-check. 기존 수집과 지도 흐름을 재사용한다.

## 최종 검증

- `npm run verify`: PASS(typecheck/lint/전체 unit/build).
- `npm run test:e2e -- tests/e2e/full-map-explorer.spec.ts --grep 'shows .* Kakao candidates'`: 기존 서울/제주 desktop/mobile 4개 PASS.
- source/`.next/static` 397파일 exact-value secret 노출 0; `git diff --check` PASS.
- Browser Verification: 로컬 `http://localhost:3000/results?tab=catalog&region=gyeongbuk` 및 `region=gyeongnam`, 실제 Production DB 읽기.
- API: 경북 공식 37+후보 684=721, 경남 공식 23+후보 728=751, HTTP 200, 마커 수 일치.
- Desktop/mobile: 두 지역 카드·지도 선택 동기화, 1440/768/390/320px 가로 넘침 없음.
- Console/network: 첫 경북 snapshot 503 한 번으로 초기 카드 선택 실패. 재진입 후 721마커/선택 정상, 콘솔 오류 0/실패 API 0. 경남도 751마커/선택 정상, 콘솔 오류 0/실패 API 0. 최초 503의 구체 원인은 미확정이며 무오류로 보고하지 않는다.
- Screenshots SKIPPED(스타일 변경 없음), DOM/실제 상호작용 검증. 추가 오류 우회 코드 없음.
- DB 적용/로컬 지도 연결 완료. Git commit/push/merge 및 Vercel 배포 SKIPPED(현재 범위 밖). 공개 사이트 반영에는 별도 배포 필요.
