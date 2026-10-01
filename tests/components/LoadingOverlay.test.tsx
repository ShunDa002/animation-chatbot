import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoadingOverlay from '@/components/LoadingOverlay';

describe('LoadingOverlay - User Story 4 (Loading State and Initialization)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a full white overlay with centered loader gif while connecting or generating thread', () => {
    const { container } = render(
      <LoadingOverlay
        isConnecting={true}
        isGeneratingThread={false}
        onRetry={vi.fn()}
      />
    );

    const overlay = container.querySelector('.loading-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay?.className).toContain('bg-white');

    const img = screen.getByRole('img', { name: /loading/i }) as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('/assets/loader.gif');
  });

  it('smoothly fades out when connecting and thread generation complete', () => {
    const { container, rerender } = render(
      <LoadingOverlay
        isConnecting={true}
        isGeneratingThread={false}
        onRetry={vi.fn()}
      />
    );

    const overlay = container.querySelector('.loading-overlay');
    expect(overlay?.className).toContain('opacity-100');
    expect(overlay?.className).not.toContain('opacity-0');

    // Finished loading
    rerender(
      <LoadingOverlay
        isConnecting={false}
        isGeneratingThread={false}
        onRetry={vi.fn()}
      />
    );

    expect(overlay?.className).toContain('opacity-0');
    expect(overlay?.className).toContain('pointer-events-none');
  });

  it('shows error message and retry button when timeout of 30 seconds expires', () => {
    const onRetry = vi.fn();
    render(
      <LoadingOverlay
        isConnecting={true}
        isGeneratingThread={false}
        onRetry={onRetry}
        timeoutMs={30000}
      />
    );

    // Prior to 30s timeout
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();

    // Fast-forward 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    // Error message and retry button appear
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeTruthy();
    expect(screen.getByText(/connection failed|failed to connect|timed out/i)).toBeTruthy();

    // Clicking retry calls onRetry
    act(() => {
      retryBtn.click();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('resets timeout when props change or retry is initiated', () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <LoadingOverlay
        isConnecting={true}
        isGeneratingThread={false}
        onRetry={onRetry}
        timeoutMs={30000}
      />
    );

    // Advance 20 seconds (less than 30s)
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();

    // Transition state
    rerender(
      <LoadingOverlay
        isConnecting={false}
        isGeneratingThread={true}
        onRetry={onRetry}
        timeoutMs={30000}
      />
    );

    // Another 15 seconds (total 35s, but reset at 20s so only 15s into new state)
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();

    // Another 15 seconds to reach 30s on the new state
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });
});
