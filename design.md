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

## Homepage Fine Revision — Photo Hero and Mixed-Source Catalog

This revision supersedes the homepage-only hero, map-height, provider-layer,
featured-card, and partner-mark rules above. Planner, recommendation, Tourism
assessment, storage, SDK-loader, and detail-page contracts remain unchanged.

### 1. Header separation

- The sticky header uses `#EDF4EF`, a `#D5E2D9` lower border, and a restrained
  `#0B503A` 3px top rule. Foreground is `#102019`.
- Desktop height is 72px and compact/mobile height is 64px. Existing real and
  future navigation semantics, mobile focus return, Escape handling, and
  preparation labels remain unchanged.

### 2. Photography-led hero

- The eleven supplied original dog photographs are the only hero media. They
  appear in attachment order through a typed manifest with Korean alternative
  text and per-breakpoint object positions. Screenshots, generated replacements,
  remote stock, and the legacy PetPass illustration are not hero sources.
- Desktop uses approximately 44% copy and 56% photography within a 500px media
  field. A warm-ivory-to-transparent horizontal gradient keeps the split soft
  without placing copy over complex photography.
- Tablet and mobile stack content. Mobile order is badge, heading, description,
  primary planner action/launcher, then photograph. The photograph uses a
  vertical warm-ivory gradient at its top edge.
- The first image is the sole eager/high-priority LCP image. Later images are
  mounted lazily as they become active; the current and outgoing frame overlap
  only during a 760ms crossfade so the carousel does not eagerly download all
  eleven assets.
- Autoplay advances every six seconds. It pauses while hover or keyboard focus
  is within the carousel and while the document is hidden. Previous/next
  controls, labelled dots, Left/Right/Home/End keyboard controls, and a quiet
  visual current-slide status are provided. Reduced motion disables autoplay
  and crossfade animation.

### 3. Revised vertical hierarchy

- Desktop hero media height: 500px. Tablet: 440px. Mobile: 330px.
- Desktop map height: 560px. Tablet: 460px. Mobile: 340px. The map is the
  strongest product/data surface directly after the hero.
- Launcher overlap must not obscure hero copy, carousel controls, or the map.

### 4. Provider-neutral homepage data

The homepage client reads one provider-neutral snapshot from
`GET /api/homepage/places`. The Route Handler composes the current Tourism
homepage catalog with the existing sanitized public Supabase RPC catalog. It
does not call Kakao Local, directions, itinerary generation, licensing,
recommendation, raw Supabase tables, or fixtures.

The snapshot contains only compact public markers, compact cards, dynamic
counts, and layer availability. Official Tourism failure remains the existing
typed homepage failure. A public-catalog failure is isolated: official map and
cards remain usable and the Kakao-backed layers display `카카오 장소 데이터
준비 중`. An unavailable layer has `count: null`; it must never be rendered as
zero.

Identical stored-public RPC reads share a 60-second server single-flight cache.
Only successful pages are retained; a rejection is evicted immediately so a
temporary catalog failure cannot poison later homepage requests. The browser
still receives one uncached provider-neutral snapshot per mount.

### 5. Map layers and claims

| Layer | Default | Marker | Source/status wording |
| --- | --- | --- | --- |
| Official Tourism | on | dark-green pin, `공` | `한국관광공사`; canonical assessment only |
| Kakao candidate | on | yellow pin, `K` | `카카오 검색 후보`; confirmation warning |
| Veterinary | off | red medical circle, `+` | `동물병원`; no 24-hour inference |
| Pet shop | off | purple square, `샵` | `펫샵·용품점` |

- Source remains explicit through icon/shape, Korean text, accessible labels,
  selected-place copy, and a compact legend; color is never the only cue.
- Each layer shows its own dynamic count. Coordinate omissions are disclosed
  separately. Stable provider-prefixed IDs are preserved and duplicate/invalid
  coordinates are filtered before clustering.
- The existing singleton Kakao SDK loader with `services,clusterer` is reused.
  The homepage renders no route polyline and makes no discovery/directions call.
- Only official records with canonical `allowed/complete` assessment may show
  `동반 가능`. Kakao candidates, hospitals, and shops never receive it.

### 6. Mixed-source place carousel

- Compact filters are exactly `전체`, `공식 장소`, `카카오 후보`, `동물병원`,
  and `펫샵`.
