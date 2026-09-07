# 충북·충남 Kakao 카탈로그 v1

기존 PetPass `inucorualcworpzqxjiu`, 기존 키/수집기/공개 흐름 재사용. Git commit/push/merge 및 배포 없음.

| 지역 | run | query 완료 | 호출 | 신규 | 여행 후보 | 병원 | 펫샵 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 충북 | 46 | 341/341 | 458 | 530 | 306 | 115 | 109 |
| 충남 | 47 | 465/465 | 643 | 935 | 586 | 204 | 145 |

- 충북 현재 11개 시·군, 충남 15개 시·군. 관광공사 옛 청원군 코드 009는 보존하되 신규 Kakao 검색에서는 제외한다. 청주·청원 통합 근거: https://www.chungbuk.go.kr/www/contents.do?key=452
- 충북 여행 후보: 카페 203, 식당 56, 숙소 45, 기타 1, 공원·산책 1.
- 충남 여행 후보: 카페 353, 식당 107, 숙소 124, 기타 1, 공원·산책 1.
- 충북 구역별: 괴산 18, 단양 22, 보은 12, 영동 15, 옥천 29, 음성 43, 제천 52, 진천 30, 청주 199, 충주 101, 증평 9.
- 충남 구역별: 서산 81, 당진 85, 논산 46, 공주 64, 금산 27, 보령 64, 부여 25, 서천 15, 아산 119, 예산 38, 천안 185, 청양 11, 태안 116, 홍성 49, 계룡 10.
- 충북 원시 결과 3,052, 분류 통과 1,545, 중복 결과 1,015, 외부구역 제외 1,461, 좌표 제외 35, 분류 제외 11.
- 충남 원시 결과 4,627, 분류 통과 2,743, 중복 결과 1,808, 외부구역 제외 1,855, 좌표 제외 9, 분류 제외 20.
- 429/timeout/provider 오류/재시도 0. 검색 상한 충북 32개·충남 50개 query: 모든 시설의 전수 목록 보장 아님.
- 신규 1,465개 모두 current/public/active/pending 없음, provider ID 중복 0. 기존 갱신·비활성화 0.
- 기존 18,893행 fingerprint `0894d02e2c6e1ed6a19c1f0d048b33e7` 전후 동일. KTO/다른 지역/검수 보존.
- 수집 후 DB 94,555,283 bytes.

## 백업과 안전장치

- 충북 `verification-evidence/kakao-chungbuk-catalog-v1/backup/20260907T144119Z/`: 기존 장소 21/run 2행.
- 충남 `verification-evidence/kakao-chungnam-catalog-v1/backup/20260907T144120Z/`: 기존 장소 28/run 2행.
- 각 normalized NDJSON 건수·SHA-256 manifest 검증 완료. 키 기록 없음.
- Migration `20260907144147_add_chungcheong_kakao_catalog.sql` 적용: 지역 제약 분기/전용 start·commit/collection flag만 추가. service_role만 함수 실행 가능.
- dry-run: 충북 77query/129호출/485후보, 충남 105query/191호출/888후보, DB 쓰기 0.
- 실행: `node --env-file=.env.local --conditions=react-server --import tsx scripts/collect-kakao-capital-v1.ts <chungbuk|chungnam> --apply`.
- 복구는 별도 승인 후 해당 run 신규 후보만 가역적 비공개 처리한다. 하드 삭제나 타 지역 stale 처리는 하지 않는다.
- 지도에는 여행 후보만 결합. 동반 여부 미확인 경고 유지, 실시간 discovery/자동 추천 정책 변경 없음.
- 사용 Skills: project context, map catalog pipeline, Kakao integrations, Supabase, TDD, regression check. 기존 코드를 재사용하고 주소/좌표/지역 단위 안전 경계를 유지했다.

## 최종 검증

- `npm run verify`: PASS (typecheck, lint, 전체 단위 테스트, build).
- `npm run test:e2e -- tests/e2e/full-map-explorer.spec.ts --grep 'shows .* Kakao candidates'`: 기존 서울/제주 desktop/mobile 4개 PASS.
- source/`.next/static` 397파일 exact-value 비밀 키 노출 0. `git diff --check` PASS.
- Browser Verification 환경: 로컬 `http://localhost:3000/results?tab=catalog&region=chungbuk` 및 `region=chungnam`, 실제 DB 읽기.
- API: 두 지역 HTTP 200. 충북 공식 21+후보 306=327마커, 충남 공식 27+후보 586=613마커 일치.
- Desktop/mobile: 1440/768/390/320px 넘침 없음. 카드 선택 aria-current/지도 동기화 PASS.
- Console/network: 두 지역 콘솔 오류 0, 충남 실패 API 0. 별도 오류 수정 없음.
- Screenshots SKIPPED(스타일 변경 없음); 실제 DOM·상호작용으로 확인. Final result PASS, Production 웹 배포는 SKIPPED(현재 범위 밖).
