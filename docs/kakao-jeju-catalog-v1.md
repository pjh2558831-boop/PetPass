# 제주 Kakao 수집 v1

- 프로젝트: 기존 PetPass `inucorualcworpzqxjiu`. 현재 키 유지.
- 제주시(110), 서귀포시(130): 각 31개, 총 62개 query. 첫 시도 최대 186회, 물리 호출 cap 1,500회.
- 기존 V1 분류·ID 중복 제거·검수 보존·완료 시 공개 로직 재사용. 제주 주소와 좌표를 함께 검증.
- 제주 후보는 동반 가능 확정 정보가 아니며, 일반 관광지·공원의 전수 목록이 아님. query당 45건 제한 존재.
- 백업: `verification-evidence/kakao-jeju-catalog-v1/backup/20260907T102901Z/`. 장소 330행, run 2행. 건수/SHA-256 검증 완료.
- 제주 start/commit 함수 적용 완료. security invoker, anon/authenticated 실행 불가, service_role 실행 가능 확인.
- dry-run: 14/14 query, 35 calls, 중복 제거 382개 후보(여행 263, 병원 61, 펫샵 58). 오류 0, 상한 도달 query 9개. DB 쓰기 없음.
- typecheck, lint, build PASS. 제주/서울/공통 runner 테스트 21개 PASS.
- 재승인 후 run 42 완료: 62/62 query, 106 calls, 신규 416개, 갱신/비활성화 0. 오류/재시도 0.
- 여행 후보 297(카페 109, 식당 84, 숙소 103, 공원·산책 1), 병원 61, 펫샵 58. 제주시 244, 서귀포시 172.
- raw 1,042건, 분류 통과 1,036건, 중복 620건, 분류 제외 6건. 상한 도달 query 19개: 전수 보장 아님.
- 전체 신규 416행 public/current/unreviewed, ID 중복 0. 기존 전체 장소 fingerprint `9481bd9a70bb1f06a83a072ed8ae5bb3` 전후 동일.
- 지도 공급자에 Kakao 추가. 자동 추천/실시간 discovery는 기존 상태 유지. 위치 미리보기의 잘못된 discovery gate를 공개 지도 지원 gate로 수정.
- 전체 unit 1,445개 PASS, 추가 미리보기 회귀 5개 PASS, desktop/mobile E2E 2개 PASS.
- 실제 로컬 API 200: 여행 지도 351곳(KTO 54 + Kakao 297). 실제 SDK 마커/클러스터 확인, 1440/390px 가로 넘침 없음. 미리보기 수정 후 console error 0, 개발 이미지 성능 warning 1. 스크린샷 미저장.
- Production DB 수집 완료. Production UI 배포/Preview/커밋/푸시 없음.

## 실행

`node --env-file=.env.local --conditions=react-server --import tsx scripts/collect-kakao-jeju-v1.ts --plan|--dry-run|--apply`

중단 run은 `--resume <runId>`로 재개. 실행 결과가 completed가 아니면 공개 완료로 보고하지 않음.

## 복구

수집 중단 후 해당 run에서 신규 생성된 제주 Kakao 행만 기존 공개 필드로 비공개 처리하는 보상 작업을 별도 승인받아 수행. ID·hits·검수 정보 삭제 금지. 기존 타 지역/KTO 행은 변경 대상이 아님.
