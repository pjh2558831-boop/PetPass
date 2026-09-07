# 경기·인천 Kakao 카탈로그 v1

기존 PetPass `inucorualcworpzqxjiu`와 현재 키를 사용한다. 새 프로젝트·키 변경·자동 추천 정책 변경·Git push·배포는 범위 밖이다.

## 수집 결과

| 지역 | 실행 | 검색 완료 | 물리 호출 | 신규 장소 | 여행 후보 | 병원 | 펫샵 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 경기 | 43 | 961/961 | 1,643 | 4,322 | 2,415 | 902 | 1,005 |
| 인천 | 44 | 341/341 | 573 | 1,227 | 672 | 248 | 307 |

- 경기 31개 시·군, 인천 개편 후 11개 구·군. 기존 지역 코드·공식 이름 재사용.
- 경기 여행 후보: 카페 1,470, 식당 640, 숙소 281, 관광지 6, 공원·산책 8, 레저 2, 기타 8.
- 인천 여행 후보: 카페 413, 식당 162, 숙소 95, 공원·산책 1, 기타 1.
- 경기 1,500호출 cap에서 868개 완료 후 partial, 동일 run의 93개만 143호출로 재개. 완료 전 pending 공개 차단 유지.
- provider 오류·429·timeout·재시도 0. 경기 외부 구역 4,230건/분류 제외 34건, 인천 외부 구역 1,626건/분류 제외 12건. 좌표 제외 0.
- 검색 상한 도달: 경기 294개, 인천 91개. query당 최대 45건이므로 전수 수집 보장 아님. 관광지·공원의 일반 목록이 아니라 반려동물 검색 후보임.
- 신규 5,549개 모두 current/public, ID 중복 0. 기존 갱신·비활성화 0.
- 기존 12,159행 fingerprint `1487b397b3349a87280f9578fc8f04ab` 전후 동일. 타 지역·KTO·기존 검수 보존.

## 백업과 DB

- 경기: `verification-evidence/kakao-gyeonggi-catalog-v1/backup/20260907T135510Z/`, 장소 2,565행/run 3행.
- 인천: `verification-evidence/kakao-incheon-catalog-v1/backup/20260907T135513Z/`, 장소 515행/run 2행.
- 건수/SHA-256 검증 완료. 키는 백업하지 않음.
- Migration `20260907135618_add_capital_region_kakao_catalog.sql`: 두 지역의 shape 제약 분기와 전용 start/commit 함수 추가. 기존 지역 함수 보존, service_role 전용 권한 확인.
- 복구 시 수집 중단 후 해당 run 신규 Kakao 행만 가역적 비공개 처리하는 보상 작업을 별도 승인받는다. 하드 삭제 금지.

## 실행

`node --env-file=.env.local --conditions=react-server --import tsx scripts/collect-kakao-capital-v1.ts <gyeonggi|incheon> <--plan|--dry-run|--apply|--resume runId>`

지도는 여행 후보만 기존 공식 여행 장소와 결합한다. 실시간 discovery와 자동 추천 설정은 변경하지 않는다.

## 최종 검증

- `npm run verify`: PASS (typecheck, lint, 155개 파일/1,467개 단위 테스트, production build).
- `npm run test:e2e -- tests/e2e/full-map-explorer.spec.ts --grep 'shows .* Kakao candidates'`: PASS, 기존 서울/제주 desktop/mobile 4개 회귀 테스트.
- Browser Verification: 로컬 `http://localhost:3000/results?tab=catalog&region=gyeonggi` 및 `region=incheon`. 실제 Production DB 읽기 결과 경기 2,533핀(공식 118 + Kakao 여행 후보 2,415), 인천 717핀(공식 45 + 후보 672). 공개 snapshot API 두 지역 HTTP 200.
- Desktop 1440×900, mobile 390×844: 각 12카드, 가로 넘침 없음. 카드 선택/지도 연동 확인. 인천 콘솔 오류 0. 별도 스크린샷 저장 SKIPPED(구조·상호작용 확인으로 충분).
- source 및 `.next/static` 397파일 exact-value 비밀 키 검사: 노출 0. `git diff --check`: PASS.
- 사용 Skills: petpass-project-context, map-catalog-pipeline, kakao-integrations, Supabase, test-driven-development, regression-check. 기존 수집/atomic publication 및 지도 경로를 재사용.
- DB 적용 완료, 로컬 지도 연결 완료. commit/push/merge/Vercel 배포는 수행하지 않음. 공개 사이트의 새 프런트엔드 설정 반영은 별도 배포가 필요함.
