# Phase 1 Data Model: Animated Character Chat

**Date**: 2026-08-31 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Nothing here is persisted. Every entity lives in browser memory for the length of one visit
(FR-024). The thread UUID is stored in React state, created by the external FastAPI backend on page
load (FR-043, D15). All server-side storage is the backend's responsibility.

---

## Emotion

The entire vocabulary crossing the seam between conversation and character (FR-020). Declared in
`lib/emotion.ts`, which imports nothing.

| Field | Type | Rules |
|-------|------|-------|
| value | `Emotion` | One of a closed union of 4-8 string literals, including `"neutral"` |

**Provisional set** (final set derived from the rig inventory per FR-006):
`"neutral" | "happy" | "sad" | "surprised" | "angry" | "shy"`

**Validation rules**:

- `NEUTRAL: Emotion = "neutral"` is the exported default and the fallback for every failure path
  (FR-019).
- `isEmotion(value: unknown): value is Emotion` is the only way an outside string becomes an
  `Emotion`. The cue parser and the renderer both go through it, so an unmapped value cannot enter
  the system silently (FR-007).
- Every member of the union must have an entry in the emotion map; the map is typed as
  `Record<Emotion, EmotionPresentation>` so a missing entry fails compilation rather than at runtime.

---

## Message

One turn in the log (FR-001, FR-002, FR-015).

| Field | Type | Rules |
|-------|------|-------|
| id | `string` | Unique within the visit; used as the list key |
| author | `"visitor" \| "character"` | Drives the visual distinction required by FR-002 |
| text | `string` | Display text only. The emotional cue has already been stripped (FR-018) |
| status | `"complete" \| "streaming" \| "failed"` | `"streaming"` only ever applies to a character message |

**Validation rules**:

- A visitor message is capped at 300 characters before it can be created (FR-022); the cap is
  enforced at input time, not at send time.
- A message with `status: "streaming"` has not yet been announced to assistive technology; the
  announcement fires exactly once on transition to `"complete"` (FR-036).
- `text` never contains the cue marker at any point in its lifetime, including mid-stream - the tail
  buffer in D6 holds back the candidate marker before it can reach this field (FR-018, SC-007).

---

## Conversation

The ordered history for the current visit, plus the bounded slice that travels onward.

| Field | Type | Rules |
|-------|------|-------|
| messages | `Message[]` | Full visit history, oldest first. Display source of truth |
| threadId | `string \| null` | UUID from `POST /threads`; null until thread creation succeeds (FR-043) |
| inFlight | `boolean` | True from send until the reply completes, fails, or times out |
| emotion | `Emotion` | Current emotional state; the last value handed across the seam |
| status | `"idle" \| "connecting" \| "waiting" \| "streaming" \| "error" \| "limited"` | Drives both the panel status and the announcements; `"connecting"` is the thread-creation phase (FR-045) |

**Note**: `outboundHistory` has been removed (D15). The frontend no longer sends conversation
history with each message. The backend manages context via the thread ID.

**Validation rules**:

- At most one turn in flight (FR-021). While `inFlight` is true, sending is refused and the reason is
  visible to the visitor.
- A failed, empty, or abandoned reply returns `status` to a sendable state without a reload
  (FR-023).
- The whole entity is discarded on unload; nothing is written to any persistent store (FR-024).

---

## ThreadId

A UUID identifying the conversation thread on the external backend (FR-043, D15).

| Field | Type | Rules |
|-------|------|-------|
| value | `string` | UUID returned by `POST /threads` on page load |

**Validation rules**:

- Fetched once on mount via `POST /threads`. Stored in component state for the visit only.
- If the fetch fails, `ConversationStatus` is `'connecting'` and sending is disabled (FR-045).
- Included as `thread_id` in every `POST /chat` request.
- Discarded on unload/reload — a new page load creates a new thread (FR-024).

---

## MockConversationListItem

Static dummy data to populate the sidebar's list of old conversations, since no real persistence exists (FR-001, FR-024).

| Field | Type | Rules |
|-------|------|-------|
| id | `string` | Unique mock identifier |
| title | `string` | Short display text for the list |
| date | `string` | Mock timestamp |

