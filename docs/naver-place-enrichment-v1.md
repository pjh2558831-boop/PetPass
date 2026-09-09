# WEEKENDOG 외부 장소 검색·전국 집계 v1

구현 모드는 `external_link_only`. [정책](naver-place-integration-policy-v1.md)과 [사진 검토 절차](naver-media-provenance-v1.md)를 따른다. 내장 NAVER 검색·자동 장소 보강 완료를 의미하지 않는다.

## UI와 불변 조건

공개 장소 카드와 관광공사 상세 화면의 ‘외부 검색으로 더 확인’을 펼치면 장소 정보/이미지 검색 링크가 나온다. 실제 이름·지점명·전체 주소를 그대로 URL 인코딩해 네이버로 이동한다. 주소가 없으면 이름만 사용하고 지역을 추정하지 않는다. 기존 주소에 포함된 시도 별칭·도로명·건물번호·층은 제거하지 않는다. 불명확한 이름의 대체 문구는 검색하지 않는다.

일반 `<a>`이므로 화면 로딩·카드 생성·지도 이동·정렬·페이지 이동·일정 복원에서 NAVER 요청이 없다. 검색결과를 앱에 표시하지 않으며 결과 사진을 대표 사진으로 승격하지 않는다. 조회 시각이나 ‘네이버 인증’ 배지를 만들지 않는다.

카카오 지도/Local/Mobility, 관광공사·인허가, canonical ID/주소/좌표, 동반 평가와 현재 `full_public_catalog_v1` 추천 경계, 지역별 여행 지원 기능을 변경하지 않았다. 기본 Tourism/Kakao와 선택 shopping/veterinary/pet-shop 구성을 보존한다. 마커 DTO·카드 RPC·캐시·인기도·인증 구조도 변경하지 않는다. 오래된 문서의 Tourism-only/Busan-only 제한으로 되돌리지 않는다.

## 전국 읽기 전용 명령

```powershell
npm run naver:inventory
npm run naver:inventory -- --dry-run
npm run --silent naver:inventory -- --plan > inventory.json
```

기존 `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SECRET_KEY`를 서버 실행에서 사용한다. 자격 증명을 출력하지 않는다. 원격 SELECT와 기존 공개 카탈로그 RPC만 호출한다. 정규 지역 config의 지역/공급자/데이터셋별 200개 cursor page를 순차로 읽으며 이전 page를 재생하지 않는다. optional 데이터셋도 해당 지역 설정에 따라 집계한다.

최대 DB 요청 2,000회, 전체 15분, 요청별 8초, 파티션별 1,000 page, 재시도 없음. 공개 ID 중복·커서 정체·개수 변화·부분 실패는 complete=false/종료 1로 보고한다. 이 경우 publicCount는 null이며 observedPublicCount만 부분 관측이다. NAVER 예산은 0이다. `sample/apply/resume` 등 다른 인수는 거절한다.

공개 대상은 공급자별 현행 공개 RPC가 판정한다. 원본 행은 따로 커서 집계하며 inactive/rejected/hidden/nonCurrent/providerNotExposed는 **서로 겹칠 수 있는 원본 상태 통계**다. notInPublicScan은 전체 스캔 성공 시만 공개 대상과의 차이를 나타낸다. stale+confirmed처럼 기존 정책상 공개되는 행을 임의로 숨기지 않는다. 스캔은 트랜잭션 스냅샷이 아니므로 동시 발행이 있으면 다시 실행해야 한다.

## 2026-09-09 실행 결과

[정제된 실제 집계 JSON](naver-inventory-2026-09-09.json): complete=true, DB 읽기 299회, 원본 등록 26,432행, 공개 장소 25,667곳. 원본 등록과 공개 대상 차이는 765행이다. 사진 URL 존재 6,814곳/미보유 18,853곳이며 유효성·사용권 검증 수는 아니다. 독립 승인·신규 게시 사진 0건. NAVER 실검색 지역 없음; 17개 지역 모두 DB 집계만 실행했다.

| 지역 | 공개 장소 | 사진 URL 존재 |
| --- | ---: | ---: |
| 부산 | 1,068 | 34 |
| 충북 | 551 | 15 |
| 충남 | 963 | 27 |
| 대구 | 811 | 8 |
| 대전 | 489 | 7 |
| 강원 | 1,320 | 98 |
| 광주 | 476 | 1 |
| 경북 | 1,159 | 29 |
| 경기 | 6,887 | 2,536 |
| 경남 | 1,232 | 19 |
| 인천 | 1,742 | 510 |
| 제주 | 746 | 321 |
| 전북 | 697 | 23 |
| 전남 | 877 | 23 |
| 세종 | 114 | 1 |
| 서울 | 6,142 | 3,134 |
| 울산 | 393 | 28 |

합성 검색 테스트는 부산·서울·경기·강원·제주·세종·전북과 지역 누락을 포함한다. 라이브 검색 결과를 fixture나 스크린샷에 저장하지 않았다. 원격 데이터/Storage 쓰기, 마이그레이션, 커밋·푸시·병합·배포 없음.

