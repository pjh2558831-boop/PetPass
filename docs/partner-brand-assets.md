# Homepage partner brand assets

Retrieval date: 2026-08-15 (Asia/Seoul)

Only files offered by an official provider page with a sufficiently clear use
case are stored in `public/brand/partners/`. Provider names remain visible text;
logos never replace source attribution.

| Provider | Local asset | Official source | Format | Usage note |
| --- | --- | --- | --- | --- |
| Kakao Maps | `kakaomap-horizontal-ko.png` | [Kakao Developers — Kakao Map resources](https://developers.kakao.com/tool/resource/map) | PNG | The official page states that this logo may be used in services or shortcuts that use the Map/Local API. The horizontal Korean variant is used without alteration and follows the linked [Kakao Map design guide](https://developers.kakao.com/tool/resource/static/pdf/map/kakaomap_design_guidelines.pdf). |
| Ministry of the Interior and Safety | `mois-horizontal-ko-transparent.png`, `mois-horizontal-ko-transparent-trimmed.png` | User-provided official horizontal signature; matches the asset from the [행정안전부 기관문양](https://www.mois.go.kr/frt/sub/a07/miBanner/screen.do) package | PNG with alpha | The original transparent conversion is preserved. The `-trimmed` display copy removes only transparent outer canvas so the official symbol and wordmark align visually with the other homepage partners; artwork, colors, and aspect ratio are unchanged. |
| Korea Tourism Organization | `kto-horizontal-ko-transparent.png` | User-provided official Korea Tourism Organization horizontal signature attached to the homepage fine-tune task | PNG with alpha | Derived from the supplied JPG by converting only its white background to transparency. The full bilingual signature keeps its original dimensions, aspect ratio, artwork, and provider text. |

The Kakao corporate CI page is not used because it prohibits commercial use of
the provided material, while the separate Kakao Map resource page explicitly
describes Map/Local API service use. No asset is hotlinked at runtime. All three
marks are served from `public/brand/partners/`.
