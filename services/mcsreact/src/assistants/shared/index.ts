/**
 * Shared components and hooks for unified chat interface
 * Use these for all assistant chat implementations
 */

// Hooks
export { useChatMessages } from './hooks/useChatMessages';
export { useVoiceInput } from './hooks/useVoiceInput';

// Components
export { ChatPanel } from './components/ChatPanel';
export type { ChatPanelProps } from './components/ChatPanel';
export { VoiceInputWidget } from './components/VoiceInputWidget';
export { ConversationComponent } from './components/ConversationComponent';
export { StandardAssistantChat } from './components/StandardAssistantChat';
export { HumanInputWidget } from './components/HumanInputWidget';
