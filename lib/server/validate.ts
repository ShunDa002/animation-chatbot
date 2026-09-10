/**
 * Request shape validation (FR-029). Anything malformed is rejected with 400 before the provider is
 * contacted, so a bad request cannot cost the demo a provider call or a count from the ceiling.
 *
 * The rules are contracts/chat-api.md's, exactly:
 *   - 1 to 6 entries, oldest first
 *   - each content 1 to 300 characters after trim
 *   - the last entry must be role "user"
 *   - anything beyond `messages` is ignored, not an error
 *
 * Deliberately hand-written rather than schema-library-driven: it is four rules over one shape, and
 * the constitution asks for a written justification before a dependency is added. There is nothing
 * to justify here.
 */

import { HISTORY_WINDOW, MAX_INPUT_CHARACTERS } from '@/lib/limits';

export interface ValidOutboundMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ValidationResult =
  | { ok: true; messages: ValidOutboundMessage[] }
  | { ok: false; reason: string };

function isRole(value: unknown): value is 'user' | 'assistant' {
  return value === 'user' || value === 'assistant';
}

/**
 * Validate a parsed request body.
 *
 * `reason` is for server-side logging only. It never reaches the browser - the browser gets the one
 * plain sentence from lib/server/copy.ts (FR-030).
 */
export function validateChatRequest(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, reason: 'body is not an object' };
  }

  const { messages } = body as { messages?: unknown };

  if (!Array.isArray(messages)) return { ok: false, reason: 'messages is not an array' };
  if (messages.length === 0) return { ok: false, reason: 'messages is empty' };
  if (messages.length > HISTORY_WINDOW) {
    return { ok: false, reason: `messages has ${messages.length} entries, max ${HISTORY_WINDOW}` };
  }

  const validated: ValidOutboundMessage[] = [];

  for (const [index, entry] of messages.entries()) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return { ok: false, reason: `entry ${index} is not an object` };
    }

    const { role, content } = entry as { role?: unknown; content?: unknown };

    if (!isRole(role)) return { ok: false, reason: `entry ${index} has role ${String(role)}` };
    if (typeof content !== 'string') {
      return { ok: false, reason: `entry ${index} content is not a string` };
    }

    const trimmed = content.trim();
    if (trimmed.length === 0) return { ok: false, reason: `entry ${index} content is blank` };
    if (trimmed.length > MAX_INPUT_CHARACTERS) {
      return {
        ok: false,
        reason: `entry ${index} content is ${trimmed.length} characters, max ${MAX_INPUT_CHARACTERS}`,
      };
    }

    validated.push({ role, content: trimmed });
  }

  // The turn being requested has to be the visitor's. A history ending in an assistant message is
  // asking the model to continue itself, which is not a shape this endpoint serves.
  if (validated.at(-1)?.role !== 'user') {
    return { ok: false, reason: 'last entry is not role user' };
  }

  return { ok: true, messages: validated };
}

/** Parse and validate in one step, since a JSON error is a 400 for the same reason. */
export async function readChatRequest(request: Request): Promise<ValidationResult> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, reason: 'body is not valid JSON' };
  }
  return validateChatRequest(body);
}
