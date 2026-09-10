# Feature Specification: Animated Character Chat

**Feature Branch**: `001-animated-character-chat`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: single-page web app where an animated 2D character sits beside a chat
panel; the visitor types, a language model replies, the reply appears as text, and the character
reacts with a matching animation. Text-only, no voice. Public portfolio demo, free-tier inference,
no accounts, no stored data. Four deliberately separated concerns: presentation (character canvas,
message log, input box); character rendering (an imperative 60fps render loop over a rigged model,
knowing nothing about chat); conversation (turn history, sending it away, receiving a reply,
extracting the emotional cue); and an inference proxy as the only server-side piece (holds the API
key, attaches the persona prompt, forwards to the provider). The design rests on the seam between
character rendering and conversation: conversation hands the character a single emotion value and
nothing else — that is the entire vocabulary between them, so either side is replaceable.

## Clarifications

### Session 2026-08-31

- Q: Since the demo has no accounts and stores no data, what should the server use to tell one
  visitor from another when it enforces the request limit? → A: Option D — no per-visitor limit; a
  single global daily request ceiling for the whole demo, with no visitor identification of any kind.
- Q: What concrete numbers should the three caps use — longest visitor message, past turns sent
  onward, and global daily request ceiling? → A: 300 characters, the 6 most recent messages, and 150
  requests per day.
- Q: When a request to the model provider hangs or fails, how long should the demo wait before
  giving up, and should it retry automatically? → A: 20-second timeout, no automatic retry — the
  visitor resends manually.
- Q: Under a reduced-motion preference, should the character still show its emotional reaction in a
  still form or drop emotional feedback entirely? → A: Keep the emotion as a still expression change
  with a brief cross-fade; suppress idle drift and reaction motion.
- Q: How should a screen-reader user be told what the character is doing and what the reply says,
  given the reply arrives progressively? → A: Announce the reply once complete, announce the thinking
  state when the wait begins, and give the character area a text description naming its current
  emotional state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Character feels alive on arrival (Priority: P1)

A visitor opens the demo page. Within a couple of seconds a 2D character appears and begins moving
on its own — breathing, blinking, small posture drift — looping indefinitely without any input. The
visitor can see the character is animated before typing anything.

**Why this priority**: This is the riskiest and most load-bearing part of the feature. If the
character cannot be loaded and animated reliably in a browser, nothing else here has value. It also
delivers the portfolio's first impression on its own, with no chat at all.

**Independent Test**: Open the page with the chat panel ignored. Confirm the character appears, the
idle loop runs continuously and smoothly, and a manually triggered reaction animation plays and then
returns to idle. No conversation or server involvement required.

**Acceptance Scenarios**:

1. **Given** a visitor opens the page on a supported desktop browser, **When** the page finishes
   loading, **Then** the character is visible and its idle animation is looping without any visitor
   action.
2. **Given** the idle loop is running, **When** a reaction animation is triggered, **Then** the
   reaction visibly interrupts the idle loop, plays to completion, and the idle loop resumes
   afterwards.
3. **Given** the character has been on screen for several minutes with no input, **Then** it is
   still animating and motion remains smooth.
4. **Given** the visitor's browser or device cannot display the animated character, **When** the
   page loads, **Then** a still image of the character is shown in its place and the rest of the
   page remains fully usable.

---

### User Story 2 - Hold a conversation (Priority: P2)

A visitor types a message and sends it. Their message appears immediately in the message log. The
reply appears progressively, word by word, rather than arriving all at once after a pause. The
visitor can send follow-up messages, and replies take earlier turns into account for the duration of
the visit.

**Why this priority**: This is the demo's actual content. It is independently valuable and can be
built and shipped against a still image of the character, before any animation is wired in.

**Independent Test**: Replace the animated character with a still image. Send several messages in
sequence. Confirm each is echoed into the log, each reply streams in progressively, replies
reference earlier turns, and no emotional cue markup is ever visible in the displayed text.

**Acceptance Scenarios**:

1. **Given** an empty message log, **When** the visitor sends a message, **Then** the message
   appears in the log immediately and a reply begins appearing within a few seconds.
2. **Given** a reply is still streaming, **When** the visitor looks at the message bubble, **Then**
   text is visibly accumulating rather than the interface appearing frozen.
3. **Given** an earlier exchange in the same visit, **When** the visitor sends a message referring
   back to it, **Then** the reply demonstrates awareness of the earlier turn.
4. **Given** a reply has finished, **When** the visitor reads it, **Then** no bracketed cue, markup,
   or internal instruction text is visible anywhere in the message.
