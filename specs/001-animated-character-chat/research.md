# Phase 0 Research: Animated Character Chat

**Date**: 2026-08-31 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

All Technical Context unknowns are resolved below. No `NEEDS CLARIFICATION` remains.

---

## D1. Application shell and hosting

**Decision**: Next.js (App Router) with TypeScript in strict mode, deployed on Vercel as a single
project holding both the page and the proxy route handler.

**Rationale**: FR-025 requires the provider credential to live server-side, which means the demo
needs a server surface no matter what. One Next.js project gives that surface in the same
deployment as the page, so there is no second origin, no CORS preflight, and one deploy target.
Author familiarity is the deciding factor over hand-rolled static files plus a bare function:
familiarity is worth more here than a few hundred bytes of framework overhead.

**Alternatives considered**:

- Static HTML/JS plus a standalone serverless function: marginally simpler output, but reintroduces
  cross-origin configuration and two build paths for no behavioural gain.
- Vite SPA plus a separate API: same objection, plus a second deploy target.

---

## D2. Character rendering stack

**Decision**: `pixi-live2d-display` (Cubism 4 build) layered over PixiJS v7, with the Cubism 4 Core
runtime vendored into `public/` and loaded as a global before the renderer initialises.

**Rationale**: The library already implements model loading, motion groups, expression switching,
motion priority (`FORCE` / `NORMAL` / `IDLE`), and automatic idle-motion looping. Those four
features map almost one-to-one onto FR-005, FR-007, FR-008, and FR-009, so the mapping layer this
project writes is a lookup table rather than an animation system. The vendor's Cubism Web Framework
is the alternative and requires hand-written WebGL setup, matrix maths, and a render loop before a
single model appears on screen.

**Version pinning is load-bearing**: `pixi-live2d-display` ships separate builds per PixiJS major
(v6 and v7 lines) and does **not** support PixiJS v8. PixiJS must therefore be pinned to the v7
line, and the exact renderer/PixiJS version pair must be confirmed against the renderer's README at
install time rather than assumed. Import the `cubism4` entry point, not the all-versions bundle,
since only Cubism 4 models are used.

**Cubism Core**: `live2dcubismcore.min.js` is not published to npm. It is extracted from the
official Cubism SDK for Web and served from `public/live2d/core/`. It must be present as
`window.Live2DCubismCore` before the renderer module initialises, which forces the load-order rule
in D3.

**Alternatives considered**:

- Cubism Web Framework directly: several hundred lines of WebGL and matrix code to reach parity.
- Rive or Lottie: would satisfy the emotion seam, but neither reads Live2D `.model3.json` rigs, so
  the free sample model in D4 could not be used.
- Sprite-sheet 2D animation: cheapest to run, but discards the rigged-model portfolio point.

---

## D3. Loading the renderer inside Next.js

**Decision**: The character component is client-only, loaded with `next/dynamic` and
`{ ssr: false }`. Cubism Core is injected via `next/script` with `strategy="beforeInteractive"`.
PixiJS and the renderer are imported dynamically inside the component's mount effect, after Core is
confirmed present.

**Rationale**: Both PixiJS and the renderer touch `window` and `document` at module scope, so any
server-rendered import path throws during build. `beforeInteractive` guarantees Core is a global
before hydration, satisfying the ordering requirement in D2. The mount effect returning a destroy
function is what makes FR-013 (no duplicate characters, no leaked GPU resources across remounts)
testable, since React Strict Mode double-invokes effects in development and will expose a missing
teardown immediately.

**Alternatives considered**:

- A `<script>` in the root layout head plus a readiness poll: works, but replaces a framework
  guarantee with a timing loop.
- Loading Core itself inside `useEffect`: adds a race the framework already solves.

---

## D4. Character model

**Decision**: A Cubism 4 sample model from Live2D's free material set, vendored under
`public/live2d/model/`, chosen during the rig inventory step from candidates that ship **both**
motion groups and `.exp3.json` expression files.

**Rationale**: FR-008 requires the reaction's expression to persist after the motion ends. A rig
with motions but no expression files cannot satisfy that without holding a final animation frame,
which is fragile. So expression files are a selection criterion, not a nice-to-have. Sample models
are licensed free for non-commercial use, which is what a public portfolio demo is; commissioning a
rig would dominate the project's timeline.

