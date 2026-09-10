# Aria — animated character chat

A single-page portfolio demo: a rigged 2D character sits beside a chat panel, the visitor types, a
language model replies as streaming text, and the character reacts with a matching animation and
expression. Text only. No accounts, no persistence, free-tier inference.

The load-bearing design decision is a seam. The conversation layer hands the character exactly one
value — an `Emotion` — and nothing else. That is the entire vocabulary between them, which is why
either side can be replaced without touching the other.

```
conversation ──── setEmotion(emotion: Emotion) ────▶ character
conversation ──── thinking: boolean ───────────────▶ character
character ─────────────── nothing ─────────────────▶ conversation
```

`lib/emotion.ts` declares that vocabulary and imports nothing. A lint rule in `eslint.config.mjs`
plus `tests/unit/boundaries.test.ts` make a cross-seam import a build failure rather than a review
comment — a seam maintained by reviewer memory closes within a month.

Specification, plan, and task list: [`specs/001-animated-character-chat/`](specs/001-animated-character-chat/).

## Status

The conversation, the inference proxy, and the accessibility surface are built and tested. **The
animated character is not** — it needs two license-gated manual downloads that cannot be automated.
See [What is not built yet](#what-is-not-built-yet).

| Area | State |
|------|-------|
| Chat, streaming, cue stripping, history window | Built, 180 tests green |
| Inference proxy: validation, daily ceiling, timeout, failure mapping | Built and tested over real HTTP |
| Accessibility: keyboard, live region, contrast, reduced motion | Built and tested |
| Animated Live2D character | **Blocked** — needs the vendored rig |
| Still-image fallback | Built; currently the whole character layer |

## Requirements

- Node 20 or newer (developed on 24)
- A Groq API key — free tier, no card: <https://console.groq.com>
- A counter store for the daily ceiling (Vercel's Upstash integration provides both values)

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev                  # http://localhost:3000
```

Every value in `.env.example` is documented in place. Two notes worth reading before you wonder why
nothing works:

- **Without `KV_REST_API_URL` and `KV_REST_API_TOKEN`, every send returns the temporary-limit
  message.** That is correct: the quota check fails closed by design, because a demo that cannot
  account for its own spending does not spend. To work on the conversation without provisioning a
  store, run the test stub instead (below).
- **There is no value of `DAILY_REQUEST_LIMIT` that switches the ceiling off**, including `0`, which
  refuses everything, and `Infinity`, which is ignored. An env var that disables a cost brake in
  production is the footgun the brake exists to prevent.

### Running against the stub, with no keys at all

```bash
node tests/fixtures/stub-server.ts 4319
GROQ_API_KEY=x GROQ_BASE_URL=http://127.0.0.1:4319/v1 GROQ_MODEL=x \
KV_REST_API_URL=http://127.0.0.1:4319/kv KV_REST_API_TOKEN=x npm run dev
```

The stub plays scripted replies chosen by a prefix in your message: `#split`, `#delayed`,
`#provider-500`, `#no-cue`, `#emotion-sad`, and others in
[`tests/fixtures/scripts.ts`](tests/fixtures/scripts.ts). Handy for seeing the failure paths without
waiting for a provider to misbehave.

## Commands

```bash
npm run dev              # dev server
npm run build            # production build; also the strict-mode type gate
npm run lint             # includes the import-boundary rule that enforces the emotion seam
npm test                 # Vitest: unit + component (102 tests)
npm run test:e2e         # Playwright: API contract, conversation, a11y, reduced motion (78 tests)
npm run verify:bundle    # after a build: proves no key or persona text reached the client
```

`npm run lint` failing on a cross-seam import is the intended outcome, not a nuisance.

The e2e suite runs with `workers: 1` on purpose. The stub holds one counter for the whole suite,
exactly as the real deployment holds one counter for every visitor — that shared global ceiling is
the design, not an accident of the fixture, so parallel specs would fight over one integer.

## Architecture

```
app/
  layout.tsx            Cubism Core via next/script beforeInteractive
  page.tsx              the single view; the seam is wired here, in two props
  api/chat/route.ts     the only server-side code
components/             presentation
lib/
  emotion.ts            THE SEAM — imports nothing
  limits.ts             the two caps, shared by both enforcement points
  character/            imperative; knows nothing about chat
  conversation/         knows nothing about rendering
  server/               imported by nothing but the route handler
  ui/                   tokens and copy, each declared once
```

`lib/server/**` is imported only by `app/api/chat/route.ts`. That is what keeps the persona text and
the API key out of the client bundle, and `npm run verify:bundle` asserts it against the real build
output rather than trusting the arrangement.

### The pinned version pair matters

`pixi-live2d-display@0.5.0-beta` is the **only** published version that peers on `pixi.js@^7`; the
`0.4.0` "latest" tag peers on PixiJS 6, and no published version supports PixiJS 8. So:

- do not bump `pixi.js` to 8
- do not "upgrade" `pixi-live2d-display` to `0.4.0` — that is a downgrade to the v6 line and will
  break the canvas

### Two deliberate deviations from the plan

- **Runtime.** Research D8 chose Next's Edge runtime for streaming cold-start. Next 16 deprecates
  Edge in favour of `nodejs`, which streams natively too, so the route handler runs on `nodejs`. The
  reasoning behind D8 is unchanged; only the runtime name is.
- **A client-side stall watchdog.** FR-034 forbids the endpoint cutting off a reply that has already
  begun streaming. But a provider that sends three words and then hangs forever would leave the turn
  in flight for the rest of the visit, while the spec's edge case for a stalled reply requires that
  the partial text stays visible *and the visitor can send again*. No server behaviour can deliver
  the second half without violating FR-034, so `useConversation` gives up after 10 seconds of
  silence, keeps every character already shown, and ends the turn.

## Deploying to Vercel

1. Import the repository. Framework detection handles the build.
2. Add the Upstash integration — it sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
3. Set `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL`, and `DAILY_REQUEST_LIMIT` in project settings.
   The key belongs in Vercel only, never in the repository.
4. Run `npm run build && npm run verify:bundle` before the first deploy.

Swapping provider is those three `GROQ_*` values and no source edit — OpenRouter, Together, and
OpenAI all speak the same shape.

## What is not built yet

The animated character. It needs two files that are not on npm and sit behind Live2D's click-through
licence, so they have to be fetched by a person:

1. `live2dcubismcore.min.js`, from the official Cubism SDK for Web, into
   `public/live2d/core/`
2. A Cubism 4 sample model into `public/live2d/model/`, with its licence terms copied verbatim to
   `public/live2d/model/LICENSE.txt`

The model has to ship `.exp3.json` expression files, not motions alone: FR-008 requires a reaction's
expression to persist after its motion ends, and holding a final animation frame instead is fragile.

Once those exist, the order of work is fixed and is spelled out in
[`tasks.md`](specs/001-animated-character-chat/tasks.md): inventory the rig (T011) → finalise the
`Emotion` union from what it can actually express (T013) → write the emotion map (T026) → wire the
renderer (T028–T032). FR-006 requires the emotion set to be *derived* from the rig, so there is no
shortcut past the inventory.

**The `Emotion` union currently in `lib/emotion.ts` is provisional**, taken from research D4 and
marked as such in the file. `shy` and `surprised` are the likeliest not to survive the inventory,
since a candidate with a motion but no distinct expression does not enter the set. Finalising it is a
two-file change plus the persona text, and the map is typed `Record<Emotion, …>` so forgetting the
second file fails the build.

Until then `components/CharacterArea.tsx` renders the still image, which is the configuration User
Story 2 was specified to be testable in. The seam is unaffected: the character area receives one
`Emotion` and one boolean, so swapping the still image for the renderer touches that file and
`lib/character/**` and nothing else.

## Licence

Code in this repository is the author's. The vendored character model carries its own licence, in
`public/live2d/model/LICENSE.txt`, and the attribution its terms require is displayed on the page.
