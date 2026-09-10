import { personaMessage } from '@/lib/server/persona';
import type { ValidOutboundMessage } from '@/lib/server/validate';

/**
 * One forwarded streaming call to an OpenAI-shaped chat-completions endpoint (research D5, D8).
 *
 * Provider, endpoint, model, and credential are all environment values, hard-coded nowhere
 * (FR-032). Swapping Groq for OpenRouter, Together, or OpenAI is a change of three environment
 * values and no source edit, which is what SC-012 asks to be demonstrable.
 *
 * This module knows nothing about HTTP status mapping or visitor-facing copy - it either returns a
 * body to read or throws. The route handler owns the translation (FR-030).
 */

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function readProviderConfig(env: Record<string, string | undefined>): ProviderConfig {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    // Configuration error, not a visitor error. The route handler turns this into the generic
    // failure message; it must never say "missing API key" to a visitor.
    throw new ProviderError('GROQ_API_KEY is not set');
  }

  return {
    apiKey,
    baseUrl: (env.GROQ_BASE_URL?.trim() || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    model: env.GROQ_MODEL?.trim() || 'llama-3.1-8b-instant',
  };
}

export interface CallOptions {
  config: ProviderConfig;
  messages: ValidOutboundMessage[];
  /** Aborts the upstream request. The route handler owns the deadline (FR-034). */
  signal: AbortSignal;
}

/**
 * Start the provider call and hand back the raw response body.
 *
 * The persona is attached here, ahead of the forwarded messages, so there is no path by which a
 * caller could omit it (FR-026).
 */
export async function callProvider({ config, messages, signal }: CallOptions): Promise<Response> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      // Short replies keep latency inside SC-005's 3-second first-token target and keep the free
      // tier's token budget flat.
      max_tokens: 220,
      temperature: 0.8,
      messages: [personaMessage(), ...messages],
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    // The upstream status is carried for server-side logging only. FR-030 forbids it reaching the
    // browser, and the route handler is what enforces that.
    throw new ProviderError(`provider responded ${response.status}`, response.status);
  }

  return response;
}

/**
 * Turn an OpenAI-shaped SSE body into a stream of plain text deltas.
 *
 * Re-emitting reduced text rather than proxying the provider's SSE is deliberate: it keeps
 * provider-shaped payloads, and any provider error text embedded in them, from ever reaching the
 * browser (FR-030). There is exactly one kind of event here, so there is nothing left to frame.
 */
export async function* readTextDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Anything after the last separator is a partial
      // frame and stays in the buffer.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '' || payload === '[DONE]') continue;

          let parsed: { choices?: Array<{ delta?: { content?: unknown } }> };
          try {
            parsed = JSON.parse(payload);
          } catch {
            // A malformed frame is the provider's problem, not the visitor's. Skip it; the reply
            // continues with whatever else arrives.
            continue;
          }

          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) yield delta;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
