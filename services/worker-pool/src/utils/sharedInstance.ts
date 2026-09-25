import { AssistantLoader } from '../services/AssistantLoader';
import { AssistantExecutor } from '../services/AssistantExecutor';
import { KnowledgeService } from '../services/KnowledgeService';
import { ArtifactsService } from '@stage7-nextgen/artifacts';
import { buildAssistantManifest, parseSTAGE7_ASSISTANTS, validateManifest, filterCatalogByManifest, type AssistantManifest } from '../data/assistantManifest';

const persistence = new ArtifactsService();
const knowledgeService = new KnowledgeService(persistence);
const assistantLoader = new AssistantLoader(persistence);
const assistantExecutor = new AssistantExecutor(knowledgeService);

export { assistantLoader, assistantExecutor, knowledgeService, persistence, buildAssistantManifest, parseSTAGE7_ASSISTANTS, validateManifest, filterCatalogByManifest, type AssistantManifest };
