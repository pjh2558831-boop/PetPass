# WEEKENDOG ui_ver_4 홈페이지 리디자인 검증

## Changed files

작업 위치: C:/Users/pjh25/Desktop/ui_ver_4. 이 대화의 후속 작업도 이 복제본에 한정한다. 원본 펫패스의 git 상태는 기존 미추적 premium-audit.json만 남아 있으며 변경하지 않았다.

- app/layout.tsx
- app/page.tsx
- app/homepage-v4.css (신규)
- components/home/homepage-landing.tsx (신규)
- components/home/hero-photo-carousel.tsx
- components/home/hero-planner-launcher.tsx
- components/home/home-place-workbench.tsx
- components/home/home-selected-itinerary-tray.tsx
- components/home/homepage-live-experience.tsx
- components/home/homepage-nationwide-places.tsx
- components/home/homepage-pet-content.module.css
- components/home/homepage-pet-content.tsx
- components/home/official-place-carousel.tsx
- components/home/weekendoog-hero.tsx
- components/layout/site-header.tsx
- public/images/home/hero/coastal-dog-v4.webp (신규)
- public/images/home/landscape-v4.webp (신규)
- tests/e2e/homepage-v4.spec.ts (신규)
- tests/e2e/homepage-nationwide.spec.ts
- tests/e2e/homepage-pet-content.spec.ts
- design.md
- design-qa.md

검증 산출물은 git 제외 경로 verification-evidence/homepage-v4/ 및 verification-evidence/homepage-v4-premium-audit.json에 보관했다. 기존 premium-audit.json은 수정하지 않았다.

## Key changes

흰색 헤더, 해안 도로와 반려견 히어로, 초록 강조 제목, 떠 있는 검색창, 세 가지 서비스 안내, 지역별 추천 카드, 지도/장소 목록, 선택한 장소, 뉴스/축제, 언덕 일러스트 순서로 레퍼런스 구성을 적용했다. 기존 React 구성요소, 검색/지도/선택 데이터와 일정 이동 흐름을 재사용했다. 필터는 native details, 지역은 select, 이미지 전환은 수동 버튼을 사용한다. API, 인증, 저장 스키마, 추천 엔진, 의존성과 배포 설정은 변경하지 않았다.

사용 Skills: petpass-project-context, petpass-ui-review, regression-check, Frontend Design Premium(frontend-design 및 premium), Product Design(image-to-code/design-qa), imagegen, debugging-and-error-recovery, test-driven-development, code-review-and-quality.

시각 비교 기준은 C:/Users/pjh25/Desktop/ChatGPT Image 2026년 9월 9일 오후 07_14_19.png (951×1654)이다. 동일한 951 CSS px 화면 폭에서 히어로 비율, 타이포그래피, 추천 카드/지도 분할, 뉴스/축제 열 구성, 하단 장식을 함께 비교했다. 전체 높이를 억지로 동일하게 늘이거나 줄이지 않았다. 구현 이미지 951×2083에는 원래 출처/안내/푸터와 빈 데이터 상태가 포함되어 있으므로 픽셀 단위 동일 화면이라는 주장은 하지 않는다.

실제 브라우저 정제 과정에서 헤더 겹침과 CSS 로딩 우선순위, 951px 지도/목록 높이, 모바일 썸네일 텍스트가 순서 변경 버튼을 가리는 문제, 필터가 결과 클릭을 가리는 문제, 좁은 화면 제목 줄바꿈을 수정했다. 최종 951px 및 390px 전체 페이지 스크린샷을 직접 확인했다.

## Validation

