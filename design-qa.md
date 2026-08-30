# WEEKENDOG `ui_ver2` final design QA

## 1. Reference image

- Authoritative reference: `C:/Users/pjh25/Desktop/PetPass-ui-ver2/.codex-reference/weekendog-ui-reference.png` (948 × 1660).
- It is used only for hierarchy, density, spacing, alignment, section order, surfaces, and emphasis—not as product data.

## 2. Implementation screenshot

- Equivalent implementation: `verification-evidence/weekendog-ui-ver2/final/homepage-948x1660.png`.
- Same-state comparison: `verification-evidence/weekendog-ui-ver2/final/reference-vs-implementation-948x1660.png` (reference left, implementation right).
- Supporting catalog, planner, and schedule captures are in the same final evidence directory.

## 3. Viewports

- Homepage: 1440 × 1000, 948 × 1660, 1024 × 900, 768 × 1024, 390 × 844, 320 × 720.
- Catalog: 1440 × 1000, 1024 × 900, 390 × 844, 320 × 720.
- Planner steps 1–3: 1440 × 1000, 390 × 844, 320 × 720 each.
- Matched schedule: 1440 × 1000, 390 × 844, 320 × 720.

## 4. Stable UI states

- Homepage: 부산 전체, official and Kakao-candidate data ready, static hero, first official place selected, deterministic Kakao canvas.
- Catalog: 부산 전체, default categories, recommendation sort, first page, deterministic provider data and canvas.
- Planner: neutral step 1, completed pet data at step 2, confirmed departure and preferences at step 3.
- Schedule: successful provider-backed mocked recommendation with three stops and deterministic geometry.
- Loading, partial, empty, retry, map-failure, and reduced-motion states are covered by the complete Playwright suite.

## 5. Section comparison

| Reference element | Adopted/Omitted | Implementation evidence | Reason |
| --- | --- | --- | --- |
| Overlay or lightweight homepage header | Adopted | `components/layout/site-header.tsx`, `homepage-948x1660.png` | Lightweight over the hero; mobile menu below 900 px. |
| Static Busan hero image | Adopted | `components/home/hero-photo-carousel.tsx` | One preloaded image; no timer, autoplay, or carousel controls. |
| One strong hero CTA | Adopted | `components/home/hero-planner-launcher.tsx` | One filled `여행 만들기` action in the upper viewport. |
| Compact region utility bar | Adopted | `components/home/hero-planner-launcher.tsx` | Region and submit share one compact surface. |
| Three-step process | Adopted | `components/home/recommendation-process-section.tsx` | Flat numbered row instead of feature cards. |
| Example-course editorial layout | Adopted | `components/home/example-course-card.tsx` | One image-and-timeline editorial story. |
| Two-course layout | Omitted | `components/home/example-course-card.tsx` | The product has one truthful non-personalized example; duplication would add unsupported content. |
| Map/list workbench | Adopted | `components/home/homepage-live-experience.tsx`, `catalog-1440x1000.png` | Map and compact results share one bounded surface. |
| Selected-place tray | Adopted | `.homepage-selected-place` | Existing homepage selection is shown as one compact map overlay. |
| Result-row density | Adopted | `.homepage-workbench-row`, `.catalog-result-card` | Source, status, location, and actions stay compact without nested cards. |
| Supporting discovery row | Adopted | `components/home/official-place-carousel.tsx` | Data-driven cards follow the workbench; no fixed count is presented. |
| Trust strip | Adopted | `components/home/public-data-trust-card.tsx` | Explains verification principles without a fabricated score. |
| Partner logos | Adopted | `components/home/partner-brand-mark.tsx` | Uses local official assets without placeholders. |
| Contact/footer structure | Adopted | `components/home/contact-card.tsx`, `components/layout/site-footer.tsx` | Contact and safety copy close the page. |

The final density pass reduced desktop hero, process, and editorial heights so the workbench enters the 948 × 1660 comparison frame while retaining the real product's richer information.

## 6. Typography

- Existing Pretendard/system typography and deep-green hierarchy are preserved.
- Hero, process, editorial, workbench, and result headings step down consistently.
- Generic English eyebrow copy was removed from the homepage error state.

## 7. Spacing

