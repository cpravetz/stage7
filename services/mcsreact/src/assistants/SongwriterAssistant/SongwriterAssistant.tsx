import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { BaseAssistantPage } from '../shared/BaseAssistantPage';
import { songwriterAssistantClient } from '../shared/assistantClients';
import { Tabs, Tab, Box } from '@mui/material/index.js';
import { ConversationMessage } from '@cktmcs/sdk';

import LyricWritingCenter from './LyricWritingCenter';
import MelodyCompositionStudio from './MelodyCompositionStudio';
import ChordProgressionHub from './ChordProgressionHub';
import SongStructureCenter from './SongStructureCenter';
import GenreSpecificWorkshop from './GenreSpecificWorkshop';
import MusicProductionCenter from './MusicProductionCenter';
import CreativeInsightAlerts from './CreativeInsightAlerts';
import MusicalTimeline from './MusicalTimeline';
import { ChatPanel } from '../../assistants/shared/components/ChatPanel';
import { LyricSection, SongStructure } from './types';

// Define additional data types for songwriter
interface MelodyIdea {
  id: string;
  name: string;
  description: string;
  key?: string;
}

interface ChordProgression {
  id: string;
  name: string;
  chords: string[];
  genre?: string;
}

interface SongInsight {
  id: string;
  type: 'Lyric' | 'Melody' | 'Harmony' | 'Structure' | 'Theme';
  description: string;
}

