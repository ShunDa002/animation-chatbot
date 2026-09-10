# Phase 1 Data Model: Animated Character Chat

**Date**: 2026-08-31 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Nothing here is persisted. Every entity lives in browser memory for the length of one visit
(FR-024), except the daily counter in D7, which holds one integer server-side and expires itself.

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
| inFlight | `boolean` | True from send until the reply completes, fails, or times out |
| emotion | `Emotion` | Current emotional state; the last value handed across the seam |
| status | `"idle" \| "waiting" \| "streaming" \| "error" \| "limited"` | Drives both the panel status and the announcements |

**Derived value**:

- `outboundHistory = messages.slice(-6)` - the 6 most recent messages, visitor and character
  combined, filtered to `status: "complete"` (FR-017). Older messages stay visible in the log but do
  not travel.

**Validation rules**:

- At most one turn in flight (FR-021). While `inFlight` is true, sending is refused and the reason is
  visible to the visitor.
- A failed, empty, or abandoned reply returns `status` to a sendable state without a reload
  (FR-023).
- The whole entity is discarded on unload; nothing is written to any persistent store (FR-024).

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

## ChatRequest / ChatResponse

The browser-to-proxy surface. Full contract in [contracts/chat-api.md](./contracts/chat-api.md).

| Entity | Field | Type | Rules |
|--------|-------|------|-------|
| ChatRequest | messages | `{role: "user" \| "assistant", content: string}[]` | At most 6 entries; each `content` at most 300 characters; rejected without contacting the provider if malformed (FR-029) |
| ChatResponse | (stream) | newline-delimited text chunks | Reply text only. No provider payload shape, no error text, no model or provider identifiers (FR-030) |

**Validation rules**:

- The persona/system message is attached server-side and is absent from the request type entirely, so
  the browser cannot supply, replace, or read it (FR-026).
- No visitor identifier of any kind is accepted, derived, or stored (clarification session, FR-028).

---

## DailyQuota

Server-side, the only thing that outlives a request. One integer per UTC day (D7, FR-028).

| Field | Type | Rules |
|-------|------|-------|
| key | `string` | `quota:YYYY-MM-DD` (UTC) |
| count | `number` | Incremented before the provider call; ceiling 150 |
| ttl | `seconds` | Slightly over 24 hours, so the key expires itself |

**Validation rules**:

- Holds no visitor data and no identifier - it cannot distinguish one caller from another by design.
- If the store is unreachable, the check fails closed and the request is refused with the
  temporary-limit message (D7).
- A refused request must not consume a count.
