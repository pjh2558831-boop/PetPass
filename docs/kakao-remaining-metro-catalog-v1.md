# 미수집 광역시·세종 Kakao 카탈로그 v1

- 대상: 대전 5구/155 query, 대구 9구·군/279, 광주 5구/155, 울산 5구·군/155, 세종 1구역/31. 총 775 query.
- 기존 PetPass `inucorualcworpzqxjiu`와 현재 키를 재사용. Git commit/push/merge·Vercel 배포 없음.
- 기존 수집기 `scripts/collect-kakao-capital-v1.ts`의 지역 allowlist만 확장. 31개 템플릿, ID dedupe, 검수 보존, 완료 시 지역 단위 공개를 재사용한다.
- 세종은 구·군 없는 주소와 `세종 {검색어}`를 지원한다. 대구 군위군을 포함하도록 북쪽 좌표 경계를 36.5로 확장한다. 광주는 기존 광주/광주광역시 및 전남광주통합특별시 주소 중 정확한 5구만 허용한다.
- API query당 최대 45건, 실행당 물리 호출 cap 1,500(재시도 포함). 모든 시설을 빠짐없이 조회하는 전수 목록은 아니다. 동반 가능 확정이 아닌 검색 후보다.

## 백업·적용 게이트

- 백업: `verification-evidence/kakao-{region}-catalog-v1/backup/20260907T152528Z/` (대전만 `20260907T152527Z`). normalized NDJSON 건수/SHA-256 검증 완료, 키 저장 없음.
- 장소/run 백업 행 수: 대전 8/3, 대구 8/2, 광주 1/2, 울산 29/2, 세종 2/2.
- 최초 백업 읽기 실패 후 재실행 성공. 쓰기 전에 모든 지역 백업을 완료했다.
- Migration `20260907152705_add_remaining_metro_kakao_catalog.sql`: 기존 전북 함수 계약을 해당 지역별로 복제하고 주소/좌표/계획만 변경. 기존 shape constraint 분기는 보존하고 새 분기만 추가한다.
- 10개 start/commit 함수 모두 anon/authenticated 호출 불가, service_role만 허용 확인.
- migration 적용 전후 기존 24,197행 fingerprint `c8414bbc5d5b2583a2eeae748e8118e2` 동일.
- dry-run 후보: 대전 470, 대구 781, 광주 462, 울산 352, 세종 106. DB 쓰기·provider 오류·429·timeout·재시도 모두 0.
- 회복은 별도 승인 후 해당 신규 run 후보만 가역적 비공개 처리. 기존 데이터 삭제/타 지역 reconciliation 금지.
- Skills: petpass-project-context, map-catalog-pipeline, kakao-integrations, Supabase, TDD. 주소/계획 RED→GREEN 확인.

## 완료 수량

| 지역 | run | 완료 query | 호출 | 여행 후보 | 병원 | 펫샵 | 신규 공개 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 대전 | 52 | 155 | 253 | 241 | 112 | 128 | 481 |
| 대구 | 53 | 279 | 444 | 421 | 191 | 191 | 803 |
| 광주 | 54 | 155 | 269 | 258 | 111 | 106 | 475 |
| 울산 | 55 | 155 | 225 | 218 | 67 | 79 | 364 |
| 세종 | 56 | 31 | 45 | 63 | 28 | 21 | 112 |

- 775 query 모두 완료, 1,236호출. 신규 2,235개 모두 unique Kakao ID, active/current/public/pending 없음. 기존 갱신·비활성화 0.
- 수집 후 기존 24,197행 fingerprint 동일: KTO·타지역·검수·동반조건 보존. DB 114,281,619 bytes.
- 대전 raw 2,417/중복 998/외부구역 934/좌표 제외 0/분류 제외 4.
- 대구 raw 3,947/중복 1,653/외부구역 1,473/좌표 제외 0/분류 제외 18. 군위군 17개 포함.
- 광주 raw 2,696/중복 1,018/외부구역 1,170/좌표 제외 33/분류 제외 0.
- 울산 raw 1,859/중복 803/외부구역 685/좌표 제외 0/분류 제외 7.
- 세종 raw 339/중복 215/외부구역 0/좌표 제외 0/분류 제외 12.
- 모든 run provider 오류·429·timeout·재시도 0.

## 최종 검증 / Browser Verification

- 변경: 기존 registry/CLI/backup/repository 지역 allowlist, 주소 검증, 지역 지도 설정, DB RPC 타입, forward migration, 해당 테스트. UI 컴포넌트·추천 엔진 변경 없음.
- `npm run verify`: PASS(typecheck/lint/160 unit 파일·1,508 tests/build).
- 기존 강원 테스트의 대전 Tourism-only 가정은 신규 요구사항에 맞춰 갱신했다. 테스트 비활성화 없음.
- `npm run test:e2e -- tests/e2e/full-map-explorer.spec.ts --grep 'shows .* Kakao candidates'`: 기존 서울/제주 desktop/mobile 4개 PASS.
- source/`.next/static` 397파일 exact-value secret 노출 0. `git diff --check` PASS.
- Skills 추가: petpass-ui-review, regression-check, debugging-and-error-recovery.
- Environment/URL: 로컬 `http://localhost:3000/results?tab=catalog&region={daejeon|daegu|gwangju|ulsan|sejong}&page=1`, 실제 DB 읽기.
- Flows: 5개 지역 모두 마커/카드 로드, 카드의 지도 보기 선택 및 aria-current 확인.
- Desktop/mobile: 1440/768/390/320px 가로 넘침 없음.
- Console/network: 최종 세종 콘솔 오류 0, 경고 1; 5개 지역 실패 API 0.
- 최초 브라우저 검사에서 모바일 선택 후 접힌 목록의 visibility를 기다려 timeout. 기존 모바일 동작에 맞춰 DOM 선택 상태 검사로 바꾸고 5개 지역 재검증 PASS. 앱 우회 변경 없음.
- Screenshots SKIPPED(스타일 변경 없음); DOM·상호작용 확인. 확인된 앱 회귀 없음.
- Final result: DB 및 로컬 지도 PASS. 앱에 등록된 17개 지역 모두 Kakao 수집 데이터 존재. Git commit/push/merge·Vercel 배포 SKIPPED. 공개 사이트 반영에는 별도 배포 필요.
