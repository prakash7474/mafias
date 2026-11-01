# MAFIAS Project Instructions

## Project identity

MAFIAS is a CEG Guindy student entertainment and creative club. The approved visual direction is **MAFIAS — CULTURE IN MOTION**: a premium creative-collective experience combining editorial design, performance culture, real club photography and purposeful interactive 3D.

The previous horror, haunted/graveyard, gangster, luxury-crime-family and mafia-game directions are rejected. Do not reintroduce them unless the project owner explicitly changes this direction.

## Product priorities

1. Communicate entertainment, creativity, performance, collaboration and campus culture.
2. Keep real MAFIAS people, history, events and photography central to the experience.
3. Make the experience visually distinctive, accessible, responsive and fast.
4. Use Three.js / React Three Fiber and GSAP only where they improve the story or interaction.

## Existing application protection

Before editing:
- Inspect the repository structure, package scripts, existing architecture and Git working-tree status.
- Read any existing project instructions and preserve their valid requirements.
- Identify the smallest set of files needed for the requested change.
- Record existing behaviour of the homepage, navigation, registration and backend integration relevant to the task.
- Present a concise change plan for broad visual or architectural changes before proceeding.

Never:
- Run destructive Git commands such as `git reset --hard`, `git clean -fd`, or force-push without explicit approval.
- Discard uncommitted user changes.
- Replace the application or rewrite unrelated components to implement one feature.
- Change API contracts, database schemas, authentication, registration validation or submission behaviour unless explicitly requested.
- Create new routes for sections that are intended to remain in the existing homepage.
- Create duplicate Three.js canvases, animation managers or audio systems without a demonstrated need.
- Delete assets before checking references and import usage.

## Approved design system

Starting palette:
- Ink: `#0B0C10`
- Warm white: `#F4F1EC`
- Signal crimson: `#E5364A`
- Graphite: `#282B31`
- Cool silver: `#8D929B`
- Stone: `#D9D5CF`

Use alternating dark and light editorial sections. Crimson is an accent, not a full-page wash. Typography should be bold and contemporary, with a clear hierarchy and readable body text. Candidate fonts include Space Grotesk, Manrope, Syne and IBM Plex Mono; inspect the current font setup before adding dependencies.

Avoid generic college templates, excessive glassmorphism, meaningless HUD elements, random particle demos and decorative effects that obscure content.

## Content integrity

- Use supplied and verified MAFIAS member names, photographs, events and history.
- The current office-bearer source contains 37 entries across 11 groups; preserve the source spellings and group assignments when working on that section.
- Dhanush appears under both Logistics and Media; do not merge the entries without confirmation.
- Club history is described as more than ten years. Do not invent an exact founding year or milestone dates.
- Narendra Prasath (NP) has been identified by the club owner as founder. Do not invent quotations, biography details or founder-specific achievements.
- Never generate substitute faces for real members or the founder.
- Never use stock photographs as if they depict actual MAFIAS events or members. Clearly distinguish temporary mood references from real club assets.

## Architecture and implementation

- Reuse the existing React + Vite architecture and current packages.
- Reuse the existing React Three Fiber Canvas and renderer where appropriate.
- Reuse existing GSAP / ScrollTrigger and Howler systems instead of duplicating them.
- Scope new component styles. Avoid broad global selectors and unrelated global CSS changes.
- Keep normal document scrolling and accessible navigation. Do not hijack scroll.
- Respect `prefers-reduced-motion`, keyboard navigation and focus visibility.
- Provide a meaningful static fallback for WebGL-dependent visuals.
- Load below-the-fold images and models progressively.

## Three-phase roadmap

### Phase 1 — Visual identity
Theme tokens, typography, navigation, hero composition, purposeful MAFIAS 3D identity, opening interactions and responsive foundation. Do not start Phase 2 content until Phase 1 is reviewed and approved.

### Phase 2 — The MAFIAS story
Club culture, origins, founder acknowledgement, verified timeline, organization, current office-bearers, department groups, real event archive and integration with the existing registration experience.

### Phase 3 — Immersive experience
Advanced scroll choreography, interaction polish, 4K/responsive optimisation, performance, accessibility, sound and production validation.

Do not implement all phases in one uncontrolled pass. Work only on the phase explicitly requested.

## Validation and reporting

After a meaningful change:
- Run the repository's existing build and relevant tests.
- Inspect the actual browser rendering, not only compilation.
- Check browser console and failed network requests.
- Verify desktop, tablet and mobile layouts relevant to the change.
- Verify registration, navigation and backend behaviour if touched or at risk.
- Report files created/modified, tests run, visual checks, missing assets and remaining risks.

Do not claim visual quality, performance or successful functionality without testing it.
