import { promises as fs } from 'fs';
import path from 'path';
import { BaseInterface } from '../interfaces/baseInterface';
import { analyzeError } from '@cktmcs/errorhandler';


export class InterfaceManager {
    private interfaces: Map<string, BaseInterface> = new Map();

    constructor() {
        this.loadInterfaces();
    }

    private async loadInterfaces() {
        const interfaceDirectory = path.join(__dirname, '..','interfaces');

        try {
            const files = await fs.readdir(interfaceDirectory);
            for (const file of files) {
                // Skip non-TS or non-JS files
                if (!file.endsWith('.ts') && !file.endsWith('.js')) {
                    continue;
                }
                // Dynamically import the model class
                const interfaceModule = await import(path.join(interfaceDirectory, file));

                // Assume that the class name is the default export from the module
                const interfaceInstance = interfaceModule.default;
                if (interfaceInstance instanceof BaseInterface && interfaceInstance.interfaceName) {
                    this.interfaces.set(interfaceInstance.interfaceName.toLowerCase(), interfaceInstance);
                    console.log(`Loaded interface: ${interfaceInstance.interfaceName}`);
                }
            }
            console.log(`modelManager Loaded ${this.interfaces.size} interfaces.`);
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading interfaces:', error instanceof Error ? error.message : error);
        }
    }

    getInterfaces() : Map<string, BaseInterface>{
        return this.interfaces;
    }

    getInterface(name: string) : BaseInterface | undefined{
        if (name) {
            return this.interfaces.get(name.toLowerCase());
        } else {
            console.error('Interface name is undefined in getInterface');
            return undefined;
        }
    }

    /**
     * Get all interfaces
     * @returns Map of all interfaces
     */
    getAllInterfaces(): Map<string, BaseInterface> {
        return this.interfaces;
    }
}

const interfaceManager = new InterfaceManager();
export { interfaceManager };