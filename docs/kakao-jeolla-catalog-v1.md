# 전북·전남 Kakao 카탈로그 v1

기존 PetPass `inucorualcworpzqxjiu`와 현재 키를 재사용한다. Git commit/push/merge 및 Vercel 배포는 수행하지 않는다.

- 전북 14개 시·군 434 query, 전남 22개 시·군 682 query. 기존 31개 템플릿, ID dedupe, 검수 보존, 지역 단위 완료 후 공개를 재사용한다.
- 기존 `scripts/collect-kakao-capital-v1.ts <jeonbuk|jeonnam> --plan|--dry-run|--apply|--resume <runId>` 사용. 실행당 물리 호출 1,500회 제한(재시도 포함), query당 최대 45건이므로 모든 시설의 전수 목록을 보장하지 않는다.
- 전북의 어청도, 전남의 흑산도·가거도 좌표를 포함하도록 기존 bounds 서쪽 경계를 확장한다. 정확한 주소 시·군 검증도 함께 적용한다.
- Kakao가 전남 주소를 `전남광주통합특별시`로 반환하여 최초 전남 dry-run은 후보 0건으로 차단했다. 새 접두어를 허용한 뒤 재실행했다. 전남의 기존 22개 시·군 whitelist를 유지하므로 광주 5개 구는 포함하지 않는다. KTO 내부 코드·원문은 변경하지 않는다.
- 현재 명칭 확인: https://law.jeonnam.go.kr/ 및 https://law.go.kr/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1001145779

## 백업과 schema

- 전북: `verification-evidence/kakao-jeonbuk-catalog-v1/backup/20260907T150406Z/`, 장소 31행/run 2행.
- 전남: `verification-evidence/kakao-jeonnam-catalog-v1/backup/20260907T150406Z/`, 장소 35행/run 2행.
- normalized NDJSON 건수/SHA-256 manifest 검증 완료. 키 저장 없음.
- 적용 migration: `20260907150527_add_jeolla_kakao_catalog.sql`, `20260907150916_accept_current_jeonnam_kakao_address.sql`.
- 지역별 start/commit 네 함수는 service_role 전용. 기존 publication finalize 재사용, 하드 삭제 없음.
- 두 migration 적용 후 기존 22,689행 fingerprint `ba37e62640f18e1943b45826572a40e5` 동일.
- dry-run: 전북 98 query/157호출/642후보, 전남 재실행 154 query/242호출/806후보. DB 쓰기·provider 오류·429·timeout·재시도 0.
- 복구는 별도 승인 후 해당 run 신규 후보를 가역적 비공개 처리한다. 타 지역 reconciliation 금지.

## 검증

- Skills: petpass-project-context, map-catalog-pipeline, kakao-integrations, Supabase, TDD, debugging-and-error-recovery, petpass-ui-review, regression-check.
- 주소·좌표 및 query 계획 테스트 RED → GREEN. 지도 공급자는 수집 완료 후 활성화했고 해당 테스트도 통과했다.

## 실제 수집 결과

| 지역 | run | 완료 query | 호출 | 신규 공개 | 여행 후보 | 병원 | 펫샵 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 전북 | 50 | 434/434 | 557 | 666 | 367 | 181 | 118 |
| 전남 | 51 | 682/682 | 868 | 842 | 589 | 152 | 101 |

- 전북 여행 후보: 카페 262, 식당 50, 숙소 53, 관광지 1, 기타 1.
- 전남 여행 후보: 카페 374, 식당 83, 숙소 130, 공원·산책 1, 기타 1.
- 전북 raw 3,343/분류 통과 1,960/중복 결과 1,294/외부 구역 1,345/좌표 제외 11/분류 제외 27/상한 query 34.
- 전남 raw 4,889/분류 통과 2,541/중복 결과 1,699/외부 구역 2,319/좌표 제외 0/분류 제외 29/상한 query 48.
- 두 지역 provider 오류·429·timeout·재시도 0. 기존 갱신·비활성화 0.
- 신규 1,508개 모두 unique ID, active/current/public이며 pending 없음. 기존 22,689행 fingerprint 수집 후에도 동일하여 KTO·타지역·기존 검수 값 보존을 확인했다.
- 수집 후 DB 106,867,859 bytes.

## 최종 검증 / Browser Verification

- `npm run verify`: PASS(typecheck/lint/159 unit 파일·1,492 tests/build).
- `npm run test:e2e -- tests/e2e/full-map-explorer.spec.ts --grep 'shows .* Kakao candidates'`: 서울/제주 desktop/mobile 4개 PASS.
- source/`.next/static` 397파일 exact-value secret 노출 0.
- Environment/URL: 로컬 `http://localhost:3000/results?tab=catalog&region=jeonbuk&page=1`, `region=jeonnam&page=1`. 실제 Production DB 읽기만 사용.
- Flows: 전북 기본 지도 398마커/12카드, 전남 623마커/12카드 렌더링. 두 지역 카드의 지도 보기 선택 동작 완료, 전남 선택 aria-current 1개 확인.
- Desktop/mobile: 1440/768/390/320px 가로 넘침 없음.
- Console: 두 지역 오류 0(각 경고 1). Network: 실패 API 0.
- Screenshots SKIPPED(스타일 변경 없음). DOM·상호작용 기반 확인.
- Regressions: 확인된 회귀 없음. 추가 UI 우회 수정 없음.
- Final result: DB 적용·로컬 지도 연결 PASS. Git commit/push/merge·Vercel 배포 SKIPPED(범위 밖). 공개 사이트 지도 연결 반영에는 별도 배포가 필요하다.
