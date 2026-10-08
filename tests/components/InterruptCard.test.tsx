import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterruptCard } from '@/components/MessageList';

describe('InterruptCard - User Story 5 (HITL Confirmation UI) (T018a)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders confirmation card with Yes and No buttons in default state', () => {
    render(<InterruptCard threadId="thread-123" interruptId="int-456" />);

    const card = screen.getByRole('region', { name: /confirmation/i });
    expect(card).toBeTruthy();

    const yesBtn = screen.getByRole('button', { name: /yes/i });
    const noBtn = screen.getByRole('button', { name: /no/i });

    expect(yesBtn).toBeTruthy();
    expect(noBtn).toBeTruthy();
    expect((yesBtn as HTMLButtonElement).disabled).toBe(false);
    expect((noBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('submits "yes" to POST /chat/resume and shows Approved text summary', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'resumed' }),
    });
    global.fetch = fetchMock;

    const onSuccess = vi.fn();
    render(
      <InterruptCard
        threadId="thread-123"
        interruptId="int-456"
        onSuccess={onSuccess}
      />
    );

    const yesBtn = screen.getByRole('button', { name: /yes/i });
    await user.click(yesBtn);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const [url, options] = firstCall;
    expect(url).toContain('/chat/resume');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body as string);
    expect(body).toEqual({
      thread_id: 'thread-123',
      interrupt_id: 'int-456',
      resume: 'yes',
    });

    await waitFor(() => {
      expect(screen.getByText(/approved/i)).toBeTruthy();
    });
    expect(onSuccess).toHaveBeenCalledWith('yes');
  });

  it('submits "no" to POST /chat/resume and shows Rejected text summary', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'resumed' }),
    });
    global.fetch = fetchMock;

    const onSuccess = vi.fn();
    render(
      <InterruptCard
        threadId="thread-123"
        interruptId="int-456"
        onSuccess={onSuccess}
      />
    );

    const noBtn = screen.getByRole('button', { name: /no/i });
    await user.click(noBtn);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, options] = firstCall;
    const body = JSON.parse(options.body as string);
    expect(body).toEqual({
      thread_id: 'thread-123',
      interrupt_id: 'int-456',
      resume: 'no',
    });

    await waitFor(() => {
      expect(screen.getByText(/rejected/i)).toBeTruthy();
    });
    expect(onSuccess).toHaveBeenCalledWith('no');
  });

  it('displays inline error and keeps buttons active when submission fails', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    global.fetch = fetchMock;

    render(<InterruptCard threadId="thread-123" interruptId="int-456" />);

    const yesBtn = screen.getByRole('button', { name: /yes/i });
    await user.click(yesBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    expect((yesBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