| 실행 명령/검사 | 결과 |
| --- | --- |
| npm run verify | PASS: typecheck, lint, 단위 테스트 168파일/1,553개, production build |
| npm run typecheck / npm run lint / npm run build (후속 변경 후 개별 재실행) | 모두 PASS |
| 아래 범위의 npm run test:e2e | PASS: Chromium / mobile-chrome 24개 |
| npm run test:e2e -- tests/e2e/homepage-v4.spec.ts (마지막 줄바꿈/촬영 위치 수정 후) | PASS: 4개 재검증 |
| Frontend Design Premium audit_project.py --mode strict | PASS: findings 0 |
| git diff --check | PASS: 최종 공백 오류 없음; Windows 줄바꿈 안내만 존재 |
| 원본 펫패스 git status --short | PASS: 작업 전의 미추적 premium-audit.json만 존재 |
| 1440/1280/951/768/390/320px | PASS: 섹션 순서, 지도/목록 전환, 문서 가로 넘침 없음 |
| 검색, 검색 해제/포커스, 필터, 선택/순서/제거/전체 지우기, 일정 화면 이동 | PASS: E2E 검증 |
| 사진 재시도, 지역 부분 실패/재시도, 목록 페이지 이동, 긴 한글, 뉴스/행사 로딩/빈 상태/오류/정책 비활성 | PASS: E2E 검증 |
| 실제 데이터 홈페이지 확인 | 실제 전국 17개 지역 조회 및 Kakao 지도/목록 렌더링을 확인. 조회 시점 장소 수 11,271 |
| 로컬 미리보기 재실행 후 Invoke-WebRequest http://localhost:3000 | PASS: HTTP 200 |
| 재실행 후 Codex 내장 브라우저 재접속 | NO-GO: 이전 연결 오류 data: 페이지의 브라우저 URL 정책 차단. 설정을 변경하거나 우회하지 않음 |
| 전체 역사적 E2E / 실제 계정 로그인·외부 저장 | SKIPPED: 홈페이지 관련 흐름에 한정; 실제 외부 쓰기 미실행 |

24개 브라우저 검사 실행 명령:

```text
npm run test:e2e -- tests/e2e/homepage-v4.spec.ts tests/e2e/homepage-photos.spec.ts tests/e2e/homepage-nationwide.spec.ts tests/e2e/homepage-pet-content.spec.ts tests/e2e/homepage.spec.ts --grep 'v4 |loads missing workbench|nationwide home keeps|searches loaded places|paginates a dense|synthetic content layout|independent loading|policy-disabled news'
```

최종 정적 비교 스크린샷은 C:/Users/pjh25/Desktop/ui_ver_4/verification-evidence/homepage-v4/homepage-v4-{1440,1280,951,768,390,320}.png에 있다. 스크린샷의 장소 및 SDK는 격리된 테스트 fixture이며 실제 서비스 데이터나 실제 지도 화면의 증거로 사용하지 않는다. 실제 데이터 확인은 별도 수동 브라우저 실행으로 구분한다. 개발 서버의 Next 표시가 스크린샷에 포함될 수 있다.

## Status

PASS — 요청 범위의 구현 및 관련 검증 완료. 최종 내장 브라우저 재접속 한계는 별도로 기록했으며 서버 HTTP 응답과 마지막 Playwright 렌더링은 통과했다.

## Remaining risks

- 레퍼런스의 개별 장소/행사 이미지 원본이 없어 동일 사진을 넣지 않았다. 기존 제공자 사진·정적 지도·사진 준비 중 상태를 사용하며 실제 장소 사진을 AI로 꾸며 넣지 않는다. 생성한 두 이미지는 히어로와 장식 배경에만 사용한다.
- 행사 DTO에 이미지가 없어 레퍼런스의 큰 전시회 사진 대신 실제 일정/날짜/원문 링크를 유지한다. 뉴스/행사 표시 내용은 제공자 결과 및 운영 정책에 따라 달라진다.
- 추천 카드에 전국 집계 API가 없어 실제 17개 지역 선택을 사용한다. 전국 지도 검색은 기존 전체 지역 조회를 유지한다. 장소 수와 선택 수를 레퍼런스 숫자로 고정하지 않는다.
- 기존 로고, 출처/동반 조건, 자동 추천 진입, 푸터를 유지하므로 레퍼런스와 세부 형태/전체 높이는 다르다.
- 전체 앱의 모든 로그인 상태와 외부 데이터 쓰기는 검증 범위가 아니다. 홈 관련 24개 브라우저 검사 및 전체 단위 테스트 통과를 모든 프로덕션 동작의 보증으로 해석하지 않는다.

