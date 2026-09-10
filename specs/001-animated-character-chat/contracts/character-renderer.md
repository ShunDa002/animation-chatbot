# Contract: Character Renderer

**Module**: `lib/character/renderer.ts` - imperative, framework-agnostic, no React, no chat.

**Satisfies**: FR-005, FR-008 to FR-014, FR-035, FR-038, SC-002, SC-003

---

## Surface

```ts
import type { Emotion } from "@/lib/emotion";

export interface CharacterHandle {
  setEmotion(emotion: Emotion): void;
  setThinking(thinking: boolean): void;
  resize(): void;
  destroy(): void;
  readonly ready: boolean;
  readonly currentLabel: string;      // plain-word emotion name for aria-label (FR-038)
}

export interface CreateOptions {
  canvas: HTMLCanvasElement;
  modelUrl: string;
  reducedMotion: boolean;             // read before the first frame (FR-035)
  onUnavailable(): void;              // load/WebGL failure - caller shows the still image (FR-012)
  onLabelChange(label: string): void; // fires on every emotion change (FR-038)
}

export function createCharacter(options: CreateOptions): Promise<CharacterHandle>;
```

`onUnavailable` and `onLabelChange` are presentation callbacks, not conversation ones. They carry no
emotion back and no chat state; the renderer still cannot talk to `lib/conversation/**`.

## Behavioural guarantees

| # | Guarantee | Source |
|---|-----------|--------|
| R1 | After `createCharacter` resolves, an idle animation is looping with no caller action | FR-005 |
| R2 | The idle loop resumes whenever nothing else is playing, indefinitely | FR-005 |
| R3 | `setEmotion` starts the mapped reaction at forcing priority and applies the mapped expression | FR-007, FR-008 |
| R4 | The expression persists after the reaction's motion ends, until the next `setEmotion` | FR-008 |
| R5 | `setEmotion` during a playing reaction yields exactly one visible reaction - the newer - with no overlap or stuck pose | FR-009 |
| R6 | `setThinking(true)` enters a visibly distinct state; `setThinking(false)` leaves it | FR-010 |
| R7 | An unknown value can never arrive: the type forbids it, and callers pass `NEUTRAL` on any doubt | FR-019 |
| R8 | `destroy()` releases GPU resources, removes the model, and cancels the loop; calling it twice is safe | FR-013 |
| R9 | Repeated create/destroy/resize leaves no duplicate character, no growing resource count, no frame-rate decay | FR-013, SC-011 |
| R10 | With `reducedMotion: true`, no motion starts, and idle motion, breath, physics, and blink are all suppressed; `setEmotion` applies the expression by cross-fade only | FR-014, D9 |
| R11 | Model or WebGL failure calls `onUnavailable` exactly once and never throws into the caller | FR-012 |
| R12 | No work on the render path exceeds one frame budget; nothing blocks the UI thread | Constitution IV |

## Load-order requirement

`window.Live2DCubismCore` must exist before this module is imported. The page guarantees this with
`next/script strategy="beforeInteractive"`; the module asserts it and calls `onUnavailable` rather
than throwing if the global is missing (D2, D3).

## Non-obligations

Stated so nobody adds them later thinking they were forgotten:

- The renderer does **not** report when an animation finishes.
- It does **not** queue emotions. A newer emotion replaces an older one; there is no backlog.
- It does **not** know what a message, a turn, a reply, or a provider is.
- It does **not** persist anything.

## Test obligations

- Two `setEmotion` calls in the same frame leave exactly one reaction playing (R5).
- After a reaction completes, the expression is unchanged and the idle loop is running (R4, R2).
- `destroy()` then `createCharacter()` in sequence yields one model, not two; PixiJS resource counts
  return to their post-create baseline (R8, R9).
- With `reducedMotion: true`, no parameter driven by breath, physics, or blink changes across 60
  consecutive frames, while `setEmotion` still changes the expression (R10).
- A deliberately broken `modelUrl` calls `onUnavailable` once and the chat panel remains fully usable
  (R11).