5. **Given** a reply is in progress, **When** the visitor tries to send another message, **Then**
   sending is prevented or queued, and the reason is visible.
6. **Given** the visitor reloads the page, **When** it loads again, **Then** the message log is
   empty and no trace of the previous conversation is shown.

---

### User Story 3 - Character reacts to what it says (Priority: P3)

When a reply finishes arriving, the character plays a reaction animation matching the reply's
emotional tone and adopts a matching facial expression. The expression lingers after the motion
ends, so the mood carries, then the idle loop resumes underneath.

**Why this priority**: This is the payoff that distinguishes the demo from any text chatbot, but it
depends on both prior stories existing. It is a visible enhancement rather than a prerequisite.

**Independent Test**: Send messages designed to provoke different tones (a joke, bad news, a plain
question) and confirm the character's reaction visibly differs between them and matches the reply's
tone, then confirm the idle loop resumes.

**Acceptance Scenarios**:

1. **Given** a reply with a cheerful tone has just finished, **When** the reaction plays, **Then**
   the animation and expression differ visibly from those played after a sad or neutral reply.
2. **Given** a reaction animation finishes, **When** several seconds pass with no new message,
   **Then** the facial expression is still the reaction's expression and the idle loop is running
   underneath it.
3. **Given** a reply arrives with no recognisable emotional cue, or a cue outside the supported set,
   **When** the reply is displayed, **Then** the full reply text is shown and the character remains
   in a neutral state rather than failing or showing an error.
4. **Given** a new reaction is triggered while a previous reaction is still playing, **When** the new
   one starts, **Then** exactly one reaction is visible — the newer one — with no visual overlap or
   stuck pose.

---

### User Story 4 - The wait reads as thinking (Priority: P4)

Between sending a message and the first words of the reply appearing, the character visibly behaves
as though it is thinking, so a slow reply reads as consideration rather than as a broken page.

**Why this priority**: A polish pass, but the one that protects the demo against the most likely
day-to-day flaw — free-tier inference latency. Cheap to add once the reaction path exists.

**Independent Test**: Artificially delay a reply by several seconds and confirm the character enters
a distinct, visibly different state during the wait and leaves it when text begins arriving.

**Acceptance Scenarios**:

1. **Given** the visitor has just sent a message, **When** no reply text has arrived yet, **Then**
   the character is in a visibly distinct thinking state and a waiting indicator is present in the
   chat panel.
2. **Given** the character is in the thinking state, **When** the first reply text arrives, **Then**
   the thinking state ends.
3. **Given** a reply takes an unusually long time, **When** the visitor waits, **Then** the thinking
   state continues without the character freezing or the page appearing hung.
4. **Given** no reply has arrived after 20 seconds, **When** the attempt is abandoned, **Then** the
   thinking state ends, the character returns to idle, and the visitor is told they can send again.

---

### Edge Cases

- **Character assets fail to load** (missing file, blocked request, unsupported browser): a still
  image of the character is shown and the conversation remains fully usable.
- **Reply is empty or contains only an emotional cue**: nothing malformed is displayed; the visitor
  sees a short fallback message and the character stays neutral.
- **Cue text appears mid-reply rather than at the end**: the displayed text is unaffected, and the
  character's reaction is driven only by a cue in the expected position.
- **The provider is unreachable, errors, or times out**: after at most 20 seconds the attempt is
  abandoned with no automatic retry. The visitor sees a plain, actionable message inviting them to
  send again; no provider error text, status code, or diagnostic detail is shown; the character leaves
  the thinking state and returns to idle.
- **Reply stalls after starting**: if text has begun arriving and then stops, the partial reply stays
  visible and the visitor can send again; nothing already shown is retracted.
- **Usage limit reached** (the visitor sends too many messages, or the shared free-tier allowance is
  exhausted): the visitor is told in plain language that the demo is temporarily limited and can
  retry later; the page does not break.
- **Automated or abusive traffic**: requests beyond the global daily ceiling are rejected before
  reaching the provider, so the provider allowance and its cost stay bounded no matter how much
  traffic arrives. Because the ceiling is global and no visitor is identified, sustained automated
  traffic can consume the day's ceiling and put the demo into its temporary-limit state for everyone
  until the next reset — an accepted tradeoff of having no visitor identity.
- **Extremely long visitor message**: input stops at 300 characters, and the remaining allowance is
  visible before sending rather than the send failing.
