# Contract: Rig Capability Inventory

**Satisfies**: FR-006, FR-007 - the emotional-state set must be _derived_ from what the rig provides,
not chosen in advance.

**Status**: Template. Filled in during implementation, before `lib/emotion.ts` is finalised. This
blocks the emotion map, which blocks all character-side wiring.

---

## Why this exists as a contract

FR-006 forbids picking an emotion set and hoping the rig can express it. The dependency runs the
other way: inventory the model first, then fix the set. Getting this backwards is the most likely
way to end up with two emotions that look identical on screen, which SC-008 would fail.

## Selection criteria for the model

A candidate Cubism 4 sample model qualifies only if all of these hold:

1. Licensed free for non-commercial use, with terms that a public portfolio demo satisfies.
2. Ships `.exp3.json` expression files - not motions alone. FR-008 requires the expression to persist
   after the motion ends, and holding a final animation frame is a fragile substitute (D4).
3. Provides at least 4 visually distinguishable reaction motions, so the closed set can reach FR-006's
   minimum.
4. Provides an idle motion group suitable for indefinite looping (FR-005).
5. Includes physics and pose files if the rig depends on them, so the vendored copy is complete.

## Inventory table - to be completed

**Model**: `Haru (ハル PRO版)` **Source**: `Live2D Official Sample Data (haru_ja)` **License**: `Live2D Free Material License Agreement (Original Character)`

### Motion groups

| Group name (from `.model3.json`) | Count | Duration  | Loops | Reads as                                    | Candidate emotion |
| -------------------------------- | ----- | --------- | ----- | ------------------------------------------- | ----------------- |
| `Idle`                           | 3     | 10.0s     | Yes   | Natural breathing and subtle gentle sway    | `neutral`         |
| `Tap`                            | 6     | 1.4s–3.1s | No*   | Attentive nodding / casual response gesture | `neutral`         |
| `Flick`                          | 3     | 2.6s–3.0s | No*   | Cheerful head tilt, bright gesture          | `happy`           |
| `FlickRight`                     | 3     | 2.1s–4.2s | No*   | Hesitant glance away, bashful / embarrassed | `shy`             |
| `FlickLeft`                      | 3     | 2.6s–4.2s | No*   | Startled turn, abrupt wide-eyed reaction    | `surprised`       |
| `Shake`                          | 2     | 2.0s–3.7s | No*   | Irritated body shake, frustrated reaction   | `angry`           |
| `Flick3`                         | 3     | 1.6s–2.0s | No*   | Drooping posture, dejected downward tilt    | `sad`             |

_\*Note: Motion metadata sets `Loop: true` by default, but the project triggers them as one-shot reaction motions that return to the `Idle` loop._

### Expressions

| Expression name (`.exp3.json`) | Reads as                                                 | Candidate emotion |
| ------------------------------ | -------------------------------------------------------- | ----------------- |
| `Normal.exp3.json`             | Neutral, calm resting baseline expression                | `neutral`         |
| `Smile.exp3.json`              | Smiling curved eyes (`PARAM_EYE_SMILE=1`), raised brows  | `happy`           |
| `Sad.exp3.json`                | Troubled angled eyebrows, downturned mouth               | `sad`             |
| `Surprised.exp3.json`          | Wide pupils (`PARAM_EYE_OPEN=1`), high raised brows      | `surprised`       |
| `Angry.exp3.json`              | Furrowed brows (`PARAM_BROW_ANGLE=-0.5`), clenched mouth | `angry`           |
| `Blushing.exp3.json`           | Blushed cheeks (`PARAM_TERE=1`), softened gaze           | `shy`             |

_(Note: `f01.exp3.json` and `f02.exp3.json` are redundant minor variations and are omitted per the inventory rules)._

### Other capabilities present

- [x] Physics file (`haru.physics3.json`)
- [x] Pose file (`haru.pose3.json`)
- [x] Eye blink parameter group (`PARAM_EYE_L_OPEN`, `PARAM_EYE_R_OPEN`)
- [ ] Breath parameters _(handled via motion curves)_
- [x] Lip-sync parameters (unused - text-only demo, FR-033) (`PARAM_MOUTH_OPEN_Y`)

## Output of this inventory

Three things, in this order:

1. **The final `Emotion` union** in `lib/emotion.ts` - 4 to 8 values including `"neutral"`, each one
   backed by a motion and an expression that exist and look different from the others.
2. **The emotion map** in `lib/character/emotionMap.ts`, typed `Record<Emotion, EmotionPresentation>`
   so it cannot be partial.
3. **The persona's cue vocabulary** in `lib/server/persona.ts` - the list of names the model is told
   it may emit. It must match the union exactly; a name the model can emit but the map cannot resolve
   would fall back to neutral silently, which is legal (FR-019) but wasteful.

## Rules

- If a candidate emotion has a motion but no distinct expression, it does not enter the set. A set of
  four that read clearly beats a set of eight where three are indistinguishable (SC-008).
- `"neutral"` must map to the idle-adjacent expression, so returning to neutral is not itself a
  visible event.
- Once fixed, changing the set is a two-file change plus persona text - see
  [emotion-seam.md](./emotion-seam.md).

## Test obligation

One unit test reads the vendored `.model3.json` and asserts that every `motionGroup` and `expression`
named in the emotion map actually exists in the model. A renamed or missing asset then fails the
suite rather than the live demo.
