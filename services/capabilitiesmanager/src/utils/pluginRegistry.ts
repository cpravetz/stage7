import { PluginDefinition, PluginManifest, PluginRepositoryType, PluginLocator } from '@cktmcs/shared';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PluginMarketplace } from '@cktmcs/marketplace';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PluginRegistry {
    private cache: Map<string, PluginRepositoryType>;
    private verbIndex: Map<string, string>;  // verb -> id mapping
    private pluginMarketplace: PluginMarketplace;
    private pluginsDir: string;
    public currentDir = dirname(fileURLToPath(import.meta.url));

    constructor() {
        this.cache = new Map();
        this.verbIndex = new Map();
        this.pluginMarketplace = new PluginMarketplace();
        this.pluginsDir = path.join(__dirname, 'plugins');
        this.initialize();        
    }

    public async initialize(): Promise<void> {
        // Initialize existing plugins
        const locators = await this.pluginMarketplace.list();
        for (const locator of locators) {
            this.updateCache(locator);
        }
    }   

    async fetchOne(id: string, repository?: PluginRepositoryType): Promise<PluginManifest | undefined> {
        const plugin = await this.pluginMarketplace.fetchOne(id, repository);
        if (plugin && !this.cache.has(plugin.id)) {
            this.updateCache(this.getLocatorFromManifest(plugin));
        }
        return plugin;
    }

    async fetchOneByVerb(verb: string): Promise<PluginManifest | undefined> {
        if (this.verbIndex.has(verb)) {
            const id = this.verbIndex.get(verb);
            if (!id) {
                return undefined;
            }
            const repository = this.cache.get(id);
            return this.pluginMarketplace.fetchOne(id, repository);
        }
        const plugin = await this.pluginMarketplace.fetchOneByVerb(verb);
        if (plugin && !this.cache.has(plugin.id)) {
            this.updateCache(this.getLocatorFromManifest(plugin));
        }
        return plugin;
    }

    async findOne(id: string): Promise<PluginDefinition | undefined> {
        if (this.cache.has(id)) {
            return this.pluginMarketplace.fetchOne(id, this.cache.get(id));
        }
        const plugin = await this.pluginMarketplace.fetchOne(id);
        if (plugin && !this.cache.has(plugin.id)) {
            this.updateCache(this.getLocatorFromManifest(plugin));
        }
        return plugin;
    }

    public store(plugin: PluginManifest): Promise<void> {
        return this.pluginMarketplace.store(plugin);
    }

    async list(): Promise<PluginLocator[]> {
        return this.pluginMarketplace.list();
    }

    private async updateCache(pluginLocator: PluginLocator): Promise<void> {
        console.log('Registry: Update cache with ', pluginLocator.verb, pluginLocator.id);
        this.cache.set(pluginLocator.id, pluginLocator.repository.type);
        this.verbIndex.set(pluginLocator.verb, pluginLocator.id);
    }

    private getLocatorFromManifest(manifest: PluginManifest): PluginLocator {
        return {
            id: manifest.id,
            verb: manifest.verb,
            repository: {
                type: manifest.repository.type,
                url: manifest.repository.url,
                signature: manifest.repository.signature,
                dependencies: manifest.repository.dependencies
            }
        };
    }
}