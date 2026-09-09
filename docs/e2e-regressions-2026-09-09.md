# 지도 미리보기·판정 복원 E2E 회귀 검증

2026-09-09. 범위는 기존 E2E 두 건이다. 기존 NAVER 작업과 다른 작업의 홈페이지 변경은 보존한다. 공급자·추천 점수·판정 정책·DB·배포는 변경하지 않는다.

## Skills와 판단 근거

| skills read | checklists | concrete influence |
| --- | --- | --- |
| using-agent-skills, context-engineering, petpass-project-context | 지침·diff·관련 계약부터 확인 | 기존 변경 보존, 두 실패 재현 후 수정 |
| debugging-and-error-recovery, test-driven-development | 재현 → 상태 추적 → 최소 수정 → 재검증 | 클릭 가림과 오래된 문구 기대를 별개 원인으로 분리 |
| kakao-integrations, map-catalog-pipeline | 마커 identity·공개 DTO·공급자 경계 | SDK/클러스터러/DTO/RPC 수정 없음 |
| petpass-ui-review, regression-check | responsive checklist, browser matrix, 키보드·콘솔·저장 복원 | 1440/390px A→B 전환, Enter/Escape, 원본 전체 흐름 유지 |
| vercel:agent-browser | 실제 브라우저 상호작용·관측 기반 selector | 기존 Playwright runner의 일반 click 사용; force/DOM 이벤트 우회 없음 |
| security-and-hardening, code-review-and-quality | 저장 검증·범위·최종 diff | 잘못된 enum 거절, 증거에 비밀/전체 공급자 payload 배제 |

## 마커

- exact root cause: `MapPanel`이 React portal의 `.map-selection-content`를 `setSelectionContent()`로 전달하면 `lib/kakao/maps.ts`의 `renderSelectionInfo()`가 선택 좌표에 Kakao CustomOverlay를 생성했다. 다른 마커와 실제로 겹쳤다.
- blocking element/component: `.map-selection-content .catalog-result-card__actions` / `.explorer-map-place-preview`.
- pointer-event/z-index behavior: 수정 전 overlay는 absolute/z-index 10/pointer-events auto, 내부 preview는 relative/z-index 20. 일반 마커 z-index 4, 선택 마커 9. 캔버스 안의 클릭 영역이 가려졌다.
- responsible files/functions: `components/map/map-panel.tsx:MapPanel`, `lib/kakao/maps.ts:renderSelectionInfo`, `app/weekendog-globals.css`.
- files changed: `MapPanel`과 CSS만 런타임 수정. portal 연결을 제거하고 기존 preview를 캔버스 아래 flex 형제 영역에 배치한다. 기존 controller API는 유지한다.
- interaction behavior before/after: 닫기를 먼저 해야 다른 마커 클릭 가능 → 미리보기 열린 채 다른 마커를 일반 click하면 선택이 바뀜. 링크와 버튼의 pointer-events를 끄지 않는다.
- marker registry behavior: 전환 전후 26, 생성 마커 수 불변, 선택 마커 1, 지도 1, 클러스터러 1. 페이지 2와 필터 URL 유지. 기존 선택에 따른 pan은 유지.
- baseline: page 2, selected `tour:7012`. overlay `(665,80,340,257)`, target 공식 장소 14 `(963.52,249.95,42,50.75)`. pointer interception timeout 재현.
- 수정 후 1440px: map bottom 673, preview top 674; target 공식 장소 14 y279.36, height55.58. preview는 canvas 밖이며 가림 없음. 390px도 같은 경계 검증 통과.

## 판정·저장

