import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageInput from '@/components/MessageInput';
import MessageLog from '@/components/MessageLog';
import Announcer from '@/components/Announcer';
import ChatPanel from '@/components/ChatPanel';
import { copy } from '@/lib/ui/copy';
import type { Message } from '@/lib/conversation/limits';
import type { Conversation } from '@/lib/conversation/useConversation';
import { NEUTRAL } from '@/lib/emotion';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

// T043 & T116. Behaviour, not internals: what the visitor sees and what a screen reader is told.

function message(partial: Partial<Message> & Pick<Message, 'author' | 'text'>): Message {
  return { id: partial.text.slice(0, 10), status: 'completed', ...partial };
}

function mockConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    messages: [],
    status: 'idle',
    threadId: 'test-thread-uuid',
    emotion: NEUTRAL,
    inFlight: false,
    notice: null,
    announcement: null,
    send: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    isHistoryLoading: false,
    historyError: null,
    loadHistory: vi.fn().mockResolvedValue(undefined),
    retryHistory: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('MessageInput', () => {
  it('shows the remaining allowance before sending, not after (FR-022)', async () => {
    render(<MessageInput onSend={vi.fn()} disabled={false} />);
    expect(screen.getByText(copy.charactersRemaining(300))).toBeTruthy();

    await userEvent.type(screen.getByRole('textbox'), 'hello');
    expect(screen.getByText(copy.charactersRemaining(295))).toBeTruthy();
  });

  it('prevents input beyond 300 rather than truncating at send time', async () => {
    render(<MessageInput onSend={vi.fn()} disabled={false} />);
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;

    await userEvent.click(box);
    await userEvent.paste('x'.repeat(350));

    expect(box.value).toHaveLength(300);
    expect(screen.getByText(copy.atCharacterLimit)).toBeTruthy();
  });

  it('sends the draft and clears the box', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} disabled={false} />);

    await userEvent.type(screen.getByRole('textbox'), 'hello there');
    await userEvent.click(screen.getByRole('button', { name: copy.sendLabel }));

    expect(onSend).toHaveBeenCalledWith('hello there');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  });

  it('sends on Enter but not on Shift+Enter', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} disabled={false} />);
    const box = screen.getByRole('textbox');

    await userEvent.type(box, 'first{Shift>}{Enter}{/Shift}');
    expect(onSend).not.toHaveBeenCalled();

    await userEvent.type(box, '{Enter}');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('refuses a blank draft', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} disabled={false} />);

    await userEvent.type(screen.getByRole('textbox'), '   ');
    await userEvent.type(screen.getByRole('textbox'), '{Enter}');

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: copy.sendLabel })).toHaveProperty('disabled', true);
  });

  it('shows why sending is refused while a turn is in flight (FR-021)', () => {
    render(
      <MessageInput onSend={vi.fn()} disabled disabledReason={copy.replyInProgress} />,
    );
    expect(screen.getByText(copy.replyInProgress)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.sendLabel })).toHaveProperty('disabled', true);
  });

  it('disables sending and displays connecting notice during connecting status (FR-045)', () => {
    render(<MessageInput onSend={vi.fn()} disabled={false} status="connecting" />);
    expect(screen.getByText(copy.connecting)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.sendLabel })).toHaveProperty('disabled', true);
  });

  it('keeps unsent input across a re-render (constitution III)', async () => {
    const { rerender } = render(<MessageInput onSend={vi.fn()} disabled={false} />);
    await userEvent.type(screen.getByRole('textbox'), 'half a thought');

    // A reply arriving elsewhere re-renders the panel. The draft must survive it.
    rerender(<MessageInput onSend={vi.fn()} disabled disabledReason={copy.replyInProgress} />);

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('half a thought');
  });

  it('labels its control for a screen reader (FR-003)', () => {
    render(<MessageInput onSend={vi.fn()} disabled={false} />);
    expect(screen.getByLabelText(copy.inputLabel)).toBeTruthy();
  });
});

