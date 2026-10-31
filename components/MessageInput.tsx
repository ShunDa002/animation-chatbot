'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  atCharacterLimit,
  clampInput,
  isSendable,
  MAX_INPUT_CHARACTERS,
  remainingCharacters,
  validateRagFile,
  getRagFileExtension,
  type ThreadRagUploadState,
} from '@/lib/conversation/limits';
import { copy } from '@/lib/ui/copy';
import type { ConversationStatus } from '@/lib/conversation/useConversation';
import {
  fetchModels,
  uploadRagDocument,
  loadSampleResumeFile,
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
  /** Optional resume file loader override for testing */
  loadResumeFn?: (path?: string, signal?: AbortSignal) => Promise<File>;
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

export const STORAGE_KEY_MODEL = 'chat_selected_model';

/**
 * The composer (FR-022, FR-003, D13, US9).
 *
 * The draft lives in this component's own state (or controlled value), which is what makes it survive a re-render of the
 * log above it (constitution III). It is also cached in sessionStorage so unsubmitted drafts
 * survive page reloads (FR-024).
 *
 * Integrates RAG document upload via a 2-option dropdown menu and sticky document pill (FR-005, FR-043-FR-047, US9).
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
  loadResumeFn = loadSampleResumeFile,
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
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const cached = sessionStorage.getItem(STORAGE_KEY_MODEL);
        if (cached) return cached;
      }
    } catch {
      // Ignore sessionStorage access errors
    }
    return (externalModels && externalModels[0]) || '';
  });

  const selectedModel =
    controlledModel ??
    (internalSelectedModel && modelOptions.includes(internalSelectedModel)
      ? internalSelectedModel
      : modelOptions[0] || '');

  const handleModelChange = (newModel: string) => {
    setInternalSelectedModel(newModel);
    try {
      if (typeof window !== 'undefined' && window.sessionStorage && newModel) {
        sessionStorage.setItem(STORAGE_KEY_MODEL, newModel);
      }
    } catch {
      // Ignore sessionStorage access errors
    }
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
          setInternalSelectedModel((prev) => {
            const next = fetched.includes(prev) ? prev : fetched[0] || '';
            try {
              if (typeof window !== 'undefined' && window.sessionStorage && next) {
                sessionStorage.setItem(STORAGE_KEY_MODEL, next);
              }
            } catch {
              // Ignore sessionStorage access errors
            }
            return next;
          });
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const attachmentButtonRef = useRef<HTMLButtonElement>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);

  const isMountedRef = useRef(false);
  const remaining = remainingCharacters(currentDraft);
  const atLimit = atCharacterLimit(currentDraft);
  const counterId = useId();
  const inputId = useId();
  const dropdownId = useId();

  // RAG document upload state per-thread (FR-047, US9)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [uploadsByThread, setUploadsByThread] = useState<Record<string, ThreadRagUploadState>>({});

  const activeThreadKey = threadId ?? '__default__';
  const currentUpload = uploadsByThread[activeThreadKey] ?? INITIAL_UPLOAD_STATE;
  const isUploading = currentUpload.status === 'uploading' || currentUpload.status === 'processing';
  const hasActiveAttachment =
    currentUpload.status !== 'idle' &&
    (currentUpload.file !== null ||
      currentUpload.status === 'uploading' ||
      currentUpload.status === 'processing' ||
      currentUpload.status === 'ready' ||
      currentUpload.status === 'already_added' ||
      currentUpload.status === 'failed');

  // Dismiss dropdown on outside click or Escape key
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        attachmentButtonRef.current &&
        !attachmentButtonRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  // Abort any in-flight upload on unmount
  useEffect(() => {
    return () => {
      if (uploadAbortControllerRef.current) {
        uploadAbortControllerRef.current.abort();
        uploadAbortControllerRef.current = null;
      }
    };
  }, []);

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
    (isUploading ? copy.ragUploadInProgressReason : isConnecting ? copy.connecting : null);

  const isMultiline = currentDraft.includes('\n') || currentDraft.length > 48;
  const isTextareaDisabled = Boolean(
    disabled && !isWaitingForResponse && status !== 'waiting' && !isStreaming,
  );
  const isActionsDisabled = Boolean(disabled || isConnecting);
  const isAttachmentDisabled = isActionsDisabled || hasActiveAttachment || threadId === null;

  const isStreamingRef = useRef(isStreaming);
  const statusRef = useRef(status);
  const onStopRef = useRef(onStop);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
    statusRef.current = status;
    onStopRef.current = onStop;
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const canStop = Boolean(
          onStopRef.current && (isStreamingRef.current || statusRef.current === 'streaming'),
        );
        if (canStop) {
          event.preventDefault();
          onStopRef.current?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (!isMultiline) {
      textarea.style.height = '1.5rem';
      textarea.style.overflowY = 'hidden';
      textarea.scrollTop = 0;
      return;
    }

    // Reset height to auto to compute scrollHeight accurately
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;

    if (scrollHeight > 120) {
      textarea.style.height = '120px';
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.height = `${Math.max(scrollHeight, 40)}px`;
      textarea.style.overflowY = 'hidden';
    }
  }, [currentDraft, isMultiline]);

  function submit(): void {
    const handleSend = onSubmit ?? onSend;
    if (
      disabled ||
      isWaitingForResponse ||
      isConnecting ||
      isUploading ||
      threadId === null ||
      !isSendable(currentDraft) ||
      !handleSend
    ) {
      return;
    }
    if (selectedModel) {
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.setItem(STORAGE_KEY_MODEL, selectedModel);
        }
      } catch {
        // Ignore sessionStorage access errors
      }
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

  // Upload runner with AbortController lifecycle
  const startUpload = async (fileToUpload: File) => {
    const targetThreadKey = activeThreadKey;
    const targetThreadId = threadId ?? 'default-thread';

    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }

    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;

    const ext = getRagFileExtension(fileToUpload.name).replace('.', '').toUpperCase();

    setUploadsByThread((prev) => ({
      ...prev,
      [targetThreadKey]: {
        status: 'uploading',
        file: fileToUpload,
        fileName: fileToUpload.name,
        fileTypeLabel: ext || 'DOC',
        fileSizeBytes: fileToUpload.size,
        progress: 0,
        statusMessage: copy.ragStatusUploading,
        originalFilename: null,
      },
    }));

    try {
      const result = await uploadFn(targetThreadId, fileToUpload, {
        signal: abortController.signal,
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
      setUploadsByThread((prev) => {
        const existing = prev[targetThreadKey] ?? INITIAL_UPLOAD_STATE;
        return {
          ...prev,
          [targetThreadKey]: {
            ...existing,
            status: isDuplicate ? 'already_added' : 'ready',
            statusMessage: isDuplicate ? copy.ragStatusDuplicate : copy.ragStatusReady,
            originalFilename: result.originalFilename,
          },
        };
      });
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        return;
      }
      const userMessage =
        err instanceof RagUploadError
          ? err.userMessage
          : err instanceof Error && err.message
            ? err.message
            : copy.ragErrorGeneric;

      setUploadsByThread((prev) => {
        const existing = prev[targetThreadKey] ?? INITIAL_UPLOAD_STATE;
        return {
          ...prev,
          [targetThreadKey]: {
            ...existing,
            status: 'failed',
            statusMessage: userMessage,
          },
        };
      });
    } finally {
      if (uploadAbortControllerRef.current === abortController) {
        uploadAbortControllerRef.current = null;
      }
    }
  };

  const handleSelectBrowseFiles = () => {
    setIsDropdownOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (!file) return;

    const validation = validateRagFile(file, threadId);
    if (!validation.valid) {
      setUploadsByThread((prev) => ({
        ...prev,
        [activeThreadKey]: {
          status: 'failed',
          file: validation.file ?? file,
          fileName: validation.file ? validation.file.name : file.name,
          fileTypeLabel: getRagFileExtension(validation.file?.name || file.name)
            .replace('.', '')
            .toUpperCase(),
          fileSizeBytes: validation.file ? validation.file.size : file.size,
          progress: null,
          statusMessage: validation.error,
          originalFilename: null,
        },
      }));
      return;
    }

    void startUpload(validation.file);
  };

  const handleSelectResumePdf = async () => {
    setIsDropdownOpen(false);

    const targetThreadKey = activeThreadKey;
    const targetThreadId = threadId ?? 'default-thread';

    if (threadId === null || threadId === '') {
      setUploadsByThread((prev) => ({
        ...prev,
        [targetThreadKey]: {
          status: 'failed',
          file: null,
          fileName: 'resume.pdf',
          fileTypeLabel: 'PDF',
          fileSizeBytes: null,
          progress: null,
          statusMessage: copy.ragErrorNoConversation,
          originalFilename: null,
        },
      }));
      return;
    }

    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }

    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;

    // Immediately display the sticky document pill in uploading state with progress
    setUploadsByThread((prev) => ({
      ...prev,
      [targetThreadKey]: {
        status: 'uploading',
        file: null,
        fileName: 'resume.pdf',
        fileTypeLabel: 'PDF',
        fileSizeBytes: null,
        progress: 0,
        statusMessage: copy.ragStatusUploading,
        originalFilename: null,
      },
    }));

    try {
      const file = await loadResumeFn('/resume.pdf', abortController.signal);
      if (abortController.signal.aborted) {
        return;
      }

      const validation = validateRagFile(file, threadId);
      if (!validation.valid) {
        setUploadsByThread((prev) => {
          const existing = prev[targetThreadKey] ?? INITIAL_UPLOAD_STATE;
          return {
            ...prev,
            [targetThreadKey]: {
              ...existing,
              status: 'failed',
              file: validation.file ?? file,
              fileName: file.name,
              fileTypeLabel: 'PDF',
              fileSizeBytes: file.size,
              progress: null,
              statusMessage: validation.error,
            },
          };
        });
        return;
      }

      setUploadsByThread((prev) => {
        const existing = prev[targetThreadKey] ?? INITIAL_UPLOAD_STATE;
        return {
          ...prev,
          [targetThreadKey]: {
            ...existing,
            file: validation.file,
            fileSizeBytes: validation.file.size,
          },
        };
      });

      const result = await uploadFn(targetThreadId, validation.file, {
        signal: abortController.signal,
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
      setUploadsByThread((prev) => {
        const existing = prev[targetThreadKey] ?? INITIAL_UPLOAD_STATE;
        return {
          ...prev,
          [targetThreadKey]: {
            ...existing,
            status: isDuplicate ? 'already_added' : 'ready',
            statusMessage: isDuplicate ? copy.ragStatusDuplicate : copy.ragStatusReady,
            originalFilename: result.originalFilename,
          },
        };
      });
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        return;
      }
      const userMessage =
        err instanceof RagUploadError
          ? err.userMessage
          : err instanceof Error && err.message
            ? err.message
            : copy.ragErrorGeneric;

      setUploadsByThread((prev) => {
        const existing = prev[targetThreadKey] ?? INITIAL_UPLOAD_STATE;
        return {
          ...prev,
          [targetThreadKey]: {
            ...existing,
            status: 'failed',
            statusMessage: userMessage,
          },
        };
      });
    } finally {
      if (uploadAbortControllerRef.current === abortController) {
        uploadAbortControllerRef.current = null;
      }
    }
  };

  const handleCancelAttachment = () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }
    setUploadsByThread((prev) => ({
      ...prev,
      [activeThreadKey]: INITIAL_UPLOAD_STATE,
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <form
      className="composer flex flex-col shrink-0 mt-auto justify-end w-full"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {/* Hidden native file input for Browse files option */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.docx"
        tabIndex={-1}
        className="hidden"
        aria-label={copy.ragBrowseLabel}
        data-testid="rag-file-input"
        onChange={handleFileInputChange}
      />

      {/* Sticky Document Pill stacked directly above the outer top border of the composer container */}
      {hasActiveAttachment && (
        <div className="w-full flex items-center justify-start mb-1.5 sm:mb-2">
          <div
            data-testid="rag-document-pill"
            role={currentUpload.status === 'failed' ? 'alert' : 'status'}
            aria-live="polite"
            className={`inline-flex items-center gap-2 max-w-full px-3 py-1 rounded-full text-xs transition-all shadow-md ${
              currentUpload.status === 'failed'
                ? 'bg-rose-950/70 border border-rose-800 text-rose-200'
                : 'bg-[#181a24] border border-[#2d3142] text-white'
            }`}
          >
            {/* File format badge */}
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                currentUpload.status === 'failed'
                  ? 'bg-rose-900/80 text-rose-200 border border-rose-700/60'
                  : 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
              }`}
            >
              {currentUpload.fileTypeLabel || 'DOC'}
            </span>

            {/* File name */}
            <span
              className="font-medium truncate max-w-[140px] sm:max-w-[220px]"
              title={currentUpload.fileName ?? ''}
            >
              {currentUpload.fileName || 'document'}
            </span>

            {/* Status / In-flight Spinner / Status Message */}
            {isUploading ? (
              <div className="flex items-center gap-1.5 shrink-0 text-blue-400">
                <svg
                  className="animate-spin w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {currentUpload.status === 'uploading' &&
                  currentUpload.progress !== null &&
                  currentUpload.progress > 0 && (
                    <span className="text-[10px] font-semibold">{currentUpload.progress}%</span>
                  )}
              </div>
            ) : currentUpload.status === 'failed' ? (
              <span
                className="text-[11px] text-rose-300 truncate max-w-[180px] sm:max-w-[260px]"
                title={currentUpload.statusMessage ?? ''}
              >
                {currentUpload.statusMessage}
              </span>
            ) : currentUpload.status === 'already_added' ? (
              <span
                className="text-[10px] text-blue-300 font-medium truncate max-w-[160px] sm:max-w-[220px]"
                title={currentUpload.statusMessage ?? copy.ragStatusDuplicate}
              >
                {copy.ragStatusDuplicate}
              </span>
            ) : currentUpload.status === 'ready' ? (
              <span
                className="text-[10px] text-emerald-400 font-medium truncate max-w-[160px] sm:max-w-[220px]"
                title={currentUpload.statusMessage ?? copy.ragStatusReady}
              >
                {copy.ragStatusReady}
              </span>
            ) : null}

            {/* Cancel button (X) */}
            <button
              type="button"
              data-testid="rag-pill-cancel-btn"
              aria-label={copy.ragCancelAttachmentLabel}
              onClick={handleCancelAttachment}
              className="p-0.5 rounded-full text-[var(--text-muted)] hover:text-white hover:bg-[#232736] transition-colors cursor-pointer shrink-0 ml-0.5"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div
        className={`composer-box relative flex ${
          isMultiline
            ? 'flex-col gap-2 p-3 rounded-2xl'
            : 'flex-row items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:py-2 rounded-full'
        } bg-[#181a24] focus-within:bg-[#1e2230] border border-[#2d3142] focus-within:border-[#383d54] shadow-lg transition-all duration-200 ${
          isTextareaDisabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
        data-multiline={isMultiline ? 'true' : 'false'}
      >
        <div
          className={`composer-text-zone flex-1 min-w-0 ${isMultiline ? 'order-1 w-full' : 'order-2 flex items-center'}`}
        >
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
            maxLength={MAX_INPUT_CHARACTERS}
            onChange={(event) => handleDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            className="w-full block bg-transparent border-0 border-none text-white text-sm sm:text-base leading-6 font-sans resize-none outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 focus:border-0 focus:border-transparent focus-visible:border-transparent placeholder:text-[var(--text-muted)] py-0 px-1 min-h-[1.5rem] max-h-[7.5rem] overflow-y-auto shadow-none focus:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              outline: 'none',
              border: 'none',
              boxShadow: 'none',
              overflowY: 'hidden',
              height: '1.5rem',
            }}
          />
        </div>

        {/* Footer / actions wrapper */}
        <div
          className={`composer-footer ${
            isMultiline
              ? 'order-2 flex items-center justify-between w-full pt-1 border-t border-[#2d3142]/40'
              : 'contents'
          }`}
        >
          {/* Attachment button zone with dropdown menu */}
          <div
            className={`composer-actions-left relative flex items-center ${isMultiline ? '' : 'order-1 shrink-0'}`}
          >
            {isDropdownOpen && (
              <div
                ref={dropdownRef}
                id={dropdownId}
                data-testid="rag-dropdown-menu"
                role="menu"
                aria-label={copy.ragDropdownAriaLabel}
                className="absolute bottom-full left-0 mb-2 z-30 min-w-[150px] bg-[#181a24] border border-[#2d3142] rounded-xl shadow-2xl py-1 text-white flex flex-col focus:outline-none"
              >
                <button
                  type="button"
                  role="menuitem"
                  data-testid="rag-dropdown-browse"
                  onClick={handleSelectBrowseFiles}
                  className="w-full text-left px-3 py-2 text-xs text-white hover:bg-[#232736] transition-colors cursor-pointer flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4 text-[var(--text-muted)]"
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
                  <span>{copy.ragBrowseLabel}</span>
                </button>

                <div className="my-1 border-t border-[#2d3142]" role="separator" />

                <button
                  type="button"
                  role="menuitem"
                  data-testid="rag-dropdown-resume"
                  onClick={handleSelectResumePdf}
                  className="w-full text-left px-3 py-2 text-xs text-white hover:bg-[#232736] transition-colors cursor-pointer flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span>{copy.ragResumeOptionLabel}</span>
                </button>
              </div>
            )}

            <button
              ref={attachmentButtonRef}
              type="button"
              disabled={isAttachmentDisabled}
              aria-label={copy.attachmentLabel}
              aria-expanded={isDropdownOpen}
              aria-controls={dropdownId}
              title={hasActiveAttachment ? copy.ragAttachmentDisabledTooltip : copy.attachmentLabel}
              onClick={() => {
                if (hasActiveAttachment) return;
                setIsDropdownOpen((prev) => !prev);
              }}
              className={`p-1.5 sm:p-2 rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                isDropdownOpen
                  ? 'text-white bg-[#232736]'
                  : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bubble-visitor)]/60'
              }`}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>

          {/* Controls zone */}
          <div
            className={`composer-actions-right flex items-center gap-1.5 sm:gap-2 ${isMultiline ? '' : 'order-3 shrink-0'}`}
          >
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
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>

            {/* Stop button or Send button */}
            {isStreaming ||
            (!isWaitingForResponse &&
              onStop &&
              (status === 'waiting' || status === 'streaming')) ? (
              <button
                type="button"
                aria-label={copy.stopLabel}
                onClick={onStop}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer transition-all flex items-center justify-center shrink-0 shadow-sm"
              >
                <span className="sr-only">{copy.stopLabel}</span>
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
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
                  threadId === null ||
                  !isSendable(currentDraft)
                }
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center shrink-0 shadow-sm"
              >
                <span className="sr-only">{copy.sendLabel}</span>
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="composer-meta flex justify-between gap-3 text-xs text-[var(--text-muted)]">
        <span
          id={counterId}
          className={atLimit ? 'at-limit text-[var(--danger)] font-medium' : undefined}
        >
          {atLimit ? copy.atCharacterLimit : copy.charactersRemaining(remaining)}
        </span>
        {effectiveReason ? <span>{effectiveReason}</span> : null}
      </div>
    </form>
  );
}
