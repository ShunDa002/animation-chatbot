'use client';

import { useState } from 'react';
import { resumeChat } from '@/lib/conversation/backend';

export interface HitlConfirmationProps {
  threadId: string;
  interruptId?: string;
  initialDecision?: 'yes' | 'no' | null;
  onResume?: (decision: 'yes' | 'no') => Promise<void>;
  onSuccess?: (decision: 'yes' | 'no') => void;
  onError?: (error: Error) => void;
  prompt?: string;
  className?: string;
}

/**
 * Interactive confirmation card attached to interrupted AI messages (FR-021, FR-022, FR-023).
 *
 * Allows the user to submit approval ("yes") or rejection ("no") for pending HITL interrupts.
 * Handles API submission via POST /chat/resume, inline error display with retry capability,
 * and text replacement upon success.
 */
export default function HitlConfirmation({
  threadId,
  interruptId,
  initialDecision = null,
  onResume,
  onSuccess,
  onError,
  prompt = 'Action requires approval:',
  className = '',
}: HitlConfirmationProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<'yes' | 'no' | null>(initialDecision);

  const activeDecision = decision ?? initialDecision;

  const handleDecision = async (chosenDecision: 'yes' | 'no') => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      if (onResume) {
        await onResume(chosenDecision);
      } else {
        const response = await resumeChat(threadId, chosenDecision, interruptId);
        if (!response.ok) {
          throw new Error(`Submission failed with status ${response.status}`);
        }
      }

      setDecision(chosenDecision);
      onSuccess?.(chosenDecision);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to submit decision. Please try again.';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Confirmation"
      className={`hitl-confirmation-card mt-3 p-3 sm:p-3.5 rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-lg text-white backdrop-blur-sm ${className}`}
    >
      {activeDecision ? (
        <div className="flex items-center gap-2 text-sm font-medium">
          {activeDecision === 'yes' ? (
            <div className="inline-flex items-center gap-1.5 text-emerald-400">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>Approved</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-slate-400">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Rejected</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {prompt && (
            <p className="text-xs sm:text-sm text-slate-300 font-medium m-0">{prompt}</p>
          )}

          {error && (
            <div
              role="alert"
              className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/60 rounded px-2.5 py-1.5"
            >
              {error}
            </div>
          )}

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleDecision('yes')}
              className="px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm inline-flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                'Yes'
              )}
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleDecision('no')}
              className="px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-600 text-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