## Git / Deployment

- commit: not performed
- push: not performed
- merge: not performed
- production deployment: not performed
- database / migrations: not performed

## 2026-09-09 브라우저 코멘트 1–4 반영

- 접이식 여행 예시 영역과 예시 코스를 홈에서 제거했다.
- 데이터 제공처 로고와 기존 문의 링크는 하단 일러스트 아래, 푸터 바로 위로 이동했다. 연한 녹색 배경과 얇은 구분선, 모바일 세로 배치로 정리했다.
- 전국 지역 조회 완료 카운터를 제거했다. 연결 실패/좌표 누락 안내 및 기존 재시도 동작은 유지했다.
- 이번 변경 파일: app/page.tsx, app/homepage-v4.css, components/home/public-data-trust-card.tsx, components/home/homepage-nationwide-places.tsx, tests/e2e/homepage.spec.ts, tests/e2e/homepage-nationwide.spec.ts, tests/e2e/homepage-pet-content.spec.ts, tests/e2e/homepage-v4.spec.ts, design.md, design-qa.md.
- Skills: petpass-project-context, petpass-ui-review, regression-check. 기존 구성요소를 재사용했다.
- npm run verify: PASS (타입, 린트, 단위 168파일/1,553개, 빌드).
- npm run test:e2e -- tests/e2e/homepage-v4.spec.ts tests/e2e/homepage-nationwide.spec.ts tests/e2e/homepage-pet-content.spec.ts --grep 'v4 |nationwide home keeps|synthetic content layout': PASS 14개.
- 검증: 삭제된 문구 부재, 제공처 로고 3개, 문의 URL 보존, 일러스트 다음 하단 배치, 검색/선택/일정 이동, 실패 재시도, 320–1440px 가로 넘침 없음. E2E pageerror 없음.
- verification-evidence/homepage-v4/homepage-v4-951.png 및 homepage-v4-390.png를 갱신하고 직접 시각 확인했다. 격리된 테스트 이미지/지도 사용 화면이다.
- Playwright CLI 로컬 페이지 열기/1292px 리사이즈/하단 스크롤/스크린샷/콘솔 및 네트워크 조회를 완료했다. 전국 지역 및 뉴스/행사 요청 HTTP 200을 확인했다. 임시 CLI 브라우저는 종료했다. 모바일 시각 확인은 E2E 스크린샷을 사용했다.
- git diff --check: PASS. commit/push/merge/production deployment: not performed.
- 결과: PASS. 실제 외부 문의 전송 및 로그인 작업은 수행하지 않았다.

## 2026-09-09 전 지역 추천 사진 우선 / 정책 페이지