describe('ChatPanel (FR-045)', () => {
  it('shows connecting indicator and disables send during connecting status', () => {
    render(
      <ChatPanel
        conversation={mockConversation({
          status: 'connecting',
          threadId: null,
        })}
      />,
    );

    expect(screen.getAllByText(copy.connecting).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: copy.sendLabel })).toHaveProperty('disabled', true);
  });

  it('transitions from connecting to idle enabling the send button', async () => {
    const { rerender } = render(
      <ChatPanel
        conversation={mockConversation({
          status: 'connecting',
          threadId: null,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: copy.sendLabel })).toHaveProperty('disabled', true);

    rerender(
      <ChatPanel
        conversation={mockConversation({
          status: 'idle',
          threadId: 'uuid-1234',
        })}
      />,
    );

    await userEvent.type(screen.getByRole('textbox'), 'Hello');
    expect(screen.getByRole('button', { name: copy.sendLabel })).toHaveProperty('disabled', false);
  });

  it('displays thinking dots in MessageLog when status is waiting (FR-040)', () => {
    render(
      <ChatPanel
        conversation={mockConversation({
          status: 'waiting',
          inFlight: true,
          threadId: 'uuid-1234',
        })}
      />,
    );

    expect(screen.getByTestId('thinking-dots')).toBeTruthy();
  });

  it('disables message input when an interrupted message is present (FR-018, FR-019)', () => {
    render(
      <ChatPanel
        conversation={mockConversation({
          status: 'idle',
          inFlight: false,
          threadId: 'uuid-1234',
          messages: [
            {
              id: 'msg-1',
              author: 'character',
              text: 'Awaiting your approval...',
              status: 'interrupted',
            },
          ],
        })}
      />,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(screen.getByRole('button', { name: copy.sendLabel })).toHaveProperty('disabled', true);
    expect(screen.getByText('Awaiting approval...')).toBeTruthy();
  });

  it('renders HitlConfirmation card attached to interrupted message (FR-021, US5)', () => {
    render(
      <ChatPanel
        conversation={mockConversation({
          status: 'idle',
          inFlight: false,
          threadId: 'uuid-1234',
          messages: [
            {
              id: 'msg-1',
              author: 'character',
              text: 'Approve buying 10 shares of META? (yes/no)',
              status: 'interrupted',
              interruptId: 'int-789',
            },
          ],
        })}
      />,
    );

    const confirmationCard = screen.getByRole('region', { name: /confirmation/i });
    expect(confirmationCard).toBeTruthy();
    expect(screen.getByRole('button', { name: /yes/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /no/i })).toBeTruthy();
  });

  it('restores draft into message input when status transitions to error (FR-020)', async () => {
    const send = vi.fn();
    const { rerender } = render(
      <ChatPanel
        conversation={mockConversation({
          status: 'idle',
          inFlight: false,
          threadId: 'uuid-1234',
          send,
        })}
      />,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(textarea, 'Buy 10 shares{Enter}');

    expect(send).toHaveBeenCalledWith('Buy 10 shares');
    expect(textarea.value).toBe('');

    // Stream fails with error
    rerender(
      <ChatPanel
        conversation={mockConversation({
          status: 'error',
          notice: copy.failedGeneric,
          inFlight: false,
          threadId: 'uuid-1234',
          send,
        })}
      />,
    );

    // Textarea is re-enabled and draft is restored
    expect(textarea.disabled).toBe(false);
    expect(textarea.value).toBe('Buy 10 shares');
  });

  it('renders Stop button during streaming and invokes conversation.stop on click or Escape', async () => {
    const stopMock = vi.fn().mockResolvedValue(undefined);
    render(
      <ChatPanel
        conversation={mockConversation({
          status: 'streaming',
          inFlight: true,
          stop: stopMock,
        })}
      />,
    );

    const stopBtn = screen.getByRole('button', { name: copy.stopLabel });
    expect(stopBtn).toBeTruthy();

    await userEvent.click(stopBtn);
    expect(stopMock).toHaveBeenCalledTimes(1);

    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, '{Escape}');
    expect(stopMock).toHaveBeenCalledTimes(2);
  });

  it('submits user input and selected model to conversation.send', async () => {
    const send = vi.fn();
    const mockModels = ['model-standard', 'model-fast'];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url, options) => {
      if (String(url).endsWith('/models') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockModels),
        });
      }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') });
    });

    try {
      render(
        <ChatPanel
          conversation={mockConversation({
            threadId: 'thread-test-789',
            send,
          })}
        />,
      );

      const modelSelect = (await screen.findByRole('combobox', { name: copy.modelSelectLabel })) as HTMLSelectElement;
      await userEvent.selectOptions(modelSelect, 'model-fast');

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await userEvent.type(textarea, 'Testing model selection{Enter}');

      expect(send).toHaveBeenCalledWith('Testing model selection', 'model-fast');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MessageLog', () => {
  it('distinguishes visitor messages from character messages (FR-002)', () => {
    render(
      <MessageLog
        messages={[
          message({ author: 'visitor', text: 'mine' }),
          message({ author: 'character', text: 'hers' }),
        ]}
      />,
    );

    const mine = screen.getByText(/mine/).closest('.message');
    const hers = screen.getByText(/hers/).closest('.message');

    expect(mine?.className).toContain('visitor');
    expect(hers?.className).toContain('character');
    expect(mine?.className).not.toEqual(hers?.className);
  });

  it('marks a streaming message so the interface can show it is still arriving', () => {
    render(<MessageLog messages={[message({ author: 'character', text: 'part', status: 'streaming' })]} />);
    expect(screen.getByText(/part/).closest('.message')?.getAttribute('data-status')).toBe(
      'streaming',
    );
  });

  it('is a log for assistive technology', () => {
    render(<MessageLog messages={[]} />);
    expect(screen.getByRole('log')).toBeTruthy();
  });

  it('renders character icon beside character messages and not visitor messages (FR-002)', () => {
    const { container } = render(
      <MessageLog
        messages={[
          message({ author: 'visitor', text: 'mine' }),
          message({ author: 'character', text: 'hers' }),
        ]}
      />,
    );

    const icons = container.querySelectorAll('[data-testid="character-icon"]');
    expect(icons.length).toBe(1);

    const hers = screen.getByText(/hers/).closest('.message');
    expect(hers?.parentElement?.querySelector('[data-testid="character-icon"]')).toBeTruthy();

    const mine = screen.getByText(/mine/).closest('.message');
    expect(mine?.parentElement?.querySelector('[data-testid="character-icon"]')).toBeNull();
  });

  it('aligns visitor messages right and character messages left with flex-1 right edge', () => {
    render(
      <MessageLog
        messages={[
          message({ author: 'visitor', text: 'mine' }),
          message({ author: 'character', text: 'hers' }),
        ]}
      />,
    );

    const mineWrapper = screen.getByText(/mine/).closest('.message')?.parentElement;
    expect(mineWrapper?.className).toContain('justify-end');

    const hersBubble = screen.getByText(/hers/).closest('.message');
    expect(hersBubble?.className).toContain('flex-1');
  });

  it('renders a temporary thinking bubble with thinking dots when status === "waiting" (FR-040)', () => {
    render(
      <MessageLog
        messages={[message({ author: 'visitor', text: 'hello' })]}
        status="waiting"
      />,
    );

    expect(screen.getByTestId('thinking-bubble')).toBeTruthy();
    expect(screen.getByTestId('thinking-dots')).toBeTruthy();
    expect(screen.getByRole('status', { name: /thinking/i })).toBeTruthy();
    expect(screen.getByText('Aria')).toBeTruthy();

    const bubble = screen.getByTestId('thinking-bubble');
    expect(bubble.querySelector('[data-testid="character-icon"]')).toBeTruthy();
  });

  it('does not render thinking bubble when status is idle, streaming, or error (FR-040)', () => {
    const { rerender } = render(
      <MessageLog
        messages={[message({ author: 'visitor', text: 'hello' })]}
        status="idle"
      />,
    );
    expect(screen.queryByTestId('thinking-bubble')).toBeNull();

    rerender(
      <MessageLog
        messages={[message({ author: 'visitor', text: 'hello' })]}
        status="streaming"
      />,
    );
    expect(screen.queryByTestId('thinking-bubble')).toBeNull();

    rerender(
      <MessageLog
        messages={[message({ author: 'visitor', text: 'hello' })]}
        status="error"
      />,
    );
    expect(screen.queryByTestId('thinking-bubble')).toBeNull();
  });

  it('thinking dots animation respects prefers-reduced-motion (FR-014)', () => {
    render(<MessageLog messages={[]} status="waiting" />);

    const dots = screen.getByTestId('thinking-dots').querySelectorAll('span');
    expect(dots.length).toBe(3);
    dots.forEach((dot) => {
      expect(dot.className).toContain('motion-reduce:animate-none');
    });
  });

  it('renders subtle (Stopped) indicator when message status is cancelled (FR-025)', () => {
    render(
      <MessageLog
        messages={[
          message({ author: 'character', text: 'This was cancel', status: 'cancelled' }),
        ]}
      />,
    );

    const indicator = screen.getByTestId('stopped-indicator');
    expect(indicator).toBeTruthy();
    expect(indicator.textContent).toBe('(Stopped)');
  });

  it('does not render empty failed character message when subsequent message is sent', () => {
    const { container } = render(
      <MessageLog
        messages={[
          message({ id: 'visitor-1', author: 'visitor', text: 'First user message' }),
          message({ id: 'char-1', author: 'character', text: '', status: 'streaming' }),
          message({ id: 'visitor-2', author: 'visitor', text: 'Second user message' }),
        ]}
        status="idle"
      />,
    );

    // char-1 has no content and is not the active streaming message, so it must not render
    expect(screen.queryByTestId('thinking-dots')).toBeNull();
    expect(container.querySelectorAll('.message.character')).toHaveLength(0);
    expect(screen.getByText('First user message')).toBeTruthy();
    expect(screen.getByText('Second user message')).toBeTruthy();
  });
});

