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

# WEEKENDOG results category-panel redesign — design QA

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