- exact canonical state: `tour:7000` / KTO / `not_allowed`, `kakao:9101` / Kakao / `unknown`.
- where the state was lost or misrendered: 유실 없음. 첫 실패는 저장 전 카드 문구 검사에서 발생했다.
- whether the test expectation was current or stale: stale. 2026-09-06 commit `2984a03a7f7c88f441157e65baaf96fe2e224db6` (`Make registered places eligible and exclude pet services from auto routes`)가 등록 장소 표시를 통일했다. 현재 `selectedItineraryVerdictLabel()`은 모든 canonical verdict에 `반려동물 동반 가능`을 반환하며 `selectedItineraryNeedsWarning()`은 false다. `tests/unit/pet-access-verdict-label.test.ts`가 이 정책을 명시적으로 검증한다. 이 작업은 해당 정책을 바꾸지 않는다.
- responsible files/functions: `lib/storage/selected-itinerary-storage.ts:selectedItineraryVerdictLabel`, `components/places/public-catalog-card.tsx`, `components/planner/unified-planner-form.tsx`.
- files changed: 원본 `tests/e2e/full-map-explorer.spec.ts`의 기대 문구/복원 검증, `tests/e2e/planner-test-helpers.ts`의 이미 잠긴 지역 처리, DTO/저장 unit 두 파일.
- serialization/DTO/UI changes: 프로덕션 serialization/DTO/판정 UI 변경 없음. 원본 planner 후반에서 선택 모드의 disabled 지역 select를 다시 조작하던 오래된 helper를 수정하고, 실제 지역 값 26 검증은 유지했다. planner는 경고 문구 대신 기존 `sourceLabel · publicLabel`을 렌더링하므로 그 원문 두 개를 검증한다.
- known-negative result: 새로고침 전후 내부 `not_allowed`, 카드 통일 문구 유지, planner 원문 `한국관광공사 · 반려동물 출입 불가` 보존.
- unknown result: 새로고침 전후 내부 `unknown`, 카드 통일 문구 유지, planner 원문 `카카오 검색 후보 · 동반 여부 확인 필요` 보존. 두 내부 상태를 합치지 않았다.

| state-flow | known-negative | unknown |
| --- | --- | --- |
| fixture/provider row | snapshot fixture override: tour:7000, not_allowed, 반려동물 출입 불가 | kakao:9101, unknown, 동반 여부 확인 필요 |
| normalized catalog row | 현재 snapshot의 verdict 우선 병합 | markerToCatalogCard가 verdict 유지 |
| marker DTO | petAccessVerdict=not_allowed | petAccessVerdict=unknown |
| card DTO | 동일 verdict·publicLabel 보존 | 동일 verdict·publicLabel 보존 |
| selected place state | selectedItineraryPlaceFromCatalog → not_allowed | → unknown |
| rendered badge | 반려동물 동반 가능(현재 등록 장소 표시 계약) | 같은 표시 계약; 내부 상태는 unknown |
| saved snapshot | PlanDraft v2 selectedPlaces[].evidence.verdict=not_allowed, label=반려동물 출입 불가 | verdict=unknown, label=동반 여부 확인 필요 |
| restored state | PlanDraft 우선 load → petAccessVerdict=not_allowed | → petAccessVerdict=unknown |
| rendered badge after refresh | 카드 동일; planner는 보존된 출처·원문 표시 | 카드 동일; planner는 보존된 출처·원문 표시 |

선택 itinerary schema v3, PlanDraft schema v2는 그대로다. 경량 fixture에는 reason code와 primary-evidence object가 없다(미제공). 없는 값을 만들거나 전체 provider payload를 다시 넣지 않았다. 기존 조회 실패/NEEDS_CONFIRMATION 로직도 수정하지 않았다.

## 검증 결과

최종 상태: **BLOCKED_BY_BUILD_OR_TEST**. 두 대상 회귀는 해결됐지만, 필수 전체 E2E에 범위 밖 실패가 남아 있다.

