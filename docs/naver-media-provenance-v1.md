# 장소 사진 검토 v1

검색 이미지는 장소 사진이나 사용 허가가 아니다. 현재 패치는 사진을 다운로드·업로드·게시하지 않는다.
기존 `resolvePlaceCardImage`의 제공 사진 → 승인 사진 → 위치 지도 → 카테고리 대체 표시 순서를 보존한다.

## 로컬 운영자 절차

1. 독립적으로 허가받은 자료와 권리 문서를 공개 폴더·Git 밖에 보관한다. OS 사용자 계정과 파일 접근 권한으로 운영자 접근을 제한한다. 공개 관리자 HTTP 경로나 새로운 인증 체계는 만들지 않는다.
2. 아래 manifest를 작성하고 실제 카탈로그의 `tour:`/`kakao:` ID 및 정확한 지점·사진을 대조한다. 검토자 이름 입력은 인증이나 증거 진위 확인을 대신하지 않는다.
3. `npm run media:review -- <로컬 manifest.json>`을 실행한다. 로컬 파일 최대 1MB, 최대 1,000개 항목만 검사한다. 결과는 항목 인덱스·사유 코드·적격 수만 출력한다.
4. identity/rights/quality가 모두 approved이고 유효한 권리 근거·표시/저장/호스팅 권한이 있어야 적격이다. 변형에는 별도 권한이 필요하다. 만료·철회·미래 검토 시각은 적격이 아니다.
5. 적격 판정은 게시가 아니다. 향후 게시 전 운영자가 원본 증거, 파일 안전성, 정확한 지점, 공개 대상 여부를 확인하고 대상 환경의 업로드 승인을 받아야 한다. 게시 후 철회·만료 시 자산/최적화 캐시/파생본 제거 절차도 먼저 확정한다.

```json
{
  "version": 1,
  "entries": [{
    "placeId": "kakao:실제등록ID",
    "role": "venue_photo",
    "sourceReference": "독립적으로 제공받은 원본의 보관 참조",
    "rightsholder": "실제 권리자",
    "licenseReference": "서명된 허가 문서의 보관 참조",
    "assetVersion": "변경 불가능한 자산 버전 참조",
    "identityReview": "pending",
    "rightsReview": "pending",
    "qualityReview": "pending",
    "reviewedBy": "검토 운영자",
    "reviewedAt": "2026-09-09T00:00:00Z",
    "attribution": "권리자가 요구한 공개 표기 또는 표기 불필요 근거",
    "permittedTransformations": ["none"],
    "allowedUses": [],
    "expiresAt": null,
    "revokedAt": null,
    "revocationConditions": "실제 허가서의 철회 조건"
  }]
}
```

`null` 만료는 허가서에 기한 제한이 없음을 확인했을 때만 사용한다. pending/rejected 항목은 비적격이며 명령은 종료 코드 1을 반환한다. manifest·권리자·비공개 계약 참조를 공개 DTO에 넣지 않는다. 기존 `approvedImageUrl`은 표시 경계일 뿐 권리 관리 저장소가 아니므로 이번 검증기를 자동으로 연결하지 않는다. 새 Storage bucket·RLS·테이블·이미지 allowlist·프록시는 없다.