- `전체` contains official eligible cards plus Kakao travel candidates.
  Veterinary and pet-shop records appear only under their explicit filters.
- Official cards may use the provider image or the existing neutral fallback
  and link to the typed Tourism detail route. Kakao-backed records never use a
  scraped image; they use local category placeholders and an external Kakao
  place link when present.
- Candidate cards show their actual name, district/address, normalized category,
  candidate warning, and `카카오 검색 후보`. Hospital/shop cards show address,
  district, phone when present, and their accurate facility label. No rating,
  review, popularity, 24-hour, or pet-access claim is invented.
- Five cards are visible on desktop, about three on tablet, and 78–84vw on
  mobile. Native overflow, scroll snap, previous/next, and
  Left/Right/Home/End focus movement remain.

### 7. Public-data partner marks

- Partner artwork may be stored locally only when an official provider page
  offers a downloadable mark and its usage is sufficiently clear. Source URL,
  retrieval date, format, and usage note are recorded in
  `docs/partner-brand-assets.md`.
- When an official downloadable asset or usage permission is unclear, the
  existing neutral icon plus provider text remains. Unofficial logo files,
  hotlinked images, and improvised wordmarks are prohibited.
- Korea Tourism Organization, Kakao Maps/Mobility, and the Ministry of the
  Interior and Safety remain three equal cards with accurate role descriptions.

### 8. Responsive, accessibility, and performance acceptance

- Verify 1440, 768, 390, and 320 widths with no document or map-canvas overflow.
- All controls retain 44px targets, visible focus, Korean labels, logical
  headings, source text, and non-noisy live regions. Carousel controls expose
  the current position without announcing every autoplay change.
- Normal homepage mount makes one `/api/homepage/places` request, one canonical
  Kakao SDK request, and no generation, direction, discovery, live collection,
  remote-logo, or direct Supabase browser request.
- Performance checks cover HTML, snapshot response, LCP image, initially
  downloaded carousel images, map initialization/clustering, duplicate
  requests, and local image weights.

## Homepage Fine Tune — Hero Balance and Official Partner Logos

This focused refinement supersedes only the hero-copy/framing and public-data
partner-mark presentation above. The page hierarchy, carousel behavior, map
data, planner, discovery, and recommendation boundaries remain unchanged.

### 1. Hero copy and proportions

- Supporting copy is exactly `공식 반려동물 동반 정보와 이동 동선을 바탕으로`
  followed by `가장 자연스러운 하루 일정을 제안해드려요.`. It should read as
  two compact lines on desktop and wrap naturally on smaller screens.
- Desktop uses a 45% copy field and 55% photo field. The headline retains its
  existing size and visual priority; reclaimed copy height creates breathing
  room above the planner launcher.
- The photo remains `object-fit: cover`, but the narrower photo field and
  per-slide positions show slightly more surrounding scenery and reduce the
  perceived dog scale without letterboxing, distortion, or face cropping.
- The photo blend is a gradual warm-ivory overlay with multiple low-opacity
  transition stops. It must reach transparent softly, keep the photograph
  saturated, and avoid a visible white haze band or sharp vertical edge.
- Autoplay, crossfade timing, previous/next controls, indicators, hover/focus
  pause, page-visibility pause, lazy loading, and reduced-motion behavior do
  not change.

### 2. Official partner marks

- The user-provided Korea Tourism Organization and Ministry of the Interior
  and Safety horizontal signatures are stored locally as alpha PNGs. Only the
  white background is removed; the official artwork, typography, colors,
  dimensions, aspect ratio, and spacing remain unchanged.
  The existing approved local Kakao Map asset remains.
- Every card reserves the same 42px desktop logo area and a compact 36px mobile
  area. Artwork uses `object-fit: contain`, left alignment, original aspect
  ratio, and provider-specific maximum widths only to equalize visual weight.
- Cards have equal height, consistent padding, a fixed logo row, unified title
  and supporting-copy typography, and aligned whitespace.
- Final copy is `한국관광공사 Tour API` / `관광 장소와 반려동물 동반 정보`,
  `Kakao Maps / Kakao Mobility` / `지도 표시와 실제 이동시간`, and
  `행정안전부 공공데이터` / `확인 가능한 업종의 인허가 보조 정보`.
- Logos are local assets with no runtime hotlink. Their supplied provenance and
  repository filenames are recorded in `docs/partner-brand-assets.md`.

