import { promises as fs } from 'fs';
import path from 'path';
import { BaseService } from '../services/baseService';
import { analyzeError } from '@cktmcs/errorhandler';

export class ServiceManager {
    private services: Map<string, BaseService> = new Map();

    constructor() {
        this.loadServices();
    }

    private async loadServices() {
        const serviceDirectory = path.join(__dirname, '..','services');

        try {
            const files = await fs.readdir(serviceDirectory);
            console.log('Files in service directory',serviceDirectory,': ', files);
            for (const file of files) {
                // Skip non-TS or non-JS files
                if (!file.endsWith('.ts') && !file.endsWith('.js')) {
                    continue;
                }

                // Dynamically import the model class
                const serviceModule = await import(path.join(serviceDirectory, file));

                // Assume that the class name is the default export from the module
                const serviceInstance = serviceModule.default;
                if (serviceInstance instanceof BaseService && serviceInstance.serviceName) {
                    this.services.set(serviceInstance.serviceName.toLowerCase(), serviceInstance);
                    console.log(`Loaded service: ${serviceInstance.serviceName}`);
                }
            }
            console.log(`modelManager Loaded ${this.services.size} services.`);
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading services:', error instanceof Error ? error.message : error);
        }
    }

    getServices() : Map<string, BaseService>{
        return this.services;
    }

    getService(name: string) : BaseService | undefined{
        if (!name) {
            console.error('Service name is undefined in getService');
            return undefined;
        }
        return this.services.get(name.toLowerCase());
    }

    /**
     * Get all services
     * @returns Map of all services
     */
    getAllServices(): Map<string, BaseService> {
        return this.services;
    }

}

const serviceManager = new ServiceManager();
export { serviceManager };