- 변경: components/home/official-place-carousel.tsx, lib/homepage/homepage-card-image.ts, components/layout/site-footer.tsx, app/(legal)/layout.tsx, app/(legal)/legal.css, app/(legal)/privacy/page.tsx, app/(legal)/terms/page.tsx, tests/unit/homepage-card-image.test.ts, tests/e2e/homepage-v4.spec.ts, design.md, design-qa.md.
- 모든 지역의 현재 추천 후보에 대해 실제 사진을 가진 카드를 먼저 안정 정렬한다. 사진 여부가 같으면 기존 순서를 유지한다. 후보 선정 수/공식 평가/추천 엔진은 바꾸지 않았다.
- 부산 외 지역의 초기 응답에는 사진 주소가 없으므로 기존 requestMapPlaceCardDetails를 12개 묶음으로 재사용한다. 지역 전환 시 요청 취소 및 다른 지역 사진 혼입 방지, 부분 실패 시 기존 지도/카테고리 표시를 유지한다. API/DB 계약과 인증 설정을 수정하지 않았다.
- /privacy 및 /terms를 추가하고 모든 페이지의 푸터에서 연결했다. 운영자 배박이김, 비공개 문의 weekendog2@gmail.com은 사용자가 직접 제공했다. 법인명/사업자 번호를 만들어 넣지 않았다.
- 개인정보처리방침은 코드로 확인한 OAuth·프로필 이미지·반려동물·로컬 저장·위치 사용에 맞춘 초안이다. 공개 운영 전 실제 보유 기간, 위탁 업체 계약, 로그/백업 삭제 주기, 저장 국가·국외 이전 사항을 확인해 확정해야 한다. 이를 페이지에 표시하고 검색 색인 제외 metadata를 적용했다. 인증 동의 UI나 계정 삭제 기능을 새로 구현한 것은 아니다.
- 참고: [개인정보 보호법 제30조 — 국가법령정보센터](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1020398435). 보유 기간·위탁·권리 행사 및 연락처 등 필수 항목을 검토했으며 법률상 적합성을 보증하지 않는다.
- Skills: PetPass project-context / UI-review / regression-check. Supabase 사용 흔적은 로컬 코드로만 확인했고 외부 DB에 접근하거나 쓰지 않았다.
- npm run verify: PASS (168파일/1,554개 단위 검사 포함). 사진 상세 조회 보완 후 npm run typecheck, npm run lint, npm run build 재실행 PASS.
- npm run test:e2e -- tests/e2e/homepage-v4.spec.ts: PASS 6개. 데스크톱/모바일에서 각각 17개 지역을 순회하며 사진 우선, 지역 변경, 푸터 정책 링크, 이메일 주소, 1292/390/320px 개인정보 문서 가로 넘침을 확인했다. 기존 검색·선택·일정 이동 및 320–1440px 홈 화면 검사도 통과했다.
- 초기 테스트 fixture가 default 응답에 허용되지 않는 cardDetails를 넣고 부산 전용 enrichment를 다른 지역에 사용해 실패했다. 실제 계약을 보존하고 기존 상세 API를 mock하는 테스트로 수정했다. readonly 튜플 테스트 타입 오류도 수정 후 typecheck를 통과했다.
- 실제 로컬 /terms: Playwright CLI 열기·스크린샷·콘솔 검사 PASS, Errors 0 / Warnings 0. 임시 브라우저 종료. 개인정보 문서의 데스크톱/모바일 스크린샷 직접 확인. 증거: verification-evidence/homepage-v4/privacy-{1292,390,320}.png 및 terms-desktop.png.
- next-env.d.ts는 Next.js 실행 시 dev/build 경로를 재생성하는 파일이다. 그 외 원본 프로젝트는 변경하지 않았다.
- 상태: 구현/관련 검사 PASS. 개인정보처리방침의 공개용 확정은 위 운영 설정 확인 전까지 미완료.
- commit / push / merge / production deployment / DB write: not performed.