### 3. Responsive acceptance

- At 1440px the headline, two-line copy, launcher, and 55% photo field remain
  visually balanced with no overlap.
- At 768px, 390px, and 320px the existing stacked order remains; the top-edge
  photo blend replaces the desktop horizontal blend and the dog face stays in
  frame.
- Trust cards stack cleanly below the desktop three-column layout, keep logos
  legible, and introduce no horizontal overflow or layout shift.

## Full Map Explorer and Source-Aware Marker System

This section is the authoritative contract for the canonical full place
explorer at `/results?tab=catalog`. It supersedes earlier shared catalog-marker
visuals while preserving the homepage, Tourism evidence, planner,
recommendation, route-order marker, provider, and SDK-loader boundaries.

### 1. Full explorer layout

- Desktop uses the viewport below the 72px WEEKENDOG header and compact
  progress/toolbar area. The map occupies approximately 70–74% and the result
  panel 26–30%, with the panel constrained to roughly 360–460px. The map stays
  fixed inside the explorer; cards scroll internally and pagination remains in
  a stable footer.
- Tablet uses a map/list mode when a 60–65% map and 35–40% panel would make the
  result panel narrower than a readable card.
- Mobile never compresses map and cards side by side. It exposes labelled map
  and list modes, uses a map height of approximately 52–60dvh, keeps filters and
  controls reachable, and introduces no horizontal overflow at 390px or 320px.
- `지도 크게 보기` and equivalent catalog actions use the existing canonical
  `/results?tab=catalog` route. No competing map route is added.

### 2. Collection and viewport contract

The explorer derives three named collections:

```text
filteredPlaces = every unique, public, coordinate-valid place that passes the
                 district, category, source, and committed search-scope rules
mapPlaces      = all places from filteredPlaces rendered on the map
pagedPlaces    = the current 12-place sidebar slice
```

Changing a page never changes `mapPlaces`. A real district, category, source,
or committed-bounds change updates map and cards together. Invalid coordinates
and duplicate stable provider IDs create neither a card nor a marker. Counts
are dynamic and disclose `카드는 페이지당 12개 · 지도는 현재 필터의 전체 결과`.

Map movement is provisional. The first settled viewport establishes a
baseline. Later user zoom or pan sets `viewportDirty` and reveals `이 지역 검색
다시하기`, but keeps the active dataset, cards, markers, and selection. Only
that explicit action commits the latest rectangle, resets the sidebar to page
1, and recalculates the three collections. Programmatic fit/pan operations and
meaningfully unchanged rectangles do not dirty the scope or create requests.
Resetting district/category filters intentionally clears a committed rectangle.

### 3. Four local source pins

All shared catalog maps use four transparent, equal-geometry local SVG assets:

| Source | Asset | Color | Inner meaning | Accessible wording |
| --- | --- | --- | --- | --- |
| Tourism official | `/map-pins/tourism-official.svg` | deep green | official medal/badge | 한국관광공사 장소 |
| Kakao candidate | `/map-pins/kakao-candidate.svg` | warm yellow | neutral location pin | 카카오 검색 후보 |
| Veterinary | `/map-pins/veterinary.svg` | coral red | medical cross and paw | 동물병원 |
| Pet shop | `/map-pins/pet-shop.svg` | deep purple | storefront and paw | 펫샵·용품점 |

The pins contain no emoji, remote URL, or Kakao corporate logo. Shape, icon,
Korean source text, and control labels communicate identity in addition to
color. Homepage and full explorer share the assets. Itinerary results retain
numbered route-order markers because route sequence has priority there.

### 4. Canonical marker and cluster lifecycle

- One map instance owns exactly one `MarkerClusterer` and one
  `Map<string, SourceMarkerRecord>`.
- One stable place ID owns exactly one visible `kakao.maps.Marker`. That same
  object is the clusterer member and the selected marker.
- Selection swaps the marker's source-preserving `MarkerImage` to an image
  approximately 10% larger and raises its z-index. It never adds a halo, pulse,
  radar ring, concentric circle, or second marker.
- A `CustomOverlay` may show selected-place information, but it is not a pin
  and is never clustered. Existing non-clustered itinerary controls may remain
  custom overlays.
- On data/filter replacement, diff the registry, detach obsolete listeners and
  markers, create or update required records, then call `clusterer.clear()`,
  `addMarkers(activeMarkers)`, and `redraw()`. Reuse the same map, clusterer, and
  unchanged marker objects.
