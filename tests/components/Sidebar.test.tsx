import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from '@/components/Sidebar';

describe('Sidebar - User Story 7 (Sidebar Conversations Fetching)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('displays skeleton loader matching list items while /conversations request is pending (FR-029)', () => {
    // Hang fetch so it stays pending
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    render(<Sidebar />);

    const skeleton = screen.getByTestId('sidebar-skeleton');
    expect(skeleton).toBeTruthy();
    expect(skeleton.getAttribute('aria-busy')).toBe('true');
  });

  it('renders conversations sorted by date descending (latest at top) on success (FR-027, FR-028)', async () => {
    const mockData = [
      {
        id: 'conv-older',
        threadId: 't-1',
        title: 'Older conversation',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      },
      {
        id: 'conv-latest',
        threadId: 't-2',
        title: 'Latest conversation',
        createdAt: '2026-10-08T10:00:00Z',
        updatedAt: '2026-10-08T10:00:00Z',
      },
      {
        id: 'conv-middle',
        threadId: 't-3',
        title: 'Middle conversation',
        createdAt: '2026-10-05T10:00:00Z',
        updatedAt: '2026-10-05T10:00:00Z',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    render(<Sidebar />);

    // Skeleton disappears and list appears
    await waitFor(() => {
      expect(screen.queryByTestId('sidebar-skeleton')).toBeNull();
    });

    const list = screen.getByRole('list', { name: /past conversations/i });
    const items = within(list).getAllByRole('button');
    expect(items.length).toBe(3);

    // Latest should be at top
    expect(items[0]?.getAttribute('title')).toBe('Latest conversation');
    expect(items[1]?.getAttribute('title')).toBe('Middle conversation');
    expect(items[2]?.getAttribute('title')).toBe('Older conversation');
  });

  it('displays inline error and a Retry button when /conversations fetch fails (FR-030)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    globalThis.fetch = fetchMock;

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load conversations|request failed/i)).toBeTruthy();
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeTruthy();

    // Recover on retry
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'conv-1',
          threadId: 't-1',
          title: 'Recovered conversation',
          createdAt: '2026-10-08T10:00:00Z',
          updatedAt: '2026-10-08T10:00:00Z',
        },
      ],
    });

    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Recovered conversation')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('displays simple "No conversations" text with no extra buttons when list is empty (FR-031)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText('No conversations')).toBeTruthy();
    });

    // Make sure no extra retry or action buttons are rendered inside the list area
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    expect(screen.queryByRole('list', { name: /past conversations/i })).toBeNull();
  });

  it('supports controlled prop overrides for conversations, isLoading, error, and onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onSelect = vi.fn();

    const { rerender } = render(
      <Sidebar isLoading={true} onRetry={onRetry} onSelectConversation={onSelect} />
    );

    expect(screen.getByTestId('sidebar-skeleton')).toBeTruthy();

    // Controlled error
    rerender(
      <Sidebar
        isLoading={false}
        error="Custom error occurred"
        onRetry={onRetry}
        onSelectConversation={onSelect}
      />
    );
    expect(screen.getByText('Custom error occurred')).toBeTruthy();
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    await user.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);

    // Controlled conversations
    rerender(
      <Sidebar
        isLoading={false}
        error={null}
        conversations={[
          { id: 'c-1', title: 'Controlled Chat', date: 'Today' },
        ]}
        onSelectConversation={onSelect}
      />
    );
    expect(screen.getByText('Controlled Chat')).toBeTruthy();
    const chatBtn = screen.getByRole('button', { name: /controlled chat/i });
    await user.click(chatBtn);
    expect(onSelect).toHaveBeenCalledWith('c-1');
  });

  it('triggers onSelectConversation with threadId when item has threadId and highlights active conversation (FR-034)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    const sample = [
      {
        id: 'conv-id-1',
        threadId: 'thread-uuid-1',
        title: 'Active Thread Item',
        date: 'Today',
      },
    ];

    const { rerender } = render(
      <Sidebar
        conversations={sample}
        onSelectConversation={onSelect}
        activeThreadId="thread-uuid-1"
      />
    );

    const btn = screen.getByRole('button', { name: /active thread item/i });
    expect(btn.getAttribute('aria-current')).toBe('true');

    await user.click(btn);
    expect(onSelect).toHaveBeenCalledWith('conv-id-1', 'thread-uuid-1');

    // Without activeThreadId
    rerender(
      <Sidebar
        conversations={sample}
        onSelectConversation={onSelect}
        activeThreadId={null}
      />
    );
    expect(btn.getAttribute('aria-current')).toBeNull();
  });
});