## 2026-09-09 메인 지도 지역별 지연 로딩
- 작업 범위: ui_ver_4만 수정. 초기 전국 17개 스냅샷 다운로드/전체 장소 렌더링을 제거하고, 17개 시·도 표식과 지역 선택 목록을 표시한다.
- 지역 선택 또는 확대 후 지도 이동이 250ms 안정되면 한 지역의 core 스냅샷만 조회한다. 기존 취소·캐시·중복 제거 클라이언트를 재사용한다. 이전 지역 응답은 현재 화면을 덮어쓰지 않으며 축소 시 전국 표식으로 돌아간다.
- 데이터 갱신/검색 시 지도 재맞춤을 막고, 모바일에서 숨긴 지도에 대한 위치 변경은 다시 표시할 때 적용한다. 일정 선택은 지역 이동 후에도 보존한다.
- 변경 파일: components/home/homepage-nationwide-places.tsx, home-place-workbench.tsx; components/map/map-panel.tsx; lib/homepage/nationwide.ts; lib/kakao/maps.ts; app/homepage-v4.css 및 관련 회귀 테스트.
- Skills: petpass-project-context, petpass-ui-review, kakao-integrations, performance-optimization, regression-check; 기존 Frontend Design Premium/Product Design 방향 유지.
- PASS: npm run verify (168파일, 1,555개 단위 테스트, 타입/린트/프로덕션 빌드). 최종 숨김 지도 보완 후 npm run typecheck, npm run lint, npx vitest run tests/unit/kakao-integration.test.ts tests/unit/homepage-nationwide.test.ts (11개) 재통과.
- PASS: Playwright 데스크톱/모바일 18개 관련 시나리오: homepage-v4(6), homepage-photos(2), homepage-nationwide(4), homepage의 지역 필터(2), full-map-explorer의 캐시/미리보기(4). 초기 0요청/17표식, 지역별 조회, 실패/재시도, 재방문 캐시, 축소, 늦은 응답 무시, 사진 재시도, 선택/일정 이동을 확인했다. 기존 전체 E2E 모음은 실행하지 않았다.
- PASS: 실제 localhost 카카오 지도에서 초기 장소 스냅샷 0건/지역 표식 17개; 부산 선택 후 busan 요청 1건, 538개 지역 장소, 목록 첫 12행 표시. 실제 축소 복귀, 모바일 키보드 Enter 지역 선택 및 목록→지도 전환, 가로 넘침 없음 확인. 스크린샷: verification-evidence/homepage-v4/regional-desktop.png, regional-mobile.png, regional-mobile-map.png, regional-mobile-busan.png.
- 제한: 자동 지역 판별은 기존 영역 사각형과 중심점 기반이다. 행정 경계 근처에서는 지역 목록으로 직접 선택 가능. 초 단위 속도 향상률은 측정하지 않았으며 위 수치는 초기 요청/렌더링 작업량 비교다.
- 별도 확인: 실제 부산 사진 상세 /api/map/places/cards 요청에서 503이 발생했다. 지도/장소 목록은 정상이며 사진 재시도 UI는 mock 회귀 테스트 통과. 해당 API/공급자 계약은 이번 변경에서 수정하지 않았다.
- git diff --check PASS. commit/push/merge/deployment/DB write: 수행하지 않음.


## 2026-09-09 지도·목록 크기 확대
- ui_ver_4/app/homepage-v4.css만 스타일 수정: 지도와 목록 높이 480→600px, 데스크톱 지도:목록 비율 1.7:1→1.45:1, 사진 48→76px(모바일 44→64px), 장소명 13→16px, 주소 11→13px, 보조 정보 9→11px.
- 기존 PetPass UI-review/regression-check 적용. npm run typecheck / npm run lint / npm run build PASS. npx playwright test tests/e2e/homepage-v4.spec.ts PASS 6개(검색·선택·일정 이동, 320–1440px 반응형, 정책 링크). CSS 변경으로 별도 단위 테스트 SKIPPED.
- 실제 카카오 지도 1292px 화면에서 지도 높이600px, 사진76px 확인. 390px 목록의 확대 사진·한글 줄바꿈·스크롤을 직접 확인. 증거: verification-evidence/homepage-v4/larger-map-desktop.png, larger-list-mobile.png.
- API/지역 지연 로딩 변경 없음. commit/push/merge/deployment: 수행하지 않음.


