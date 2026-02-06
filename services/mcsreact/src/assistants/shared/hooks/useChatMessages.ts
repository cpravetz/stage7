import { useState, useRef, useEffect, useCallback } from 'react';
import { ConversationMessage } from '@cktmcs/sdk';

/**
 * Custom hook for managing chat message state and operations
 * Handles message display, auto-scroll, and message operations
 */
export const useChatMessages = (initialMessages: ConversationMessage[] = []) => {
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Add a single message
  const addMessage = useCallback((message: ConversationMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  // Add multiple messages
  const addMessages = useCallback((newMessages: ConversationMessage[]) => {
    setMessages((prev) => [...prev, ...newMessages]);
  }, []);

  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Replace messages (useful for re-fetching conversation)
  const replaceMessages = useCallback((newMessages: ConversationMessage[]) => {
    setMessages(newMessages);
    scrollToBottom();
  }, [scrollToBottom]);

  // Get messages filtered by sender
  const getMessagesBySender = useCallback(
    (sender: 'user' | 'assistant') => {
      return messages.filter((msg) => msg.sender === sender);
    },
    [messages]
  );

  return {
    messages,
    setMessages,
    addMessage,
    addMessages,
    clearMessages,
    replaceMessages,
    getMessagesBySender,
    messagesEndRef,
    scrollToBottom,
  };
};
