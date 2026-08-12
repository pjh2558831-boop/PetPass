# Recommendation Result UI V1

## Product flow before Stage 5

The combined form populated legacy itinerary-generation fields. The results
surface compared up to three composer strategies and linked a selected strategy
to a separate detailed itinerary page. The composer did not consume the Stage 3
matrix or Stage 4 optimizer. Old draft persistence stored that legacy itinerary
shape in versioned local storage.

## Stage 5 result surface

The existing combined form remains the only submission surface. Place-name and
map departure selection preserve their source, pace maps exactly to
`relaxed|balanced|packed`, overnight requires accommodation, and no legacy count
or duration is sent.

The result header shows departure, date, expected start/end, pace, stop count,
final distance, final driving time, visit time, and wait time. Exact and
time-limited results use different truthful wording. When matrix and final route
temporal bases differ, the UI says that ordering used the comparison matrix and
displayed times/geometry came from final Kakao validation; it never calls a
traffic-independent matrix real-time traffic.

Each chronological stop exposes a Korean category, Korea Tourism Organization
source, allowed/conditional verdict, mandatory conditions, information trust,
neutral licensing confirmation state, operating warnings, and only the Korean
explanations whose structured reason codes are present. Provider evidence is in
an expandable section. No internal score is rendered as a quality percentage.

The existing single Kakao SDK loader renders a distinct departure marker,
numbered route stops, and only final provider geometry. Timeline and marker
selection are synchronized. Automatic route stops never use the yellow Kakao
discovery identity.

Validated lower-travel and popularity-oriented alternatives appear only when
returned by the optimizer. Switching replaces summary, timeline, and geometry
without rerunning providers. The optimizer itself only emits a popularity
alternative when sufficient popularity evidence produced a popular anchor.

Reorder and removal update a draft view but never claim it is validated. The
explicit `경로 다시 계산` action calls ordered-route validation. Success changes
the label to `직접 수정한 일정`; failure leaves the draft visible with a clear
conflict and restore action. `추천 일정 다시 만들기` is a separate full rerun.

The page stacks timeline and map below desktop width. Buttons remain at least
44px tall, loading/error states are announced, the timeline is an ordered list,
alternative controls use tabs, expandable evidence uses native `details`, and
focus/selection is not communicated by color alone.
