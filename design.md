# WEEKENDOG Homepage Design System

This document is the source of truth for the WEEKENDOG public homepage. The
finalized homepage reference image attached to the implementation task is the
authority for layout, composition, proportions, hierarchy, spacing, and mood.
It is not a source of truth for provider data, supported product features,
counts, ratings, popularity, regions, or pet-access claims.

## 1. Product identity

- **Public brand:** WEEKENDOG
- **Service category:** official-data-based pet travel discovery and itinerary
  planning
- **Core value:** verify places that can be visited with a pet, compare travel
  conditions, and create a natural itinerary using actual driving information
- **Tone:** friendly, trustworthy, calm, modern, outdoors-oriented, and clearly
  grounded in Korean travel
- **Avoid:** repeated AI language, AI-dashboard styling, glassmorphism, neon
  colors, excessive gradients, fake popularity or reviews, and unverified
  pet-friendly claims

The homepage must look like a real travel product rather than a technology
demonstration. Product value is expressed through official evidence, travel
conditions, real travel time, and practical itinerary planning.

## 2. Visual-reference interpretation

The reference is interpreted as this fixed section hierarchy:

1. Restrained header with mark, navigation, and account actions
2. Split hero with large travel message and dog/travel media
3. Compact trip-launcher card overlapping the hero on desktop
4. Large live map preview as the main product visual
5. Compact carousel of verified, officially sourced visitable places
6. Five-step “how WEEKENDOG creates a trip” process
7. Side-by-side editorial example course and emotional CTA
8. Side-by-side public-data trust and contact cards
9. Compact footer with real links only

The visual proportions use a wide centered container, warm ivory page,
white content surfaces, dark forest green, generous horizontal breathing room,
compact controls, rounded cards, restrained broad shadows, and a photography-
driven hero. The map is visually dominant; lower sections become progressively
smaller. Marketing sections must not become unnecessarily tall.

The reference’s unsupported data, colorful category markers, ratings, counts,
and nationwide suggestions are not copied. Existing source semantics and the
Busan MVP boundary take precedence.

## 3. Design tokens

### Color

| Role | Value |
| --- | --- |
| Page background | `#FAF8F3` |
| Primary dark green | `#0B503A` |
| Primary hover/deep | `#073F2E` |
| Primary soft | `#EAF4EC` |
| Primary border | `#C8DED0` |
| Main text | `#13201B` |
| Secondary text | `#5D6963` |
| Muted text | `#7E8883` |
| Card background | `#FFFFFF` |
| Soft section background | `#F4F7F2` |
| Border | `#E1E7E2` |
| Candidate yellow | `#F4C84A` |
| Warning orange | existing approved orange system |

Existing mint variables remain as compatibility aliases to the WEEKENDOG
green values. Shared aliases `--brand`, `--brand-deep`, `--brand-soft`,
`--surface-muted`, `--surface-sage`, `--orange-soft`, `--radius-card`,
`--radius-control`, `--shadow-button`, and `--shadow-card` must all resolve.

### Geometry and shadow

- Large section radius: `24px`
- Card radius: `18px`
- Control radius: `14px`
- Pill radius: `999px`
- Card shadow: `0 14px 40px rgba(11, 80, 58, 0.07)`
- Button shadow: `0 8px 20px rgba(11, 80, 58, 0.18)`
- Header height: `72px`
- Homepage/site content width: `1280px`
- Existing product page width may remain `1180px`
- Section spacing: `72px` desktop, `48px` tablet, `32px` mobile

### Typography

Use the existing Pretendard/Noto Sans KR Korean system stack; add no font
package.

- Hero: `64px` desktop, `46px` tablet, `34px` mobile; weight `900`;
  line-height `1.08`; tight Korean letter spacing
- Section heading: `30px` desktop, `26px` tablet, `24px` mobile; weight
  `850–900`; line-height `1.3`
- Body: `15–17px`; weight `400–600`; line-height `1.7`
- Supporting text: `12–14px`; line-height `1.55`
- Labels/buttons: `13–15px`; weight `700–850`

## 4. Responsive rules

