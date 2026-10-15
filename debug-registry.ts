import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { buildProviderRegistry } from './services/brain/src/providers/registry';
const providers = buildProviderRegistry();
console.log(providers.map((p: any) => ({ id: p.id, name: p.name })));