## 변경과 검증 기록

- UI: `components/places/naver-search-disclosure.tsx`를 카드/상세에 재사용. `lib/places/naver-search-links.ts`에서 고정 외부 URL 구성. `app/weekendog-globals.css`에서 작은 보조 영역과 이미지 오류 대체 표시를 지원한다. 기존 CSS가 사진 오류 placeholder까지 숨기는 문제를 발견해, 처음부터 사진이 없는 카드의 레이아웃은 유지하면서 로드 실패 대체 표시만 보이게 수정했다.
- 운영: `scripts/registered-place-inventory.ts`와 작은 커서 검사 함수, `scripts/review-venue-media.ts`와 `lib/places/venue-media-review.ts`. package.json에 명령 2개 추가. 새 의존성·DB migration 없음.
- 문서: 이 문서, 정책·사진 출처 문서, 집계 JSON, design.md. 기존 `.playwright-cli/`와 `premium-audit.json`은 보존했다.
- 적용 Skill: using-agent-skills, context-engineering, petpass-project-context, map-catalog-pipeline, supabase, test-driven-development, petpass-ui-review, regression-check, debugging-and-error-recovery, security-and-hardening, code-review-and-quality. 저장소 지침과 관련 UI 체크리스트, 설치된 Next.js Link 문서를 읽었다.

| 실제 실행 | 결과 |
| --- | --- |
| `npm run verify` (typecheck, lint, test, build) | PASS: 167개 테스트 파일, 1,533개 단위 테스트 및 프로덕션 빌드 |
| 새 3개 단위 테스트 파일의 구현 전/후 실행 | 예상 RED 후 11개 PASS |
| `npm run test:e2e -- tests/e2e/full-map-explorer.spec.ts tests/e2e/pet-access-detail.spec.ts --project=chromium --grep 'external NAVER'` | PASS: 7개 |
| `npm run naver:inventory -- --plan` | PASS: 실제 17개 지역 DB 읽기, 299 요청, NAVER 0 요청, 원격 쓰기 0 |
| `npm run media:review -- <문서 예시 임시파일>` | PASS: 미승인 항목 적격 0, 게시 0, 예상 종료 코드 1 |
| `git diff --check`와 최종 코드/보안 경계 검토 | PASS |
| NAVER Local / Image API smoke | 각각 SKIPPED: external_link_only, 사용권 미확인 |
| 전국 자동 검색·이미지 다운로드·사진 게시 | SKIPPED: 이번 모드에서 구현/실행하지 않음 |

### 브라우저 증거와 제한

환경은 localhost:3000의 Next.js 개발 서버와 기존 Playwright Chromium 합성 provider/map이다. 1440/768/390/320px에서 실제 Disclosure 클릭·Enter·Tab·접기를 검증하고 화면 이미지를 확인했다. 한글 내용과 포커스 표시가 보이며 가로 넘침이 없다. 산출 이미지는 `test-results/full-map-explorer-external-*/naver-*.png`에 있으며 저장소 추적 대상이 아니다.

새 상호작용 검사는 정렬·페이지 이동·지도 카드 선택·미리보기 닫기·다른 마커 선택 후 기존 26개 마커 ID와 스냅샷 요청 1회를 유지했다. 대표 사진 실패 시 카테고리 대체 표시와 링크가 사용 가능하다. 링크 화면의 pageerror는 0, NAVER 자동 요청 0이다. 의도적 사진 404 외에 새로운 기능 오류는 발견되지 않았다. 기존 브랜드 이미지의 Next.js LCP 권고 경고는 남아 있다. 실제 카카오 SDK 및 NAVER 콘텐츠를 사용한 라이브 브라우저 검증은 아니다.

기존 E2E 두 개는 FAIL이며 이번 보조 영역을 일시 제거한 비교 실행에서도 동일하게 실패했다. 테스트를 약화하거나 기존 추천/평가 코드를 변경하지 않았다.

1. `keeps one source marker per place across pagination, selection, and viewport commit`: 열린 선택 미리보기가 다음 지도 마커 클릭을 가려 timeout. 새 검사는 사용자가 미리보기를 닫은 뒤 선택하는 성공 경로를 확인했으며 기존 실패를 대체하지 않는다.
2. `full catalog selection preserves known-negative and unknown places through refresh`: 기대한 ‘원문상 동반 불가’ 배지 미표시. 따라서 이 E2E의 저장 후 복원 전체 경로는 미검증으로 남는다. 기존 저장/복원 단위 테스트는 전체 suite에서 PASS.

사진 검토 적격은 입력된 증거 체크리스트 통과일 뿐 계약 진위·실제 이미지 안전성·실제 장소 일치를 자동 인증하지 않는다. 배치 동시 발행 안정성, 현행/9월 20일 약관 전문, Application 자격 증명 종류 및 Local/Image 권한은 후속 운영 확인 항목이다. 커밋·푸시·병합·배포하지 않았다.