- **Very long conversation in one visit**: only the 6 most recent messages travel onward, so replies
  keep arriving and cost per request stays flat. The visitor sees no failure, but the character will
  not recall turns older than that window — expected behaviour, not a defect.
- **Visitor navigates away or reloads mid-reply**: the in-flight reply is abandoned cleanly and no
  further work is charged to the demo's allowance.
- **Announcement collides with a new send**: if the visitor sends again immediately after a reply
  completes, announcements MUST NOT interrupt each other or be lost — the later state wins and is
  announced once.
- **Narrow or short viewport**: character and chat panel both remain usable, neither cropped to the
  point of being unusable, and the page never scrolls sideways.
- **Visitor prefers reduced motion**: idle drift and reaction animations do not play; each emotional
  state appears as its still expression, cross-faded in. The character never moves, yet still visibly
  responds to what it said, and the conversation is unaffected.
- **Rapid repeated sends**: only one turn is in flight at a time; duplicate turns are not created.

## Requirements *(mandatory)*

### Functional Requirements

**Presentation**

- **FR-001**: The page MUST present, in a single view with no navigation, a character display area, a
  scrolling message log, and a text input with a send control.
- **FR-002**: The message log MUST visually distinguish visitor messages from character messages and
  MUST keep the newest message in view as content grows.
- **FR-003**: The page MUST remain usable on a narrow viewport, with all controls reachable by
  keyboard and no sideways page scrolling.
- **FR-036**: Reply text MUST be announced to assistive technology once, as a whole, when the reply is
  complete — never progressively as it accumulates — so a screen-reader user hears one coherent reply
  rather than fragments.
- **FR-037**: Entering the thinking state MUST produce a brief non-interrupting announcement that a
  reply is being prepared, and failures and limit messages MUST be announced by the same means, so no
  visitor-facing state is visible-only.
- **FR-038**: The character display MUST carry a text description that names the character and its
  current emotional state in plain words, updated whenever the emotional state changes, so the
  character's reaction is available to a visitor who cannot see the character display.
- **FR-004**: Every visitor-facing message — errors, limits, waiting states — MUST be plain language
  the visitor can act on, and MUST NOT expose provider names, error codes, or diagnostic text.

**Character behaviour**

- **FR-005**: The character MUST begin an idle animation loop automatically on load, with no visitor
  action, and MUST return to that loop whenever no other animation is playing.
- **FR-006**: The character MUST support a closed, documented set of emotional states, sized to what
  the chosen character rig can actually express (expected 4–8 values, including a neutral default).
  The set MUST be established by inventorying the rig's available animations and expressions before
  the set is fixed.
- **FR-007**: Each supported emotional state MUST map to exactly one reaction animation and, where
  the rig provides them, one facial expression. Every value in the set MUST have a mapping, and an
  unmapped value MUST be impossible to introduce silently.
- **FR-008**: A reaction MUST visibly take precedence over the idle loop while it plays, and its
  expression MUST persist after the motion ends until the next reaction or state change.
- **FR-009**: Triggering a reaction while one is playing MUST result in a single visible reaction —
  the newer one — with no overlap or stuck pose.
- **FR-010**: The character MUST have a distinct thinking state, entered when a reply has been
  requested and no reply text has yet arrived, and exited when reply text begins arriving.
- **FR-011**: The character MUST hold visibly smooth motion during idle, reaction, and thinking
  states on the project's baseline target device.
- **FR-012**: The character display MUST be replaceable by a still image with no change to
  conversation behaviour, and MUST fall back to that still image automatically when the animated
  character cannot be displayed.
- **FR-013**: Repeated mounting, unmounting, or resizing of the character display MUST NOT leave
  duplicate characters on screen, accumulate graphics resources, or degrade animation smoothness.
- **FR-014**: When the visitor's platform signals a reduced-motion preference, the character MUST
  still convey emotional state but MUST NOT convey it through movement: idle drift and reaction
  animations are suppressed, and each emotional state is shown as its still expression or pose,
  reached by a brief cross-fade rather than a hard cut or a played animation. Conversation MUST remain
  fully functional, and the emotion seam MUST be unchanged — the conversation layer still hands over
  one emotional state and remains unaware that motion is suppressed.
- **FR-035**: The reduced-motion preference MUST be honoured for the whole visit including page load,
  so no motion plays before the preference is applied, and MUST take effect without the visitor
  configuring anything in the page.

**Conversation**

- **FR-015**: Sending a message MUST add it to the visible log immediately, before any reply is
  requested.
- **FR-016**: Reply text MUST be displayed progressively as it arrives, not withheld until the reply
  is complete.
