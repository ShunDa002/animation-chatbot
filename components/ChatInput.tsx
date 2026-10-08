'use client';

import MessageInput, { type MessageInputProps } from '@/components/MessageInput';

export type ChatInputProps = MessageInputProps;

/**
 * ChatInput component shell (T002).
 * Adaptive, auto-expanding message input component adhering to modern conversational UI patterns.
 */
export function ChatInput(props: ChatInputProps) {
  return <MessageInput {...props} />;
}

export default ChatInput;