- `zoom_changed`, `bounds_changed`, `dragend`, and `idle` never clear the
  registry or mutate `mapPlaces`. Kakao's clusterer alone decomposes neutral
  numbered clusters into the four visible source pins.
- Clusters are neutral dark gray-green circles with centered numbers. They use
  no provider glyph, source color, medal, halo, pulse, radar, or concentric
  ring.

### 5. Explorer controls and result truth

- The compact source toolbar is `전체`, `관광공사`, `Kakao 여행 후보`,
  `동물병원`, `펫샵`; all four layers are enabled on first visit. Every control
  includes its source icon, label, and `aria-pressed` state.
- The sidebar shows a dynamic `총 X곳`, a sort selector, an accessible filter
  control, any active-filter summary, 12 readable cards, and stable pagination.
- Tourism cards show the provider image or neutral fallback, source, actual
  available assessment wording, title, address, category, and typed detail
  action. Only a canonical `allowed/complete` assessment may say `동반 가능`.
- Kakao travel records say `카카오 검색 후보` and `동반 여부 확인 필요`.
  Veterinary and pet-shop records say respectively `동물병원` or
  `펫샵·용품점`, plus `반려동물 편의시설`; neither implies pet access or
  24-hour operation.
- Selecting a card selects the same marker and pans only when required.
  Selecting a marker moves to its sidebar page, scrolls the card into view, and
  updates the information overlay without a selection loop.

### 6. Performance, accessibility, and regression rules

- Render all coordinate-valid filtered records as compact SDK markers; do not
  silently cap the map. Render only 12 DOM cards at once.
- Reuse markers and the single clusterer across page changes, selection,
  rerenders, pan, and zoom. Full provider collection, recommendation generation,
  Kakao discovery, and directions are outside the explorer render path.
- Source controls, map/list modes, pagination, cards, and filters retain visible
  focus and approximately 44px targets. Map state and errors use concise Korean
  live-region wording without noisy movement announcements.
- The singleton Kakao SDK URL remains the only loader and retains
  `services,clusterer`. Server-only provider and Supabase secrets never enter
  client code or public DTOs. Homepage shared pins and itinerary numbered
  markers remain regression requirements.

## Category-First Explorer, Optional Facilities, Ranking, and Image Fallbacks

This section supersedes the source-first controls and source-order sorting in
the full catalog explorer. It does not alter Tourism-only automatic itinerary
eligibility or the Stage 1–5 route engine.

### 1. Canonical category contract

One provider-neutral mapper owns the seven visible categories used by URL
state, controls, counts, cards, maps, ranking, and image placeholders:

| Key | Label | Canonical inputs |
| --- | --- | --- |
| `attraction` | 관광지 | Tourism 12/14/15/28; Kakao attraction, park/walk, leisure, camping |
| `food` | 식당 | Tourism 39 unless canonical metadata explicitly identifies a café; Kakao food |
| `cafe` | 카페 | Kakao café; only explicitly identified Tourism cafés |
| `accommodation` | 숙소 | Tourism 32; Kakao accommodation |
| `shopping` | 쇼핑 | Tourism 38; ordinary Kakao shopping records |
| `veterinary` | 동물병원 | canonical veterinary records only |
| `pet_shop` | 펫샵·용품점 | canonical pet-shop records only |

Title guessing never turns a Tourism restaurant into a café. `pet_shop` is
never merged into ordinary shopping. Records outside the initial view remain
stored, public, reviewable, and immediately available to filters.

### 2. Category-first state and controls

- A fresh explorer enables exactly 관광지, 식당, 카페, 숙소. 쇼핑,
  동물병원, and 펫샵·용품점 remain available but start disabled.
- The primary controls are grouped under `여행 장소` and `추가로 보기`.
  Every toggle has a label, check state, count where space permits,
  `aria-pressed`, and a 44px target. State is restored through the catalog URL.
- `전체` enables all seven categories. `기본으로` restores the initial four;
  initial state is therefore not the same as all.
- The map indicator reads `부산 반려동물 장소` and `현재 표시 X곳`. The
  count reflects active categories, district, enabled source rules, and the
  committed map rectangle. Pagination alone never changes it.
- Category changes update `filteredPlaces`, all coordinate-valid
  `mapPlaces`, the 12-card page, counts, and selection together. They never
  mutate remote visibility, review state, stale state, or stored records.