interface ProductionTechnique {
  id: string;
  technique: string;
  category: 'Mixing' | 'Mastering' | 'Effect' | 'Arrangement';
  description: string;
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

const SongwriterAssistantView: React.FC<AssistantRenderProps> = ({
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

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    const lyrics = useMemo(() => Object.values(assistantState?.lyric || {}) as LyricSection[], [assistantState]);
    const melodies = useMemo(() => Object.values(assistantState?.melody || {}) as MelodyIdea[], [assistantState]);
    const chordProgressions = useMemo(() => Object.values(assistantState?.chordProgression || {}) as ChordProgression[], [assistantState]);
    const songStructures = useMemo(() => Object.values(assistantState?.songStructure || {}) as SongStructure[], [assistantState]);
    const songInsights = useMemo(() => Object.values(assistantState?.songInsight || {}) as SongInsight[], [assistantState]);
    const productionTechniques = useMemo(() => Object.values(assistantState?.productionTechnique || {}) as ProductionTechnique[], [assistantState]);

    useEffect(() => {
        if (!conversationId) return;
        const loadState = async () => {
            const [lyricsState, melodiesState, chordsState, structuresState, insightsState, techniquesState] = await Promise.all([
                getState('lyric'),
                getState('melody'),
                getState('chordProgression'),
                getState('songStructure'),
                getState('songInsight'),
                getState('productionTechnique')
            ]);

            mergeAssistantState('lyric', lyricsState || []);
            mergeAssistantState('melody', melodiesState || []);
            mergeAssistantState('chordProgression', chordsState || []);
            mergeAssistantState('songStructure', structuresState || []);
            mergeAssistantState('songInsight', insightsState || []);
            mergeAssistantState('productionTechnique', techniquesState || []);
        };

        loadState().catch((err) => {
            console.error('[SongwriterAssistant] Failed to load state:', err);
        });
    }, [conversationId, getState, mergeAssistantState]);

    const buildEvent = useCallback((type: string, payload: any, entityId?: string) => ({
        type,
        payload,
        entityId,
        schemaVersion: '1.0',
        source: 'ui'
    }), []);

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
                        aria-label="songwriter assistant features tabs"
                    >
                        <Tab label="Lyrics" />
                        <Tab label="Melody" />
                        <Tab label="Chord Progressions" />
                        <Tab label="Song Structure" />
                        <Tab label="Genre" />
                        <Tab label="Production" />
                        <Tab label="Creative Insights" />
                        <Tab label="Timeline" />
                    </Tabs>
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 0}>
                    {tabValue === 0 && (
                        <Box sx={{ p: 3 }}>
                            <LyricWritingCenter
                                lyrics={lyrics}
                                onAddLyrics={(section) => {
                                    sendEvent(buildEvent('domain.lyric.create', { ...section }, section.id));
                                }}
                                onDeleteLyrics={(lyricId) => {
                                    sendEvent(buildEvent('domain.lyric.delete', { id: lyricId }, lyricId));
                                }}
                                onUpdateLyrics={(lyricId, content) => {
                                    sendEvent(buildEvent('domain.lyric.update', { id: lyricId, content }, lyricId));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 1}>
                    {tabValue === 1 && (
                        <Box sx={{ p: 3 }}>
                            <MelodyCompositionStudio
                                melodies={melodies}
                                onCreateMelody={(melody) => {
                                    sendEvent(buildEvent('domain.melody.create', { ...melody }, melody.id));
                                }}
                                onDeleteMelody={(melodyId) => {
                                    sendEvent(buildEvent('domain.melody.delete', { id: melodyId }, melodyId));
                                }}
                                onPlayMelody={(melodyId) => {
                                    sendEvent(buildEvent('domain.melody.play', { id: melodyId }, melodyId));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 2}>
                    {tabValue === 2 && (
                        <Box sx={{ p: 3 }}>
                            <ChordProgressionHub
                                progressions={chordProgressions}
                                onSelectChordProgression={(progression) => {
                                    sendEvent(buildEvent('domain.chordProgression.select', { ...progression }, progression.id));
                                }}
                                onCreateProgression={(progression) => {
                                    sendEvent(buildEvent('domain.chordProgression.create', { ...progression }, progression.id));
                                }}
                                onDeleteProgression={(progressionId) => {
                                    sendEvent(buildEvent('domain.chordProgression.delete', { id: progressionId }, progressionId));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 3}>
                    {tabValue === 3 && (
                        <Box sx={{ p: 3 }}>
                            <SongStructureCenter
                                structures={songStructures}
                                onCreateStructure={(structure) => {
                                    sendEvent(buildEvent('domain.songStructure.create', { ...structure }, structure.id));
                                }}
                                onSelectStructure={(structureId) => {
                                    sendEvent(buildEvent('domain.songStructure.select', { id: structureId }, structureId));
                                }}
                                onDeleteStructure={(structureId) => {
                                    sendEvent(buildEvent('domain.songStructure.delete', { id: structureId }, structureId));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 4}>
                    {tabValue === 4 && (
                        <Box sx={{ p: 3 }}>
                            <GenreSpecificWorkshop
                                onSelectGenre={(genre) => {
                                    sendEvent(buildEvent('domain.genre.select', { genre }));
                                }}
                                onAnalyzeGenre={(genre) => {
                                    sendEvent(buildEvent('domain.genre.analyze', { genre }));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 5}>
                    {tabValue === 5 && (
                        <Box sx={{ p: 3 }}>
                            <MusicProductionCenter
                                techniques={productionTechniques}
                                onApplyProduction={(technique) => {
                                    sendEvent(buildEvent('domain.productionTechnique.apply', { ...technique }, technique.id));
                                }}
                                onExploreProduction={(category) => {
                                    sendEvent(buildEvent('domain.productionTechnique.explore', { category }));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 6}>
                    {tabValue === 6 && (
                        <Box sx={{ p: 3 }}>
                            <CreativeInsightAlerts
                                insights={songInsights}
                                onGenerateInsights={() => {
                                    sendEvent(buildEvent('domain.songInsight.generate', {}));
                                }}
                                onAcknowledgeInsight={(insightId) => {
                                    sendEvent(buildEvent('domain.songInsight.acknowledge', { id: insightId }, insightId));
                                }}
                            />
                        </Box>
                    )}
                </Box>
                <Box role="tabpanel" hidden={tabValue !== 7}>
                    {tabValue === 7 && (
                        <Box sx={{ p: 3 }}>
                            <MusicalTimeline
                                lyrics={lyrics}
                                melodies={melodies}
                                onViewTimeline={() => {
                                    sendEvent(buildEvent('domain.timeline.view', {}));
                                }}
                            />
                        </Box>
                    )}
                </Box>
            </Box>

            <Box sx={{ width: '50%', borderLeft: '1px solid #e0e0e0' }}>
                <ChatPanel messages={messages} onSendMessage={sendMessage} isLoading={isLoading} error={error} assistantName="Songwriter Assistant" enableVoiceInput={true} />
            </Box>
        </Box>
    );
};

const SongwriterAssistant: React.FC<{ clientId: string }> = ({ clientId }) => {
  return (
    <BaseAssistantPage
      title="Songwriter Assistant"
      description="Write lyrics, compose melodies, create chord progressions, and develop song structures. Get help with songwriting, music theory, and creative inspiration."
      client={songwriterAssistantClient}
      initialPrompt="Hello! I need help writing a song."
      clientId={clientId}
    >
      {(props) => <SongwriterAssistantView {...props} />}
    </BaseAssistantPage>
  );
};

export default SongwriterAssistant;


