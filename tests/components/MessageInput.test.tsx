import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  it('gates POST /models fetch when isBackendReady is false until backend is ready (FR-040)', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ['gated-model-1', 'gated-model-2'],
    });
    globalThis.fetch = fetchMock;

    try {
      const { rerender } = render(<MessageInput onSend={vi.fn()} isBackendReady={false} />);

      // fetchMock should not have been called while isBackendReady is false
      expect(fetchMock).not.toHaveBeenCalled();

      // Transition isBackendReady to true
      rerender(<MessageInput onSend={vi.fn()} isBackendReady={true} />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('option', { name: 'gated-model-1' })).toBeTruthy();
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MessageInput - User Story 9 (RAG Document Upload via Attachment Dropdown and Sticky Pill)', () => {
  it('toggles the Attachment dropdown menu with Browse files and resume.pdf separated by a divider', async () => {
    render(<MessageInput onSend={vi.fn()} threadId="thread-test-123" />);
    const attachmentBtn = screen.getByRole('button', { name: copy.attachmentLabel });

    // Initially dropdown is not open
    expect(screen.queryByTestId('rag-dropdown-menu')).toBeNull();
    expect(attachmentBtn.getAttribute('aria-expanded')).toBe('false');

    // Click to open dropdown
    await userEvent.click(attachmentBtn);
    expect(screen.getByTestId('rag-dropdown-menu')).toBeTruthy();
    expect(attachmentBtn.getAttribute('aria-expanded')).toBe('true');

    // Verify option 1: Browse files
    const browseOpt = screen.getByTestId('rag-dropdown-browse');
    expect(browseOpt).toBeTruthy();
    expect(browseOpt.textContent).toContain(copy.ragBrowseLabel);

    // Verify separator
    const separator = screen.getByRole('separator');
    expect(separator).toBeTruthy();

    // Verify option 2: resume.pdf
    const resumeOpt = screen.getByTestId('rag-dropdown-resume');
    expect(resumeOpt).toBeTruthy();
    expect(resumeOpt.textContent).toContain(copy.ragResumeOptionLabel);

    // Click to close
    await userEvent.click(attachmentBtn);
    expect(screen.queryByTestId('rag-dropdown-menu')).toBeNull();
    expect(attachmentBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes dropdown when clicking outside or pressing Escape', async () => {
    render(<MessageInput onSend={vi.fn()} threadId="thread-test-123" />);
    const attachmentBtn = screen.getByRole('button', { name: copy.attachmentLabel });

    // Open dropdown
    await userEvent.click(attachmentBtn);
    expect(screen.getByTestId('rag-dropdown-menu')).toBeTruthy();

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('rag-dropdown-menu')).toBeNull();

    // Open again
    await userEvent.click(attachmentBtn);
    expect(screen.getByTestId('rag-dropdown-menu')).toBeTruthy();

    // Click outside
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('rag-dropdown-menu')).toBeNull();
  });

  it('rejects invalid files client-side and displays error in document pill with cancel button', async () => {
    const mockUploadFn = vi.fn();
    render(<MessageInput onSend={vi.fn()} threadId="thread-test-123" uploadFn={mockUploadFn} />);

    const fileInput = screen.getByTestId('rag-file-input') as HTMLInputElement;
    const invalidFile = new File(['code'], 'malicious.exe', { type: 'application/x-msdownload' });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    // Document pill appears with alert role and error message
    const pill = screen.getByTestId('rag-document-pill');
    expect(pill).toBeTruthy();
    expect(pill.getAttribute('role')).toBe('alert');
    expect(screen.getByText(copy.ragErrorUnsupportedFormat)).toBeTruthy();
    expect(mockUploadFn).not.toHaveBeenCalled();

    // Attachment button is now disabled with tooltip
    const attachmentBtn = screen.getByRole('button', { name: copy.attachmentLabel });
    expect(attachmentBtn.hasAttribute('disabled')).toBe(true);
    expect(attachmentBtn.getAttribute('title')).toBe(copy.ragAttachmentDisabledTooltip);

    // Clicking cancel button dismisses pill and re-enables attachment button
    const cancelBtn = screen.getByTestId('rag-pill-cancel-btn');
    await userEvent.click(cancelBtn);
    expect(screen.queryByTestId('rag-document-pill')).toBeNull();
    expect(attachmentBtn.hasAttribute('disabled')).toBe(false);
  });

  it('immediately uploads valid file from Browse and renders sticky pill with progress and ready states', async () => {
    let resolveUpload!: (value: any) => void;
    const mockUploadPromise = new Promise((res) => {
      resolveUpload = res;
    });

    const mockUploadFn = vi.fn().mockImplementation((threadId, file, options) => {
      options?.onUploadProgress?.(50);
      options?.onProcessingStart?.();
      return mockUploadPromise;
    });

    render(<MessageInput onSend={vi.fn()} threadId="thread-test-123" uploadFn={mockUploadFn} />);

    // User chooses Browse files from dropdown
    await userEvent.click(screen.getByRole('button', { name: copy.attachmentLabel }));
    await userEvent.click(screen.getByTestId('rag-dropdown-browse'));

    const fileInput = screen.getByTestId('rag-file-input') as HTMLInputElement;
    const validFile = new File(['valid pdf content'], 'report.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    // Upload started immediately
    expect(mockUploadFn).toHaveBeenCalledWith('thread-test-123', validFile, expect.any(Object));

    // Sticky pill appears stacked above composer
    const pill = screen.getByTestId('rag-document-pill');
    expect(pill).toBeTruthy();
    expect(screen.getByText('report.pdf')).toBeTruthy();
    expect(screen.getByText('PDF')).toBeTruthy();

    // Attachment button is disabled during upload
    const attachmentBtn = screen.getByRole('button', { name: copy.attachmentLabel });
    expect(attachmentBtn.hasAttribute('disabled')).toBe(true);
    expect(attachmentBtn.getAttribute('title')).toBe(copy.ragAttachmentDisabledTooltip);

    // Resolves upload
    resolveUpload({ status: 'ready', duplicate: false, filename: 'report.pdf' });

    await waitFor(() => {
      expect(screen.getByText(copy.ragStatusReady)).toBeTruthy();
    });

    // Attachment button remains disabled because document is active
    expect(attachmentBtn.hasAttribute('disabled')).toBe(true);
  });

  it('immediately displays sticky document pill with upload progress when selecting resume.pdf option', async () => {
    let resolveResumeFetch!: (file: File) => void;
    const mockResumeFetchPromise = new Promise<File>((res) => {
      resolveResumeFetch = res;
    });

    let resolveUpload!: (value: any) => void;
    const mockUploadPromise = new Promise((res) => {
      resolveUpload = res;
    });

    const mockUploadFn = vi.fn().mockReturnValue(mockUploadPromise);
    const mockResumeFile = new File(['resume content'], 'resume.pdf', { type: 'application/pdf' });
    const mockLoadResumeFn = vi.fn().mockReturnValue(mockResumeFetchPromise);

    render(
      <MessageInput
        onSend={vi.fn()}
        threadId="thread-test-123"
        uploadFn={mockUploadFn}
        loadResumeFn={mockLoadResumeFn}
      />,
    );

    // Open dropdown and select resume.pdf
    await userEvent.click(screen.getByRole('button', { name: copy.attachmentLabel }));
    await userEvent.click(screen.getByTestId('rag-dropdown-resume'));

    expect(mockLoadResumeFn).toHaveBeenCalledTimes(1);

    // Pill is immediately displayed above input with upload progress BEFORE resume asset finishes loading
    expect(screen.getByTestId('rag-document-pill')).toBeTruthy();
    expect(screen.getByText('resume.pdf')).toBeTruthy();
    expect(screen.getByText('PDF')).toBeTruthy();
    const attachBtn = screen.getByRole('button', { name: copy.attachmentLabel });
    expect(attachBtn.hasAttribute('disabled')).toBe(true);
    expect(attachBtn.getAttribute('title')).toBe(copy.ragAttachmentDisabledTooltip);

    // Resolve the resume asset loading
    resolveResumeFetch(mockResumeFile);

    await waitFor(() => {
      expect(mockUploadFn).toHaveBeenCalledWith('thread-test-123', mockResumeFile, expect.any(Object));
    });

    resolveUpload({ status: 'ready', duplicate: false, filename: 'resume.pdf' });
    await waitFor(() => {
      expect(screen.getByText(copy.ragStatusReady)).toBeTruthy();
    });
  });

  it('displays informational success inside pill when backend reports duplicate document', async () => {
    const mockUploadFn = vi.fn().mockResolvedValue({
      status: 'already_added',
      duplicate: true,
      filename: 'existing.pdf',
    });

    render(<MessageInput onSend={vi.fn()} threadId="thread-test-123" uploadFn={mockUploadFn} />);

    const fileInput = screen.getByTestId('rag-file-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['content'], 'existing.pdf')] } });

    await waitFor(() => {
      expect(screen.getByTestId('rag-document-pill')).toBeTruthy();
      expect(screen.getByText(copy.ragStatusDuplicate)).toBeTruthy();
    });
  });

  it('disables chat Send while document upload is in progress', async () => {
    let resolveUpload!: (value: any) => void;
    const mockUploadPromise = new Promise((res) => {
      resolveUpload = res;
    });
    const mockUploadFn = vi.fn().mockReturnValue(mockUploadPromise);

    render(<MessageInput onSend={vi.fn()} threadId="thread-test-123" uploadFn={mockUploadFn} />);

    // Type a sendable draft
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'Hello during upload');

    // Send button should be enabled initially
    const sendBtn = screen.getByRole('button', { name: copy.sendLabel });
    expect(sendBtn.hasAttribute('disabled')).toBe(false);

    // Start upload
    const fileInput = screen.getByTestId('rag-file-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['content'], 'doc.txt')] } });

    // Now send button must be disabled
    expect(sendBtn.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(copy.ragUploadInProgressReason)).toBeTruthy();

    resolveUpload({ status: 'ready', duplicate: false });
    await waitFor(() => {
      expect(sendBtn.hasAttribute('disabled')).toBe(false);
    });
  });

  it('cancel button aborts in-flight upload, clears pill, and re-enables Attachment button', async () => {
    let capturedSignal: AbortSignal | undefined;
    const mockUploadPromise = new Promise(() => {}); // never resolves
    const mockUploadFn = vi.fn().mockImplementation((threadId, file, options) => {
      capturedSignal = options?.signal;
      return mockUploadPromise;
    });

    render(<MessageInput onSend={vi.fn()} threadId="thread-test-123" uploadFn={mockUploadFn} />);

    const fileInput = screen.getByTestId('rag-file-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['content'], 'long-upload.pdf')] } });

    // Pill is visible and upload is in flight
    expect(screen.getByTestId('rag-document-pill')).toBeTruthy();
    const attachmentBtn = screen.getByRole('button', { name: copy.attachmentLabel });
    expect(attachmentBtn.hasAttribute('disabled')).toBe(true);

    // Click cancel button
    const cancelBtn = screen.getByTestId('rag-pill-cancel-btn');
    await userEvent.click(cancelBtn);

    // In-flight upload signal was aborted
    expect(capturedSignal?.aborted).toBe(true);

    // Pill is removed and Attachment button is re-enabled
    expect(screen.queryByTestId('rag-document-pill')).toBeNull();
    expect(attachmentBtn.hasAttribute('disabled')).toBe(false);
  });

  it('scopes RAG upload state per threadId', async () => {
    const mockUploadFn = vi.fn().mockResolvedValue({ status: 'ready', duplicate: false });
    const { rerender } = render(<MessageInput onSend={vi.fn()} threadId="thread-A" uploadFn={mockUploadFn} />);

    // Upload on Thread A
    const fileInput = screen.getByTestId('rag-file-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['thread A file'], 'threadA.txt')] } });

    await waitFor(() => {
      expect(screen.getByTestId('rag-document-pill')).toBeTruthy();
      expect(screen.getByText('threadA.txt')).toBeTruthy();
    });

    // Switch to Thread B
    rerender(<MessageInput onSend={vi.fn()} threadId="thread-B" uploadFn={mockUploadFn} />);

    // In Thread B, Thread A's document pill should NOT be visible and Attachment button is enabled
    expect(screen.queryByTestId('rag-document-pill')).toBeNull();
    expect(screen.getByRole('button', { name: copy.attachmentLabel }).hasAttribute('disabled')).toBe(false);

    // Switch back to Thread A
    rerender(<MessageInput onSend={vi.fn()} threadId="thread-A" uploadFn={mockUploadFn} />);
    expect(screen.getByTestId('rag-document-pill')).toBeTruthy();
    expect(screen.getByText('threadA.txt')).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.attachmentLabel }).hasAttribute('disabled')).toBe(true);
  });
});
