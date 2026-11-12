# Global model and data-interface update

The previous release linked users to a standalone research exhibit. The dynamic flight model remained at the main URL but its navigation was weak; the actual flight UI was limited to 17 East Asian airports.

This update makes the global model the primary landing view, with a 67-airport sourced sample, world and East Asia cameras, a global manual preset, unchanged East Asia preset, and spherical routes split at the antimeridian. Playback, uplift optimization, quote import, market context and the separate supply-chain model remain available.

The presentation uses Fuel Atlas branding with white surfaces, navy type and restrained blue charts, following the explorer/report separation on IEA's data pages. The research's calculations, 919-word reflection and archived submission documents remain unchanged.

Validation includes numerical, geometry, quote and simulated DOM tests, CSS parsing and an independent source/cascade review. Global geography was inspected as a rendered SVG. The environment exposes no supported browser-control runtime, so this does not claim a real-browser or assistive-technology test.

A subsequent release on 13 November uses the available Chromium runtime for actual browser acceptance and integrates Research into the shared five-tab workspace. The earlier verification limit above is superseded by [the current review record](reviews/README.md).
