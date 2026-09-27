# Implementation Plan: Animated Character Chat

**Branch**: `001-animated-character-chat` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-animated-character-chat/spec.md`

## Summary

A single-page portfolio demo: a rigged 2D character animates above a chat panel, the visitor types,
a language model replies as streaming text, and the character reacts with a matching animation and
expression. No accounts, no persistence, free-tier inference.

This project is **frontend-only** (D15). The character is rendered by `pixi-live2d-display` over
PixiJS v7, with the Cubism 2.1 Core runtime (for the new Remu model) vendored locally, alongside the Cubism 4 Core runtime. A
separate FastAPI backend project handles provider credentials, persona instructions, rate limiting,
and conversation context. The frontend communicates with it via two HTTP endpoints: `POST /threads`
(returns a thread UUID on page load) and `POST /chat` (accepts `user_input` + `thread_id`, returns
a plain-text streaming response).

The load-bearing design decision is the seam: the conversation layer hands the character exactly one
value - an `Emotion` - and nothing else. That vocabulary is declared in a single shared module that
imports nothing, so the character side never learns about messages, and the conversation side never
learns about animations. Full reasoning in [research.md](./research.md);
the seam contract is [contracts/emotion-seam.md](./contracts/emotion-seam.md).

## Technical Context

**Language/Version**: TypeScript 5.x in `strict` mode, targeting Node 20+ for tooling

**Primary Dependencies**: Next.js (App Router) - `react` / `react-dom` - `pixi.js` pinned to the v7
line - `pixi-live2d-display` (cubism2 and cubism4 entry points). No server-side dependencies (`@upstash/redis`
removed per D15).
Vendored: Cubism 4 Core (`live2dcubismcore.min.js`), Cubism 2 Core (`live2d.js`), and the "Remu" sample model (`rem.json`, Cubism 2.1).

**Styling**: Tailwind CSS v4 via `@tailwindcss/postcss` (D13). Utility classes in JSX for all
layout, spacing, colour, and typography. `globals.css` retains only the Tailwind import, CSS custom
properties for animation tokens, and the `prefers-reduced-motion` media query.

**Storage**: No database. Conversation history lives in browser memory for the visit only (FR-024).
The thread UUID is stored in React state for the visit only. All server-side storage (daily counter,
conversation context) is the external backend's responsibility (D15).

**Testing**: Vitest + React Testing Library (unit, component); Playwright headless Chromium
(integration, end-to-end). Provider intercepted at the HTTP boundary; clock injected.

**Target Platform**: Modern desktop browsers with hardware-accelerated WebGL; narrow viewports
usable but not primary. No server-side runtime required in this project (D15).

**Project Type**: Web application - frontend-only Next.js project (no API routes).

**Performance Goals**: 60fps sustained character animation, never below 30fps (SC-003); visible
feedback to a send within 100ms (SC-004); first reply words within 3s for 90% of turns (SC-005);
character visible and animating within 3s of page load (SC-002).

**Constraints**: Provider credential never reaches the browser (FR-025); 300-character input cap,
6-message history window, 150 requests/day global ceiling (FR-017, FR-022, FR-028); 20-second
provider timeout with no automatic retry (FR-034); reduced-motion honoured before the first frame
(FR-035); emotion vocabulary is the only cross-seam traffic (FR-020); character model must be fully
visible head-to-toe at all times, scaled down to fit its container rather than cropped, and anchored to the bottom of the screen with no empty space beneath it (FR-042).

**Scale/Scope**: Low, bursty portfolio traffic. One character, one conversation per visit, one API
route, 4-8 emotional states. Roughly 20 source files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Constitution version 1.1.0, ratified 2026-08-31, last amended 2026-08-31.

| Principle | Gate | Status |
|-----------|------|--------|
| I. Code Quality | Single-responsibility modules; stdlib and existing deps preferred; no speculative abstraction; typed and validated boundaries; errors handled or propagated with context; shortcuts marked in-code | **PASS** - see notes |
| II. Testing Standards | Non-trivial logic ships with tests; behaviour-level assertions; deterministic; integration coverage of the response path and animation state transitions through real wiring | **PASS** - D11 |
| III. UX Consistency | One source of truth for durations/colours/spacing/copy; feedback within 100ms; actionable failure messages with no raw provider text; keyboard, text alternatives, AA contrast, reduced motion; input and log survive re-render | **PASS** - D9, D10 |
| IV. Performance | 60fps floor 30fps; first response within 300ms; no UI-thread blocking; measurements cited; optimisation only after measurement | **PASS with a stated measurement method** - D11 |
| Additional Constraints | TypeScript in `strict` mode on Node declared in `package.json`; secrets from environment; no conversation logging above debug; model/provider identifiers configurable | **PASS** - resolved by amendment, see below |
| Workflow & Gates | Spec and plan precede implementation; review against principles; suite green at merge; measurement cited for performance-affecting change | **PASS** |

### Notes on the passing gates

- **Principle I**: the only abstraction this plan introduces is the emotion seam, and it is required
  by FR-020 rather than speculative. There is one implementation of the renderer and no interface
  wrapping it - the seam is a function signature (`setEmotion(emotion)`), not a plugin system. The
  vendored Cubism Core and model are assets, not dependencies to justify.
- **Principle III**: `lib/ui/tokens.ts` is the single source for animation durations, cross-fade
  timing, colours, and spacing. Copy for the four visitor-facing failure states lives in one module
  so wording cannot drift between the panel and the live region.
- **Principle IV**: the 60fps requirement is verified by a recorded measurement on the baseline
  device, not by a CI assertion, because headless WebGL runs on a software rasteriser. This is a
  stated method, not an exemption: the measurement is attached to the PR as the principle requires.
  Automated tests cover the adjacent invariants (loop running, no accumulation across remounts, no
  frame-blocking work on the render path).

### Resolved: the language constraint

Constitution v1.0.0 stated *"Language and runtime: Python >= 3.13 as declared in `pyproject.toml`.
Dependencies are declared there, never installed ad hoc."* This feature is TypeScript on Next.js
with dependencies in `package.json`, which was a direct conflict when this plan was first drafted.

It is a conflict of sequence, not of judgement: the constitution was ratified before the stack was
chosen, and it recorded the language of the repository's scaffolding (`main.py`, `pyproject.toml`,
`.venv`) rather than a decision about this feature. The clause's intent - one declared language and
runtime, dependencies declared in a manifest and never installed ad hoc - is fully satisfied by
TypeScript with `package.json`.

**Resolved on 2026-08-31** by amending the constitution to v1.1.0 (MINOR: a constraint redefined, no
principle removed). The clause now reads TypeScript in `strict` mode on Node with dependencies
declared in `package.json`, so this gate passes and nothing blocks implementation.

The amendment's migration note records that `main.py`, `pyproject.toml`, `.python-version`, and
`.venv` are NOT grandfathered - T001 removes them. Retaining them instead is legitimate only if the
Python service in D12 is a deliberate portfolio goal, which is the author's call.

### Post-design re-check (after Phase 1)

Re-run against the produced artifacts: no new violation. The data model adds no entity that outlives
a visit; the contracts add no provider detail to the browser surface; the accessibility and
reduced-motion requirements are expressed as testable behaviour rather than as intentions. With the
language clause amended, no gate fails and no blocking item remains.

D13 (Tailwind) and D14 (layout) introduce no new principle violations: Tailwind is declared in
`package.json` (not ad hoc), the single-source-of-truth requirement is met through Tailwind's theme
plus `lib/ui/tokens.ts`. The UI components are purely presentational with no
cross-seam imports.

A `/speckit-analyze` pass over spec, plan, and tasks found zero CRITICAL issues. Its five HIGH
findings were remediated in `tasks.md` and in this file: the waiting indicator and the failure and
limit announcements moved from US4 back to US2 where their failure paths live, a scripted-provider
fixture task was added as T007a, counter atomicity under concurrent load gained a test (T039a) and an
implementation constraint (T046), and constitution III's in-progress-input guarantee was added to
T053 and T043.

**2026-09-15 — FR-042 layout bug fix**: A `/speckit-clarify` session identified that the spec did
not define what "visible" means for the character model. The clarification established that the full
body must be visible at all times — scaled down to fit rather than cropped. This resolved a live bug
where `layoutModel()` in `renderer.ts` used `anchor(0.5, 0)` with `y=0`, pushing the model's head
and face above the canvas boundary. The renderer contract gains a new guarantee R13 (FR-042), and
the fix changes anchor, position, and scale logic. No principle violations.

**2026-09-20 — D15 external backend migration**: The `/speckit-clarify` session established that
this project is frontend-only. The API route (`app/api/chat/route.ts`) and the entire `lib/server/`
layer are removed; the frontend calls an external FastAPI backend directly. No new principle
violations:
- **I**: `backend.ts` is a thin fetch wrapper with a single responsibility. The `@upstash/redis`
  dependency is removed (fewer deps, not more).
- **II**: The backend module is testable via scripted fixtures; the cue reader is unchanged.
- **III**: A new `'connecting'` status and `backendUnavailable` copy string ensure the thread-
  creation failure path has visible feedback (FR-045).
- **IV**: No performance change — the streaming path is identical; one extra round trip on page
  load (thread creation) is offset by removing the same-origin proxy hop.

**2026-09-26 — FR-005 random idle sequence**: A `/speckit-clarify` session updated the idle behavior to randomly select from a pool of neutral/subtle motions (excluding strong emotional reactions) with a random 3-8 second delay, rather than a continuous loop. The renderer contract `character-renderer.md` guarantees R1 and R2 were updated to reflect this sequence behavior. No new principle violations.

**2026-09-27 — FR-042 character bottom anchor**: A `/speckit-clarify` session defined that the character must be rendered on the full screen height, attaching its bottom to the bottom of the screen with no empty space beneath it, allowing the message input to partially overlap the bottom. The renderer contract R13 and the renderer's layout logic must enforce bottom-anchoring. Implementation confirmed that the `Live2DModel` texture contains empty transparent margins (~10% top, ~15% bottom), so the renderer layout was updated to explicitly zoom by `1.33x` and shift downwards by `15%` of its scaled height to effectively crop the transparent padding. Additionally, `ChatPanel` padding was removed and its gradient opacity was reduced to ensure the character's feet are visibly flush behind the overlapping message input. No new principle violations.

**2026-09-27 — Remu Model and Screenshot Update**: The model is switched to "Remu" (`rem.json`), a Cubism 2.1 model requiring `live2d.js` to be loaded in `layout.tsx`. Its motion arrays and part exclusivity files (`remu.physics.json`, `remu.pose.json`) are used with default settings. A new `still.png` screenshot must be captured using Playwright as a one-off script, substituting the old static fallback image.

## Project Structure

### Documentation (this feature)

```text
specs/001-animated-character-chat/
├── plan.md                              # This file
├── research.md                          # Phase 0 output - 12 decisions, risks
├── data-model.md                        # Phase 1 output - entities, states, transitions
├── quickstart.md                        # Phase 1 output - setup and validation guide
├── contracts/
│   ├── emotion-seam.md                  # The load-bearing contract
│   ├── character-renderer.md            # Imperative renderer surface
│   ├── chat-api.md                      # POST /api/chat request/response/stream
│   └── rig-inventory.md                 # Template: what the chosen rig provides
├── checklists/
│   └── requirements.md                  # Spec quality checklist (already complete)
└── tasks.md                             # Phase 2 - created by /speckit-tasks, not here
```

### Source Code (repository root)

```text
app/
├── layout.tsx                  # Root layout; Cubism Core via next/script beforeInteractive
├── page.tsx                    # Sidebar + full-screen character area + 50% bottom chat overlay (D14)
└── globals.css                 # Tailwind import, CSS custom properties, reduced-motion query (D13)

