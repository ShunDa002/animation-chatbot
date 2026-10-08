import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageInput from '@/components/MessageInput';
import { copy } from '@/lib/ui/copy';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

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

describe('MessageInput - Draft Caching in sessionStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('restores cached draft from sessionStorage on mount', () => {
    sessionStorage.setItem('chat_input_draft', 'Previously saved draft');
    render(<MessageInput onSend={vi.fn()} disabled={false} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Previously saved draft');
  });

  it('caches text in sessionStorage when typed', async () => {
    render(<MessageInput onSend={vi.fn()} disabled={false} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'Hello draft');
    expect(sessionStorage.getItem('chat_input_draft')).toBe('Hello draft');
  });

  it('clears cached draft from sessionStorage when submitted', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} disabled={false} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'Hello draft');
    expect(sessionStorage.getItem('chat_input_draft')).toBe('Hello draft');

    const sendBtn = screen.getByRole('button', { name: copy.sendLabel });
    await userEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith('Hello draft');
    expect(sessionStorage.getItem('chat_input_draft')).toBeNull();
  });
});

describe('MessageInput - Controlled Mode and HITL State Handling', () => {
  it('supports controlled value and onChange props', async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <MessageInput value="Initial text" onChange={onChange} onSubmit={onSubmit} />
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Initial text');

    await userEvent.type(textarea, '!');
    expect(onChange).toHaveBeenCalledWith('Initial text!');

    // Parent updates controlled value
    rerender(<MessageInput value="Updated text" onChange={onChange} onSubmit={onSubmit} />);
    expect(textarea.value).toBe('Updated text');
  });

  it('submits controlled value and calls onChange with empty string on Enter', async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<MessageInput value="Submit me" onChange={onChange} onSubmit={onSubmit} />);
    const textarea = screen.getByRole('textbox');

    await userEvent.type(textarea, '{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('Submit me');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('disables textarea and all action controls when disabled=true (HITL interrupt state)', () => {
    render(<MessageInput onSend={vi.fn()} disabled={true} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const attachmentBtn = screen.getByRole('button', { name: copy.attachmentLabel }) as HTMLButtonElement;
    const modelSelect = screen.getByRole('combobox', { name: copy.modelSelectLabel }) as HTMLSelectElement;
    const voiceBtn = screen.getByRole('button', { name: copy.voiceInputLabel }) as HTMLButtonElement;
    const sendBtn = screen.getByRole('button', { name: copy.sendLabel }) as HTMLButtonElement;

    expect(textarea.disabled).toBe(true);
    expect(attachmentBtn.disabled).toBe(true);
    expect(modelSelect.disabled).toBe(true);
    expect(voiceBtn.disabled).toBe(true);
    expect(sendBtn.disabled).toBe(true);
  });

  it('keeps textarea enabled but disables send button when isWaitingForResponse=true', () => {
    render(<MessageInput onSend={vi.fn()} disabled={false} isWaitingForResponse={true} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const sendBtn = screen.getByRole('button', { name: copy.sendLabel }) as HTMLButtonElement;

    expect(textarea.disabled).toBe(false);
    expect(sendBtn.disabled).toBe(true);
  });
});

describe('MessageInput - User Story 6 (Stop Generation)', () => {
  it('renders Stop button instead of Send button when isStreaming=true', () => {
    const onStop = vi.fn();
    render(<MessageInput onSend={vi.fn()} onStop={onStop} isStreaming={true} />);

    // Send button should NOT be present
    expect(screen.queryByRole('button', { name: copy.sendLabel })).toBeNull();

    // Stop button should be present
    const stopBtn = screen.getByRole('button', { name: copy.stopLabel });
    expect(stopBtn).toBeTruthy();

    // Styled as circular button with darker/red background
    expect(stopBtn.className).toContain('rounded-full');
    expect(stopBtn.className).toMatch(/bg-(?:red-600|red-700|\[#b91c1c\]|\[#dc2626\])/);

    // Contains square icon
    const square = stopBtn.querySelector('rect');
    expect(square).toBeTruthy();
  });

  it('calls onStop when the Stop button is clicked during streaming', async () => {
    const onStop = vi.fn();
    render(<MessageInput onSend={vi.fn()} onStop={onStop} isStreaming={true} />);

    const stopBtn = screen.getByRole('button', { name: copy.stopLabel });
    await userEvent.click(stopBtn);

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('triggers onStop when Escape key is pressed while isStreaming=true', async () => {
    const onStop = vi.fn();
    render(<MessageInput onSend={vi.fn()} onStop={onStop} isStreaming={true} />);

    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, '{Escape}');

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('does not trigger onStop on Escape key when isStreaming is false', async () => {
    const onStop = vi.fn();
    render(<MessageInput onSend={vi.fn()} onStop={onStop} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, '{Escape}');

    expect(onStop).not.toHaveBeenCalled();
  });
});

describe('MessageInput - Dynamic Models from Backend', () => {
  it('loads dynamic models from backend via POST /models and updates dropdown', async () => {
    const mockModels = ['deepseek-r1', 'claude-3-7-sonnet', 'gemini-2.5-flash'];
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
      render(<MessageInput onSend={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'deepseek-r1' })).toBeTruthy();
      });

      expect(screen.getByRole('option', { name: 'claude-3-7-sonnet' })).toBeTruthy();
      expect(screen.getByRole('option', { name: 'gemini-2.5-flash' })).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('updates selected model value and calls onModelChange', async () => {
    const onModelChange = vi.fn();
    render(<MessageInput onSend={vi.fn()} models={['custom-model-1', 'custom-model-2']} onModelChange={onModelChange} />);

    const modelSelect = screen.getByRole('combobox', { name: copy.modelSelectLabel }) as HTMLSelectElement;
    await userEvent.selectOptions(modelSelect, 'custom-model-2');

    expect(modelSelect.value).toBe('custom-model-2');
    expect(onModelChange).toHaveBeenCalledWith('custom-model-2');
  });

  it('submits user input and selected model to onSend/onSubmit', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} models={['custom-model-1', 'custom-model-2']} />);

    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'Hello world');

    const modelSelect = screen.getByRole('combobox', { name: copy.modelSelectLabel }) as HTMLSelectElement;
    await userEvent.selectOptions(modelSelect, 'custom-model-2');

    const sendBtn = screen.getByRole('button', { name: copy.sendLabel });
    await userEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith('Hello world', 'custom-model-2');
  });
});