**Constraint on order of work**: FR-006 requires the emotional-state set to be derived from what the
rig actually provides. The inventory therefore blocks the emotion map, and the emotion map blocks
the character-side wiring. Provisional working set, subject to that inventory:
`neutral, happy, sad, surprised, angry, shy` (6 values, inside FR-006's 4-8 range).

**License obligation**: the sample model's license terms are copied verbatim into
`public/live2d/model/LICENSE.txt` and the page carries the attribution its terms require.

---

## D5. Inference provider

**Decision**: Groq, called from the route handler at
`https://api.groq.com/openai/v1/chat/completions` with `stream: true`. Base URL, model id, and API
key are all read from environment variables.

**Rationale**: Groq's free developer tier allows on the order of thousands of requests per day,
which dwarfs this demo's 150/day ceiling (FR-028), so the ceiling is a cost brake rather than a
quota workaround. The request shape is the widely-copied OpenAI chat-completions shape, so the proxy
is one forwarded HTTP call. That same shape makes provider replacement (OpenRouter, Together,
OpenAI) a change of three environment values with no structural edit, which is exactly what FR-032
and SC-012 ask to be demonstrable.

**Model selection**: Groq's available model list changes over time, so the model id is **not**
hard-coded. `GROQ_MODEL` is read from the environment with a documented default confirmed against
Groq's live model list at setup time. A small instruction-following model is preferred: the persona
work is light and the cue format in D6 is simple, so latency matters more than reasoning depth for
SC-005.

**Alternatives considered**:

- OpenRouter free tier: same interface, wider model choice, stricter free-tier rate limits.
- Self-hosting a model: no provider ceiling to respect, but no free hosting either.

---

## D6. Emotional cue format and streaming-safe stripping

**Decision**: The persona instructs the model to end every reply with a bare marker on its own,
`[emotion:<name>]`. The conversation layer strips it before display, using a **tail buffer** while
streaming: the last N characters of accumulated text (N = longest possible marker) are withheld from
rendered output until either the marker is matched or the stream ends.

**Rationale**: A plain-text marker survives small models far more reliably than structured output,
and its failure mode is a readable reply with a neutral character (FR-019) rather than an
unparseable response with nothing to show. The tail buffer exists because FR-016 streams text while
FR-018 forbids the cue ever being visible - without it, a visitor briefly sees `[emo` appear and
vanish, which SC-007 counts as a failure. Withholding a fixed-size tail costs nothing perceptually
and is deterministically testable by feeding a chunk sequence that splits the marker mid-token.

**Alternatives considered**:

- JSON response containing text and emotion: cannot stream text progressively without a
  partial-JSON parser, and small models break the schema often.
- Provider tool/function calling: another failure surface, and not uniformly supported across the
  OpenAI-shaped providers this design wants to stay portable across.
- Client-side sentiment classification: discards the model's own stated intent, adds a dependency,
  and guesses where the model could simply say.

---

## D7. Global daily request ceiling

**Decision**: One integer counter in Vercel-provisioned Upstash Redis, keyed by UTC date
(`quota:YYYY-MM-DD`), incremented before the provider call and given a TTL slightly over 24 hours so
it expires itself. Requests arriving when the counter exceeds 150 are rejected before the provider
is contacted.

**Rationale**: FR-028 requires the count to hold across separate server invocations. Vercel
functions are stateless and horizontally scaled, so process memory cannot satisfy that - a
module-level counter would silently allow 150 requests *per warm instance*. This is the one place
the project's "no datastore" intent needs a footnote, and it is a narrow one: the store holds a
single integer per day, no visitor data, no identifier, nothing that outlives its TTL. It is a
counter, not a database, and the privacy guarantees in FR-024 and FR-031 are untouched.

**Alternatives considered**:

- Module-level in-memory counter: zero infrastructure, but fails FR-028 outright and would make
  SC-013 unverifiable. Rejected as a correctness failure, not a simplification.
- Vercel Firewall / platform rate limiting: no code at all, but it limits per-IP, and the
  clarification session explicitly chose no per-visitor limiting. It also cannot express "150
  provider calls in total per day".
- Vercel Edge Config: read-optimised, not intended for a write-per-request counter.

**Deployment note**: if the counter store is unreachable, the quota check must **fail closed** -
reject with the temporary-limit message - rather than fail open. A missing counter must never mean
unlimited provider spend.

---

## D8. Streaming transport

**Decision**: The route handler runs on the Edge runtime, reads Groq's SSE stream, and re-emits a
minimal newline-delimited text stream to the browser. The browser reads it with `ReadableStream` and
`TextDecoder`.

**Rationale**: Edge runtime streams natively with low cold-start cost, which protects SC-005's
3-second first-token target on a demo that is idle most of the time. Re-emitting a reduced stream
rather than proxying Groq's raw SSE keeps provider-shaped payloads, and any provider error text,
from reaching the browser, which FR-030 requires. Newline-delimited text is chosen over full SSE
because there is exactly one event type; a second framing layer would earn nothing.

**Timeout**: the 20-second abandonment rule (FR-034) is enforced with `AbortSignal.timeout(20000)`
on the upstream fetch, cleared once the first chunk has been forwarded, since FR-034 allows an
already-streaming reply to finish.

---

## D9. Reduced motion

**Decision**: Read `(prefers-reduced-motion: reduce)` before the first frame. When set, the renderer
disables idle motion, breath, physics, and eye-blink parameter updates, and `setEmotion` applies only
the expression, cross-faded over roughly 150ms, with no motion started.

**Rationale**: FR-014 keeps emotional feedback but removes movement. Live2D models keep moving even
with no motion playing, because breath, physics, and auto-blink drive parameters continuously - so
"do not start motions" is not sufficient to reach a still character, and each of those must be
switched off explicitly. Reading the preference before the first frame satisfies FR-035.

**Alternatives considered**:

- Slowed or reduced-amplitude motion: still movement, still a vestibular trigger.
- Freeze on neutral: complies with the letter of reduced-motion guidance but deletes the feature for
  those visitors, which the clarification session rejected.

---

## D10. Accessibility approach

**Decision**: A polite live region announces the completed reply once (FR-036) and the thinking,
failure, and limit states (FR-037). The character container carries `role="img"` with an
`aria-label` naming the character and its current emotional state, updated on every `setEmotion`
(FR-038).

**Rationale**: Announcing a streaming reply progressively produces per-token interruptions, so the
visible text and the announced text are deliberately decoupled: the DOM accumulates, the live region
receives one final message. The emotion is already a single named value crossing the seam, so
exposing it as text costs one attribute write and introduces no new vocabulary.

---

## D11. Testing strategy

**Decision**: Vitest with React Testing Library for unit and component tests; Playwright (headless
Chromium) for integration and end-to-end. The Groq call is intercepted at the HTTP boundary, never
by mocking project code. Time and randomness are injected.

**Rationale**: The constitution requires integration coverage proving input reaches output through
real wiring, and forbids mocking the code under test. Intercepting at the network boundary satisfies
both: the route handler, the stream reader, the cue stripper, and the emotion dispatch all run for
real, with only the provider replaced by a scripted stream. That scripted stream is also what makes
the hard cases deterministic - a marker split across chunks, a stream that stalls, an empty reply, a
cue naming an unsupported emotion.

**Frame-rate verification (SC-003)**: asserting 60fps in CI is unreliable, because headless WebGL
runs on a software rasteriser. SC-003 is therefore verified by a recorded measurement on the
baseline device (browser frame-rendering stats or a devtools performance trace, attached to the PR
per constitution Principle IV), while the automated suite asserts the cheaper invariants: the loop
is running, no duplicate models accumulate across remounts, and no frame-blocking work sits on the
render path.

**Alternatives considered**:

- Mocking `fetch` inside the conversation layer: faster to write, but tests the mock, and the
  constitution prohibits mocking the code under test.
- Playwright only: slow feedback for pure functions such as the cue stripper, which deserve
  microsecond-level tests.

---

## D12. Excluded: a Python service

**Decision**: No FastAPI service. The server-side work is one forwarded HTTP call with a header
attached, and it lives in the Next.js route handler.

**Rationale**: A second service in a second language adds a deployment, its own cold starts, and
cross-origin handling, to wrap a single HTTP call. It becomes justified when the server side gains
real work - embeddings, retrieval, an evaluation harness - where Python's ecosystem genuinely wins.

**Open, and not a technical question**: if demonstrating Python is itself a goal of the portfolio,
that is a legitimate reason to add the service, and it is the author's call. Nothing in this plan
prevents it later: the browser talks to one endpoint, so a Python service could sit behind or
replace the route handler without the conversation layer noticing. The repository's existing
`main.py`, `pyproject.toml`, and `.venv` are unused by this feature; see the Constitution Check in
[plan.md](./plan.md) for how that is resolved.

---

## Residual risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Renderer/PixiJS major-version mismatch (v8 unsupported) | Blank canvas, cryptic errors | Pin PixiJS to the v7 line; confirm the pair against the renderer README at install |
| Chosen sample rig lacks expression files | FR-008 unsatisfiable as designed | Expression files are a model-selection criterion (D4) |
| Small model ignores the cue format | Neutral character, replies still readable | FR-019 fallback; SC-006 sets a 90% bar, not 100% |
| Counter store missing at deploy | Unlimited provider spend | Quota check fails closed (D7) |
| Groq retires the configured model id | Every reply fails | Model id is an environment value, not a constant (D5) |

---

**Sources consulted**: [pixi-live2d-display README](https://github.com/guansss/pixi-live2d-display/blob/master/README.md),
[pixi-live2d-display on npm](https://www.npmjs.com/package/pixi-live2d-display),
[Groq free tier overview](https://free-llm.com/provider/groq-cloud),
[Groq pricing and limits](https://www.eesel.ai/blog/groq-pricing)