- **FR-017**: Conversation history for the current visit MUST accompany each new message so replies
  are aware of earlier turns, bounded to the 6 most recent messages — visitor and character combined,
  counted per the definition of a turn in Key Entities — with anything older dropped from what travels
  onward while remaining visible in the log.
- **FR-018**: The reply MUST carry a single emotional cue as plain text at an agreed position, and
  the conversation layer MUST strip that cue from the displayed text before the visitor can see it.
- **FR-019**: A missing, malformed, or unrecognised cue MUST NOT prevent the reply text from being
  displayed; the character MUST fall back to neutral.
- **FR-020**: The conversation layer MUST hand the character exactly one emotional state value and
  nothing else. It MUST NOT reference animations, expressions, or rendering behaviour, and the
  character MUST NOT reference messages, turns, or the provider.
- **FR-021**: Exactly one turn MUST be in flight at a time; further sends MUST be prevented or queued
  while a reply is arriving, with the reason visible to the visitor.
- **FR-022**: Visitor input MUST be capped at 300 characters, with the cap visible before sending and
  input beyond it prevented rather than silently truncated at send time.
- **FR-023**: A failed, empty, or abandoned reply MUST leave the conversation in a state where the
  visitor can send another message without reloading the page.
- **FR-024**: Conversation history MUST exist only for the duration of the visit and MUST NOT be
  written to any persistent store on the device or the server.

**Inference proxy**

- **FR-025**: All provider requests MUST pass through a server-side endpoint owned by this project.
  The provider credential MUST NOT be present in anything delivered to the browser.
- **FR-026**: The endpoint MUST attach the character's persona instructions — including the
  instruction to emit the emotional cue — server-side. The browser MUST NOT be able to supply,
  replace, or read those instructions.
- **FR-027**: The endpoint MUST stream the reply back to the browser as it arrives from the provider,
  without waiting for completion.
- **FR-028**: The endpoint MUST enforce a single global ceiling of 150 requests shared by all
  visitors, reset on a fixed daily period, and MUST reject requests beyond it before contacting the provider. The
  count MUST hold across separate server invocations, not only within one. No per-visitor limit is
  enforced and no visitor identifier — address, token, or fingerprint — is derived, transmitted, or
  stored for limiting purposes.
- **FR-029**: The endpoint MUST validate incoming request shape and reject anything malformed without
  contacting the provider.
- **FR-030**: The endpoint MUST translate provider failures into a generic failure response and MUST
  NOT relay provider error text or credentials to the browser.
- **FR-034**: A reply request MUST be abandoned after 20 seconds without completing, counted from
  when the request reaches the endpoint. Abandonment MUST be treated as a failure per FR-030 and
  MUST NOT be retried automatically — recovery is the visitor sending again. A request that has begun
  streaming text MUST be allowed to finish streaming rather than being cut off at the 20-second mark.
- **FR-031**: The endpoint MUST NOT log visitor message content or reply content by default.
- **FR-032**: The provider, endpoint address, model identifier, and persona text MUST all be
  configurable without changing conversation or character behaviour.

**Out of scope**

- **FR-033**: The feature MUST NOT include voice input or output, accounts or sign-in, saved or
  resumable conversations, multiple characters, or a character-selection interface.

### Key Entities

- **Message**: one turn in the log — author (visitor or character), text as displayed, and whether it
  is still arriving. Lives only in browser memory for the visit.
- **Conversation history**: the ordered list of messages for the current visit, and the bounded slice
  of it sent onward with each new message.
- **Emotional state**: one value from the closed supported set, plus a neutral default. The single
  and only value passed from conversation to character.
- **Emotional cue**: the plain-text marker carried at an agreed position in a reply, from which an
  emotional state is derived and which is never displayed.
- **Character capability inventory**: the animations and expressions the chosen rig actually
  provides, from which the emotional state set and its mapping are derived.
- **Persona instructions**: the character's personality and the cue-emission instruction, held
  server-side only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can send a message and read a reply without instructions, on the
  first attempt, within 30 seconds of page load.
- **SC-014**: A visitor using only a keyboard and a screen reader can complete a full exchange — send
  a message, learn that a reply is coming, hear the complete reply once, and learn the character's
  resulting mood — without encountering an unlabelled control or a fragmented, word-by-word
  announcement.
- **SC-002**: The character is visible and animating within 3 seconds of page load on a normal
  broadband connection.
- **SC-003**: Character motion stays visibly smooth on the baseline target device — 60 frames per
  second sustained, never dropping below 30 — during idle, reaction, and thinking states.