components/
├── CharacterStage.tsx          # Client-only wrapper; owns mount/destroy of the renderer
├── StillCharacter.tsx          # Fallback still image (FR-012)
├── ChatPanel.tsx               # Composes log + input + status + thinking indicator
├── MessageLog.tsx              # Scrolling log, newest in view, character icon on character msgs (FR-002)
├── MessageInput.tsx            # 300-char cap, remaining count, send control (FR-022)
└── Announcer.tsx               # Polite live region (FR-036, FR-037)

lib/
├── emotion.ts                  # THE SEAM: Emotion union, NEUTRAL, isEmotion. Imports nothing.
├── character/                  # Imperative. Knows nothing about chat.
│   ├── renderer.ts             # create/attach/destroy, setEmotion, setThinking
│   ├── emotionMap.ts           # Emotion -> motion group + expression (from rig inventory)
│   └── reducedMotion.ts        # Preference read + still-mode parameter suppression
├── conversation/               # Knows nothing about rendering.
│   ├── useConversation.ts      # Thread lifecycle, send, stream read, one-in-flight guard (D15)
│   ├── backend.ts              # createThread() + sendMessage() — backend URL resolution (D15)
│   ├── cue.ts                  # Marker parse + tail-buffered stripping (D6)
│   └── limits.ts               # 300 chars, Message type (outboundHistory removed per D15)
└── ui/
    ├── tokens.ts               # Durations, easing, colours, spacing
    └── copy.ts                 # Visitor-facing failure, limit, and connection wording