### Desktop — 1440px reference, `>= 1024px`

- Split hero; copy and launcher on the left, approved dog/travel crop on the
  right.
- Launcher overlaps the hero’s lower edge without covering the headline.
- Map is full content width and approximately `420px` high.
- Carousel reserves roughly five card widths while rendering only the allowed
  records actually available.
- Five process steps appear in one connected row.
- Example/CTA and data/contact pairs appear side by side.

### Tablet — 768px, `768–1023px`

- Use the accessible mobile navigation to prevent crowding.
- Stack the hero and make the launcher full width with no overlap.
- Map remains full width and approximately `360px` high.
- Carousel shows about 2.5 cards; process steps wrap in ordered rows.
- Both lower two-column areas stack.

### Mobile — 390px, `<= 767px`

- Hero order is copy, direct primary action, image, compact launcher.
- No element may extend beyond the viewport; verify at both 390px and 320px.
- Map is approximately `300px` high. Summary and selected-place overlays move
  outside the canvas so map gestures and controls remain usable.
- Cards are approximately `78vw` and use snap scrolling.
- Process becomes a vertical timeline in numeric order.
- All lower cards stack; no sticky control covers content.
- Interactive targets are at least approximately `44px`.

## 5. Non-negotiable data-truth rules

### Counts and provider state

- Never hardcode place totals or category counts. Read them from the current
  visibility-joined Tourism catalog.
- During loading, show neutral skeletons and no numeric claim.
- On catalog failure, clear map data, counts, selected places, and cards and
  show an honest unavailable state with retry when appropriate.
- A successful empty result displays zero; an error never masquerades as zero.
- Production failures never fall back to fixtures or demo records.

### Regions

- Active homepage choices are limited to the Busan MVP: 부산 전체, 해운대구,
  수영구/광안리, 기장군, and 부산진구/서면, derived from region config.
- Nationwide or unsupported destinations are not active controls.
- Future coverage may only appear as an explicit 준비 중 state.

### Ratings, popularity, and access

- Display no stars, review counts, rankings, or “popular” labels without a
  sufficient canonical popularity result.
- The simple `동반 가능` badge requires both canonical
  `verdict === "allowed"` and `evaluationState === "complete"`.
- Conditional, unknown, not-allowed, partial, insufficient-evidence, and Kakao
  candidate records never receive that badge.
- If fewer than five eligible records exist, render fewer cards.
- Featured cards use current Korea Tourism Organization records only and show
  `한국관광공사` as their source.

## 6. Map-marker and source rules

- Korea Tourism Organization: dark-green pin with internal `공` glyph.
- Kakao Local discovery candidate: approved yellow pin with internal `K` glyph.
- Source is also communicated in marker accessible names, legends, and selected
  overlays; it never relies on color alone.
- Homepage uses only the official Tourism layer. It does not fetch or render a
  Kakao candidate layer and never presents a candidate as pet-friendly.
- Category differences belong in filters, labels, or cards; they do not replace
  provider-source color semantics.
- Reuse the single Kakao SDK loader with `services,clusterer`, clustering, and
  its existing marker fallback. Add no competing loader.
- Homepage draws no route polyline and invokes no directions or recommendation
  request.

## 7. Component architecture

`app/page.tsx` remains a small Server Component composition. Interactive client
boundaries are limited to state they actually own.

```text
Homepage
├─ SiteHeader
├─ WeekendoogHero
│  ├─ HeroCopy
│  ├─ HeroPlannerLauncher (client)
│  └─ HeroMedia
├─ HomepageLiveExperience (client)
│  ├─ HomepageMapPreview
│  │  ├─ AreaSummaryCard
│  │  ├─ MapPanel / canonical Kakao controller
│  │  └─ FeaturedPlaceOverlay
│  └─ OfficialPlaceCarousel
├─ RecommendationProcessSection
├─ ExampleCourseCard
├─ EmotionalCtaCard
├─ PublicDataTrustCard
├─ ContactCard
└─ SiteFooter
```

