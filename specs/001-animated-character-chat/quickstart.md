# Quickstart & Validation: Animated Character Chat

**Date**: 2026-08-31 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

How to get the demo running locally, and the runnable checks that prove each spec requirement holds.
Implementation detail lives in `tasks.md`; this file is the setup and validation guide.

---

## Prerequisites

| Need | Why |
|------|-----|
| Node 20+ and npm | Next.js toolchain |
| The official Cubism SDK for Web download | Source of `live2dcubismcore.min.js`, which is not on npm (D2) |
| A Cubism 4 sample model with expression files | The rig (D4, [contracts/rig-inventory.md](./contracts/rig-inventory.md)) |
| The external FastAPI backend running (D15) | Thread creation and chat. See the backend project's own setup guide |

## Setup

```bash
npm install
cp .env.example .env.local
```

Tailwind CSS v4 and `@tailwindcss/postcss` are already in `devDependencies` (D13). The PostCSS
config at `postcss.config.mjs` is checked in. No additional Tailwind setup is needed.

Fill `.env.local`:

```ini
# Backend base URL (D15, FR-032). Defaults to http://127.0.0.1:8000 if omitted.
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
```

Vendor the two assets that are not npm packages:

```text
public/live2d/core/live2dcubismcore.min.js     # from the Cubism SDK for Web
public/live2d/model/<model files>              # the sample rig
public/live2d/model/LICENSE.txt                # the rig's license terms, verbatim
```

Then run:

```bash
npm run dev          # http://localhost:3000
```

**Without the backend running**: thread creation fails on page load, sending is disabled, and a
connection notice is shown (FR-045). The character and its idle animation are unaffected. Start the
FastAPI backend to enable chat.

To develop the conversation path without the real backend, run against the scripted-backend
fixture (`tests/fixtures/backend.ts`), which mocks both `/threads` and `/chat` responses.

## Commands

```bash
npm run dev          # dev server
npm run build        # production build - also the type gate, strict mode
npm run lint         # includes the import-boundary rule that enforces the emotion seam
npm test             # Vitest: unit + component
npm run test:e2e     # Playwright: integration + end-to-end
```

`npm run lint` failing on a cross-seam import is the intended outcome, not a nuisance - see
[contracts/emotion-seam.md](./contracts/emotion-seam.md).

---

## Validation scenarios

Each maps to spec requirements and is runnable. The provider is replaced by a scripted stream fixture
in every automated scenario, so nothing here consumes the daily ceiling (D11).

### V1. Character alive on arrival - User Story 1 (P1)

1. Open the page with the chat panel ignored.
2. The character appears and an idle loop runs with no interaction.
3. Trigger a reaction manually from the dev console handle.
4. The reaction interrupts idle, plays out, and idle resumes; the expression stays.

**Proves**: FR-005, FR-008, SC-002. Automated in `tests/e2e/character.spec.ts`; the 60fps part of
SC-003 is a recorded measurement on the baseline device, attached to the PR, not a CI assertion
(D11).

### V2. A full turn - User Story 2 (P2)

1. Type a message and send.
2. Your message appears immediately; a waiting indicator appears within 100ms.
3. Reply text accumulates progressively.
4. Send a follow-up that refers to the first exchange; the reply shows awareness of it.
5. Reload: the log is empty.

**Proves**: FR-015, FR-016, FR-017, FR-043, FR-024, SC-004, SC-005.

### V3. The cue is never visible - the highest-value check

1. Run the fixture that splits `[emotion:happy]` across chunk boundaries - for example
   `"...done"`, `" [emo"`, `"tion:ha"`, `"ppy]"`.
2. Capture the rendered message text on **every** frame of the stream.
3. No frame contains `[`, `emo`, or any fragment of the marker.

**Proves**: FR-018, SC-007, and the tail buffer in D6. Run this one before believing anything else
about the cue path - it is the requirement most likely to pass a naive implementation by accident and
fail on a real stream.

### V4. Bad cues degrade, never break

