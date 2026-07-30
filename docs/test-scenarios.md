# Test scenarios

## Automated unit scenarios

- Core schemas accept the complete demo profile, places, and itinerary.
- Unknown access statuses and invalid coordinates are rejected.
- Versioned localStorage round-trips valid values.
- Corrupted or unsupported storage is removed safely.
- Ambiguous access text remains `NEEDS_CONFIRMATION`.
- Missing explicitly required equipment produces `NOT_MATCHED`.
- Assessment restrictions remain identical to source-derived policy restrictions.
- License matching requires both normalized business name and compatible address.

## Critical browser flow

1. Open the landing page.
2. Start the Busan demo planner.
3. Name a small dog and keep carrier and leash selected.
4. Save the profile and choose the default day-trip preferences.
5. Verify the result summary uses the saved name.
6. Save the recommended route as a draft.
7. Open the itinerary and replace the ambiguous cafe.
8. Verify the replacement persists in the UI.
9. Open a place detail and verify status, original source text, and demo labeling.

Run this flow in desktop and mobile Chromium projects.

## Manual integration scenarios for the next phase

- Missing Tourism API key returns a visible configuration state, not fixtures.
- Malformed Tourism API JSON is rejected before normalization.
- Kakao timeouts offer retry without losing the planner inputs.
- A license `NO_MATCH` explanation never claims illegality.
- Closed-day or missing-hours data changes or warns the schedule.
