# Contract: The Emotion Seam

**Status**: Load-bearing. Every other contract in this feature can change without this one moving.

**Satisfies**: FR-006, FR-007, FR-019, FR-020, SC-012

---

## The whole vocabulary

```ts
// lib/emotion.ts - imports nothing. Nothing in this file may ever import anything.

export type Emotion =
  | "neutral"
  | "happy"
  | "sad"
  | "surprised"
  | "angry"
  | "shy";           // provisional set - final membership comes from the rig inventory (FR-006)

export const NEUTRAL: Emotion = "neutral";

export function isEmotion(value: unknown): value is Emotion;
```

That is the entire interface between conversation and character. One string from a closed set, one
default, one type guard.

## Direction of flow

```text
  conversation ──── setEmotion(emotion: Emotion) ────▶ character
  conversation ──── setThinking(thinking: boolean) ──▶ character

  character ─────────────── nothing ─────────────────▶ conversation
```

The character side never calls back. There is no event, no callback parameter, no promise resolving
when an animation finishes. If the conversation layer needed to know when a reaction ended, that
would be a second item of vocabulary and this contract would have failed.

## Rules

1. **The conversation layer may pass nothing else.** No animation name, no duration, no intensity, no
   confidence score, no reply text, no message object. Adding any of these breaks the contract even
   if the code still compiles.
2. **The character layer may not reach across.** `lib/character/**` must not import from
   `lib/conversation/**`, must not read message state, and must not know a provider exists.
3. **The conversation layer may not reach across.** `lib/conversation/**` must not import from
   `lib/character/**`. It does not know whether a canvas, a still image, or nothing at all is on the
   other side.
4. **Both sides import `lib/emotion.ts` and neither owns it.** The file has no dependencies, so it
   cannot drag anything across the seam with it.
5. **`isEmotion` is the only entrance.** Any string arriving from the model, a URL, a test fixture,
   or a log is either accepted by `isEmotion` or becomes `NEUTRAL`. There is no third path
   (FR-019).
6. **Adding an emotion is a two-file change**: the union in `lib/emotion.ts` and the map in
   `lib/character/emotionMap.ts`. The map is typed `Record<Emotion, EmotionPresentation>`, so
   forgetting the second file fails the build (FR-007).

## Enforcement

A lint boundary rule (`eslint-plugin-boundaries` or equivalent `no-restricted-imports` config) makes
rules 2 and 3 build failures. This is deliberate: a seam maintained by reviewer memory is a seam that
closes within a month.

```text
lib/character/**  may import: lib/emotion, lib/ui/tokens        forbidden: lib/conversation/**, lib/server/**
lib/conversation/** may import: lib/emotion, lib/ui/*           forbidden: lib/character/**, lib/server/**
lib/server/**     may import: lib/emotion                       forbidden: components/**, lib/character/**, lib/conversation/**
```

## What replaceability means here (SC-012)

The spec asks that either side be swappable. Concretely, and each is demonstrated once:

| Swap | Files touched | Files untouched |
|------|---------------|-----------------|
| Live2D renderer to still images | `lib/character/renderer.ts`, `lib/character/emotionMap.ts` | all of `lib/conversation/**`, `app/api/chat/route.ts` |
| Groq to OpenRouter | three environment values (`GROQ_BASE_URL`, `GROQ_API_KEY`, `GROQ_MODEL`) | all of `lib/character/**`, all of `lib/conversation/**` |
| Add an emotion | `lib/emotion.ts`, `lib/character/emotionMap.ts`, persona text | everything else |

If a proposed change to one side requires editing the other, the change is wrong or this contract
needs amending - and amending it is a spec-level decision, not an implementation detail.

## Test obligations

- `isEmotion` accepts every union member and rejects `""`, `"HAPPY"`, `"joyful"`, `null`,
  `undefined`, `0`, `{}`.
- The emotion map is exhaustive (compile-time) and every referenced motion group and expression
  exists in the vendored model (runtime test reading the model manifest).
- A static import-boundary test, or the lint rule running in CI, proves no cross-seam import exists.
- The still-image swap in the table above is exercised by an end-to-end test that runs a full turn
  with the renderer disabled and asserts the conversation behaves identically.