Reuse `PlannerStateProvider`, `MapPanel`, the canonical map controller/SDK
loader, `PlaceImage`, missing-image UI, category labels, region labels, and
existing detail URL conventions. Do not duplicate the planner, card evidence
logic, route optimizer, or map loader.

## 8. Interaction and navigation rules

### Header and footer

- 여행 만들기 → `/planner/pet`
- 장소 찾기 → `/results?tab=catalog`
- 추천 코스 → `/results?tab=recommendations`
- 커뮤니티, 마이페이지, 로그인, 회원가입 are focusable buttons with
  `aria-disabled="true"`, visible `준비 중`, and no `href`.
- Mobile menu retains Escape, outside-click, `aria-expanded`, and focus return.
- Footer contains only real planner, catalog, and itinerary links.

### Hero launcher

- Three compact summary labels are `어디로 떠날까요?`, `언제 갈까요?`, and
  `누구와 함께?`; only destination is an editable native select.
- Quick choices are labeled `빠른 지역 선택`, never “인기 검색”.
- Submit patches the existing `TravelPreferences` district and opens
  `/planner/pet`. 부산 전체 explicitly removes a previous district.
- It does not set a departure, confirm the form, or trigger generation.

### Map and places

- Map and `전체 보기` actions open `/results?tab=catalog`.
- Official cards open `/places/{contentId}` with `contentTypeId` when available.
- Selecting a marker updates the external place card. Unassessed map records
  use neutral `상세에서 동반 조건 확인` language.
- Carousel supports touch scrolling, visible previous/next buttons, and
  Left/Right/Home/End keyboard movement between card links.

### Future experiences

- Example-course detail and contact are intentional `준비 중` controls, not
  links or submit actions.
- No blank route is created for auth, community, profile, contact, or editorial
  course detail.

## 9. Final public copy

### Hero

```text
반려견과 함께,
어디로 떠나볼까요?

공식 반려동물 동반 정보를 확인하고,
이동시간과 여행 조건을 고려해
가장 자연스러운 하루를 만들어드려요.
```

### Places and process

- Places heading: `함께 갈 수 있는 장소`
- Process heading: `WEEKENDOG는 이렇게 여행을 만듭니다`
- `1. 공식 근거 확인` — 한국관광공사의 반려동물 동반 근거를 확인합니다.
- `2. 조건 비교` — 내 반려견의 크기, 동반 조건, 운영시간을 비교합니다.
- `3. 일정 구성` — 여행 스타일과 방문 시간을 고려해 일정을 구성합니다.
- `4. 실제 이동시간 반영` — 카카오 길찾기의 실제 이동시간으로 동선을
  비교합니다.
- `5. 최종 경로 검증` — 최종 경로를 다시 확인해 실행 가능한 일정을
  완성합니다.

### Example and CTA

- `WEEKENDOG PICK`
- `이번 주말 추천 예시 코스`
- `실제 개인화 결과가 아니며 장소·시간은 조건에 따라 달라집니다.`
- `우리 아이와의 완벽한 여행, 지금 시작해보세요!`
- Button: `여행 일정 만들기`

### Public data and contact

- Heading: `신뢰할 수 있는 공공데이터를 사용합니다`
- Sources: 한국관광공사 Tour API, Kakao Maps / Kakao Mobility, 행정안전부
  공공데이터
- Note: `공식 데이터를 중심으로 정보를 제공하며, 운영 여부와 현장
  조건은 변경될 수 있어 방문 전 추가 확인이 필요할 수 있습니다.`
- Contact heading: `문의가 필요하신가요?`
- Contact action: `문의하기 · 준비 중`

## 10. Asset and implementation limitations

- No approved WEEKENDOG logo or isolated dog photograph exists. Use the
  approved PawPrint mark and carefully cropped current dog illustration; report
  this limitation after implementation.
- Do not expose the old PetPass social image through WEEKENDOG metadata.
- No auth, community, profile, contact, or editorial course-detail route exists;
  these remain explicit preparation states.
- Live provider or Kakao configuration failures remain honest unavailable
  states and are never replaced by fixtures.
- Do not deploy as part of this implementation.
