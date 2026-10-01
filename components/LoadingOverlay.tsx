'use client';

import { useEffect, useState } from 'react';

export interface LoadingOverlayProps {
  isConnecting: boolean;
  isGeneratingThread: boolean;
  onRetry: () => void;
  timeoutMs?: number;
  error?: string | null;
}

export default function LoadingOverlay({
  isConnecting,
  isGeneratingThread,
  onRetry,
  timeoutMs = 30000,
  error = null,
}: LoadingOverlayProps) {
  const [hasTimedOut, setHasTimedOut] = useState(false);

  const isLoading = isConnecting || isGeneratingThread;

  const [prevIsLoading, setPrevIsLoading] = useState(isLoading);
  if (prevIsLoading !== isLoading) {
    setPrevIsLoading(isLoading);
    setHasTimedOut(false);
  }

  useEffect(() => {
    if (!isLoading) return;

    const timer = setTimeout(() => {
      setHasTimedOut(true);
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [isLoading, isConnecting, isGeneratingThread, timeoutMs]);

  const handleRetry = () => {
    setHasTimedOut(false);
    onRetry();
  };

  const isFailed = hasTimedOut || !!error;
  const isVisible = isLoading || isFailed;

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Loading State"
      className={`loading-overlay fixed inset-0 z-50 flex flex-col items-center justify-center bg-white transition-opacity duration-500 ease-in-out ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {isFailed ? (
        <div className="flex flex-col items-center gap-4 text-center px-4 max-w-md">
          <p className="text-gray-800 text-base sm:text-lg font-medium">
            {error || 'Connection timed out. Unable to connect to backend.'}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-medium text-sm transition-all shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/loader.gif"
            alt="Loading..."
            className="w-24 h-24 sm:w-32 sm:h-32 object-contain"
          />
        </div>
      )}
    </div>
  );
}
