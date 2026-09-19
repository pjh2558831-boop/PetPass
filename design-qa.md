**Design QA**

- Source visual truth: user-attached homepage map/list reference image in the current task (1536 × 1024 px).
- Implementation evidence: Codex in-app browser tab 2, `http://localhost:3000/#home-discovery`.
- Viewports: desktop 1292 × 986 CSS px; mobile 390 × 844 CSS px; device scale factor 1.
- State: nationwide overview, then Seoul selected/loading-error state; list and map mobile switch visible.
- Full-view comparison: matched the reference hierarchy with heading/search above a single bordered workspace, persistent region rail, map/list split, and a selected-place tray structure.
- Focused-region comparison: checked the workspace header, region rail, map/list proportions, list header, and mobile region navigation. No separate asset comparison was needed because the implementation reuses the existing Kakao map and provider place images.

**Findings**

- Typography: heading weight, scale, and navy hierarchy match the reference direction; Korean wrapping remains readable on desktop and mobile.
- Spacing/layout: desktop uses the reference three-column rail/map/list composition. Mobile keeps the map/list switch and converts the region rail to a horizontal strip.
- Colors/tokens: existing WEEKENDOG green, navy text, pale controls, borders, and radii are reused consistently.
- Image quality: existing Kakao map tiles and provider-backed place images are preserved; no placeholder art or custom SVG replacement was introduced.
- Copy/content: heading and guidance follow the reference; live counts and provider-derived place content remain truthful.
- No actionable P0/P1/P2 visual mismatch remains within the existing data and map constraints.

**Comparison history**

1. Initial mobile capture showed only the region rail scrollbar because the grid row had no reserved height.
2. Fixed the mobile workspace to reserve a 54 px region row and a 446 px content row.
3. Post-fix capture shows the horizontal region buttons above the list with no overlap or clipping.

**Verification**

- Primary interactions: nationwide overview rendered; Seoul region selection updated the active rail state, map viewport, list heading, and URL targets.
- Console errors: none.
- Network: local provider requests may show the existing visible retry state when external data is unavailable; the UI remains usable.

**Follow-up Polish**

- P3: replace the compact shared region glyph with distinct region pictograms if a dedicated icon set is supplied.

final result: passed
