import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { scriptwriterAssistantClient } from '../shared/assistantClients';
import { Tabs, Tab, Box } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';

import CharacterCreationStudio from './CharacterCreationStudio';
import StoryDevelopmentCenter from './StoryDevelopmentCenter';
import DialogueWritingWorkshop from './DialogueWritingWorkshop';
import PlotStructureHub from './PlotStructureHub';
import ScriptFormattingCenter from './ScriptFormattingCenter';
import ScriptAnalysisDashboard from './ScriptAnalysisDashboard';
import CreativeCollaborationCenter from './CreativeCollaborationCenter';
import CreativeInsightAlerts from './CreativeInsightAlerts';
import NarrativeTimeline from './NarrativeTimeline';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';
import { Character, StoryIdea } from './types';

interface Dialogue {
  id: string;
  characterId: string;
  characterName: string;
  text: string;
  action?: string;
}

interface PlotPoint {
  id: string;
  sequenceNumber: number;
  description: string;
  actNumber?: number;
}

interface ScriptInsight {
  id: string;
  category: string;
  insight: string;
  timestamp: string;
}

interface AssistantRenderProps {
    messages: ConversationMessage[];
    sendMessage: (message: string) => Promise<void>;
    sendEvent: (event: any) => Promise<void>;
    assistantState: any;
    getState: (collectionName: string) => any[];
    mergeAssistantState: (collection: string, items: any[]) => void;
    isLoading: boolean;
    error: string | null;
    humanInputRequired: { prompt: string; type: string; metadata: any; inputStepId: string; } | null;
    submitHumanInput: (response: string, inputStepId: string) => void;
    clientId: string;
    conversationId: string;
}