- Desktop hero height, process padding, course image height, timeline padding, and lower spacing were tightened after the combined comparison.
- Header, launcher, editorial, workbench, and trust/footer share shell alignment.
- Mobile keeps document-flow hero content and touch-safe spacing.

## 8. Surfaces

- Ordinary content cards use radii at or below 12 px and no content shadow.
- Shadow is limited to floating/popover affordances.
- The workbench owns its border and internal scrolling; rows are not nested cards.
- `ui_ver2` tokens remain scoped; legacy global tokens were not broadly replaced.

## 9. Data truthfulness

- Counts, distances, times, retrieval dates, and verdicts remain provider or response derived.
- No reference-image number was copied into runtime UI and no trust score was invented.

## 10. Interaction fidelity

- Navigation, region choice, map/list, filters, row/marker selection, planner steps, alternatives, save, edit, and retry remain functional.
- `currentStep` is UI-only; existing form state preserves values when moving backward.
- No provider, request, map, recommendation, or persisted-flow owner was added or moved.

## 11. Loading/error fidelity

- Initial loading never shows `총 0곳` or simultaneous empty state.
- Public map failures use nontechnical copy and keep lists usable.
- Partial and retryable failures stay explicitly labeled; strict frontend audit findings are zero.

## 12. Responsive behavior

- Desktop navigation begins at 900 px; narrower layouts use the accessible menu.
- Mobile catalog owns list/map switching and no requested viewport widens the document.
- Lower content remains scrollable; the document scrollbar is not hidden.

## 13. Accessibility

- Landmarks, headings, labels, tabs, progress, status/alert regions, and focus-visible styles remain intact.
- Escape/focus restoration, current-step validation focus, reduced motion, and 320 px overflow are covered by Playwright.
- Server-owned forms declare `noValidate` while retaining their Zod validation.

## 14. P0 findings

- None.

## 15. P1 findings

- Resolved: the first combined comparison placed the workbench too low. The density pass now brings it into the 948 × 1660 frame and better matches the reference hierarchy.

## 16. P2 findings

- Resolved: three server-action forms did not declare the application validation owner.
- Resolved: one WebKit scrollbar override lacked its standards-based color property.
- Resolved: the homepage provider-error eyebrow used generic English copy.
- Resolved: nonessential `!important` declarations were removed; remaining uses enforce reduced motion or the native hidden contract.
- Resolved: the 948 px state used a mobile header; desktop navigation now remains visible from 900 px.

## 17. P3 findings

- No release polish remains. Deterministic evidence does not reproduce provider tiles; Preview map availability is verified separately and may depend on Kakao Preview-domain authorization.

final result: passed

---

# WEEKENDOG homepage annotation revision — design QA

- Source visual truth: in-app Browser annotations 1–12 from the 1403 × 986 homepage view, including the Comment 12 partner-strip reference (`browser-comment://comment-12/additional-reference`, 622 × 67 px conversation attachment).
- Implementation screenshots:
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-homepage-annotation-revision-2026-08-22/homepage-1403x986.png`
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-homepage-annotation-revision-2026-08-22/trust-strip-1403x986.png`
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-homepage-annotation-revision-2026-08-22/homepage-390x844.png`
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-homepage-annotation-revision-2026-08-22/trust-strip-390x844.png`
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-homepage-annotation-revision-2026-08-22/homepage-1403x986-fine-tune.png`
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-homepage-annotation-revision-2026-08-22/homepage-390x844-fine-tune.png`
- Viewports: desktop 1403 × 986 CSS px and mobile 390 × 844 CSS px; browser captures used device scale factor 1. The narrow 320 × 720 CSS px state was checked for overflow without a comparison capture.
- State: `/` with the live homepage snapshot ready, default 부산 전체 region, the official and Kakao candidate map filters active, and the default official place selected.

## Full-view comparison evidence

The desktop capture confirms the annotated hero and map composition before the final launcher alignment adjustment: the evidence badge and two future planner labels are absent; the single destination heading is enlarged; the former map summary, internal legend, and below-map layer panel are replaced by one functional filter panel; and the selected card remains inside the map while clearing the lower-right Kakao watermark. The final launcher geometry is guarded separately by the 1403 px browser test described in comparison item 6.