describe('Announcer (FR-036, FR-037)', () => {
  it('says nothing at rest', () => {
    render(<Announcer status="idle" announcement={null} notice={null} />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('announces the connecting state during initial thread creation (FR-045)', () => {
    render(<Announcer status="connecting" announcement={null} notice={null} />);
    expect(screen.getByRole('status').textContent).toBe(copy.connecting);
  });

  it('announces the thinking state when the wait begins', () => {
    render(<Announcer status="waiting" announcement={null} notice={null} />);
    expect(screen.getByRole('status').textContent).toBe(copy.thinking);
  });

  it('announces the completed reply once, whole', () => {
    render(<Announcer status="idle" announcement="A whole sentence." notice={null} />);
    expect(screen.getByRole('status').textContent).toBe(copy.replyComplete('A whole sentence.'));
  });

  it('never announces a partial reply, because streaming text never reaches it', () => {
    // The contract with useConversation: `announcement` is set only on completion. A streaming
    // status with no announcement must produce nothing, so no per-chunk interruption is possible.
    render(<Announcer status="streaming" announcement={null} notice={null} />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('announces failures and limits through the same channel (FR-037)', () => {
    const { rerender } = render(
      <Announcer status="error" announcement={null} notice={copy.failedTimeout} />,
    );
    expect(screen.getByRole('status').textContent).toBe(copy.failedTimeout);

    rerender(<Announcer status="limited" announcement={null} notice={copy.limited} />);
    expect(screen.getByRole('status').textContent).toBe(copy.limited);
  });

  it('lets the later state win when a send follows a reply immediately', () => {
    // spec Edge Cases: announcements must not interrupt each other or be lost - the later state
    // wins and is announced once.
    const { rerender } = render(
      <Announcer status="idle" announcement="First reply." notice={null} />,
    );
    expect(screen.getByRole('status').textContent).toContain('First reply.');

    rerender(<Announcer status="waiting" announcement="First reply." notice={null} />);
    expect(screen.getByRole('status').textContent).toBe(copy.thinking);
  });

  it('is polite and atomic, so a reply is read as one utterance', () => {
    render(<Announcer status="idle" announcement="Whole thing." notice={null} />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
  });
});
