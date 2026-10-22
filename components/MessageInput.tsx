'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  atCharacterLimit,
  clampInput,
  isSendable,
  MAX_INPUT_CHARACTERS,
  remainingCharacters,
  validateRagFile,
  formatFileSize,
  getRagFileExtension,
  type ThreadRagUploadState,
} from '@/lib/conversation/limits';
import { copy } from '@/lib/ui/copy';
import type { ConversationStatus } from '@/lib/conversation/useConversation';
import {
  fetchModels,
  uploadRagDocument,
  type UploadRagDocumentOptions,
  type RagUploadResult,
  RagUploadError,
} from '@/lib/conversation/backend';

export interface MessageInputProps {
  /** Callback invoked when the user submits a message via Enter key or Send button. */
  onSubmit?: (text: string, model?: string) => void;
  /** Legacy alias for onSubmit. */
  onSend?: (draft: string, model?: string) => void;
  /** The controlled text value of the input, enabling the parent to restore drafts on error. */
  value?: string;
  /** Callback when text changes to update the controlled value. */
  onChange?: (text: string) => void;
  /** If true, disables the text area and all actions. */
  disabled?: boolean;
  /** Why sending is refused, when it is. */
  disabledReason?: string | null;
  /** If true, places the input in a waiting state where the send button is disabled but text input remains enabled. */
  isWaitingForResponse?: boolean;
  /** If true, indicates the AI is generating a response. The component morphs the Send button into a Stop button. */
  isStreaming?: boolean;
  /** Current conversation status. */
  status?: ConversationStatus;
  /** Optional callback when stop button is clicked during waiting. */
  onStop?: () => void;
  /** Optional model list override */
  models?: string[];
  /** Optional controlled selected model */
  selectedModel?: string;
  /** Optional callback when selected model changes */
  onModelChange?: (model: string) => void;
  /** Defaults to true. When false during initial startup, holds back POST /models until ready (FR-040) */
  isBackendReady?: boolean;
  /** Active conversation thread identifier for RAG file upload association (FR-043, FR-047) */
  threadId?: string | null;
  /** Optional upload implementation override for deterministic component testing */
  uploadFn?: (
    threadId: string,
    file: File,
    options?: UploadRagDocumentOptions,
  ) => Promise<RagUploadResult>;
}

export type Props = MessageInputProps;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const STORAGE_KEY_DRAFT = 'chat_input_draft';

const INITIAL_UPLOAD_STATE: ThreadRagUploadState = {
  status: 'idle',
  file: null,
  fileName: null,
  fileTypeLabel: null,
  fileSizeBytes: null,
  progress: null,
  statusMessage: null,
  originalFilename: null,
};

/**
 * The composer (FR-022, FR-003, D13, US9).
 *
 * The draft lives in this component's own state (or controlled value), which is what makes it survive a re-render of the
 * log above it (constitution III). It is also cached in sessionStorage so unsubmitted drafts
 * survive page reloads (FR-024).
 *
 * Integrates RAG document upload on the Attachment (+) button (FR-005, FR-043-FR-047).
 */