Fixtures: no marker; `[emotion:ecstatic]` (not in the set); `[emotion:]`; a marker mid-reply;
an empty reply.

Expected in every case: the full reply text displays (or the fallback message for the empty case),
and the character sits at neutral. Nothing throws.

**Proves**: FR-019, SC-006 (the 100%-display half).

### V5. Reaction matches tone - User Story 3 (P3)

1. Run 20 varied fixtures covering every emotion in the set.
2. Assert the emotion handed across the seam matches the fixture's marker for each.
3. Have an observer view replies of differing tone and tell the reactions apart.

**Proves**: FR-007, SC-006, SC-008.

### V6. The wait reads as thinking - User Story 4 (P4)

1. Fixture delays the first chunk by 5 seconds.
2. The character is in the thinking state and a waiting indicator is present for the whole delay.
3. On first chunk, thinking ends.

**Proves**: FR-010, FR-037.

### V7. Failure paths

| Fixture | Expected |
|---------|----------|
| Backend `/chat` returns 500 | 502-equivalent to browser, plain message, character returns to idle, no provider text shown |
| Backend `/chat` never responds | Timeout, one request only, visitor invited to resend |
| Stream starts then stalls | Partial text stays, sendable again |
| Backend returns 429 | Temporary-limit message, character returns to idle |
| Backend `/threads` unreachable on page load | Connection notice shown, sending disabled (FR-045) |
| Broken `modelUrl` | Still image shown, chat fully usable |

**Proves**: FR-012, FR-023, FR-028, FR-030, FR-034, FR-045, SC-009.

### V8. Reduced motion

1. Emulate `prefers-reduced-motion: reduce` **before** page load.
2. Run a full turn.
3. No parameter changes across 60 consecutive frames; the expression still changes per emotion; the
   conversation works normally.

**Proves**: FR-014, FR-035, SC-008 (reduced-motion half).

### V9. Keyboard and screen reader

1. Complete a full turn using only the keyboard.
2. With a screen reader: the thinking state is announced; the completed reply is announced **once**,
   whole; the character area reports the character and its current emotional state.
3. No control is unlabelled; no word-by-word announcement occurs.

**Proves**: FR-003, FR-036, FR-037, FR-038, SC-014.

### V10. Seam replaceability - do each once

| Swap | Check |
|------|-------|
| Disable the renderer, use the still image | Every conversation test in V2 to V7 passes unchanged |
| Point `NEXT_PUBLIC_BACKEND_URL` at a different backend instance | A full turn works with zero source edits |

**Proves**: FR-012, FR-020, FR-032, FR-047, SC-012.

### V11. Endurance

Run 20 turns over 30 minutes with the renderer live. Assert: one character on screen, PixiJS resource
counts flat, no growth in reply-handling latency, animation still smooth.

**Proves**: FR-013, SC-011.

### V12. Pointer Tracking - FR-048

1. Move the pointer across the entire browser window.
2. The character's gaze and head orientation track the pointer in real-time.
3. Trigger a reaction animation; the tracking pauses (character ignores pointer or smoothly returns to center) until the reaction ends, then resumes.
4. On a touch device (or DevTools touch emulation), touch and drag to track; on release, the character smoothly returns to center.
5. Emulate `prefers-reduced-motion: reduce` before page load; pointer tracking is disabled entirely.

**Proves**: FR-048, FR-014 (reduced motion).

---

## Before deploying

- [x] Constitution amended for the TypeScript stack - done 2026-08-31, v1.1.0 (see Constitution Check
      in [plan.md](./plan.md))
- [ ] SC-006 cue-compliance rate measured against the real backend over 20 turns and recorded (T074)
      - fixtures supply the cue themselves, so the suite cannot prove this one
- [ ] `NEXT_PUBLIC_BACKEND_URL` set correctly for the production backend
- [ ] External FastAPI backend deployed and accessible from the frontend's domain
- [ ] CORS configured on the backend to allow the frontend's origin
- [ ] Rig license file vendored
- [ ] `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` all green
- [ ] 60fps measurement recorded on the baseline device and attached to the PR (constitution IV)