The mobile capture confirms the launcher returns to normal document flow rather than inheriting the desktop overlay offset. Browser measurement reported zero horizontal overflow at both 390 px and 320 px.

## Focused region comparison evidence

The Comment 12 reference uses a compact partner strip: a short trust statement on the left, a divider, and evenly spaced official marks without individual provider-card backgrounds. The desktop trust capture follows that structure with the three supported WEEKENDOG sources. The mobile capture intentionally stacks the introductory copy over the same three-mark row to preserve legibility. The supplied transparent 행정안전부 mark received a transparent-canvas-only trim so its visible scale matches 한국관광공사 and 카카오맵; its artwork, colors, and aspect ratio remain unchanged.

## Required fidelity surfaces

- Fonts and typography: existing Pretendard stack and WEEKENDOG weight hierarchy are preserved; the destination prompt is promoted to 15 px/900 and remains readable at 320 px.
- Spacing and layout rhythm: launcher padding and width are reduced; the desktop launcher aligns below the copy at the shell's left edge; mobile positioning resets; map overlays use consistent 24 px insets and the selected card clears the watermark.
- Colors and tokens: existing cream, forest green, white, border, shadow, and state colors are reused without introducing a new palette.
- Image quality and asset fidelity: existing hero photos and official local partner assets are used. No placeholder or code-drawn logo replaces a supplied mark.
- Copy and content: all four requested hero strings and both duplicate map labels are removed. Existing truthful source labels, counts, and provider-unavailable status remain available through the functional filter controls.

## Comparison history

1. P1 — the first mobile pass inherited the desktop `left: 44%` launcher offset and clipped the form. Fixed by resetting `left` and `bottom` at the tablet/mobile breakpoint; the revised 390 px capture has zero overflow.
2. P2 — the first partner-strip pass exposed excessive transparent canvas around the 행정안전부 signature, making it visibly smaller than the neighboring marks. Fixed with a 419 × 108 transparent-canvas-only display copy and verified in desktop/mobile trust captures.
3. P2 — the original carousel controls occupied the same lower image zone as the new launcher overlay. Fixed by moving desktop carousel controls and slide status to the top edge while retaining the existing mobile control position.
4. P2 — the previous map layer fieldset changed the map shell height and allowed the selected card to sit near the canvas boundary. Replacing it with the internal filter panel and setting a 70 px bottom inset keeps the selected card inside the canvas and above the watermark; the geometry assertion passes on desktop.
5. P2 — the follow-up desktop annotation requested a wider, more leftward launcher and a shorter partner strip. At 1403 px the launcher now measures exactly 550 px and begins 4.4 px before the hero media edge; the public-data card measures exactly 200 px. The 1024 px breakpoint keeps those fixed desktop dimensions, while the existing tablet/mobile rules restore full-width launcher flow and content-driven trust-card height. The measured horizontal overflow remains 0 px at 1403, 390, and 320 px.
6. P2 — the next annotation supersedes the partial image overlap from item 5: the 550 px desktop launcher now aligns exactly with the hero shell's left edge and sits below the copy block, fully outside the photo column. Tablet and mobile continue to use the existing document-flow launcher layout.

## Findings

No actionable P0, P1, or P2 differences remain. The launcher no longer covers the hero photograph on desktop, and the responsive launcher remains in normal document flow on tablet and mobile.

## Follow-up polish

- P3: if the hero copy length changes later, recheck the vertical gap above the launcher at 1024–1439 px.

final result: passed

---

# WEEKENDOG homepage map category dropdown — design QA

- User annotation: replace the homepage map's fixed provider-layer panel with the same place-category dropdown used by the full results explorer.
- Verified route: `http://localhost:3000/`.
- Viewports: 1915 × 1272, 390 × 844, and the 320 px overflow regression.

## Final behavior

- The compact `필터` trigger is anchored at the map's top-left on desktop and placed immediately above the map on mobile.
- The dropdown contains only the seven place categories: 관광지, 식당, 카페, 숙소, 쇼핑, 동물병원, 펫샵·용품점.
- 관광지·식당·카페·숙소 are selected by default. Draft choices do not change markers until `적용하기` is pressed.
- `초기화` restores the four default travel categories. Escape closes the dropdown and returns focus to the trigger; clicking outside also closes it.
- Provider identity remains truthful on markers, selected-place cards, and the map watermark; the removed provider controls are not recreated inside the dropdown.

