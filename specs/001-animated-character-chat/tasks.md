---

description: "Task list for feature 001 - Animated Character Chat"
---

# Tasks: Animated Character Chat

**Input**: Design documents from `/specs/001-animated-character-chat/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED and non-optional. Constitution v1.1.0 Principle II is NON-NEGOTIABLE, and every
contract in `contracts/` carries a "Test obligations" section. Test tasks are written before the
implementation they cover, within each phase.

**Organization**: Tasks are grouped by user story so each story is independently implementable and
testable. Stack is TypeScript on Next.js (App Router) deployed to Vercel, per plan.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 - maps to the user stories in spec.md
- Exact file paths are given in every task

## Path Conventions

Single Next.js project at the repository root: `app/`, `components/`, `lib/`, `public/`, `tests/`.
Structure is fixed by the **Source Code** section of plan.md; do not invent a `src/` layer.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Turn the repository from a Python scaffold into the Next.js project plan.md describes.

- [X] T001 Delete the unused Python scaffolding - `main.py`, `pyproject.toml`, `.python-version`, and the `.venv/` directory - per the migration note in `.specify/memory/constitution.md` v1.1.0
- [X] T002 Initialize the Next.js App Router project at the repository root with TypeScript in `strict` mode: `package.json`, `tsconfig.json` (with the `@/*` path alias), `next.config.mjs`, and `.gitignore` additions for `node_modules/` and `.next/`
- [X] T003 Install and pin the render stack in `package.json`: `pixi.js` pinned to the v7 line and `pixi-live2d-display`, with the exact version pair confirmed against the renderer's README at install time per research D2 - record the confirmed pair as a comment beside the pinned versions in `package.json`, since `README.md` does not exist until T075
- [X] T004 [P] Install `@upstash/redis` in `package.json` for the daily counter (research D7)
- [X] T005 [P] Configure ESLint and Prettier at the repository root (`eslint.config.mjs`, `.prettierrc`) with the Next.js and TypeScript presets, and add `lint` and `format` scripts to `package.json`
- [X] T006 [P] Configure Vitest with React Testing Library and jsdom in `vitest.config.ts` plus `tests/setup.ts`, and add the `test` script to `package.json`
- [X] T007 [P] Configure Playwright headless Chromium in `playwright.config.ts` with the dev server as `webServer`, and add the `test:e2e` script to `package.json`
- [X] T007a [P] Create the scripted-provider fixture harness in `tests/fixtures/scripts.ts` (the named scripts) plus `tests/fixtures/stub-server.ts` (a local HTTP server Playwright launches as a second `webServer`): intercept the provider at the HTTP boundary, never by mocking project code. NOTE: implemented as a real local server rather than `page.route()`, because the fetches under test are made by the route handler on the server, which `page.route()` cannot see (constitution II, research D11), and ship the named scripts every later test task depends on - a marker split across chunk boundaries, a first chunk delayed 5 seconds, a stream that begins then stalls, a stream that never responds, a provider error status, an empty reply, a cue naming an emotion outside the set, and one script per union member. Ten test tasks (T025, T040 to T044, T057, T061, T062, T066, T067, T071) are blocked without this
- [X] T008 [P] Create `.env.example` listing `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL`, `DAILY_REQUEST_LIMIT`, `KV_REST_API_URL`, and `KV_REST_API_TOKEN` exactly as documented in [contracts/chat-api.md](./contracts/chat-api.md), with no real values
- [X] T009 Create the empty directory skeleton from plan.md so later tasks have somewhere to land: `app/api/chat/`, `components/`, `lib/character/`, `lib/conversation/`, `lib/server/`, `lib/ui/`, `public/live2d/core/`, `public/live2d/model/`, `tests/unit/`, `tests/component/`, `tests/e2e/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The emotion seam, the shared UI vocabulary, the page shell, and the vendored rig. Every
user story depends on these.

**CRITICAL**: No user story work can begin until this phase is complete. In particular T011 blocks
T013, and T013 blocks every character-side and persona task in the feature (FR-006).

- [ ] T010 Select and vendor the Cubism 4 sample model into `public/live2d/model/` against the five selection criteria in [contracts/rig-inventory.md](./contracts/rig-inventory.md) - expression files are mandatory, not optional - copy its license terms verbatim to `public/live2d/model/LICENSE.txt`, and export one still frame of the rig in its neutral expression to `public/live2d/still.png` as the fallback image T033 renders, so the fallback looks like the same character (FR-012)
- [ ] T011 Fill in the inventory tables in [contracts/rig-inventory.md](./contracts/rig-inventory.md) from the vendored model's `.model3.json`: every motion group, every `.exp3.json` expression, what each reads as, and the capability checkboxes. This is the derivation FR-006 requires and it BLOCKS T013
- [ ] T012 [P] Vendor `live2dcubismcore.min.js` from the official Cubism SDK for Web into `public/live2d/core/live2dcubismcore.min.js` - it is not published to npm (research D2)
- [X] T013 Write the final `Emotion` union, `NEUTRAL`, and `isEmotion` in `lib/emotion.ts` - 4 to 8 members including `"neutral"`, each backed by a motion AND a distinct expression found in T011. This file imports nothing, ever ([contracts/emotion-seam.md](./contracts/emotion-seam.md))
- [X] T014 [P] Unit test `lib/emotion.ts` in `tests/unit/emotion.test.ts`: `isEmotion` accepts every union member and rejects `""`, `"HAPPY"`, `"joyful"`, `null`, `undefined`, `0`, and `{}` (emotion-seam test obligations)
- [X] T015 Add the import-boundary lint rule to `eslint.config.mjs` encoding the three-row allow/forbid table in [contracts/emotion-seam.md](./contracts/emotion-seam.md), so a cross-seam import is a build failure and not a review comment
- [X] T016 [P] Static boundary test in `tests/unit/boundaries.test.ts` asserting no file under `lib/character/` imports from `lib/conversation/` or `lib/server/`, and vice versa - a second net in case the lint config is loosened later
- [X] T017 [P] Create `lib/ui/tokens.ts` as the single source for animation durations, the reduced-motion cross-fade duration (~150ms per research D9), easing curves, colours meeting WCAG AA, and spacing (constitution Principle III)
- [X] T018 [P] Create `lib/ui/copy.ts` with the visitor-facing wording for the waiting, failure, limit, and empty-reply states, and `lib/server/copy.ts` with the four failure sentences from the status table in [contracts/chat-api.md](./contracts/chat-api.md), so the panel and the live region cannot drift apart
- [X] T019 Create `app/layout.tsx` loading `/live2d/core/live2dcubismcore.min.js` via `next/script` with `strategy="beforeInteractive"`, so `window.Live2DCubismCore` exists before hydration (research D3, renderer load-order requirement)
- [X] T020 [P] Create `app/globals.css`: reset, the two-pane layout that stays usable on a narrow viewport with no sideways page scrolling (FR-003), and the `prefers-reduced-motion: reduce` media query for all CSS-driven motion
- [X] T021 Create `app/page.tsx` as the single view shell composing a character area and a chat panel area with no navigation (FR-001) - both areas are placeholders until their stories land

**Checkpoint**: The seam exists and is enforced, the rig is vendored and inventoried, the page renders
a shell. User stories can now begin.

---

## Phase 3: User Story 1 - Character feels alive on arrival (Priority: P1) - MVP

**Goal**: A rigged 2D character appears within 3 seconds of load and idles indefinitely with no
visitor action; a manually triggered reaction interrupts idle, plays out, and idle resumes with the
expression held.

**Independent Test**: Open the page with the chat panel ignored. The character appears, the idle loop
runs smoothly and continuously, a reaction triggered from the dev-console handle plays and returns to
idle, and a broken `modelUrl` shows the still image instead. No conversation or server involvement.

### Tests for User Story 1

> Write these first. They fail until the renderer exists.

- [ ] T022 [P] [US1] Renderer contract test in `tests/unit/renderer.test.ts` covering R5 (two `setEmotion` calls in one frame leave exactly one reaction), R4 and R2 (after a reaction completes the expression is unchanged and the idle loop is running), and R8 and R9 (`destroy()` then `createCharacter()` yields one model, and PixiJS resource counts return to the post-create baseline) per [contracts/character-renderer.md](./contracts/character-renderer.md)
- [ ] T023 [P] [US1] Unit test in `tests/unit/emotionMap.test.ts` reading the vendored `public/live2d/model/*.model3.json` and asserting every `motionGroup` and `expression` named in the emotion map actually exists in the model (rig-inventory test obligation)
- [ ] T024 [P] [US1] Reduced-motion unit test in `tests/unit/reducedMotion.test.ts`: with `reducedMotion: true`, no parameter driven by breath, physics, or blink changes across 60 consecutive frames, while `setEmotion` still changes the expression (R10)
- [ ] T025 [P] [US1] E2E test in `tests/e2e/character.spec.ts` for quickstart V1: character visible and idling within 3s of load with no interaction, a triggered reaction interrupts and resolves back to idle, and a deliberately broken `modelUrl` calls `onUnavailable` once and shows the still image while the page stays usable (SC-002, R11, FR-012)

### Implementation for User Story 1

- [ ] T026 [US1] Create `lib/character/emotionMap.ts` typed `Record<Emotion, EmotionPresentation>` - `motionGroup`, optional `motionIndex`, `expression`, and the plain-word `label` - populated from the T011 inventory, so a missing member fails compilation (FR-007, data-model EmotionPresentation)
- [ ] T027 [P] [US1] Create `lib/character/reducedMotion.ts`: read `(prefers-reduced-motion: reduce)` before the first frame and expose the suppression switches for idle motion, breath, physics, and auto-blink that research D9 requires - "do not start motions" alone does not stop a Live2D model moving
- [ ] T028 [US1] Implement `createCharacter` in `lib/character/renderer.ts` - dynamic import of PixiJS v7 and the `cubism4` entry point, assert `window.Live2DCubismCore` and call `onUnavailable` instead of throwing when it is absent, model load, canvas attach, and the looping idle motion that satisfies R1 and R2 - it starts with no caller action and is returned to whenever nothing else plays (FR-005)
- [ ] T029 [US1] Implement `setEmotion` in `lib/character/renderer.ts`: start the mapped motion at forcing priority, apply the mapped expression, hold that expression after the motion ends until the next `setEmotion` (FR-008), let a newer call replace an older reaction with exactly one visible (R3, R4, R5, FR-007, FR-009), and fire `onLabelChange(label)` on every change (FR-038)
- [ ] T030 [US1] Implement `resize()` and `destroy()` in `lib/character/renderer.ts`: release GPU resources, remove the model, cancel the loop, and make a second `destroy()` a no-op (R8, R9)
- [ ] T031 [US1] Apply the reduced-motion path inside `lib/character/renderer.ts`: with `reducedMotion: true` start no motion at all, and have `setEmotion` apply only the expression, cross-faded over the duration in `lib/ui/tokens.ts` (R10, FR-014, FR-035)
- [ ] T032 [US1] Create `components/CharacterStage.tsx` - client-only via `next/dynamic` with `{ ssr: false }`, owning `createCharacter` in a mount effect and `destroy()` in its cleanup so React Strict Mode's double-invoke exposes a missing teardown (research D3, FR-013), and exposing a dev-console handle for manually triggering a reaction so this story is testable with no chat
- [X] T033 [P] [US1] Create `components/StillCharacter.tsx` rendering `public/live2d/still.png` from T010 with a text alternative, shown when `onUnavailable` fires or WebGL is absent, with the conversation area untouched (FR-012)
- [ ] T034 [US1] Give the character container `role="img"` with an `aria-label` naming the character and its current emotional state in `components/CharacterStage.tsx`, updated from `onLabelChange` on every emotion change (FR-038)
- [ ] T035 [P] [US1] Mount `CharacterStage` in `app/page.tsx` and add the rig attribution the vendored license requires as visible page text (research D4 license obligation)

**Checkpoint**: User Story 1 is fully functional and demonstrable on its own - an animated character
on a page with no chat wired up. This is the MVP.

---

## Phase 4: User Story 2 - Hold a conversation (Priority: P2)

**Goal**: The visitor sends a message, sees it immediately, and watches the reply stream in word by
word with earlier turns taken into account - all working against a still image, with no animation.

**Independent Test**: Replace the animated character with `StillCharacter`. Send several messages.
Each is echoed immediately, each reply streams progressively, replies reference earlier turns, no cue
markup is ever visible, and a reload leaves an empty log.

### Tests for User Story 2

- [X] T036 [P] [US2] Unit test `tests/unit/cue.test.ts` for quickstart V3, the highest-value check in the feature: feed a chunk sequence that splits the marker across boundaries ("...done", " [emo", "tion:ha", "ppy]"), capture rendered text after every chunk, and assert no snapshot contains a bracket or any marker fragment (FR-018, SC-007, research D6)
- [X] T037 [P] [US2] Unit test `tests/unit/cue.test.ts` for the V4 cases: no marker, a cue naming an emotion outside the set, an empty cue name, a marker mid-reply, and an empty reply each yield the full display text (or the fallback message) and `NEUTRAL`, and nothing throws (FR-019)
- [X] T038 [P] [US2] Unit test `tests/unit/limits.test.ts`: the 300-character cap and the 6-message outbound window over complete messages only, per data-model Conversation (FR-017, FR-022)
- [X] T039 [P] [US2] Unit test `tests/unit/quota.test.ts` with an injected clock and a stubbed store: the key is `quota:YYYY-MM-DD` in UTC, the count increments before the provider call, the ceiling is 150, a refused request consumes no count, and an unreachable store fails CLOSED (FR-028, research D7)
- [X] T039a [P] [US2] Concurrency test in `tests/unit/quota.test.ts`: fire 40 counter checks in parallel against a shared stubbed store with 10 of the ceiling remaining, and assert at most 10 are admitted. SC-010 claims provider usage cannot exceed the ceiling "regardless of traffic volume", and a read-then-write counter races straight past 150 under exactly the flood SC-010 describes (SC-010, FR-028)
- [X] T040 [P] [US2] Route contract test `tests/e2e/api-chat.spec.ts` for every 400 row in [contracts/chat-api.md](./contracts/chat-api.md) - bad JSON, missing `messages`, empty array, 7 entries, 301-character content, last entry not `role: "user"` - each asserting no outbound provider request was made (FR-029)
- [X] T041 [P] [US2] Route contract test `tests/e2e/api-chat.spec.ts` for the 429, 502, and 504 rows: counter at 150 returns 429 with the provider never contacted; an unreachable store returns 429 and not 200; a provider error returns 502; a provider that never responds returns 504 at ~20s with exactly one provider request and no retry; and a stream that begins then stalls keeps its partial text and does not 504 (FR-030, FR-034)
- [X] T042 [P] [US2] Route contract test `tests/e2e/api-chat.spec.ts` asserting no response body in any case above contains the API key, the persona text, the provider name, or an upstream status code (FR-030, SC-007)
- [X] T043 [P] [US2] Component tests in `tests/component/` for `MessageInput` (cap visible, input beyond 300 prevented rather than truncated at send, and unsent input surviving a re-render), `MessageLog` (visitor and character visually distinguished, newest kept in view, scroll position surviving a re-render), and `Announcer` (one announcement per completed reply never progressive, plus one announcement per failure and limit state) - FR-002, FR-022, FR-036, FR-037, constitution III
- [X] T044 [P] [US2] E2E test `tests/e2e/conversation.spec.ts` for quickstart V2 against a scripted provider stream: the visitor's message and a waiting indicator appear within 100ms, reply text accumulates progressively, a follow-up shows awareness of the earlier turn, a second send during an in-flight reply is refused with a visible reason, and a reload empties the log (SC-004, SC-005, FR-021, FR-024)

### Implementation for User Story 2

- [X] T045 [P] [US2] Implement `lib/server/validate.ts`: the full `ChatRequest` shape check from [contracts/chat-api.md](./contracts/chat-api.md) - 1 to 6 entries, 1 to 300 characters after trim, last entry `role: "user"`, anything beyond `messages` ignored - returning a rejection before any provider work (FR-029)
- [X] T046 [P] [US2] Implement `lib/server/quota.ts` on `@upstash/redis`: a single atomic `INCR` on `quota:YYYY-MM-DD` in UTC - never a read followed by a write, which races under concurrency (T039a) - then compare the returned value against `DAILY_REQUEST_LIMIT` (default 150), set the TTL to slightly over 24 hours on first creation, decrement or otherwise consume no count for a request refused for any other reason, and fail closed on any store error (FR-028, SC-010, research D7)
- [X] T047 [P] [US2] Implement `lib/server/persona.ts` - the character's personality plus the instruction to end every reply with a bare emotional-cue marker, its permitted names copied exactly from the `Emotion` union in `lib/emotion.ts`. Server-only, never returned to the browser (FR-026, rig-inventory output 3)
- [X] T048 [US2] Implement `lib/server/groq.ts`: one forwarded OpenAI-shaped `chat/completions` call with `stream: true` under `AbortSignal.timeout(20000)`, reading `GROQ_API_KEY`, `GROQ_BASE_URL`, and `GROQ_MODEL` from the environment with nothing hard-coded at the call site (FR-032, research D5 and D8)
- [X] T049 [US2] Implement `app/api/chat/route.ts` on the Edge runtime in exactly the six-step order from [contracts/chat-api.md](./contracts/chat-api.md): validate, count, build with persona, call under timeout, clear the timeout on the first forwarded chunk, re-emit newline-delimited text as it arrives without waiting for the reply to complete (FR-027). Start the 20-second deadline at handler entry and pass the remaining budget to the provider fetch, because FR-034 counts the 20 seconds from when the request reaches the endpoint - not from the provider call, which happens after validation and a counter round trip. Map every failure to its status and its plain sentence from `lib/server/copy.ts`, and log counts and durations but never message or reply text (FR-030, FR-031, FR-034)
- [X] T050 [P] [US2] Implement `lib/conversation/limits.ts`: the 300-character cap and the 6-message outbound window over complete messages (FR-017, FR-022)
- [X] T051 [US2] Implement `lib/conversation/cue.ts`: the tail buffer that withholds the last N characters (N = longest possible marker) from rendered output until the marker matches or the stream ends, returning display text plus an `Emotion` resolved through `isEmotion` with `NEUTRAL` on any doubt (FR-018, FR-019, research D6)
- [X] T052 [US2] Implement `lib/conversation/useConversation.ts`: visit-scoped `Message[]`, the `status` machine from data-model Conversation, the one-in-flight guard with a visible reason, stream reading via `ReadableStream` and `TextDecoder` through `lib/conversation/cue.ts`, clean abandonment on unload, and a return to a sendable state after any failure. Imports nothing from `lib/character/` (FR-015, FR-016, FR-021, FR-023, FR-024)
- [X] T053 [P] [US2] Create `components/MessageInput.tsx`: 300-character cap enforced at input time, remaining count visible before sending, keyboard-reachable send control, a disabled state with a visible reason while a turn is in flight, and unsent input preserved across re-render - constitution III requires in-progress input to survive re-render, not only history and scroll position (FR-022, FR-003, FR-021, constitution III)
- [X] T054 [P] [US2] Create `components/MessageLog.tsx`: visitor and character messages visually distinguished using `lib/ui/tokens.ts`, newest message kept in view as content grows, and scroll position surviving re-render (FR-002, constitution III)
- [X] T055 [P] [US2] Create `components/Announcer.tsx`: one polite live region that announces a completed reply exactly once as a whole and never progressively, plus the failure and limit announcements, all worded from `lib/ui/copy.ts`, where a later state wins when announcements collide. US2 has four failure paths of its own, so FR-037's non-visible-only guarantee has to hold at this story's checkpoint rather than arriving with US4 (FR-036, FR-037, FR-004, spec Edge Cases)
- [X] T056 [US2] Create `components/ChatPanel.tsx` composing `MessageLog`, `MessageInput`, `Announcer`, and the waiting indicator - this component owns the visitor-facing waiting affordance and the 100ms feedback it carries, so US2's own T044 can assert it at the US2 checkpoint - then wire it plus `StillCharacter` into `app/page.tsx` so this story is complete with no renderer present (FR-001, FR-012, FR-037, SC-004)

**Checkpoint**: User Stories 1 and 2 both work independently - an animated character on the page, and
a full streaming conversation that runs against a still image.

---

## Phase 5: User Story 3 - Character reacts to what it says (Priority: P3)

**Goal**: When a reply finishes, the character plays the reaction matching the reply's tone and holds
the matching expression, then the idle loop resumes underneath.

**Independent Test**: Send messages provoking different tones (a joke, bad news, a plain question).
The reactions visibly differ and match the reply's tone, and the idle loop resumes afterwards.

**Depends on**: US1 (the renderer's `setEmotion`) and US2 (the cue parser producing an `Emotion`).
This phase adds no new module - it connects two existing ones across the seam.

### Tests for User Story 3

- [ ] T057 [P] [US3] E2E test `tests/e2e/emotion.spec.ts` for quickstart V5: 20 varied fixtures covering every member of the union, asserting the `Emotion` handed across the seam matches each fixture's cue and the character's `aria-label` follows it (SC-006, FR-007)
- [ ] T058 [P] [US3] E2E test `tests/e2e/emotion.spec.ts` asserting a newer reaction arriving mid-reaction leaves exactly one visible with no overlap or stuck pose, end to end rather than only at the renderer unit level (FR-009, spec US3 scenario 4)

### Implementation for User Story 3

- [X] T059 [US3] Wire the seam in `app/page.tsx`: pass the `Emotion` that `useConversation` resolved on reply completion into `CharacterStage`, which forwards it to `handle.setEmotion`. Exactly one value crosses - no reply text, no duration, no confidence score, no callback back (FR-020, [contracts/emotion-seam.md](./contracts/emotion-seam.md))
- [X] T060 [US3] Verify and correct the cue vocabulary in `lib/server/persona.ts` against the final union so the names the model is told it may emit match `lib/emotion.ts` exactly, and add a unit test in `tests/unit/persona.test.ts` asserting that correspondence (rig-inventory output 3)

**Checkpoint**: All three stories work. The demo now does the thing that distinguishes it from a text
chatbot.

---

## Phase 6: User Story 4 - The wait reads as thinking (Priority: P4)

**Goal**: Between send and the first reply words, the character visibly behaves as though thinking, so
free-tier latency reads as consideration rather than as a broken page.

**Independent Test**: Delay a reply by several seconds. The character enters a visibly distinct state
for the whole wait and leaves it when text starts arriving.

**Depends on**: US1 (`setThinking`) and US2 (the in-flight status).

### Tests for User Story 4

- [ ] T061 [P] [US4] E2E test `tests/e2e/thinking.spec.ts` for quickstart V6: a fixture delaying the first chunk by 5 seconds keeps the character in the thinking state and a waiting indicator present for the whole delay, and both end on the first chunk (FR-010, SC-005)
- [ ] T062 [P] [US4] E2E test `tests/e2e/thinking.spec.ts` for the 20-second abandonment: the thinking state ends, the character returns to idle, the visitor is invited to send again, and no failure path leaves the character stuck in the thinking state (FR-034, SC-009)

### Implementation for User Story 4

- [ ] T063 [US4] Implement `setThinking` in `lib/character/renderer.ts` as a visibly distinct state that is entered and left cleanly and that respects the reduced-motion suppression from T031 (R6, FR-010, FR-014)
- [X] T064 [US4] Wire `setThinking` in `app/page.tsx` and `components/CharacterStage.tsx` from the `useConversation` status - true from send until the first chunk, false on the first chunk, on failure, or on timeout - as the second and last item of seam vocabulary (FR-010, FR-020)
- [X] T065 [US4] Add the thinking-state announcement to `components/Announcer.tsx`, worded from `lib/ui/copy.ts` and non-interrupting, and confirm it does not collide with the completed-reply announcement when a visitor sends again immediately. The waiting indicator and the failure and limit announcements already exist from T056 and T055 - this task adds only the announcement of the thinking state itself (FR-037, FR-004, spec Edge Cases)

**Checkpoint**: All four user stories complete and independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: The validation scenarios that span stories, and the constitution's merge gates.

- [ ] T066 [P] E2E failure matrix `tests/e2e/failures.spec.ts` for the full quickstart V7 table, asserting each failure leaves an actionable plain-language message, a page usable without reloading, a character not stuck in the thinking state, and no more than one request consumed from the daily ceiling (SC-009, SC-013)
- [X] T067 [P] E2E reduced-motion test `tests/e2e/reduced-motion.spec.ts` for quickstart V8: emulate `prefers-reduced-motion: reduce` BEFORE page load, run a full turn, and assert no parameter changes across 60 consecutive frames while expressions still change per emotion and the conversation is unaffected (FR-014, FR-035, SC-008)
- [X] T068 [P] Keyboard end-to-end test in `tests/e2e/a11y.spec.ts` completing a full turn with the keyboard only and asserting no unlabelled control, plus an automated contrast check against `lib/ui/tokens.ts` for WCAG AA (FR-003, constitution III)
- [ ] T069 Manual observational pass, recorded in the PR - the three checks that need a human rather than an assertion: (a) quickstart V9 screen reader - the thinking state is announced, the completed reply is announced once and whole with no word-by-word fragmentation, and the character area reports the character and its current emotional state (SC-014, FR-036, FR-038); (b) quickstart V5 step 3 - an observer shown replies of differing tone tells the reactions apart in at least 4 of 5 pairs with motion enabled, which is the half of SC-008 that T067 does not cover (SC-008); (c) a first-time visitor with no instructions sends a message and reads a reply on the first attempt within 30 seconds of page load (SC-001)
- [ ] T070 [P] Seam replaceability demonstration for quickstart V10, one commit each and both reverted afterwards: disable the renderer in favour of `StillCharacter` and confirm every conversation test still passes unchanged; repoint `GROQ_BASE_URL`, `GROQ_MODEL`, and `GROQ_API_KEY` at OpenRouter and confirm a full turn works with zero source edits (SC-012, FR-020, FR-032)
- [ ] T071 [P] Endurance test `tests/e2e/endurance.spec.ts` for quickstart V11: 20 turns with the renderer live, asserting one character on screen, flat PixiJS resource counts, and no growth in reply-handling latency (FR-013, SC-011)
- [ ] T072 Record the 60fps measurement on the baseline device - a devtools frame trace or browser frame-rendering stats across idle, reaction, and thinking states - and attach it to the PR, since headless WebGL cannot assert SC-003 in CI. This is also the only evidence for FR-011's smoothness requirement (FR-011, SC-003, constitution IV, research D11)
- [X] T073 [P] Verify the credential never reaches the browser by grepping the built `.next/static` output for the `GROQ_API_KEY` value and for the persona text, and add that grep as a step in the build or CI script (FR-025, FR-026)
- [ ] T074 Live-provider cue-compliance run against the real Groq endpoint, recorded in the PR: 20 varied real turns, counting how many replies carry a well-formed cue that maps to a reaction. SC-006's 90% bar is a claim about the model's compliance, which fixtures cannot measure because they supply the cue themselves. Costs 20 of the day's 150 (SC-006, SC-007)
- [X] T075 [P] Write `README.md`: what the demo is, the setup steps from [quickstart.md](./quickstart.md), the confirmed PixiJS and renderer version pair from T003, the rig attribution, and the Vercel deployment steps including the Upstash integration
- [ ] T076 Run the full pre-deploy checklist at the end of [quickstart.md](./quickstart.md) - `npm run build`, `npm run lint`, `npm test`, and `npm run test:e2e` all green, Upstash provisioned and incrementing, license vendored and attribution visible

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies - start immediately
- **Foundational (Phase 2)**: needs Setup - BLOCKS every user story
- **US1 (Phase 3)**: needs Foundational, T011 and T013 in particular. Independent of US2
- **US2 (Phase 4)**: needs Foundational. Independent of US1 - it runs against the still image
- **US3 (Phase 5)**: needs US1 and US2. It is the wiring between them, nothing more
- **US4 (Phase 6)**: needs US1 and US2. Independent of US3
- **Polish (Phase 7)**: needs all four stories

### Where the story boundary was corrected

The waiting indicator and the failure and limit announcements belong to US2 (T056, T055), not US4.
US2 has four failure paths of its own and is declared independently shippable, so deferring FR-037's
"no visitor-facing state is visible-only" guarantee to Phase 6 would have left US2 failing its own
requirement at its own checkpoint - and would have left T044 asserting a waiting indicator that did
not exist yet. US4 now adds only what is genuinely its own: the character's thinking state (T063,
T064) and the announcement of that state (T065).

### The one hard serialization

T010 to T011 to T013 to T026, then all character-side work. FR-006 requires the emotion set to be
derived from the rig's actual capability, so no shortcut past T011 exists. Coding against the
provisional six-value set in research D4 and reconciling later is exactly the failure mode the
rig-inventory contract was written to prevent.

### Within Each User Story

- Tests are written before the implementation they cover, and must fail first
- `lib/emotion.ts` before anything that imports it
- `lib/character/emotionMap.ts` before `lib/character/renderer.ts`
- `lib/server/validate.ts` and `lib/server/quota.ts` before `app/api/chat/route.ts`
- `lib/conversation/cue.ts` before `lib/conversation/useConversation.ts`
- Story complete and checkpoint validated before moving to the next priority

### Parallel Opportunities

- Phase 1: T004 through T009 all in parallel after T002
- Phase 2: T012, T014, T016, T017, T018, and T020 in parallel; T010, T011, and T013 are the serial spine
- Phase 3: T022 to T025 in parallel, then T027 and T033 in parallel with T028 to T030
- Phase 4: T036 to T044 all in parallel; then T045, T046, T047, and T050 in parallel, and T053 to T055 in parallel
- Once Foundational is done, US1 and US2 can be built by two people simultaneously - the seam is what makes that safe
- Phase 7: everything except T069, T072, T074, and T076 is parallel

**T007a is on the critical path for every test task in the feature.** It is listed in Phase 1 because
a scripted provider fixture needs nothing from the application, but ten test tasks across four phases
cannot run until it exists. Do not defer it.

---

## Parallel Example: User Story 2

```bash
# All US2 tests together - different files, all failing initially:
Task: "Unit test the cue tail buffer with a split marker in tests/unit/cue.test.ts"
Task: "Unit test the 300-char cap and the 6-message window in tests/unit/limits.test.ts"
Task: "Unit test the daily counter with an injected clock in tests/unit/quota.test.ts"
Task: "Route contract tests for the 400 rows in tests/e2e/api-chat.spec.ts"
Task: "Component tests for MessageInput, MessageLog, and Announcer in tests/component/"

# Then the independent server and conversation modules together:
Task: "Implement request validation in lib/server/validate.ts"
Task: "Implement the daily counter in lib/server/quota.ts"
Task: "Implement the persona and cue instruction in lib/server/persona.ts"
Task: "Implement the caps in lib/conversation/limits.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup
2. Phase 2 Foundational - the serial spine T010 to T011 to T013 lives here, so do not rush it
3. Phase 3 User Story 1
4. **STOP and VALIDATE**: quickstart V1, plus the T022 to T025 suite green
5. Deployable as a portfolio piece already - an animated character, no chat

### Incremental Delivery

1. Setup and Foundational - the seam exists and is lint-enforced
2. US1 - animated character, no chat - deploy (MVP)
3. US2 - full streaming conversation against a still image - deploy
4. US3 - connect the two across the seam - deploy
5. US4 - the thinking state - deploy
6. Polish - the cross-story validation scenarios and the constitution's merge gates

### Parallel Team Strategy

After Foundational, US1 and US2 are genuinely independent: one developer takes `lib/character/`,
another takes `lib/conversation/` and `lib/server/`, and the lint boundary rule from T015 makes an
accidental coupling a build failure rather than a merge conflict discovered late. US3 is then a
two-file integration either of them can do.

---

## Notes

- 78 tasks. Tests are non-optional here (constitution Principle II), so test tasks are counted in
- `T007a` and `T039a` carry letter suffixes because they were inserted after numbering. Renumbering
  seventy tasks to keep the sequence pretty would have rewritten every cross-reference in this file
  for no execution benefit
- [P] means a different file and no dependency on an incomplete task
- The provider is a scripted stream fixture (T007a) in every automated test, so the suite never
  consumes the 150-per-day ceiling (research D11). T074 is the one deliberate exception: SC-006
  measures the real model's cue compliance, which no fixture can
- Commit after each task or logical group; stop at any checkpoint to validate a story on its own
- SC-003's 60fps target is a recorded measurement (T072), not a CI assertion - headless WebGL runs on
  a software rasteriser

---

## Implementation status (as of 2026-09-01)

**51 of 78 tasks complete.** 180 automated tests green: 102 Vitest (unit + component), 78 Playwright
(API contract, conversation, accessibility, reduced motion). `npm run build`, `npm run lint`, and
`npm run verify:bundle` all pass.

### Blocked on a license-gated manual download

T010 and T012 need two files that are not published to npm and sit behind Live2D's click-through
licence, so a person has to fetch them:

- `live2dcubismcore.min.js` from the official Cubism SDK for Web, into `public/live2d/core/`
- a Cubism 4 sample model into `public/live2d/model/`, shipping `.exp3.json` expression files

Everything downstream of the rig is blocked with them, because FR-006 requires the emotion set to be
derived from an inventory of what the rig can actually express, and there is no shortcut past that:

| Task | Why it is blocked |
|------|-------------------|
| T010, T012 | The downloads themselves, plus the still-image export |
| T011 | Nothing to inventory until T010 |
| T022, T023, T024, T025 | Renderer and manifest tests need the model and the renderer |
| T026 | The emotion map needs the rig's real motion-group and expression names |
| T027, T028, T029, T030, T031, T032 | The renderer itself |
| T034, T035 | Wired against the still image instead; move to the canvas when it exists |
| T057, T058 | Covered against the still image in `conversation.spec.ts`; the animation half needs the rig |
| T061, T062, T063 | The character's thinking state. The panel's waiting state is built and tested |
| T066, T069, T070, T071, T072, T074, T076 | Need either the rig, a human observer, or a real provider key |

`lib/emotion.ts` holds research D4's **provisional** union and says so in the file. Finalising it
after T011 is a two-file change plus the persona text.

### Deviations from the plan, both recorded in README.md

1. **Runtime**: `nodejs`, not Edge. Next 16 deprecates the Edge runtime; research D8's reasoning
   (stream natively, never buffer) is satisfied either way.
2. **A client-side stall watchdog** was added to `useConversation`. FR-034 forbids the endpoint
   cutting off an already-streaming reply, but the spec's stalled-reply edge case also requires the
   visitor be able to send again. No server behaviour satisfies both, so the client gives up after
   10 seconds of silence and keeps every character already shown.

### One new shared leaf module

`lib/limits.ts` holds the 300-character and 6-message caps. Both sides enforce them independently -
the browser so the cap is visible before sending, the endpoint because it may not trust the browser -
and the seam forbids `lib/server` importing `lib/conversation`. One declaration, two enforcement
points, no drift.
