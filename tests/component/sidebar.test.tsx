import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from '@/components/Sidebar';
import type { ConversationItem } from '@/components/Sidebar';

describe('Sidebar Component (T120, FR-001, FR-003)', () => {
  const sampleConversations: ConversationItem[] = [
    { id: 'conv-1', title: 'Catching up with Aria', date: 'Today' },
    { id: 'conv-2', title: 'Live2D Animation Basics', date: 'Yesterday' },
  ];

  it('renders New Chat button and triggers onNewChat callback', async () => {
    const onNewChat = vi.fn();
    render(<Sidebar onNewChat={onNewChat} />);

    const newChatBtn = screen.getByRole('button', { name: /new chat/i });
    expect(newChatBtn).toBeTruthy();

    await userEvent.click(newChatBtn);
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('renders passed past conversations list with titles and dates', () => {
    render(<Sidebar conversations={sampleConversations} />);

    expect(screen.getByText('Catching up with Aria')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Live2D Animation Basics')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
  });

  it('renders conversations from fetch when conversations prop is omitted', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: 'c-1', threadId: 't-1', title: 'Dynamic Chat 1', createdAt: '2026-10-08T10:00:00Z', updatedAt: '2026-10-08T10:00:00Z' },
        { id: 'c-2', threadId: 't-2', title: 'Dynamic Chat 2', createdAt: '2026-10-07T10:00:00Z', updatedAt: '2026-10-07T10:00:00Z' },
      ],
    });

    render(<Sidebar />);

    const list = await screen.findByRole('list', { name: /past conversations/i });
    expect(list).toBeTruthy();
    expect(list.children.length).toBeGreaterThan(0);
  });

  it('calls onSelectConversation when a conversation item is clicked', async () => {
    const onSelectConversation = vi.fn();
    render(
      <Sidebar
        conversations={sampleConversations}
        onSelectConversation={onSelectConversation}
      />,
    );

    await userEvent.click(screen.getByText('Catching up with Aria'));
    expect(onSelectConversation).toHaveBeenCalledWith('conv-1');
  });

  it('renders close button on mobile and calls onClose when clicked', async () => {
    const onClose = vi.fn();
    render(<Sidebar isOpen={true} onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: /close sidebar/i });
    expect(closeBtn).toBeTruthy();

    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders collapse toggle button for desktop and calls onToggleCollapse', async () => {
    const onToggleCollapse = vi.fn();
    render(
      <Sidebar
        isCollapsed={false}
        onToggleCollapse={onToggleCollapse}
      />,
    );

    const toggleBtn = screen.getByRole('button', { name: /collapse sidebar/i });
    expect(toggleBtn).toBeTruthy();

    await userEvent.click(toggleBtn);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('updates aria-label of toggle button when isCollapsed is true', () => {
    render(<Sidebar isCollapsed={true} />);

    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeTruthy();
  });
});