- **SC-004**: The visitor sees a response to their send — their own message in the log plus a waiting
  indicator — within 100 milliseconds of sending, every time.
- **SC-005**: The first words of a reply appear within 3 seconds of sending in at least 90% of turns.
  Whenever they do not, the thinking state is visible for the whole wait, so the page is never
  visibly frozen.
- **SC-006**: Across 20 varied test messages, an emotional cue is emitted, correctly stripped from
  the visible text, and mapped to a reaction in at least 90% of replies. In 100% of replies the full
  text is displayed regardless of cue quality.
- **SC-007**: No cue markup, persona text, provider error text, or credential is visible to the
  visitor in any of those 20 turns.
- **SC-008**: Reaction animations are distinguishable: an observer shown replies of differing tone
  can tell the character's reactions apart in at least 4 of 5 pairs. With reduced motion enabled the
  same observer can still tell them apart in at least 4 of 5 pairs from the still expressions alone,
  while no movement is observable anywhere on the page.
- **SC-009**: Every failure path — assets missing, provider unreachable, limit reached, reply empty,
  20-second timeout — leaves the visitor with an actionable plain-language message and a page they can
  keep using without reloading. No failure leaves the character in the thinking state, and no single
  visitor send ever consumes more than one request from the daily ceiling.
- **SC-010**: An unattended flood of automated requests stops reaching the provider the moment the
  global daily ceiling is hit, so provider usage for that day cannot exceed the ceiling regardless of
  traffic volume. Every visitor turned away — bot or human — receives the plain-language
  temporary-limit message rather than a broken page.
- **SC-011**: A 30-minute session of 20 turns shows no duplicate characters, no degradation in
  animation smoothness, and no increase in reply latency attributable to the page.
- **SC-012**: Replacing the character display with a still image, or switching the model provider,
  requires no change on the other side of the emotion seam — demonstrated by doing each once.
- **SC-013**: With the caps in force, a single day's provider usage cannot exceed 150 requests, and
  the text sent onward for any one request cannot exceed 300 characters of new input plus the 6 most
  recent messages — verifiable by driving the endpoint past each cap and observing rejection.

## Assumptions

- **Audience and traffic**: casual portfolio visitors on desktop-class browsers, at low and bursty
  volume. Narrow viewports must remain usable but are not the primary target.
- **Baseline target device**: a mid-range laptop with a modern browser and hardware-accelerated
  graphics. The performance targets in SC-003 are stated against that baseline.
- **Character rig**: a freely licensed sample character is used, licensed for non-commercial use,
  which is what this public portfolio demo is. Its animations and expressions are inventoried before
  the emotional state set is fixed, so the set is derived from the rig rather than chosen up front.
- **Cost model**: inference runs on a free tier. A 6-message history window (FR-017), a
  300-character input cap (FR-022), and a 150-request daily ceiling (FR-028) exist to keep usage inside that allowance. A shared
  allowance exhausted by other traffic — whether the provider's or this demo's own ceiling — is
  treated as a temporary-limit condition, not a defect.
- **No visitor identity**: the demo deliberately identifies no visitor at all, so fair-share limiting
  between visitors is impossible by construction. A global ceiling was chosen over hashed-address
  limiting to keep the privacy claim absolute: nothing derived from a visitor is ever stored, not even
  a hash. The accepted cost is that one heavy or automated caller can consume the day's ceiling.
- **Emotional cue format**: a short plain-text marker at the end of a reply, chosen over structured
  output because small free-tier models comply with it more reliably, and because its failure mode is
  a plain reply with a neutral character rather than nothing to display.
- **No persistence, no identity**: no database, no accounts, no session storage. A visitor does not
  return to resume a conversation, so conversation history lives in browser memory only. This is also
  why the global request ceiling must be counted outside server process memory.
- **Single deployment**: the page and the inference endpoint ship as one deployable unit, so no
  cross-origin configuration is required.
- **Content moderation** relies on the provider's own safeguards plus the persona instructions; no
  additional filtering layer is in scope.
- **Reduced-motion handling** relies on the platform's existing preference signal; no in-page motion
  toggle is required.
- **Assistive technology**: announcements target the screen readers commonly paired with the target
  desktop browsers. The emotional state name exposed as text (FR-038) is the same closed set used
  across the emotion seam, so it needs no separate vocabulary.
- **Technology choices** (rendering library, framework, hosting, provider) are recorded in the
  implementation plan, not here. This specification is written so that either side of the emotion
  seam can be replaced without amending it.
