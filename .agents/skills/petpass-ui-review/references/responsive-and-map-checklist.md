# Responsive and map review checklist

## Viewports and structure

- Desktop around 1440 px: hierarchy, content width, map/sidebar ratio, card density, sticky/fixed elements.
- Tablet around 768 px: reflow, navigation, filters, map height, scrolling ownership.
- Mobile around 390 px and narrow 320 px: no horizontal overflow, reachable controls, readable cards, safe-area and fixed navigation spacing.
- Interactive controls should provide an approximately 44 px touch target where practical.

## Required data states

- Initial loading and progressive loading
- Empty results and no filtered matches
- Provider or Route Handler error
- Partial/missing images or optional metadata
- Verification-required pet evidence
- Normal populated state

## Map interaction

- SDK initializes once without console errors.
- Markers represent the current filtered result set and clustering remains correct when enabled.
- Marker selection, card selection, and sidebar state remain synchronized.
- Selected place remains understandable after filters, pagination, bounds changes, and responsive reflow.
- Keyboard and touch users can reach equivalent place details.
- Map controls do not overlap navigation, cards, or safe areas.

Record which viewports and states were actually checked; do not claim visual verification from source inspection alone.