| 항목 | 실제 결과 |
| --- | --- |
| original E2E result — marker | PASS. 원본 pagination→selection→viewport commit 전체 흐름, 닫기 우회 없음 |
| original E2E result — assessment | PASS. 1440px/390px 선택→refresh→planner까지 완료 |
| typecheck | PASS, 최종 `npm run verify`에 포함 |
| lint | PASS, 최종 `npm run verify`에 포함 |
| unit tests | PASS, 최종 168 files / 1,553 tests. 직접 추가한 DTO·저장 검증 포함 |
| Playwright 전체 | `npm run test:e2e`: 310 PASS / 50 FAIL / 40 SKIPPED, 8.2분 |
| Playwright 빌드 후 재실행 | 두 원본 + 화면별 마커 전환: 5 PASS / 1 기존 SKIPPED, 10.4초. 원본 마커 테스트는 기존 desktop-only이며 390px는 새 전환 테스트로 검증 |
| build | PASS, `npm run verify`의 `npm run build` |
| SDK count | SDK loader unit: 동시 호출 시 script 1/load 1. 해당 지도 E2E는 사전 주입 mock SDK 1개, 추가 script 0, 지도 instance 1. 실 SDK 네트워크 검증은 SKIPPED |
| marker count | 26, 전환 중 생성 수 불변, 선택 marker 1, clusterer 1 |
| provider request count | 원본 지도 초기 snapshot 1, paged map 0, filtered tour markers 0, RSC 0; 새 마커 A→B의 추가 API 요청 0. 실제 공급자는 mock 환경. 기존 saved recommendation provider-free E2E도 PASS |
| storage regression | 네 verdict 구분 보존, invalid/null/missing 거절, unrelated key 유지, geometry/editToken 유입 방지 PASS. PlanDraft 우선순위/버전/복원 코드 변경 없음 |
| console/page/hydration | 추가 1440/390 전환에서 console error/pageerror 0. 기존 로고 LCP 권고와 NO_COLOR 경고는 남음 |
| final diff | `git diff --check` PASS. 작업 범위 밖 변경 보존 |

`npm run verify`는 package.json에서 typecheck→lint→전체 unit→build를 모두 실행함을 확인했다. 최초 제한 환경의 Vitest 시작 실패(상위 디렉터리 Access denied)는 동일 명령을 권한 분리한 로컬 실행으로 해소했다. 검사 제한을 약화하지 않았다.

### anything not fully verified / unrelated existing failures

전체 실패 50건의 테스트명과 오류 요약은 evidence의 `full-suite-summary.txt`에 기록했다. 대표적으로 오래된 동반 문구 기대, homepage 마커 수 5 대 실제 15, 기본 지역 busan 대 seoul, 중복 `체크인` locator, planner 세부 지역 option 기대, itinerary evidence 기대가 있다. 이번 두 대상 외에는 수정하지 않았다. 모든 50건을 변경 전 독립 재현하지 않았으므로 일괄적으로 기존 실패라고 단정하지 않는다.

검증 중 공유 작업공간에 별도 홈페이지/콘텐츠 변경이 관찰됐다(`app/page.tsx`, homepage content 파일, package 의존성 등). 이 작업에서는 해당 파일을 수정·복원하지 않았다. 최종 unit 수는 현재 작업공간 기준이며 모두 이 회귀 수정으로 추가된 테스트가 아니다. 전체 E2E를 다시 green으로 만드는 작업은 완료되지 않았다. 실 카카오 SDK와 실 공급자 호출은 이번 결정론적 검증의 범위 밖이다.

## 증거

- evidence directory: ignored `verification-evidence/e2e-regressions-2026-09-09/`.
- screenshots/artifacts: `baseline-marker`, `baseline-assessment`; 최종 `marker-a/b-1440px`, `marker-a/b-390px`, `known-negative-before/after-refresh-1440px/390px`, `unknown-before/after-refresh-1440px/390px`의 PNG/JSON. 파일명의 before/after는 각각 별도 파일이다.
- 저장하는 자료는 합성 fixture ID·판정·DOM 좌표와 화면뿐이다. credential/authorization header/실제 사용자 정보/전체 공급자 응답은 저장하지 않는다.
- no hidden test weakening: 원본 테스트 이름과 선택→새로고침→planner 이동 전체 흐름 유지. 별도 close workaround, force click, timeout 증가, 판정 enum 변환, 제품 코드의 문구 변경 없음. 오래된 기대 문구는 현행 source와 기존 unit 정책으로 입증하고 변경했다.
- 커밋·푸시·병합·배포·원격 쓰기: 수행하지 않음.