postcss.config.mjs              # @tailwindcss/postcss plugin (D13)

public/live2d/
├── core/live2dcubismcore.min.js        # Vendored from the official SDK
└── model/                              # Vendored sample rig + LICENSE.txt

tests/
├── unit/                       # cue.ts, limits.ts, emotion.ts, emotionMap.ts, backend.ts
├── component/                  # MessageInput, MessageLog, Announcer (Vitest + RTL)
├── fixtures/                   # Scripted backend responses — the backend is never real in the suite
└── e2e/                        # Playwright: full turn, failures, timeout, reduced motion
```

**Structure Decision**: One Next.js App Router project at the repository root. This project is
frontend-only (D15). The three remaining concerns map to three directories: `components/`
(presentation), `lib/character/` (rendering), `lib/conversation/` (conversation + backend calls).
`lib/emotion.ts` sits above all of them and imports nothing, which is what physically enforces the
seam — `lib/character/` may not import from `lib/conversation/` or vice versa, and a lint boundary
rule makes that a build failure rather than a code-review reminder.

The `lib/server/` directory and `app/api/chat/route.ts` have been removed (D15). All server-side
concerns — provider credentials, persona instructions, rate limiting, request validation, and
conversation context — are the responsibility of the separate FastAPI backend project.

**Layout Decision** (D14, D16): The page uses a full-screen character display with a collapsible sidebar on the left for navigation and history (mocked with dummy data). The chat panel overlays the bottom 50% of the character area with a top-to-bottom transparent-to-dark gradient (`bg-gradient-to-b from-transparent via-[rgba(28,30,39,0.8)] to-[rgba(28,30,39,0.95)]`) without heavy backdrop blur or top borders (D16, FR-001). This keeps the character's face, neck, and upper torso brightly lit and visible, while leaving the dark clothing, torso, and seated posture sharply discernible behind the chat overlay. Dialogue and input text use pure white (`text-white`) with subtle drop shadows against translucent bubble containers for maximum contrast without obscuring the artwork (FR-002). The thinking indicator is displayed as a temporary message bubble inside the chat panel (FR-040). On mobile viewports (< 640px), the sidebar becomes an off-canvas drawer accessed via a menu button, while the chat overlay remains at the bottom 50% (FR-003).

## Complexity Tracking

> Filled because two decisions will draw a reviewer's eye and both deserve a recorded justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| ~~A datastore (Upstash Redis) despite the project's stated "no database"~~ — **removed D15** | No longer applies. The daily counter is the external backend's responsibility | N/A |
| A rendering library rather than direct WebGL | FR-005 to FR-009 need motion groups, expression switching, motion priority, and idle looping | The vendor's low-level framework requires hand-written WebGL and matrix maths - several hundred lines before the first frame - and every line of it would be project-owned code to test and maintain under Principle I |
| ~~Constitution language clause conflict~~ - **resolved 2026-08-31** | The stack is TypeScript; constitution v1.0.0 named Python | Not an alternative to reject but an amendment to make. Made: constitution v1.1.0 redefines the clause as TypeScript on Node with `package.json`. No longer an open item |
| Direct cross-origin fetch to an external backend | D15: the backend is a separate FastAPI project; no in-project proxy | A Next.js API route proxy would contradict the frontend-only goal and duplicate server-side code that belongs in the backend project |
