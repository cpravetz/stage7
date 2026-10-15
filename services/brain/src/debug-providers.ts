import * as dotenv from 'dotenv';
dotenv.config({ path: '../../../.env' });
import { buildProviderRegistry } from './providers/registry';
const providers = buildProviderRegistry();
console.log(providers.map(p => ({ id: p.id, name: p.name })));
