import { AssistantLoader } from '../services/AssistantLoader';
import { AssistantExecutor } from '../services/AssistantExecutor';
import { ArtifactsService } from "../shared/artifacts";
import { buildAssistantManifest, parseSTAGE7_ASSISTANTS, validateManifest, filterCatalogByManifest, type AssistantManifest } from '../data/assistantManifest';

const persistence = new ArtifactsService();
const assistantLoader = new AssistantLoader(persistence);
const assistantExecutor = new AssistantExecutor();

export { assistantLoader, assistantExecutor, persistence, buildAssistantManifest, parseSTAGE7_ASSISTANTS, validateManifest, filterCatalogByManifest, type AssistantManifest };