## Responsive evidence

- Desktop measured trigger: 76 × 44 px. Dropdown: 380 × 447.9 px, fully contained within the 1280 px map shell with no horizontal document overflow.
- Mobile 390 px measured dropdown: 358.4 × 425.6 px with no horizontal document overflow.
- At 320 px the dropdown is 288 px wide, categories use one column, and document overflow remains zero.

## Findings

No actionable P0, P1, or P2 differences remain for the requested homepage dropdown revision.

final result: passed

---

# WEEKENDOG results category dropdown revision — design QA

- User annotation: remove the provider/source filter and replace the centered modal with an anchored dropdown.
- Verified route: `http://localhost:3000/results?tab=catalog&region=busan&page=50`.
- Viewports: 1403 × 986, 390 × 844, and the 320 px overflow regression.

## Superseded behavior

The earlier `results filter popup` modal specification is superseded by this revision. The filter no longer dims or blurs the page, no native `dialog` is mounted, and 한국관광공사/카카오맵 are no longer selectable provider filters. Provider markers remain present and truthfully identified in the map source legend.

## Final behavior

- The results-header `필터` button toggles a dropdown anchored below the button.
- The dropdown contains only the seven place-type controls, plus `초기화` and `적용하기`.
- Draft selections do not change results until `적용하기` is pressed.
- Escape returns focus to the trigger; clicking outside closes the dropdown.
- Desktop measured dropdown: 368.9 × 443.4 px with zero document overflow.
- Mobile 390 px measured dropdown: 349.6 × 425.6 px with zero document overflow.
- At 320 px, categories use one column and document overflow remains zero.

## Findings

No actionable P0, P1, or P2 differences remain for the requested revision.

final result: passed

---

# WEEKENDOG results filter popup — design QA

> Historical record only. The later `results category dropdown revision` above supersedes this centered modal and its provider controls.

- Source visual truth: `C:/Users/pjh25/Downloads/ChatGPT Image 2026년 8월 23일 오후 04_09_37.png` (1536 × 1024 px).
- Implementation screenshots:
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-results-filter-popup-2026-08-23/results-filter-1403x986.png`
  - `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-results-filter-popup-2026-08-23/results-filter-390x844.png`
- Combined comparison: `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-results-filter-popup-2026-08-23/reference-vs-implementation.png`.
- Viewports: desktop 1403 × 986 CSS px and mobile 390 × 844 CSS px, device scale factor 1. The desktop dialog measures 940 px wide; the mobile dialog measures 374.4 × 668.6 px with no document overflow.
- State: `/results?tab=catalog&region=busan&page=1`, 부산 전체, filter dialog open, both data providers and the four default travel categories selected.

## Full-view comparison evidence

The permanent map overlay was removed. The results-header `필터` control now opens a centered modal over the existing map and result cards. The dialog follows the reference sequence: provider source choices, divider, travel-place heading and guidance, four selected travel categories, three optional categories, then reset and apply actions. The live map, result pagination, and district controls remain visible behind a blurred dimmed backdrop.

## Focused region comparison evidence

The reference and implementation were combined into one comparison image. Both use two provider controls, four columns for the selected travel categories, category-colored icons, round check states, subdued unselected controls, and a separated action row. The implementation intentionally uses the project's official transparent 한국관광공사 and 카카오맵 assets and WEEKENDOG tokens. Live counts remain data-driven, so the captured values differ from the illustrative reference.

## Required fidelity surfaces

- Fonts and typography: the existing Pretendard stack, compact 24 px dialog title, 22 px travel-place heading, and 14–15 px control labels preserve the reference hierarchy within the product's denser results view.
- Spacing and layout rhythm: 34 px desktop body padding, 14 px provider gap, 12 px category gap, and a fixed footer create the same grouped rhythm while keeping all actions visible.
- Colors and tokens: WEEKENDOG forest green, soft selected background, neutral line, and existing category colors are reused.
- Image quality and asset fidelity: real local partner logo files and Lucide icons are used; no placeholder, emoji, or handcrafted SVG is introduced.
- Copy and content: `출처 (데이터 제공처)`, `여행 장소`, the supporting sentence, `초기화`, and `적용하기` follow the supplied reference. The bottom legend now labels the yellow provider as `카카오맵`.

## Comparison history

1. P2 — the first popup pass repeated provider names beside logo images whose artwork already contained those names. The duplicate text was removed and the logo/count grid was rebalanced.
2. P1 — opening the dialog directly from the click handler could lose the modal after a concurrent results rerender. Dialog visibility is now synchronized from React state, so pagination and repeated filter cycles remain stable.
3. P2 — the desktop grid would be too dense if carried unchanged to a narrow viewport. The mobile popup uses one provider column and two category columns; the measured 390 px state has no horizontal overflow.

## Findings

No actionable P0, P1, or P2 visual differences remain. Counts differ only because the implementation displays current provider data instead of the reference's illustrative values.

## Follow-up polish

- P3: if longer localized category names are introduced, recheck the 390 px two-column label wrapping.

final result: passed

---

# WEEKENDOG results category-panel redesign — design QA

> Historical record only. The later `results category dropdown revision` above supersedes this permanent map overlay.

- Source visual truth: Browser Comment 1 additional reference (`browser-comment://results-category-panel/comment-1/reference`, 964 × 510 px conversation attachment).
- Implementation screenshot: `C:/Users/pjh25/Desktop/펫패스/verification-evidence/weekendog-results-filter-redesign-2026-08-23/results-filter-1403x986.png`.
- Viewport: 1403 × 986 CSS px, device scale factor 1. The implemented panel measures 720 × 310 px within the existing map canvas.
- State: `/results?tab=catalog&region=busan&page=1`, 부산 전체, default travel categories selected, optional category counts not yet requested.

