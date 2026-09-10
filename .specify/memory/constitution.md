<!--
Sync Impact Report
Version change: 1.0.0 → 1.1.0
Modified sections:
  - Additional Constraints: the language and runtime clause was redefined from
    "Python >= 3.13 as declared in pyproject.toml" to "TypeScript on Node (Next.js App Router)
    with dependencies declared in package.json". Rationale: the constitution was ratified before
    the stack for feature 001-animated-character-chat was chosen, and it recorded the language of
    the repository scaffolding rather than a decision. The clause's intent - one declared language
    and runtime, dependencies declared in a manifest and never installed ad hoc - is unchanged.
Principles: unchanged (I. Code Quality, II. Testing Standards, III. User Experience Consistency,
  IV. Performance Requirements)
Added sections: none
Removed sections: none
Migration of existing code: the repository's `main.py`, `pyproject.toml`, `.python-version`, and
  `.venv` are scaffolding unused by any feature. They are NOT grandfathered - they are to be
  removed before feature 001 merges, or explicitly retained if a Python service is added as a
  deliberate portfolio goal (see D12 in specs/001-animated-character-chat/research.md).
Follow-up TODOs: none
-->

# Animation Chatbot Constitution

## Core Principles

### I. Code Quality

Code MUST be readable before it is clever; the reviewer, not the author, is the judge.
Rules:

- Every module, function, and public symbol has a single stated responsibility. If its name
  needs "and", split it.
- Standard library and already-installed dependencies MUST be preferred over new code. A new
  third-party dependency requires a written justification in the PR describing what it replaces.
- No speculative abstraction: no interface with one implementation, no configuration knob for a
  value that never changes, no scaffolding "for later".
- Public functions MUST have type hints and MUST validate input received from users, files, or
  the network. Internal helpers MAY skip validation already performed at the boundary.
- Errors MUST either be handled or propagate with context. Silent `except: pass` is prohibited.
- Deliberate shortcuts with a known ceiling MUST be marked in-code with the ceiling and the
  upgrade path, so the trade-off is discoverable later.

Rationale: this project is small and will be maintained by whoever reads it next, most likely
under time pressure. Volume of code is the main cost driver, so the cheapest quality control is
writing less of it and making what remains obvious.

### II. Testing Standards (NON-NEGOTIABLE)

Non-trivial logic MUST ship with an automated test in the same change. Non-trivial means a
branch, a loop, a parser, a state machine, or any path handling user input, animation timing, or
external API calls.
Rules:

- Every bug fix MUST add a test that fails before the fix and passes after it.
- Tests MUST assert observable behaviour (returned values, emitted events, rendered output), not
  internal call order or private attributes.
- Tests MUST be deterministic: no reliance on wall-clock time, network access, or random seeds
  unless the seed is fixed and the clock is injected.
- Chatbot response paths and animation state transitions MUST have integration-level coverage
  proving input reaches output through real wiring, not mocks of the code under test.
- Trivial one-liners and pure re-exports do NOT require tests.
- The full test suite MUST pass before merge. A skipped or `xfail` test requires a linked reason.

Rationale: an animated conversational interface has timing and state coupling that manual
clicking will not catch reliably. Deterministic tests are the only affordable regression net.

### III. User Experience Consistency

The interface MUST behave the same way for the same user action, everywhere in the product.
Rules:

- One source of truth for interaction vocabulary: animation durations, easing curves, colours,
  spacing, and copy tone are defined once in a shared module or token file and referenced, never
  re-typed per component.
- Every user-initiated action MUST produce visible feedback within 100ms, even when the
  underlying work is still running (typing indicator, skeleton, disabled control).
- Every failure MUST surface a message the user can act on. Raw exceptions, stack traces, and
  provider error codes MUST NOT reach the user-visible surface.
- Accessibility is not optional: keyboard reachability for all controls, text alternatives for
  non-text content, contrast meeting WCAG AA, and animation suppressed when the platform
  signals reduced-motion preference.
- Chat history, scroll position, and in-progress input MUST survive re-render and reconnection.

Rationale: inconsistency in a conversational UI reads as brokenness. Centralised tokens and
mandatory feedback keep behaviour predictable as features are added by different hands.

### IV. Performance Requirements

Performance targets are stated as numbers and verified, not asserted.
Rules:

- Animation MUST hold 60fps on the project's baseline target device; a sustained drop below
  30fps is a defect, not a tuning opportunity.
- First visible response to a user message MUST begin within 300ms of send. Model or network
  latency beyond that MUST be covered by streaming or a progress affordance, never a frozen UI.
- The UI thread MUST NOT block. Work exceeding one frame budget (~16ms) moves off the render
  path.
- Any performance claim in a PR MUST cite a measurement (timing, profile, or frame trace).
  "Should be faster" is not accepted.
- Optimisation MUST be preceded by a measurement identifying the actual hot path. Speculative
  optimisation that adds complexity is rejected under Principle I.
- Regressions above 10% on a measured path MUST be fixed or explicitly accepted with a recorded
  rationale before merge.

Rationale: perceived quality of an animated chatbot is almost entirely latency and smoothness.
Numbers make those properties reviewable; adjectives do not.

## Additional Constraints

- Language and runtime: TypeScript in `strict` mode on Node (Next.js App Router), with every
  dependency declared in `package.json` and never installed ad hoc. One declared language and
  runtime per deployable unit; adding a second requires an amendment to this clause.
- Secrets and API keys MUST come from environment or a secret store. They MUST NOT appear in
  source, fixtures, logs, or committed configuration.
- User conversation content MUST NOT be logged at any level above debug, and debug logging of
  conversation content MUST be off by default.
- Model and provider identifiers MUST be configurable, not hard-coded at call sites, so the
  model can be changed without touching logic.

## Development Workflow & Quality Gates

1. Specification and plan precede implementation for any change that adds user-visible
   behaviour. Bug fixes and mechanical refactors are exempt.
2. Every change is reviewed against the four principles above. A reviewer MAY block on any
   principle violation without needing further justification.
3. Merge gates, all mandatory: full test suite green, no new unexplained bracket tokens or TODOs
   in shipped docs, measurement cited for any performance-affecting change.
4. Any complexity a reviewer flags MUST be either removed or defended in writing in the PR. The
   default resolution is removal.

## Governance

This constitution supersedes other practices and conventions in this repository. Where a habit
and this document disagree, this document wins.

Amendment procedure: propose the change as a diff to this file with a written rationale, obtain
maintainer approval, and record the resulting version bump and date in the version line below.
Amendments affecting existing code MUST state whether existing code is grandfathered or must be
migrated, and by when.

Versioning policy follows semantic versioning:

- MAJOR: a principle is removed or redefined in a backward-incompatible way.
- MINOR: a principle or section is added, or guidance is materially expanded.
- PATCH: clarification, wording, or typo fixes with no change in obligation.

Compliance review: principle adherence is verified at code review for every PR. Repeated
violations of the same principle are grounds for amending the principle or adding an automated
check, rather than repeating the review comment.

**Version**: 1.1.0 | **Ratified**: 2026-08-31 | **Last Amended**: 2026-08-31
