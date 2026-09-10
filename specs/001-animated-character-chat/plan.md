# Implementation Plan: Animated Character Chat

**Branch**: `001-animated-character-chat` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-animated-character-chat/spec.md`

## Summary

A single-page portfolio demo: a rigged 2D character animates beside a chat panel, the visitor types,
a language model replies as streaming text, and the character reacts with a matching animation and
expression. No accounts, no persistence, free-tier inference.

The approach is a single Next.js project on Vercel holding both the page and one proxy route
handler, so the provider credential stays server-side with no second origin. The character is
rendered by `pixi-live2d-display` over PixiJS v7, with the Cubism 4 Core runtime and a free sample
model vendored as static assets. The proxy forwards one OpenAI-shaped streaming call to Groq.

The load-bearing design decision is the seam: the conversation layer hands the character exactly one
value - an `Emotion` - and nothing else. That vocabulary is declared in a single shared module that
imports nothing, so the character side never learns about messages, and the conversation side never
learns about animations. Full reasoning in [research.md](./research.md);
the seam contract is [contracts/emotion-seam.md](./contracts/emotion-seam.md).

## Technical Context

**Language/Version**: TypeScript 5.x in `strict` mode, targeting Node 20+ for tooling

**Primary Dependencies**: Next.js (App Router) - `react` / `react-dom` - `pixi.js` pinned to the v7
line - `pixi-live2d-display` (cubism4 entry point) - `@upstash/redis` for the daily counter.
Vendored, not from npm: Cubism 4 Core (`live2dcubismcore.min.js`) and one Cubism 4 sample model.

**Storage**: No database. Conversation history lives in browser memory for the visit only (FR-024).
The single exception is one integer per day in Upstash Redis for the global request ceiling - no
visitor data, TTL-expiring (see D7 in research, and Complexity Tracking below).

**Testing**: Vitest + React Testing Library (unit, component); Playwright headless Chromium
(integration, end-to-end). Provider intercepted at the HTTP boundary; clock injected.

**Target Platform**: Modern desktop browsers with hardware-accelerated WebGL; narrow viewports
usable but not primary. Server side runs on Vercel's Edge runtime.

**Project Type**: Web application - single deployable Next.js project (page + one API route).

**Performance Goals**: 60fps sustained character animation, never below 30fps (SC-003); visible
feedback to a send within 100ms (SC-004); first reply words within 3s for 90% of turns (SC-005);
character visible and animating within 3s of page load (SC-002).

**Constraints**: Provider credential never reaches the browser (FR-025); 300-character input cap,
6-message history window, 150 requests/day global ceiling (FR-017, FR-022, FR-028); 20-second
provider timeout with no automatic retry (FR-034); reduced-motion honoured before the first frame
(FR-035); emotion vocabulary is the only cross-seam traffic (FR-020).

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

A `/speckit-analyze` pass over spec, plan, and tasks found zero CRITICAL issues. Its five HIGH
findings were remediated in `tasks.md` and in this file: the waiting indicator and the failure and
limit announcements moved from US4 back to US2 where their failure paths live, a scripted-provider
fixture task was added as T007a, counter atomicity under concurrent load gained a test (T039a) and an
implementation constraint (T046), and constitution III's in-progress-input guarantee was added to
T053 and T043.

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
├── page.tsx                    # The single view: character stage + chat panel
├── globals.css                 # Reset, layout, reduced-motion media query
└── api/
    └── chat/
        └── route.ts            # Edge runtime; the only server-side code

components/
├── CharacterStage.tsx          # Client-only wrapper; owns mount/destroy of the renderer
├── StillCharacter.tsx          # Fallback still image (FR-012)
├── ChatPanel.tsx               # Composes log + input + status
├── MessageLog.tsx              # Scrolling log, newest in view (FR-002)
├── MessageInput.tsx            # 300-char cap, remaining count, send control (FR-022)
└── Announcer.tsx               # Polite live region (FR-036, FR-037)

lib/
├── emotion.ts                  # THE SEAM: Emotion union, NEUTRAL, isEmotion. Imports nothing.
├── character/                  # Imperative. Knows nothing about chat.
│   ├── renderer.ts             # create/attach/destroy, setEmotion, setThinking
│   ├── emotionMap.ts           # Emotion -> motion group + expression (from rig inventory)
│   └── reducedMotion.ts        # Preference read + still-mode parameter suppression
├── conversation/               # Knows nothing about rendering.
│   ├── useConversation.ts      # History, send, stream read, one-in-flight guard
│   ├── cue.ts                  # Marker parse + tail-buffered stripping (D6)
│   └── limits.ts               # 300 chars, 6-message window
├── server/
│   ├── persona.ts              # System prompt incl. cue instruction (server-only)
│   ├── groq.ts                 # One forwarded streaming call
│   ├── quota.ts                # Daily counter; atomic INCR; fails closed
│   ├── copy.ts                 # The four failure sentences the endpoint returns (FR-030)
│   └── validate.ts             # Request shape validation (FR-029)
└── ui/
    ├── tokens.ts               # Durations, easing, colours, spacing
    └── copy.ts                 # Visitor-facing failure and limit wording

public/live2d/
├── core/live2dcubismcore.min.js        # Vendored from the official SDK
└── model/                              # Vendored sample rig + LICENSE.txt

tests/
├── unit/                       # cue.ts, limits.ts, emotion.ts, emotionMap.ts, quota.ts
├── component/                  # MessageInput, MessageLog, Announcer (Vitest + RTL)
├── fixtures/                   # Scripted provider streams - the provider is never real in the suite
└── e2e/                        # Playwright: full turn, failures, timeout, reduced motion
```

**Structure Decision**: One Next.js App Router project at the repository root. The four concerns from
the spec map to four directories that do not import each other: `components/` (presentation),
`lib/character/` (rendering), `lib/conversation/` (conversation), `lib/server/` (proxy).
`lib/emotion.ts` sits above all of them and imports nothing, which is what physically enforces the
seam - `lib/character/` may not import from `lib/conversation/` or vice versa, and a lint boundary
rule makes that a build failure rather than a code-review reminder.

`app/api/chat/route.ts` is the only server-side code, and `lib/server/` is imported by nothing else,
so the persona text and the API key have no path into the client bundle.

## Complexity Tracking

> Filled because two decisions will draw a reviewer's eye and both deserve a recorded justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A datastore (Upstash Redis) despite the project's stated "no database" | FR-028 requires the daily count to hold across separate server invocations. Vercel functions are stateless and horizontally scaled | A module-level in-memory counter allows 150 requests *per warm instance*, so the ceiling silently stops existing and SC-013 cannot be verified. It is a correctness failure, not a simplification. Scope is one integer per UTC day with a TTL - no visitor data, no identifier |
| A rendering library rather than direct WebGL | FR-005 to FR-009 need motion groups, expression switching, motion priority, and idle looping | The vendor's low-level framework requires hand-written WebGL and matrix maths - several hundred lines before the first frame - and every line of it would be project-owned code to test and maintain under Principle I |
| ~~Constitution language clause conflict~~ - **resolved 2026-08-31** | The stack is TypeScript; constitution v1.0.0 named Python | Not an alternative to reject but an amendment to make. Made: constitution v1.1.0 redefines the clause as TypeScript on Node with `package.json`. No longer an open item |
