# 강원 Kakao 카탈로그 v1

기존 PetPass `inucorualcworpzqxjiu`, 현재 키 유지. 기존 경기·인천 수집 CLI/registry 생성기를 재사용한다. 새 프로젝트·키 변경·Git push·배포 없음.

## 수집 결과

- Run 45: 18개 시·군 × 31개 = 558 query 모두 완료, 물리 호출 732회.
- 신규 1,185곳 = 여행 후보 918, 동물병원 134, 펫샵 133.
- 여행 후보: 카페 406, 식당 186, 숙소 322, 관광지 2, 캠핑 1, 기타 1.
- 강릉 185, 고성 68, 동해 39, 삼척 33, 속초 106, 양구 10, 양양 109, 영월 26, 원주 143, 인제 28, 정선 21, 철원 19, 춘천 158, 태백 12, 평창 64, 홍천 104, 화천 14, 횡성 46.
- 원시 결과 4,775, 분류 통과 3,449, 중복 결과 2,264. 타 구역 제외 1,298, 분류 제외 28(병원 2/펫샵 26), 좌표 오류 0.
- 429·timeout·provider error·재시도 0. 검색 상한 도달 49개: API 검색 후보이며 모든 시설의 전수 목록을 보장하지 않는다.
- 1,185개 provider ID 모두 유일하고 current/public/active/pending 없음. 기존 갱신·비활성화 0.
- 기존 17,708행 fingerprint `ffc283d41fe408668beedda698aea338` 수집 전후 동일. KTO·타지역·검수·조건 정보 보존.
- DB 크기: 수집 후 88,943,763 bytes.

## 안전장치와 실행

- 강원/강원도/강원특별자치도 + 정확한 시·군 주소와 기존 좌표 경계 검증. 경남 고성군 혼입 회귀 테스트 포함.
- 기존 area_code 기반 내부 district code 001–018 재사용; 법정동 코드로 새로 rename하지 않음.
- Backup: `verification-evidence/kakao-gangwon-catalog-v1/backup/20260907T142457Z/`.
- 기존 장소 135행 SHA-256 `9b0fe943929dc8c22b7be648c1899091164f843d288f5691dc2ece71ecb91098`, run 2행 `7ddbbf5d6d69497217d1edc06dbcd1dab12eae52f3e69c3590e6ceacc31ffd35`; 건수·해시 검증 완료.
- Migration `20260907142623_add_gangwon_kakao_catalog.sql` 적용: 강원 제약 분기, 전용 start/commit 함수와 collection flag만 추가. anon/authenticated 실행 권한 없음, service_role 전용.
- Dry run 126/126 query, 208호출, 후보 1,122개, DB 쓰기 0.
- 실행: `node --env-file=.env.local --conditions=react-server --import tsx scripts/collect-kakao-capital-v1.ts gangwon --apply`.
- 복구는 별도 승인 후 run 45 신규 행만 가역적 비공개 처리. 하드 삭제·기존 지역 reconciliation 금지.
- 지도에는 여행 후보를 결합하며, 실시간 discovery·추천 정책은 변경하지 않는다. 조건 확인 전 반려동물 동반 가능으로 승격하지 않는다.

## 검증

- 신규 주소 테스트 RED(3실패) → GREEN, 지도 공급자 테스트 RED(1실패) 후 설정 연결.
- 사용 Skills: petpass-project-context, map-catalog-pipeline, kakao-integrations, Supabase, test-driven-development, petpass-ui-review, regression-check. 기존 검증/수집/publication/지도 경로 재사용.
- `npm run verify`: PASS (typecheck, lint, 156파일/1,472개 단위 테스트, build).
- `npm run test:e2e -- tests/e2e/full-map-explorer.spec.ts --grep 'shows .* Kakao candidates'`: 기존 서울/제주 desktop/mobile 4개 PASS.
- 소스/`.next/static` 397파일 비밀 키 exact-value 노출 0; `git diff --check` PASS.

### Browser Verification

- Environment/URL: 로컬 개발 서버 `http://localhost:3000/results?tab=catalog&region=gangwon&page=1`, 실제 DB 읽기.
- Flows: snapshot HTTP 200, 공식 131 + 카카오 918 = 1,049마커, 카드 12개. 카드 선택 aria-current와 지도 연동 PASS.
- Desktop/mobile: 1440/768/390/320px 가로 넘침 없음.
- Console/network: 최초 snapshot 503 한 번. 기존 오류 화면과 다시 시도 버튼으로 복구. 구체적인 일시 오류 원인은 로그에서 확정하지 못함; 오류를 무시하거나 코드를 우회 수정하지 않음.
- Screenshots: SKIPPED(스타일 변경 없음); DOM/실제 상호작용 확인.
- Fixes: 별도 오류 우회 코드 없음. debugging-and-error-recovery 스킬에 따라 재현/복구 확인.
- Final result: 다시 시도 및 새로고침 후 1,049마커/12카드 유지, 콘솔 오류 0, 실패 API 0. 최초 503은 재현되지 않아 원인 미확정 참고사항으로 남김.
- Git commit/push/merge 및 Vercel 배포 없음. Production DB 적용은 완료됐으나 공개 사이트의 지도 설정 반영에는 별도 배포 필요.
