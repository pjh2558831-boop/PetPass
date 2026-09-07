# 서울 Kakao 수집 — 2026-09-07

- 기존 PetPass Supabase: `inucorualcworpzqxjiu`. 키·환경변수 변경 없음.
- Migration: `20260907095752_add_seoul_kakao_catalog.sql`, 적용 완료.
- 수집 run: `41`, completed, 25개 구 × 31개 = 775개 query 모두 완료.
- 실제 호출 1,361회, 재시도/429/timeout/provider error 0.
- 신규 2,988곳: 여행 후보 1,327, 동물병원 841, 펫샵 820.
- 여행 후보: 카페 1,147, 식당 156, 숙박 13, 관광지 5, 산책 3, 기타 3.
- 응답 13,609건에서 중복 6,071건, 구·지역 불일치 4,501건, 좌표 오류 18건, 분류 제외 31건.
- 234개 query가 45건 상한을 초과함. 검색 계획 완료이지 서울 모든 장소의 누락 없는 전수 확보를 의미하지 않음.
- DB 검증: 중복 ID 0, 잘못된 지역 0, 미공개 0, 25개 구 포함.
- 기존 부산 Kakao 1,180행과 모든 KTO/타지역 행의 전체-row 해시가 적용 전후 일치함.
- 기존 부산 백업: ignored `verification-evidence/kakao-busan-catalog-v1/backup/20260907T095102Z/` (장소 1,833행, run 6행, count/SHA-256 검증).
- 지도는 현재 부산과 동일하게 여행 후보를 표시함. 서울 기본 스냅샷은 KTO 76 + Kakao 여행 후보 1,327 = 1,403곳. 병원·펫샵은 DB/API에 보존되며 기본 여행 지도에 포함되지 않음.
- 신규 미검수 여행 후보는 동반 가능 확정이 아님. 카드/마커에 확인 필요 문구와 방문 전 경고를 유지함.

## 실행

```powershell
node --conditions=react-server --import tsx scripts/collect-kakao-seoul-v1.ts --plan
node --env-file=.env.local --conditions=react-server --import tsx scripts/collect-kakao-seoul-v1.ts --dry-run
node --env-file=.env.local --conditions=react-server --import tsx scripts/collect-kakao-seoul-v1.ts --apply
node --env-file=.env.local --conditions=react-server --import tsx scripts/collect-kakao-seoul-v1.ts --resume <runId>
```

Apply/resume는 승인된 작업에서만 실행. 실행당 물리 호출 cap 1,500(재시도 포함), 동시성 2, timeout 8초, 최대 재시도 2. 모든 checkpoint 완료 후 기존 지역별 finalize로 공개. 부산 수집 함수와 검수 필드는 변경하지 않음.

## 검증 및 배포 상태

- typecheck, lint, 전체 단위 테스트 1,443개, Production build 통과.
- 기존 서울 쇼핑/캐시/지역 전환 회귀 확인. 실시간 DB 스냅샷 API 200 및 1,403곳 확인.
- source와 client static bundle의 현재 서버 secret exact-value 노출 0 (366개 파일).
- 새 서울 후보 카드·지도 선택·미검수 경고 브라우저 테스트: desktop/mobile 2개 통과. 서울 기존 회귀는 desktop 4개 통과; 기존 모바일 skip 4개는 유지. 서울 쇼핑 회귀에서 1440/768/390/320px 확인.
- Preview: `dpl_23SVahVG9cgs5CJNDqfJvyYuS8BE`, `READY`.
- URL: https://pet-pass-ci407aryf-pjh2558831-boops-projects.vercel.app/results?tab=catalog&region=seoul
- Vercel Deployment Protection의 로그인 redirect로 실제 Preview 검증 중단. 보호 우회/해제 없음. 로그인 후 검증 및 Production 반영 필요.
- 이전 Production rollback 대상: `dpl_GmzWGn4HQfuFbYZj4g2anjmHzkaR`.
- Production 배포·승격, commit/push는 수행하지 않음. 기존 AGENTS.md와 app/icon.png 사용자 변경은 배포 소스에서 제외함.
- 로컬 실데이터 목록은 확인했으나 3001의 실제 Kakao SDK 지도 로딩은 실패하여 실지도 핀 검증은 완료하지 못함. mocked SDK 회귀와 실제 SDK 검증을 구분할 것.

되돌리기가 필요하면 별도 승인 후 서울 Kakao 공개만 가역적으로 비활성화하고 서울 수집을 중지한다. ID/hit/검수 증거를 삭제하지 않는다. 다른 지역을 재수집하거나 stale 처리하지 않는다.
