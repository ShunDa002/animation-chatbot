'use client';

import React from 'react';
import HitlConfirmation, { type HitlConfirmationProps } from '@/components/HitlConfirmation';
import MessageLog, { type MessageLogProps } from '@/components/MessageLog';
import LoadingSkeleton from '@/components/LoadingSkeleton';

export type InterruptCardProps = HitlConfirmationProps;

/**
 * InterruptCard inline UI component (T019, T020).
 * Attached to interrupted assistant messages for Human-in-the-Loop decision confirmation.
 */
export const InterruptCard = HitlConfirmation;

export interface MessageListProps extends Partial<MessageLogProps> {
  isHistoryLoading?: boolean;
}

/**
 * MessageList component (T019, T020, T032, T033).
 * Renders conversation message stream, handles scroll to bottom, and displays
 * skeleton loader during history loading.
 */
export default function MessageList({
  isHistoryLoading = false,
  messages = [],
  ...props
}: MessageListProps) {
  if (isHistoryLoading) {
    return <LoadingSkeleton variant="chat" />;
  }

  return <MessageLog messages={messages} {...props} />;
}
