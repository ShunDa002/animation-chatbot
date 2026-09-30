import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageInput from '@/components/MessageInput';
import { copy } from '@/lib/ui/copy';

describe('MessageInput - User Story 1 (Single-line Input Entry)', () => {
  it('renders all controls: Attachment, Textarea, Model Selector, Voice, and Send', () => {
    render(<MessageInput onSend={vi.fn()} disabled={false} />);

    // Attachment button
    const attachmentBtn = screen.getByRole('button', { name: copy.attachmentLabel });
    expect(attachmentBtn).toBeTruthy();

    // Textarea
    const textarea = screen.getByRole('textbox', { name: copy.inputLabel });
    expect(textarea).toBeTruthy();

    // Model Selector
    const modelSelect = screen.getByRole('combobox', { name: copy.modelSelectLabel }) as HTMLSelectElement;
    expect(modelSelect).toBeTruthy();
    expect(screen.getByRole('option', { name: /gpt-oss-20b/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /nemotron-3.5/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /qwen3.8-27b/ })).toBeTruthy();

    // Voice button
    const voiceBtn = screen.getByRole('button', { name: copy.voiceInputLabel });
    expect(voiceBtn).toBeTruthy();

    // Send button
    const sendBtn = screen.getByRole('button', { name: copy.sendLabel });
    expect(sendBtn).toBeTruthy();
  });

  it('renders as a pill-shaped container in single-line mode', () => {
    const { container } = render(<MessageInput onSend={vi.fn()} disabled={false} />);
    const composerBox = container.querySelector('.composer-box');
    expect(composerBox).toBeTruthy();
    // In single-line mode, it should have the rounded-full pill styling
    expect(composerBox?.className).toContain('rounded-full');
  });

  it('renders Send button as a circular button in cobalt blue with an upward arrow', () => {
    render(<MessageInput onSend={vi.fn()} disabled={false} />);
    const sendBtn = screen.getByRole('button', { name: copy.sendLabel });
    // Circular styling and cobalt blue
    expect(sendBtn.className).toContain('rounded-full');
    expect(sendBtn.className).toMatch(/bg-(?:blue-600|\[#1e40af\]|\[#2563eb\]|blue-700)/);
    
    // Upward arrow icon inside send button
    const arrowSvg = sendBtn.querySelector('svg');
    expect(arrowSvg).toBeTruthy();
  });
});

describe('MessageInput - User Story 2 (Multi-line Morph and Dual-Zone Layout)', () => {
  it('morphs into a rounded card and switches to two-tier layout when text has multiple lines', async () => {
    const { container } = render(<MessageInput onSend={vi.fn()} disabled={false} />);
    const composerBox = container.querySelector('.composer-box');
    const textarea = screen.getByRole('textbox');

    expect(composerBox?.className).toContain('rounded-full');
    expect(composerBox?.getAttribute('data-multiline')).toBe('false');

    // Type two lines
    await userEvent.type(textarea, 'First line{Shift>}{Enter}{/Shift}Second line');

    // Should now be in multiline card mode
    expect(composerBox?.getAttribute('data-multiline')).toBe('true');
    expect(composerBox?.className).toContain('rounded-2xl');

    // In two-tier mode, check left and right action zones
    const leftZone = container.querySelector('.composer-actions-left');
    const rightZone = container.querySelector('.composer-actions-right');
    expect(leftZone).toBeTruthy();
    expect(rightZone).toBeTruthy();

    // Attachment button pinned to leftZone
    expect(leftZone?.querySelector(`button[aria-label="${copy.attachmentLabel}"]`)).toBeTruthy();

    // Model selector, Voice button, Send button pinned to rightZone
    expect(rightZone?.querySelector(`select[aria-label="${copy.modelSelectLabel}"]`)).toBeTruthy();
    expect(rightZone?.querySelector(`button[aria-label="${copy.voiceInputLabel}"]`)).toBeTruthy();
    expect(rightZone?.querySelector(`button[aria-label="${copy.sendLabel}"]`)).toBeTruthy();
  });

  it('stays as a pill when text is <= 36 chars and morphs to a card when exceeding 36 chars', async () => {
    const { container } = render(<MessageInput onSend={vi.fn()} disabled={false} />);
    const composerBox = container.querySelector('.composer-box');
    const textarea = screen.getByRole('textbox');

    // Exactly 36 characters
    const text36 = '123456789012345678901234567890123456';
    expect(text36.length).toBe(36);

    await userEvent.type(textarea, text36);
    expect(composerBox?.getAttribute('data-multiline')).toBe('false');
    expect(composerBox?.className).toContain('rounded-full');

    // Type 1 more character to exceed 36 chars (37 chars)
    await userEvent.type(textarea, '7');
    expect(composerBox?.getAttribute('data-multiline')).toBe('true');
    expect(composerBox?.className).toContain('rounded-2xl');

    // Backspace back to 36 chars
    await userEvent.type(textarea, '{Backspace}');
    expect(composerBox?.getAttribute('data-multiline')).toBe('false');
    expect(composerBox?.className).toContain('rounded-full');
  });

  it('preserves the textarea DOM element across single-line to multi-line transitions (no remounting)', async () => {
    render(<MessageInput onSend={vi.fn()} disabled={false} />);
    const textareaBefore = screen.getByRole('textbox');

    await userEvent.type(textareaBefore, 'Line 1{Shift>}{Enter}{/Shift}Line 2');
    const textareaAfter = screen.getByRole('textbox');

    // Identity must be strictly identical to preserve focus and caret natively
    expect(textareaAfter).toBe(textareaBefore);
  });

  it('applies max-height equivalent to 5 lines of text with overflow scrolling', async () => {
    render(<MessageInput onSend={vi.fn()} disabled={false} />);
    const textarea = screen.getByRole('textbox');

    // Check max-height class or style for 5 lines (e.g. max-h-[7.5rem] or similar ~120px)
    expect(textarea.className).toMatch(/max-h-\[(?:7\.5rem|120px|125px|8rem)\]/);
    expect(textarea.className).toContain('overflow-y-auto');
  });
});

describe('MessageInput - User Story 3 (Focus and Interaction Retention)', () => {
  it('submits on Enter and clears draft while keeping textarea enabled', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} disabled={false} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    await userEvent.type(textarea, 'Ready to send{Enter}');

    expect(onSend).toHaveBeenCalledWith('Ready to send');
    expect(textarea.value).toBe('');
    expect(textarea.disabled).toBe(false);
  });

  it('adds newline and does not submit on Shift+Enter', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} disabled={false} />);
    const textarea = screen.getByRole('textbox');

    await userEvent.type(textarea, 'Multiline test{Shift>}{Enter}{/Shift}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('renders Stop/Cancel square and calls onStop when status is waiting, keeping textarea enabled', async () => {
    const onStop = vi.fn();
    render(<MessageInput onSend={vi.fn()} onStop={onStop} disabled={true} status="waiting" />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    // Textarea remains enabled
    expect(textarea.disabled).toBe(false);

    // Stop button is rendered instead of Send
    const stopBtn = screen.getByRole('button', { name: copy.stopLabel });
    expect(stopBtn).toBeTruthy();

    // Contains square icon for Stop action
    const squareIcon = stopBtn.querySelector('rect') || stopBtn.querySelector('svg');
    expect(squareIcon).toBeTruthy();

    await userEvent.click(stopBtn);
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});


