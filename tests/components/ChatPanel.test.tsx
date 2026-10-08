import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatPanel from '@/components/ChatPanel';
import type { Conversation } from '@/lib/conversation/useConversation';
import { NEUTRAL } from '@/lib/emotion';

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

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

describe('ChatPanel - User Story 8 (Conversation History Loading)', () => {
  it('displays skeleton loader inside the main chat area while isHistoryLoading is true (FR-032)', () => {
    const conv = mockConversation({ isHistoryLoading: true });
    render(<ChatPanel conversation={conv} />);

    const skeleton = screen.getByTestId('chat-history-skeleton');
    expect(skeleton).toBeTruthy();
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
    expect(skeleton.getAttribute('aria-label')).toBe('Loading conversation history');

    // Message log is not rendered while skeleton is active
    expect(screen.queryByRole('log', { name: /messages/i })).toBeNull();

    // Input is disabled during history load
    const textarea = screen.getByRole('textbox');
    expect(textarea.hasAttribute('disabled')).toBe(true);
  });

  it('displays centered error message and Retry button when history fetch fails (FR-033)', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const conv = mockConversation({
      isHistoryLoading: false,
      historyError: 'Failed to retrieve conversation history.',
      retryHistory: onRetry,
    });

    render(<ChatPanel conversation={conv} />);

    const errorContainer = screen.getByTestId('chat-history-error');
    expect(errorContainer).toBeTruthy();
    expect(screen.getByText('Failed to retrieve conversation history.')).toBeTruthy();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeTruthy();

    await user.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders historical messages and enables text input when history loads successfully (FR-034, FR-035)', () => {
    const historicalMessages = [
      {
        id: 'msg-1',
        author: 'visitor' as const,
        text: 'Hello from past conversation!',
        status: 'completed' as const,
      },
      {
        id: 'msg-2',
        author: 'character' as const,
        text: 'Welcome back! How can I help you today?',
        status: 'completed' as const,
      },
    ];

    const conv = mockConversation({
      isHistoryLoading: false,
      historyError: null,
      messages: historicalMessages,
      threadId: 'loaded-thread-789',
    });

    render(<ChatPanel conversation={conv} />);

    // Skeleton and error must be absent
    expect(screen.queryByTestId('chat-history-skeleton')).toBeNull();
    expect(screen.queryByTestId('chat-history-error')).toBeNull();

    // Message log rendered with past messages
    const log = screen.getByRole('log', { name: /messages/i });
    expect(log).toBeTruthy();
    expect(screen.getByText('Hello from past conversation!')).toBeTruthy();
    expect(screen.getByText('Welcome back! How can I help you today?')).toBeTruthy();

    // Message input is enabled and ready to continue conversation
    const textarea = screen.getByRole('textbox');
    expect(textarea.hasAttribute('disabled')).toBe(false);
  });

  it('submits a new message for the loaded thread when user types and sends', async () => {
    const user = userEvent.setup();
    const sendMock = vi.fn();
    const conv = mockConversation({
      messages: [
        {
          id: 'hist-1',
          author: 'visitor' as const,
          text: 'Prior message',
          status: 'completed' as const,
        },
      ],
      threadId: 'active-history-thread',
      send: sendMock,
    });

    render(<ChatPanel conversation={conv} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Continuing our discussion');

    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    await user.click(sendBtn);

    expect(sendMock).toHaveBeenCalledWith('Continuing our discussion');
  });

  it('scrolls the message log to the bottom when history is rendered (FR-035)', () => {
    const historicalMessages = [
      { id: '1', author: 'visitor' as const, text: 'Old 1', status: 'completed' as const },
      { id: '2', author: 'character' as const, text: 'Old 2', status: 'completed' as const },
    ];
    const conv = mockConversation({
      messages: historicalMessages,
      threadId: 'thread-scroll-test',
    });

    render(<ChatPanel conversation={conv} />);
    const log = screen.getByRole('log', { name: /messages/i });
    expect(log).toBeTruthy();
    expect(log.scrollTop).toBe(log.scrollHeight);
  });

  it('supports controlled prop overrides for isHistoryLoading, historyError, and onRetryHistory', async () => {
    const user = userEvent.setup();
    const customRetry = vi.fn();
    const baseConv = mockConversation();

    const { rerender } = render(
      <ChatPanel
        conversation={baseConv}
        isHistoryLoading={true}
      />
    );

    expect(screen.getByTestId('chat-history-skeleton')).toBeTruthy();

    // Override with error
    rerender(
      <ChatPanel
        conversation={baseConv}
        isHistoryLoading={false}
        historyError="Custom network failure"
        onRetryHistory={customRetry}
      />
    );

    expect(screen.queryByTestId('chat-history-skeleton')).toBeNull();
    expect(screen.getByTestId('chat-history-error')).toBeTruthy();
    expect(screen.getByText('Custom network failure')).toBeTruthy();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    await user.click(retryBtn);
    expect(customRetry).toHaveBeenCalledTimes(1);
  });
});
