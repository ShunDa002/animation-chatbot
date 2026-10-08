import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HitlConfirmation from '@/components/HitlConfirmation';

describe('HitlConfirmation - User Story 5 (HITL Confirmation UI)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders confirmation card with Yes and No buttons in default state', () => {
    render(<HitlConfirmation threadId="thread-123" interruptId="int-456" />);

    const card = screen.getByRole('region', { name: /confirmation/i });
    expect(card).toBeTruthy();

    const yesBtn = screen.getByRole('button', { name: /yes|approve/i });
    const noBtn = screen.getByRole('button', { name: /no|reject/i });

    expect(yesBtn).toBeTruthy();
    expect(noBtn).toBeTruthy();
    expect((yesBtn as HTMLButtonElement).disabled).toBe(false);
    expect((noBtn as HTMLButtonElement).disabled).toBe(false);

    // No error message or decision text initially
    expect(screen.queryByText(/approved|rejected/i)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('submits "yes" to POST /chat/resume and replaces buttons with text summary on success', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'resumed' }),
    });
    global.fetch = fetchMock;

    const onSuccess = vi.fn();
    render(
      <HitlConfirmation
        threadId="thread-123"
        interruptId="int-456"
        onSuccess={onSuccess}
      />
    );

    const yesBtn = screen.getByRole('button', { name: /yes|approve/i });
    await user.click(yesBtn);

    // Verify fetch call payload
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

    // Verify buttons are replaced with text summary
    await waitFor(() => {
      expect(screen.getByText(/approved/i)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /yes|approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /no|reject/i })).toBeNull();
    expect(onSuccess).toHaveBeenCalledWith('yes');
  });

  it('submits "no" to POST /chat/resume and replaces buttons with text summary on success', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'resumed' }),
    });
    global.fetch = fetchMock;

    const onSuccess = vi.fn();
    render(
      <HitlConfirmation
        threadId="thread-123"
        interruptId="int-456"
        onSuccess={onSuccess}
      />
    );

    const noBtn = screen.getByRole('button', { name: /no|reject/i });
    await user.click(noBtn);

    // Verify fetch call payload
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, options] = firstCall;
    const body = JSON.parse(options.body as string);
    expect(body).toEqual({
      thread_id: 'thread-123',
      interrupt_id: 'int-456',
      resume: 'no',
    });

    // Verify buttons are replaced with text summary
    await waitFor(() => {
      expect(screen.getByText(/rejected/i)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /yes|approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /no|reject/i })).toBeNull();
    expect(onSuccess).toHaveBeenCalledWith('no');
  });

  it('displays inline error and keeps buttons enabled when submission fails', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    global.fetch = fetchMock;

    render(<HitlConfirmation threadId="thread-123" interruptId="int-456" />);

    const yesBtn = screen.getByRole('button', { name: /yes|approve/i });
    const noBtn = screen.getByRole('button', { name: /no|reject/i });

    await user.click(yesBtn);

    // Inline error appears
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeTruthy();
      expect(alert.textContent).toMatch(/failed|error/i);
    });

    // Buttons remain active for retry
    expect((yesBtn as HTMLButtonElement).disabled).toBe(false);
    expect((noBtn as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/approved/i)).toBeNull();

    // Retry should work if network recovers
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'resumed' }),
    });

    await user.click(yesBtn);

    await waitFor(() => {
      expect(screen.getByText(/approved/i)).toBeTruthy();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('handles custom onResume callback if provided', async () => {
    const user = userEvent.setup();
    const onResumeMock = vi.fn().mockResolvedValue(undefined);

    render(
      <HitlConfirmation
        threadId="thread-123"
        interruptId="int-456"
        onResume={onResumeMock}
      />
    );

    const yesBtn = screen.getByRole('button', { name: /yes|approve/i });
    await user.click(yesBtn);

    expect(onResumeMock).toHaveBeenCalledWith('yes');
    await waitFor(() => {
      expect(screen.getByText(/approved/i)).toBeTruthy();
    });
  });

  it('shows error if custom onResume throws', async () => {
    const user = userEvent.setup();
    const onResumeMock = vi.fn().mockRejectedValue(new Error('Network disconnected'));

    render(
      <HitlConfirmation
        threadId="thread-123"
        interruptId="int-456"
        onResume={onResumeMock}
      />
    );

    const noBtn = screen.getByRole('button', { name: /no|reject/i });
    await user.click(noBtn);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Network disconnected');
    });

    expect((noBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