export default function MessageInput({
  onSubmit,
  onSend,
  value,
  onChange,
  disabled = false,
  disabledReason,
  isWaitingForResponse = false,
  isStreaming = false,
  status,
  onStop,
  models: externalModels,
  selectedModel: controlledModel,
  onModelChange,
  isBackendReady = true,
  threadId,
  uploadFn = uploadRagDocument,
}: Props) {
  const isControlled = typeof value === 'string';
  const [internalDraft, setInternalDraft] = useState('');

  useIsomorphicLayoutEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const cached = sessionStorage.getItem(STORAGE_KEY_DRAFT);
        if (cached) {
          setInternalDraft(clampInput(cached));
        }
      }
    } catch {
      // Ignore sessionStorage access errors
    }
  }, []);

  const currentDraft = isControlled ? value : internalDraft;
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const modelOptions = externalModels && externalModels.length > 0 ? externalModels : fetchedModels;
  const [internalSelectedModel, setInternalSelectedModel] = useState<string>(() => {
    return (externalModels && externalModels[0]) || '';
  });

  const selectedModel =
    controlledModel ??
    (internalSelectedModel && modelOptions.includes(internalSelectedModel)
      ? internalSelectedModel
      : modelOptions[0] || '');

  const handleModelChange = (newModel: string) => {
    setInternalSelectedModel(newModel);
    onModelChange?.(newModel);
  };

  // Fetch dynamic models list from backend endpoint POST /models
  useEffect(() => {
    if (externalModels && externalModels.length > 0) {
      return;
    }

    if (!isBackendReady) {
      return;
    }

    const abortController = new AbortController();

    async function loadModels() {
      try {
        const fetched = await fetchModels(abortController.signal);
        if (fetched && fetched.length > 0) {
          setFetchedModels(fetched);
          setInternalSelectedModel((prev) =>
            fetched.includes(prev) ? prev : (fetched[0] || ''),
          );
        }
      } catch {
        // No dummy fallback - dynamic list only
      }
    }

    void loadModels();

    return () => {
      abortController.abort();
    };
  }, [externalModels, isBackendReady]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(false);
  const remaining = remainingCharacters(currentDraft);
  const atLimit = atCharacterLimit(currentDraft);
  const counterId = useId();
  const inputId = useId();
  const uploadPanelId = useId();

  // RAG document upload state per-thread (FR-047)
  const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadsByThread, setUploadsByThread] = useState<Record<string, ThreadRagUploadState>>({});

  const activeThreadKey = threadId ?? '__default__';
  const currentUpload = uploadsByThread[activeThreadKey] ?? INITIAL_UPLOAD_STATE;
  const isUploading = currentUpload.status === 'uploading' || currentUpload.status === 'processing';

  // Sync draft to sessionStorage on update
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        if (currentDraft) {
          sessionStorage.setItem(STORAGE_KEY_DRAFT, currentDraft);
        } else {
          sessionStorage.removeItem(STORAGE_KEY_DRAFT);
        }
      }
    } catch {
      // Ignore sessionStorage quota or access errors
    }
  }, [currentDraft]);

  const handleDraftChange = (newVal: string) => {
    const clamped = clampInput(newVal);
    if (isControlled) {
      onChange?.(clamped);
    } else {
      setInternalDraft(clamped);
    }
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        if (clamped) {
          sessionStorage.setItem(STORAGE_KEY_DRAFT, clamped);
        } else {
          sessionStorage.removeItem(STORAGE_KEY_DRAFT);
        }
      }
    } catch {
      // Ignore sessionStorage access errors
    }
  };

  const isConnecting = status === 'connecting';
  const effectiveReason =
    disabledReason ??
    (isUploading
      ? copy.ragUploadInProgressReason
      : isConnecting
        ? copy.connecting
        : null);

  const isMultiline = currentDraft.includes('\n') || currentDraft.length > 36;
  const isTextareaDisabled = Boolean(disabled && !isWaitingForResponse && status !== 'waiting' && !isStreaming);
  const isActionsDisabled = Boolean(disabled || isConnecting);

  useEffect(() => {
    if (!isStreaming || !onStop) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onStop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isStreaming, onStop]);

  useIsomorphicLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (!isMultiline) {
      textarea.style.height = '1.5rem';
      return;
    }

    // Reset height to auto to compute scrollHeight accurately
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;

    if (scrollHeight > 0) {
      textarea.style.height = `${Math.min(Math.max(scrollHeight, 40), 120)}px`;
    }
  }, [currentDraft, isMultiline]);

  function submit(): void {
    const handleSend = onSubmit ?? onSend;
    if (
      disabled ||
      isWaitingForResponse ||
      isConnecting ||
      isUploading ||
      !isSendable(currentDraft) ||
      !handleSend
    ) {
      return;
    }
    if (selectedModel) {
      handleSend(currentDraft, selectedModel);
    } else {
      handleSend(currentDraft);
    }
    if (isControlled) {
      onChange?.('');
    } else {
      setInternalDraft('');
    }
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.removeItem(STORAGE_KEY_DRAFT);
      }
    } catch {
      // Ignore sessionStorage access errors
    }
  }

  // File selection & validation handler (FR-043)
  const processSelectedFile = (file: File | null | undefined) => {
    const validation = validateRagFile(file, threadId);
    if (!validation.valid) {
      setUploadsByThread((prev) => ({
        ...prev,
        [activeThreadKey]: {
          status: 'failed',
          file: validation.file ?? null,
          fileName: validation.file ? validation.file.name : null,
          fileTypeLabel: validation.file
            ? getRagFileExtension(validation.file.name).replace('.', '').toUpperCase()
            : null,
          fileSizeBytes: validation.file ? validation.file.size : null,
          progress: null,
          statusMessage: validation.error,
          originalFilename: null,
        },
      }));
      return;
    }

    setUploadsByThread((prev) => ({
      ...prev,
      [activeThreadKey]: {
        status: 'selected',
        file: validation.file,
        fileName: validation.file.name,
        fileTypeLabel: validation.extension.replace('.', '').toUpperCase(),
        fileSizeBytes: validation.file.size,
        progress: null,
        statusMessage: null,
        originalFilename: null,
      },
    }));
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    processSelectedFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isUploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    const file = event.dataTransfer.files?.[0];
    processSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setUploadsByThread((prev) => ({
      ...prev,
      [activeThreadKey]: INITIAL_UPLOAD_STATE,
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!currentUpload.file || isUploading) return;
    const fileToUpload = currentUpload.file;
    const targetThreadKey = activeThreadKey;
    const targetThreadId = threadId ?? 'default-thread';

    // Transition to uploading state
    setUploadsByThread((prev) => ({
      ...prev,
      [targetThreadKey]: {
        ...prev[targetThreadKey],
        status: 'uploading',
        progress: 0,
        statusMessage: copy.ragStatusUploading,
      },
    }));

    try {
      const result = await uploadFn(targetThreadId, fileToUpload, {
        onUploadProgress: (percent) => {
          setUploadsByThread((prev) => {
            const existing = prev[targetThreadKey];
            if (!existing || existing.status !== 'uploading') return prev;
            return {
              ...prev,
              [targetThreadKey]: {
                ...existing,
                progress: percent,
              },
            };
          });
        },
        onProcessingStart: () => {
          setUploadsByThread((prev) => {
            const existing = prev[targetThreadKey];
            if (!existing) return prev;
            return {
              ...prev,
              [targetThreadKey]: {
                ...existing,
                status: 'processing',
                statusMessage: copy.ragStatusProcessing,
              },
            };
          });
        },
      });

      const isDuplicate = result.status === 'already_added' || result.duplicate;
      setUploadsByThread((prev) => ({
        ...prev,
        [targetThreadKey]: {
          ...prev[targetThreadKey],
          status: isDuplicate ? 'already_added' : 'ready',
          statusMessage: isDuplicate ? copy.ragStatusDuplicate : copy.ragStatusReady,
          originalFilename: result.originalFilename,
        },
      }));
    } catch (err: unknown) {
      const userMessage =
        err instanceof RagUploadError
          ? err.userMessage
          : err instanceof Error && err.message
            ? err.message
            : copy.ragErrorGeneric;

      setUploadsByThread((prev) => ({
        ...prev,
        [targetThreadKey]: {
          ...prev[targetThreadKey],
          status: 'failed',
          statusMessage: userMessage,
        },
      }));
    }
  };

  return (
    <form
      className="composer flex flex-col gap-1.5 shrink-0 mt-auto justify-end w-full"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {/* Inline RAG Document Upload Panel (FR-005, FR-044-FR-047, US9) */}
      {isUploadPanelOpen && (
        <div
          id={uploadPanelId}
          data-testid="rag-upload-panel"
          className="rag-upload-panel w-full bg-[#181a24] border border-[#2d3142] rounded-2xl p-3 sm:p-4 mb-1 flex flex-col gap-2.5 shadow-xl transition-all duration-200 text-white"
          role="region"
          aria-label={copy.ragPanelTitle}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold text-white tracking-wide">
              {copy.ragPanelTitle}
            </span>
            <button
              type="button"
              aria-label={copy.ragClosePanelLabel}
              onClick={() => setIsUploadPanelOpen(false)}
              className="p-1 rounded-full text-[var(--text-muted)] hover:text-white hover:bg-[#232736] transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-[11px] sm:text-xs text-[var(--text-muted)] m-0 leading-relaxed">
            {copy.ragScopeNotice} {copy.ragSupportedFormatsNotice}
          </p>

          {/* Hidden native file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.docx"
            tabIndex={-1}
            className="hidden"
            data-testid="rag-file-input"
            onChange={handleFileInputChange}
          />

          {/* Dropzone view when idle or failed without file */}
          {(currentUpload.status === 'idle' || (!currentUpload.file && currentUpload.status === 'failed')) && (
            <div
              data-testid="rag-dropzone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-[#383d54] hover:border-[#4d5370] bg-[#13151d]/70'
              }`}
            >
              <svg
                className="w-6 h-6 mx-auto mb-1.5 text-[var(--text-muted)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-xs text-[var(--text-muted)] mb-2 m-0">{copy.ragDropzonePrompt}</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-3 py-1 text-xs rounded-full bg-[#232736] hover:bg-[#2d3246] text-white font-medium transition-colors cursor-pointer"
              >
                {copy.ragBrowseLabel}
              </button>
            </div>
          )}

          {/* File summary view when a file is staged/uploading/complete/failed */}
          {currentUpload.file && (
            <div className="flex flex-col gap-2">
              <div
                data-testid="rag-file-summary"
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#13151d] border border-[#2d3142]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-900/60 text-blue-300 border border-blue-700/50 uppercase shrink-0">
                    {currentUpload.fileTypeLabel || 'DOC'}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-white truncate" title={currentUpload.fileName ?? ''}>
                      {currentUpload.fileName}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {currentUpload.fileSizeBytes !== null ? formatFileSize(currentUpload.fileSizeBytes) : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!isUploading && (
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-[var(--text-muted)] hover:text-white px-2 py-1 rounded hover:bg-[#232736] transition-colors cursor-pointer"
                      >
                        {copy.ragReplaceActionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        {copy.ragRemoveActionLabel}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Progress bar during uploading */}
              {currentUpload.status === 'uploading' && (
                <div className="w-full bg-[#232736] rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-150"
                    style={{ width: `${currentUpload.progress ?? 0}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Status and Error banners */}
          {currentUpload.statusMessage && (
            <div
              data-testid="rag-status-banner"
              role={currentUpload.status === 'failed' ? 'alert' : 'status'}
              className={`p-2 rounded-xl text-xs flex items-center justify-between gap-2 ${
                currentUpload.status === 'failed'
                  ? 'bg-rose-950/50 border border-rose-800/60 text-rose-300'
                  : currentUpload.status === 'ready'
                    ? 'bg-emerald-950/50 border border-emerald-800/60 text-emerald-300'
                    : currentUpload.status === 'already_added'
                      ? 'bg-blue-950/50 border border-blue-800/60 text-blue-300'
                      : 'bg-[#232736] text-[var(--text-muted)]'
              }`}
            >
              <span className="flex-1 min-w-0">{currentUpload.statusMessage}</span>
              {currentUpload.status === 'failed' && currentUpload.file && (
                <button
                  type="button"
                  onClick={handleUpload}
                  className="px-2.5 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shrink-0 cursor-pointer transition-colors"
                >
                  {copy.ragRetryActionLabel}
                </button>
              )}
            </div>
          )}

          {/* Upload submit button when file is in selected state */}
          {currentUpload.status === 'selected' && (
            <div className="flex justify-end mt-0.5">
              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading}
                data-testid="rag-upload-submit-btn"
                className="px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copy.ragUploadActionLabel}
              </button>
            </div>
          )}

          {/* Accessible live region for screen readers */}
          <div role="status" aria-live="polite" className="sr-only">
            {currentUpload.statusMessage || ''}
          </div>
        </div>
      )}

      <div
        className={`composer-box relative flex ${isMultiline
          ? 'flex-col gap-2 p-3 rounded-2xl'
          : 'flex-row items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:py-2 rounded-full'
          } bg-[#181a24] focus-within:bg-[#1e2230] border border-[#2d3142] focus-within:border-[#383d54] shadow-lg transition-all duration-200 ${isTextareaDisabled ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        data-multiline={isMultiline ? 'true' : 'false'}
      >
        <div className={`composer-text-zone flex-1 min-w-0 ${isMultiline ? 'order-1 w-full' : 'order-2'}`}>
          <label className="visually-hidden sr-only" htmlFor={inputId}>
            {copy.inputLabel}
          </label>
          <textarea
            ref={textareaRef}
            id={inputId}
            value={currentDraft}
            disabled={isTextareaDisabled}
            placeholder={copy.inputPlaceholder}
            aria-describedby={counterId}
            // The cap stops input rather than truncating at send (FR-022).
            maxLength={MAX_INPUT_CHARACTERS}
            onChange={(event) => handleDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            className="w-full bg-transparent border-0 border-none text-white text-sm sm:text-base font-sans resize-none outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 focus:border-0 focus:border-transparent focus-visible:border-transparent placeholder:text-[var(--text-muted)] py-1 px-1 min-h-[1.5rem] max-h-[7.5rem] overflow-y-auto shadow-none focus:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
          />
        </div>

        {/* Footer / actions wrapper */}
        <div
          className={`composer-footer ${isMultiline
            ? 'order-2 flex items-center justify-between w-full pt-1 border-t border-[#2d3142]/40'
            : 'contents'
            }`}
        >
          {/* Attachment button zone */}
          <div className={`composer-actions-left flex items-center ${isMultiline ? '' : 'order-1 shrink-0'}`}>
            <button
              type="button"
              disabled={isActionsDisabled}
              aria-label={copy.attachmentLabel}
              aria-expanded={isUploadPanelOpen}
              aria-controls={uploadPanelId}
              onClick={() => setIsUploadPanelOpen((prev) => !prev)}
              className={`p-1.5 sm:p-2 rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                isUploadPanelOpen
                  ? 'text-white bg-[#232736]'
                  : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bubble-visitor)]/60'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* Controls zone */}
          <div className={`composer-actions-right flex items-center gap-1.5 sm:gap-2 ${isMultiline ? '' : 'order-3 shrink-0'}`}>
            {/* Model Selector dropdown */}
            <div className="relative shrink-0">
              <select
                aria-label={copy.modelSelectLabel}
                value={selectedModel}
                disabled={isActionsDisabled}
                onChange={(e) => handleModelChange(e.target.value)}
                className="text-xs bg-transparent hover:bg-[#232736] border-0 border-none text-white rounded-full px-2.5 py-1 cursor-pointer focus:outline-none focus:ring-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ outline: 'none', border: 'none' }}
              >
                {modelOptions.map((opt) => (
                  <option key={opt} value={opt} className="bg-[#181a24] text-white">
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Voice Input button */}
            <button
              type="button"
              disabled={isActionsDisabled}
              aria-label={copy.voiceInputLabel}
              className="p-1.5 sm:p-2 rounded-full text-[var(--text-muted)] hover:text-white hover:bg-[var(--bubble-visitor)]/60 transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>

            {/* Stop button (if isStreaming or (onStop and waiting)) or Send button */}
            {isStreaming || (onStop && (status === 'waiting' || status === 'streaming')) ? (
              <button
                type="button"
                aria-label={copy.stopLabel}
                onClick={onStop}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer transition-all flex items-center justify-center shrink-0 shadow-sm"
              >
                <span className="sr-only">{copy.stopLabel}</span>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                aria-label={copy.sendLabel}
                disabled={
                  disabled ||
                  isWaitingForResponse ||
                  isConnecting ||
                  isUploading ||
                  !isSendable(currentDraft)
                }
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center shrink-0 shadow-sm"
              >
                <span className="sr-only">{copy.sendLabel}</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="composer-meta flex justify-between gap-3 text-xs text-[var(--text-muted)]">
        <span id={counterId} className={atLimit ? 'at-limit text-[var(--danger)] font-medium' : undefined}>
          {atLimit ? copy.atCharacterLimit : copy.charactersRemaining(remaining)}
        </span>
        {(disabled || isConnecting || isUploading) && effectiveReason ? <span>{effectiveReason}</span> : null}
      </div>
    </form>
  );
}