## Full-view comparison evidence

The reference's white category surface, red location cue, clear title/subtitle hierarchy, three-column button grid, circular selection states, category-colored icons, counts, rounded borders, and soft selected backgrounds are reproduced inside the existing map overlay. The unrelated right results column and live map remain in their established proportions. The duplicate right-side filter disclosure is absent, while the district selector is retained in the top toolbar so functionality is not lost.

## Focused region comparison evidence

The source and implementation were compared at the category-panel level. A focused review was required because icon tone, one-line category labels, check states, and counts are too small to judge from the full-page composition alone. The final 720 px panel keeps `펫샵·용품점` on one line and preserves three equal columns; unavailable optional counts intentionally render as `…` until that provider layer is requested.

## Required fidelity surfaces

- Fonts and typography: the existing Pretendard stack is retained; 22 px/900 title, 13 px supporting copy, and 14 px category labels reproduce the reference hierarchy without introducing a new font.
- Spacing and layout rhythm: 20 px panel padding, 12 px column gaps, 58 px controls, 18 px radii, and a 3-column grid match the reference density while fitting the existing map.
- Colors and visual tokens: WEEKENDOG white, forest-green selected state, neutral border, and shadow tokens remain intact; the reference's category-specific green, orange, brown, purple, red, and blue icon cues are added.
- Image quality and asset fidelity: the reference contains no raster imagery. All visible symbols use the installed Lucide icon library; no emoji, handcrafted SVG, CSS drawing, or placeholder asset is used.
- Copy and content: `여행 장소` and `반려견과 함께 방문 가능한 장소를 선택해보세요.` match the supplied reference. Existing truthful live counts and loading ellipses remain data-driven.

## Comparison history

1. P2 — the first 620 px implementation forced the longest category label onto two lines. The panel was widened to 720 px; the post-fix screenshot shows a stable one-line label and three equal columns.
2. P2 — removing the right filter disclosure initially risked removing district selection. The district selector was moved into the existing top toolbar and verified for Busan and Jeju states.
3. P2 — the original two visible fieldset labels and reset-button row differed from the compact reference. The categories now share one accessible fieldset with a screen-reader legend, while the visible panel presents only the requested heading, supporting copy, and category controls.

## Findings

No actionable P0, P1, or P2 differences remain. The optional category count ellipsis is an intentional live-data loading state rather than visual drift.

## Follow-up polish

- P3: if category names or localization become longer, revisit the 720 px desktop width and the 359 px single-column breakpoint.

final result: passed