## 2026-09-09 반려동물 뉴스·행사 API 카드
- ui_ver_4 작업: 제목을 반려동물 뉴스로 변경, 서버 네이버 뉴스 검색 API 결과 최대5개를 순서 번호·원문 링크·출처/제공일과 함께 표시. 기존 link_only 표시 경로 제거.
- 관광공사 행사 feed가 정상 empty일 때만 네이버 웹문서 검색으로 대체한다. 관광공사 오류는 빈 결과로 취급하지 않는다. 검색 결과에 명시된 연도 포함 날짜 범위로 진행 중/예정을 판별하고 취소·종료·날짜 불명확·복수 일정 결과는 제외한다. 원문 URL/검색 설명/조회시각과 네이버 검색 출처를 보존한다.
- 행사 카드는 이미지, 날짜 배지, 제목, 장소, 원문 링크를 표시한다. 관광공사 firstimage를 사용하며 네이버에서는 제목이 일치하는 이미지 검색의 pstatic HTTPS 썸네일만 관련 이미지로 표시한다. 이미지가 없거나 실패하면 달력 디자인을 사용하며 가짜 행사 사진은 넣지 않는다.
- 변경 파일: app/api/content/pet-news/route.ts, pet-events/route.ts; lib/naver/news.ts, search.ts, events.ts; lib/homepage/pet-content.ts; types/pet-content.ts; components/home/homepage-pet-content.tsx 및 module.css; 관련 unit/e2e 테스트.
- 기존 서버 검색 요청/오류 처리/TourRequestCache 재사용. 5분 process-local 캐시, 요청 병합, 실패60초/Retry-After 대기, 서버 전용 키. 사용자 임의 검색 쿼리는 Route Handler에서 거절한다.
- Skills: PetPass project-context / UI-review / tourism-service2 / regression-check. 기존 Frontend Design Premium/Product Design 참조 방향 유지.
- 공식 문서 확인: [NAVER API Hub 뉴스](https://api.ncloud-docs.com/docs/naver-api-hub-search-news), [웹문서](https://api.ncloud-docs.com/docs/naver-api-hub-search-webkr), [이미지](https://api.ncloud-docs.com/docs/naver-api-hub-search-image). 검색 API는 날짜/장소를 구조화된 행사 필드로 제공하지 않으므로 검색문서에 확인되는 값만 사용한다.
- PASS: npm run verify (typecheck/lint/170파일1,568개 unit tests/production build). 집중 unit 31개 PASS. npx playwright test tests/e2e/homepage-pet-content.spec.ts PASS12개: 1440/768/390/320px, 번호5개·카드1개, 출처, 사진 실패, 독립 로딩/empty/error, 외부링크·키보드 포커스. API 결과를 mock한 합성 테스트이며 실제 행사로 주장하지 않는다.
- PASS: git diff --check. Playwright CLI 실제 localhost 제목 변경 확인, 콘솔 Errors0/Warnings0. 레이아웃 증거 verification-evidence/homepage-content/synthetic-{1440,768,390,320}.png 직접 검토.
- NO-GO 실제 뉴스/검색행사 데이터: 기존 .env.local의 NAVER_API_HUB_ACCESS_KEY_ID / NAVER_API_HUB_SECRET_KEY가 존재하지만 웹문서 API는 HTTP401 반환. UI/API는 unavailable을 표시하며 실제 성공 데이터는 미검증이다. 사용자에게 유효한 키를 로컬 env에 설정하도록 요청한 상태. 키는 출력/기록하지 않았다.
- 한계: 날짜가 명확하지 않은 검색 결과는 표시되지 않으며 특정 행사의 존재/이미지 검색 성공을 보장하지 않는다. 배포 전 실키 인증 및 실제 검색 응답 확인 필요.
- commit/push/merge/deployment/DB write: 수행하지 않음.


## 2026-09-09 배포 요청 및 준비
- 사용자 명시 승인: 전체 작업 완료 후 ui_ver_4를 GitHub의 UI_VER_4 브랜치에 업로드하고 Vercel에 배포한다. 별도 승인 재요청 없이 완료 조건 충족 후 진행할 수 있다.
- GitHub origin은 pjh2558831-boop/PetPass, 로그인 확인 완료. 원격 UI_VER_4 브랜치는 조회 시 없음. 로컬 작업 브랜치 UI_VER_4 생성.
- Vercel 연결 프로젝트 pet-pass(prj_WCTSVmwQdn3VBtKsXFEDAHLcjXU7), Next.js/Node24, 기존 production READY 배포 및 weekendog.site 도메인 확인. 설치된 CLI는 없으나 Vercel 커넥터 읽기 연결 정상.
- 적용 Skills: petpass-vercel-release, vercel:deployments-cicd. 이전 npm run verify 및 관련 브라우저 검사는 PASS.
- 조건 미충족: 네이버 API401 문제로 실제 뉴스·검색 행사 연동 검증 미완료. 인증 해결 전 전체 작업 완료로 판단하지 않으며 commit/push/deployment 미실행. 키 값·.env.local·빌드/의존성/검증 산출물은 업로드 대상에서 제외한다.


## 2026-09-09 NAVER401 원인 확정 및 부분 복구
- 앞선 키 전체 오류 추정을 정정한다. 같은 저장 키로 API Hub news=200, image=200, webkr=401. webkr 원문 오류는 요청한 API는 이 Application에서 활성화되어 있지 않습니다. 기존 Developers endpoint의401은 API Hub 키와 인증 체계가 달라 발생한 진단 결과이며 앱은 올바른 Hub endpoint를 계속 사용한다. 키 교체는 하지 않았다.
- lib/naver/search.ts: 단일 blockedUntil을 API종류별 Map으로 변경하여 webkr401이 정상 news/image를 막지 않도록 수정. tests/unit/naver-events.test.ts에 분리 회귀 검사 추가.
- PASS: typecheck, lint, 관련 unit29개, build. 실제 localhost에서 pet-events unavailable 직후 pet-news ready/5개 확인.
- 적용 Skills: debugging-and-error-recovery, 기존 project-context 및 provider 규칙. 공식 NAVER API Hub 이관 가이드의 Application별 API등록/헤더 문서 확인.
- 남은 외부 설정: 웹문서 검색 API 활성화. Edge에 https://console.ncloud.com/ 접속했으나 https://auth.ncloud.com/login 으로 이동하여 로그인 대기. 사용자에게 해당 탭에서 로그인 요청. 인증정보를 읽거나 입력·노출하지 않았다. 탭은 다음 턴에 이어서 작업하도록 유지했다.
- GitHub UI_VER_4 업로드/Vercel 배포는 전체 작업 완료 조건 충족 전이므로 여전히 미실행.


## UI_VER_4 release verification — 2026-09-09
- NAVER 401 root cause confirmed: Webkr search was not enabled for WEEKENDOG. Enabled the existing application API; news and webkr both returned HTTP 200 without replacing credentials.
- Isolated retry cooldown by API kind so an unavailable web search cannot block news/image searches.
- Live event fallback returned a date-qualified pet fair. Restricted event relevance to titles and stopped venue extraction at field separators after observing unrelated trade-fair search results. Missing matching photos remain visibly represented by a calendar placeholder.
- PASS: npm run verify (typecheck, lint, 170 files / 1,570 unit tests, production build).
- PASS: 24 targeted Playwright cases across desktop/mobile: homepage-v4, homepage-nationwide, homepage-pet-content, homepage-photos. Regional overview requests 0 snapshots and shows 17 regions; selecting regions loads only those regions and caches revisits.
- NAVER server secret scope extended to Preview using the existing encrypted value; no secret values exposed or checked in.
- Release branch UI_VER_4; preview must be checked before production promotion. Previous production rollback: dpl_75dQwrmnJ6xmnet3uMqgXXBZxnJ4. No DB migrations. Privacy page remains a clearly labeled draft pending retention/transfer operating details.