- Source identity remains informational through green Tourism, yellow Kakao,
  red veterinary, and purple pet-shop pins, card badges, overlays, and a
  compact labelled legend. Source is not a primary filter task or ranking key.

### 3. Kakao compact-query delta

- Registry `kakao-busan-query-registry-v2` preserves V1 and contains only the
  missing compact variants `부산 {구군} 반려동물동반 카페` (`CE7`) and
  `부산 {구군} 반려동물동반 식당` (`FD6`) for the 16 Busan districts: at
  most 32 unique queries.
- The V2 operation is always an append/update delta. It validates address and
  coordinates, upserts by Kakao place ID, accumulates query-hit provenance,
  and preserves confirmation, rejection, reviewer, and note fields. It never
  performs absent-record reconciliation, makes unrelated rows stale, deletes
  records, or admits candidates to automatic routes.
- Collection uses pages of 15 from page 1 until `is_end`, at most three pages,
  concurrency 2–3, bounded retry/backoff, and a strict physical cap just above
  the 96-request normal maximum. Apply requires the existing ignored NDJSON
  backup and SHA-256 manifest, followed by plan, dry run, inspection, delta
  apply, and a repeat-run idempotency check.

### 4. Discovery sorting

The selector exposes exactly `추천순` and `인기도순`; recommendation is the
default. `catalog-recommendation-v1` returns a deterministic integer 0–1000:

```text
0.30 categoryAndFilterFit
+ 0.25 petEvidenceConfidence
+ 0.15 proximity
+ 0.10 dataCompleteness
+ 0.10 freshness
+ 0.10 discoveryStrength
```

Every component is bounded to `[0,1]`. The score is discovery ordering only
and never changes the displayed access verdict. Kakao candidates retain low,
unverified evidence; facilities gain category relevance only while enabled.
Proximity uses selected location, then committed map center, then district
center. Completeness rewards only real metadata and an actual provider or
approved image. Freshness uses provider/collection/review timestamps. Kakao
discovery strength uses bounded distinct query hits and query/category
agreement; other sources use a documented neutral prior.

Recommendation ties resolve by score descending, evidence descending,
distance ascending when known, normalized Korean name, then stable provider
place ID. `인기도순` uses first-party `popularity-v1` only: sufficient rows
first by popularity then recommendation; insufficient rows remain in
recommendation order. If every visible row is insufficient, show `이용 데이터가
쌓이는 동안 추천순을 함께 반영합니다.` and never invent a popularity badge or
external review signal.

### 5. Typed image truth

Cards consume an explicit `PlaceCardImage`: provider photo, approved upload,
static map, or category placeholder. They never infer provenance from URL text.

1. A valid canonical Tourism image is a provider photo; load failure advances
   to the next truthful fallback.
2. An approved upload is used only with recorded administrator, owner, or
   licensed-asset provenance. Arbitrary database URLs are not approval.
3. A Kakao location preview is optional, server generated for a known place ID,
   labelled `위치 미리보기`, and controlled only by the server flag
   `KAKAO_STATIC_MAP_THUMBNAILS_ENABLED`. It may be enabled only after a
   bounded official API/configuration test. Failure falls through safely.
4. A local polished category illustration is the universal fallback and says
   `장소 사진 준비 중`; it is not a broken-image panel or venue photograph.

No implementation scrapes or hotlinks Kakao place pages, galleries, Naver,
blogs, or search results. A future thumbnail handler, when enabled, accepts a
known ID rather than arbitrary URLs or coordinates, fixes dimensions and one
marker, rate-limits requests, keeps credentials server-side, and uses
`max-age=86400, s-maxage=604800, stale-while-revalidate=2592000`.

### 6. Responsive and regression acceptance

- Desktop keeps the category summary over the map and the scrollable 12-card
  panel. Tablet/mobile move dense controls outside the canvas and provide
  map/list modes without horizontal overflow at 390px or 320px.
- Sort and pagination never rebuild or reduce `mapPlaces`; selected places are
  preserved whenever still visible. Marker/card synchronization, the single
  clusterer, and the singleton Kakao `services,clusterer` loader remain intact.
- Normal tests use deterministic fixtures only. Browser verification covers
  all/default category actions, every optional category, both sort modes,
  truthful image fallbacks, source labels, pagination, and responsive layouts.
