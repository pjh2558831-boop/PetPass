# NAVER 장소 연동 정책 v1

확인일: 2026-09-09. 선택 모드: **external_link_only**. 별도 계약·서면 승인은 없음.
API 명세는 이용권 허가서가 아니다. 아래 미확인은 금지 확정을 뜻하지 않는다.

## 공식 근거와 적용 시점

- [Local API](https://api.ncloud-docs.com/docs/naver-api-hub-search-local): `/search/v1/local`, display 1–5, start 1, random은 정확도순. telephone은 미반환 호환 필드이고 좌표는 WGS84로 설명되지만 이 패치에서 변환·대조하지 않는다.
- [Image API](https://api.ncloud-docs.com/docs/naver-api-hub-search-image): `/search/v1/image`; link는 이미지 URL이며 출처 문서·저작권·지점 확인 정보가 아니다.
- [Application](https://guide.ncloud-docs.com/docs/apihub-application): Application Client ID/Secret을 발급하고 API별 권한을 선택한다.
- [서비스 개요](https://guide.ncloud-docs.com/docs/apihub-overview), [API 개요](https://api.ncloud-docs.com/docs/naver-api-hub-overview).
- [개정 공지](https://www.ncloud.com/support/notice/all/2243): 공지 제목에서 2026-09-20 시행 확인. 현행·개정 약관 전문을 확보하지 못했으므로 개정 후 허용 여부도 미확인이다. 레거시 Developers 약관으로 대체하지 않는다.

## 행위별 결정

| 행위 | 권한 판정 | 근거·시행일 | 제약과 구현 결정 |
| --- | --- | --- | --- |
| 1. 요청 시 Local 결과 내장 표시 | 미확인 | Local 명세, 현행/9월 20일 약관 전문 미확보 | API 호출 없이 외부 검색 링크 |
| 2. 요청 시 Image 결과 내장 표시 | 미확인 | Image 명세, 동일 | 썸네일도 조회하지 않음 |
| 3. 등록 장소 자동 검색 | 미확인 | API 개요·Application, 동일 | 전국 집계는 기존 DB 읽기만 수행 |
| 4. 기존 장소와 결과 대조 | 미확인 | 현행/개정 이용 조건 미확보 | 파생 match·점수 생성 안 함 |
| 5. 결과·대조 결과 영구 저장 | 미확인 | 동일 | DB·로그·fixture 저장 없음 |
| 6. 캐시 목적·보존·삭제 | 미확인 | 동일 | 결과 캐시 없음; 임의 TTL 없음 |
| 7. 재정렬·필터·타 공급자 결합 | 미확인 | Local/Image 명세는 순서 파라미터만 설명 | 혼합 카탈로그 편입 없음 |
| 8. 이미지 표시·프록시·다운로드·호스팅 | 미확인 | Image 명세는 이미지 URL만 제공 | 이미지 프록시·최적화·다운로드 없음 |
| 9. 출처 표시·원문 링크 조건 | 미확인 | 현행/개정 이용 조건 미확보 | 외부 이동임을 표시; 이미지 URL을 출처 페이지로 꾸미지 않음 |
| 10. 추천·인기도·AI·분석 사용 | 미확인 | 동일 | 기존 점수·평가에 NAVER 데이터 사용 없음 |
| 11. 상업 이용·인접 광고 | 미확인 | 서비스 개요가 개별 콘텐츠 이용권을 보장하지 않음 | 검색 결과·광고 결합 기능 없음 |

현재 허용된 작업은 사용자 승인 범위의 로컬 코드·기존 카탈로그 읽기·일반 외부 링크 제공이다. NAVER 페이지를 수집하지 않는다. 사용권을 확보해도 자동으로 모드가 바뀌지 않는다. 다른 모드의 구현은 해당 행위의 근거·시행일·캐시/삭제/출처 조건을 확정한 후 별도 코드 검토로 진행한다.

## 인증·예산

공식 API HUB origin은 `https://naverapihub.apigw.ntruss.com`이고 인증 헤더는 `X-NCP-APIGW-API-KEY-ID`와 `X-NCP-APIGW-API-KEY`이다. Ncloud 계정 관리 키로 대체하지 않는다.

로컬에서 `NAVER_API_HUB_ACCESS_KEY_ID`/`NAVER_API_HUB_SECRET_KEY` 존재 여부만 확인했다. `NAVER_API_HUB_CLIENT_ID`/`NAVER_API_HUB_CLIENT_SECRET`는 없다. 값·길이·해시·헤더를 출력하지 않았고, 이름으로 실제 자격 증명 종류를 판정하지 않았다. 기존 값이나 설정을 변경하지 않았다. Local/Image 인증 및 API별 권한 검사는 각각 SKIPPED(외부 링크 모드). 뉴스 권한을 추정하지 않는다.

현재 NAVER 호출 예산 0. 향후 허용된 배치의 기본 최대치는 Local `2N`, Image `N`, 별도 재시도 `R`로 총 `3N+R`. 실제 콘솔 한도·가격·잔여량·뉴스 등 기존 사용 예약분을 확인하기 전 실행하지 않는다. 일/월 한도가 다르게 기술된 공개 문서를 고정 운영 한도로 사용하지 않는다.

허용된 최초 라이브 실행은 Local/Image 각 1회 smoke를 포함해 총 물리 요청 80회 이하, 실제 등록 장소 최대 20개, 동시성 최대 2, 약 8초 timeout. 401/403·한도 소진 즉시 중단하며 인증 추측 재시도 금지. 영구 저장·원격 apply에는 사용권, API 권한, 장소 ID 목록, 요청 예산, 대상 환경, 그 환경의 쓰기 승인이 모두 필요하다.