const ScriptwriterAssistantView: React.FC<AssistantRenderProps> = ({
  messages,
  sendMessage,
  sendEvent,
  assistantState,
  getState = () => [],
  mergeAssistantState,
  isLoading,
  error,
  conversationId
}) => {
    const [tabValue, setTabValue] = useState(0);

    const characters = useMemo(() => Object.values(assistantState?.character || {}) as Character[], [assistantState]);
    const stories = useMemo(() => Object.values(assistantState?.story || {}) as StoryIdea[], [assistantState]);
    const dialogues = useMemo(() => Object.values(assistantState?.dialogue || {}) as Dialogue[], [assistantState]);
    const plotPoints = useMemo(() => {
      const items = Object.values(assistantState?.plotPoint || {}) as PlotPoint[];
      return items.sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
    }, [assistantState]);
    const scriptInsights = useMemo(() => Object.values(assistantState?.scriptInsight || {}) as ScriptInsight[], [assistantState]);

    useEffect(() => {
      if (!conversationId) return;
      const loadState = async () => {
        const [charactersState, storiesState, dialoguesState, plotPointsState, insightsState] = await Promise.all([
          getState('character'),
          getState('story'),
          getState('dialogue'),
          getState('plotPoint'),
          getState('scriptInsight')
        ]);

        mergeAssistantState('character', charactersState || []);
        mergeAssistantState('story', storiesState || []);
        mergeAssistantState('dialogue', dialoguesState || []);
        mergeAssistantState('plotPoint', plotPointsState || []);
        mergeAssistantState('scriptInsight', insightsState || []);
      };

      loadState().catch((err) => {
        console.error('[ScriptwriterAssistant] Failed to load state:', err);
      });
    }, [conversationId, getState, mergeAssistantState]);

    const buildEvent = useCallback((type: string, payload: any, entityId?: string) => ({
      type,
      payload,
      entityId,
      schemaVersion: '1.0',
      source: 'ui'
    }), []);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    return (
        <Box sx={{ display: 'flex', height: '100%', width: '100%' }}>
            <Box sx={{ flexGrow: 1, overflowY: 'auto', width: '50%' }}>
                <Box component="div" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs
                        value={tabValue}
                        onChange={handleTabChange}
                        indicatorColor="primary"
                        textColor="primary"
                        variant="scrollable"
                        scrollButtons="auto"
                        aria-label="scriptwriter assistant features tabs"
                    >
                        <Tab label="Characters" />
                        <Tab label="Story Development" />
                        <Tab label="Dialogue" />
                        <Tab label="Plot Structure" />
                        <Tab label="Formatting" />
                        <Tab label="Script Analysis" />
                        <Tab label="Collaboration" />
                        <Tab label="Creative Insights" />
                        <Tab label="Timeline" />
                    </Tabs>
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 0}>
                    {tabValue === 0 && (
                        <Box sx={{ p: 3 }}>
                            <CharacterCreationStudio
                                characters={characters}
                                onCreateCharacter={(character) => {
                                  sendEvent(buildEvent('domain.character.create', {
                                    ...character
                                  }, character.id));
                                }}
                                onDeleteCharacter={(characterId) => {
                                  sendEvent(buildEvent('domain.character.delete', { id: characterId }, characterId));
                                }}
                                onUpdateCharacter={(characterId, updates) => {
                                  sendEvent(buildEvent('domain.character.update', { id: characterId, ...updates }, characterId));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 1}>
                    {tabValue === 1 && (
                        <Box sx={{ p: 3 }}>
                            <StoryDevelopmentCenter
                                stories={stories}
                                onCreateStory={(story) => {
                                  sendEvent(buildEvent('domain.story.create', { ...story }, story.id));
                                }}
                                onUpdateStory={(storyId, story) => {
                                  sendEvent(buildEvent('domain.story.update', { id: storyId, ...story }, storyId));
                                }}
                                onDeleteStory={(storyId) => {
                                  sendEvent(buildEvent('domain.story.delete', { id: storyId }, storyId));
                                }}
                                onSelectStory={(storyId) => {
                                  const story = stories.find(s => s.id === storyId);
                                  if (story) {
                                    sendMessage(`I've selected the story: ${story.title}`);
                                  }
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 2}>
                    {tabValue === 2 && (
                        <Box sx={{ p: 3 }}>
                            <DialogueWritingWorkshop
                                dialogues={dialogues}
                                characters={characters}
                                onWriteDialogue={(dialogue) => {
                                  sendEvent(buildEvent('domain.dialogue.create', { ...dialogue }, dialogue.id));
                                }}
                                onDeleteDialogue={(dialogueId) => {
                                  sendEvent(buildEvent('domain.dialogue.delete', { id: dialogueId }, dialogueId));
                                }}
                                onUpdateDialogue={(dialogueId, text) => {
                                  sendEvent(buildEvent('domain.dialogue.update', { id: dialogueId, text }, dialogueId));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 3}>
                    {tabValue === 3 && (
                        <Box sx={{ p: 3 }}>
                            <PlotStructureHub
                                plotPoints={plotPoints}
                                onCreatePlotPoint={(plotPoint) => {
                                  sendEvent(buildEvent('domain.plotPoint.create', { ...plotPoint }, plotPoint.id));
                                }}
                                onDeletePlotPoint={(plotPointId) => {
                                  sendEvent(buildEvent('domain.plotPoint.delete', { id: plotPointId }, plotPointId));
                                }}
                                onUpdatePlotSequence={(newPlotPoints) => {
                                  newPlotPoints.forEach((plotPoint) => {
                                    sendEvent(buildEvent('domain.plotPoint.update', { ...plotPoint }, plotPoint.id));
                                  });
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 4}>
                    {tabValue === 4 && (
                        <Box sx={{ p: 3 }}>
                            <ScriptFormattingCenter
                                onApplyFormatting={(format) => {
                                  sendMessage(`I'm applying ${format} formatting to the script.`);
                                }}
                                onExportScript={(format) => {
                                  sendMessage(`I'm exporting the script in ${format} format.`);
                                }}
                                onCheckFormatCompliance={() => {
                                  sendMessage(`I'm checking the script for format compliance.`);
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 5}>
                    {tabValue === 5 && (
                        <Box sx={{ p: 3 }}>
                            <ScriptAnalysisDashboard
                                characters={characters}
                                dialogues={dialogues}
                                plotPoints={plotPoints}
                                onAnalyzeScript={() => {
                                  sendMessage(`Analyze my script with ${characters.length} characters, ${plotPoints.length} plot points, ${dialogues.length} dialogue lines.`);
                                }}
                                onCheckCharacterConsistency={() => {
                                  sendMessage(`Check character consistency for: ${characters.map(c => c.name).join(', ')}`);
                                }}
                                onEvaluatePacing={() => {
                                  sendMessage(`Evaluate the pacing of my script.`);
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 6}>
                    {tabValue === 6 && (
                        <Box sx={{ p: 3 }}>
                            <CreativeCollaborationCenter
                                characters={characters}
                                stories={stories}
                                onShareFeedback={(feedback) => {
                                  sendMessage(`I have feedback to share: ${feedback}`);
                                }}
                                onRequestCollaboration={(request) => {
                                  sendMessage(`I'd like to collaborate on: ${request}`);
                                }}
                                onSuggestImprovement={(suggestion) => {
                                  sendMessage(`I suggest this improvement: ${suggestion}`);
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 7}>
                    {tabValue === 7 && (
                        <Box sx={{ p: 3 }}>
                            <CreativeInsightAlerts
                                insights={scriptInsights}
                                onGenerateInsights={() => {
                                  sendMessage(`Generate creative insights for my script.`);
                                }}
                                onAcknowledgeInsight={(insightId) => {
                                  const insight = scriptInsights.find(i => i.id === insightId);
                                  if (insight) {
                                    sendEvent(buildEvent('domain.scriptInsight.update', { id: insightId, acknowledged: true }, insightId));
                                  }
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 8}>
                    {tabValue === 8 && (
                        <Box sx={{ p: 3 }}>
                            <NarrativeTimeline
                                characters={characters}
                                plotPoints={plotPoints}
                                onViewTimeline={() => {
                                  sendMessage(`Show me the narrative timeline with all events and character arcs.`);
                                }}
                            />
                        </Box>
                    )}
                </Box>
            </Box>

            <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Scriptwriter Assistant" enableVoiceInput={true} />
            </Box>
        </Box>
    );
};

const ScriptwriterAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Scriptwriter Assistant"
      description="Develop narratives, create characters, write dialogue, and structure scripts for various media. Get help with story development, character arcs, and script formatting."
      client={scriptwriterAssistantClient}
      initialPrompt="Hello! I need help writing a script."
      clientId={clientId}
    >
      {(props) => <ScriptwriterAssistantView {...props} />}
    </BaseAssistantPage>
  );
};

export default ScriptwriterAssistant;


