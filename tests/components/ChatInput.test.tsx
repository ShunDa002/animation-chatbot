import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatInput from '@/components/ChatInput';
import { copy } from '@/lib/ui/copy';

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('ChatInput - User Story 1 (Single-line Input Entry)', () => {
  it('renders all inline controls in single-line pill container (T005)', () => {
    const { container } = render(<ChatInput onSend={vi.fn()} disabled={false} />);

    // Pill container check
    const composerBox = container.querySelector('.composer-box');
    expect(composerBox).toBeTruthy();
    expect(composerBox?.className).toContain('rounded-full');
    expect(composerBox?.getAttribute('data-multiline')).toBe('false');

    // Controls
    expect(screen.getByRole('button', { name: copy.attachmentLabel })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: copy.inputLabel })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: copy.modelSelectLabel })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.voiceInputLabel })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.sendLabel })).toBeTruthy();
  });

  it('renders Send button as circular cobalt blue button with upward arrow', () => {
    render(<ChatInput onSend={vi.fn()} disabled={false} />);
    const sendBtn = screen.getByRole('button', { name: copy.sendLabel });
    expect(sendBtn.className).toContain('rounded-full');
    expect(sendBtn.className).toMatch(/bg-(?:blue-600|\[#1e40af\]|\[#2563eb\]|blue-700)/);
    expect(sendBtn.querySelector('svg')).toBeTruthy();
  });
});

describe('ChatInput - User Story 2 (Multi-line Morph and Dual-Zone Layout)', () => {
  it('morphs into rounded-2xl card with dual-zone layout when text exceeds 36 chars or newlines (T009)', async () => {
    const { container } = render(<ChatInput onSend={vi.fn()} disabled={false} />);
    const textarea = screen.getByRole('textbox');
    const composerBox = container.querySelector('.composer-box');

    expect(composerBox?.getAttribute('data-multiline')).toBe('false');

    // Exceed 36 characters
    await userEvent.type(textarea, 'This is a message that definitely exceeds 36 characters');
    expect(composerBox?.getAttribute('data-multiline')).toBe('true');
    expect(composerBox?.className).toContain('rounded-2xl');

    // Verify left and right action zones in footer
    const leftZone = container.querySelector('.composer-actions-left');
    const rightZone = container.querySelector('.composer-actions-right');
    expect(leftZone).toBeTruthy();
    expect(rightZone).toBeTruthy();

    expect(leftZone?.querySelector(`button[aria-label="${copy.attachmentLabel}"]`)).toBeTruthy();
    expect(rightZone?.querySelector(`select[aria-label="${copy.modelSelectLabel}"]`)).toBeTruthy();
    expect(rightZone?.querySelector(`button[aria-label="${copy.sendLabel}"]`)).toBeTruthy();
  });

  it('preserves focus and caret position without remounting during transition (US3)', async () => {
    render(<ChatInput onSend={vi.fn()} disabled={false} />);
    const textareaBefore = screen.getByRole('textbox');
    await userEvent.type(textareaBefore, 'Short text{Shift>}{Enter}{/Shift}Now multi-line');
    const textareaAfter = screen.getByRole('textbox');
    expect(textareaAfter).toBe(textareaBefore);
  });
});