**Validation rules**:
- Used strictly for presentation in the sidebar.
- Never interacted with by the conversation or character layers.

---

## EmotionPresentation

How one emotion is expressed by the chosen rig. Lives in `lib/character/emotionMap.ts`; produced by
the rig inventory (FR-006, FR-007). The conversation layer never sees this type.

| Field | Type | Rules |
|-------|------|-------|
| motionGroup | `string` | Motion group name as it appears in the model's `.model3.json` |
| motionIndex | `number \| undefined` | Index within the group; undefined means the renderer may pick |
| expression | `string` | `.exp3.json` expression name; persists after the motion ends (FR-008) |
| label | `string` | Plain-word emotion name for the character's text description (FR-038) |

**Validation rules**:

- Keyed as `Record<Emotion, EmotionPresentation>`; exhaustive by construction.
- Every `motionGroup` and `expression` must exist in the vendored model, verified once by a unit test
  that reads the model manifest - so a renamed asset fails the suite rather than the demo.

---

## CharacterState

The renderer's own state. Imperative, owned by `lib/character/renderer.ts`, never mirrored into React
state (FR-005, FR-010).

| Field | Type | Rules |
|-------|------|-------|
| emotion | `Emotion` | Last value received through `setEmotion` |
| thinking | `boolean` | Set through `setThinking` |
| reducedMotion | `boolean` | Read once before the first frame (FR-035) |
| ready | `boolean` | False until the model has loaded; false permanently on load failure (FR-012) |
| isReacting | `boolean` | True while a reaction animation plays; pauses cursor tracking (FR-048) |

### State transitions

```text
                      ┌──────────────────────────── setEmotion(e) ──────────────┐
                      │                                                         ▼
  [load] ──▶ IDLE ◀───┴── motion ends ──── REACTING ◀── setEmotion(e) ──── (any state)
              │                                │
              │                                └── setEmotion(e') while reacting:
              │                                    the newer reaction replaces the older
              │                                    at FORCE priority - exactly one visible (FR-009)
              │
              ├── setThinking(true) ──▶ THINKING ── setThinking(false) ──▶ IDLE
              │
              └── [load failure] ──▶ UNAVAILABLE ──▶ still image shown, chat unaffected (FR-012)
```

**Rules**:

- IDLE loops indefinitely with no visitor action and is the state returned to whenever nothing else
  is playing (FR-005).
- The expression set by the last reaction persists through the return to IDLE, until the next
  `setEmotion` (FR-008).
- Under `reducedMotion`, REACTING applies the expression by cross-fade and starts no motion; IDLE
  suppresses idle motion, breath, physics, and blink (FR-014).
- `destroy()` releases GPU resources and removes the model; repeated mount/unmount/resize leaves no
  duplicate character and no accumulation (FR-013).

---

## ChatRequest / ChatResponse (external backend)

The browser-to-backend surface. Full contract in [contracts/chat-api.md](./contracts/chat-api.md).
The backend is a separate FastAPI project (D15, FR-044).

| Entity | Field | Type | Rules |
|--------|-------|------|-------|
| ChatRequest | user_input | `string` | The visitor's message; at most 300 characters after trim (FR-022) |
| ChatRequest | thread_id | `string` | UUID from `POST /threads` (FR-043) |
| ChatResponse | (stream) | plain-text chunks | Reply text only. No provider payload shape, no error text, no model or provider identifiers (FR-030) |

**Validation rules**:

- The persona/system message is attached server-side by the backend and is absent from the request
  type entirely, so the browser cannot supply, replace, or read it (FR-026).
- No visitor identifier of any kind is accepted, derived, or stored (clarification session, FR-028).

---

## DailyQuota _(external backend)_

Server-side, the only thing that outlives a request. Managed entirely by the external FastAPI
backend (D15). This project does not interact with or store the daily counter.

| Field | Type | Rules |
|-------|------|-------|
| key | `string` | Backend-managed |
| count | `number` | Backend-managed; ceiling 150 |

**Note**: All validation and enforcement of the daily quota is the backend's responsibility.
The frontend receives 429 responses when the limit is reached and displays the appropriate
message (FR-028).
