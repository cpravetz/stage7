import { useEffect, useRef } from 'react';

export const useChatAutoScroll = (dependency: any[]) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, dependency);

  return messagesEndRef;
};
