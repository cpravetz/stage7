import { AssistantLoader } from '../services/AssistantLoader';
import { AssistantExecutor } from '../services/AssistantExecutor';
import { ArtifactsService } from "../shared/artifacts";

const persistence = new ArtifactsService();
export const assistantLoader = new AssistantLoader(persistence);
export const assistantExecutor = new AssistantExecutor();
export { persistence };
