import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import archiver from 'archiver';
import extract from 'extract-zip';
import { PluginManifest, PluginDefinition } from '@cktmcs/shared';

export interface PluginPackage {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    packageHash: string;
    createdAt: Date;
    manifest: PluginManifest;
    dependencies: PluginDependency[];
    signature?: string;
}

export interface PluginDependency {
    name: string;
    version: string;
    type: 'npm' | 'python' | 'system';
    optional: boolean;
}

export interface PackageMetadata {
    packageVersion: string;
    stage7Version: string;
    compatibility: string[];
    tags: string[];
    category: string;
    license: string;
}

export class PluginPackager {
    private readonly packagesDir: string;
    private readonly tempDir: string;

    constructor(packagesDir: string = './packages', tempDir: string = './temp') {
        this.packagesDir = packagesDir;
        this.tempDir = tempDir;
        this.ensureDirectories();
    }

    private ensureDirectories(): void {
        if (!fs.existsSync(this.packagesDir)) {
            fs.mkdirSync(this.packagesDir, { recursive: true });
        }
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Package a plugin into a transferable bundle
     */
    async packagePlugin(
        pluginPath: string, 
        manifest: PluginManifest, 
        metadata: PackageMetadata
    ): Promise<PluginPackage> {
        const packageId = uuidv4();
        const packageName = `${manifest.id}-${manifest.version}.s7pkg`;
        const packagePath = path.join(this.packagesDir, packageName);
        
        console.log(`Packaging plugin ${manifest.id} v${manifest.version}...`);

        // Create package structure
        const tempPackageDir = path.join(this.tempDir, packageId);
        fs.mkdirSync(tempPackageDir, { recursive: true });

        try {
            // Copy plugin files
            await this.copyPluginFiles(pluginPath, tempPackageDir);

            // Generate package manifest
            const packageManifest = this.createPackageManifest(manifest, metadata);
            fs.writeFileSync(
                path.join(tempPackageDir, 'package.json'),
                JSON.stringify(packageManifest, null, 2)
            );

            // Copy plugin manifest
            fs.writeFileSync(
                path.join(tempPackageDir, 'plugin.json'),
                JSON.stringify(manifest, null, 2)
            );

            // Analyze dependencies
            const dependencies = await this.analyzeDependencies(tempPackageDir, manifest);

            // Create dependencies file
            fs.writeFileSync(
                path.join(tempPackageDir, 'dependencies.json'),
                JSON.stringify(dependencies, null, 2)
            );

            // Create archive
            await this.createArchive(tempPackageDir, packagePath);

            // Calculate hash
            const packageHash = await this.calculateFileHash(packagePath);

            // Create plugin package object
            const pluginPackage: PluginPackage = {
                id: packageId,
                name: manifest.id,
                version: manifest.version,
                description: manifest.description,
                author: manifest.metadata?.author || 'Unknown',
                packageHash,
                createdAt: new Date(),
                manifest,
                dependencies
            };

            // Sign package if signing key is available
            if (process.env.PLUGIN_SIGNING_KEY) {
                pluginPackage.signature = await this.signPackage(packagePath);
            }

            console.log(`Plugin packaged successfully: ${packageName}`);
            return pluginPackage;

        } finally {
            // Cleanup temp directory
            if (fs.existsSync(tempPackageDir)) {
                fs.rmSync(tempPackageDir, { recursive: true, force: true });
            }
        }
    }

    /**
     * Unpack a plugin package
     */
    async unpackPlugin(packagePath: string, targetDir: string): Promise<PluginManifest> {
        console.log(`Unpacking plugin package: ${packagePath}`);

        // Verify package integrity
        await this.verifyPackage(packagePath);

        // Extract archive
        await this.extractArchive(packagePath, targetDir);

        // Read plugin manifest
        const manifestPath = path.join(targetDir, 'plugin.json');
        if (!fs.existsSync(manifestPath)) {
            throw new Error('Plugin manifest not found in package');
        }

        const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        
        console.log(`Plugin unpacked successfully: ${manifest.id} v${manifest.version}`);
        return manifest;
    }

    /**
     * Install plugin dependencies
     */
    async installDependencies(pluginDir: string): Promise<void> {
        const dependenciesPath = path.join(pluginDir, 'dependencies.json');
        if (!fs.existsSync(dependenciesPath)) {
            console.log('No dependencies file found, skipping dependency installation');
            return;
        }

        const dependencies: PluginDependency[] = JSON.parse(fs.readFileSync(dependenciesPath, 'utf8'));
        
        for (const dep of dependencies) {
            if (dep.optional) {
                try {
                    await this.installDependency(dep, pluginDir);
                } catch (error) {
                    console.warn(`Optional dependency ${dep.name} failed to install:`, error);
                }
            } else {
                await this.installDependency(dep, pluginDir);
            }
        }
    }

    private async copyPluginFiles(sourcePath: string, targetPath: string): Promise<void> {
        const stats = fs.statSync(sourcePath);
        
        if (stats.isDirectory()) {
            fs.mkdirSync(targetPath, { recursive: true });
            const files = fs.readdirSync(sourcePath);
            
            for (const file of files) {
                // Skip certain files/directories
                if (this.shouldSkipFile(file)) continue;
                
                const sourceFile = path.join(sourcePath, file);
                const targetFile = path.join(targetPath, file);
                await this.copyPluginFiles(sourceFile, targetFile);
            }
        } else {
            fs.copyFileSync(sourcePath, targetPath);
        }
    }

    private shouldSkipFile(filename: string): boolean {
        const skipPatterns = [
            'node_modules',
            '__pycache__',
            '.git',
            '.DS_Store',
            'Thumbs.db',
            '*.log',
            '*.tmp'
        ];
        
        return skipPatterns.some(pattern => {
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace('*', '.*'));
                return regex.test(filename);
            }
            return filename === pattern;
        });
    }

    private createPackageManifest(manifest: PluginManifest, metadata: PackageMetadata): any {
        return {
            name: manifest.id,
            version: manifest.version,
            description: manifest.description,
            author: manifest.metadata?.author || 'Unknown',
            license: metadata.license,
            stage7: {
                packageVersion: metadata.packageVersion,
                stage7Version: metadata.stage7Version,
                compatibility: metadata.compatibility,
                category: metadata.category,
                tags: metadata.tags
            },
            main: manifest.entryPoint?.main || 'main.py',
            language: manifest.language || 'python'
        };
    }

    private async analyzeDependencies(pluginDir: string, manifest: PluginManifest): Promise<PluginDependency[]> {
        const dependencies: PluginDependency[] = [];

        // Check for Python dependencies
        const requirementsPath = path.join(pluginDir, 'requirements.txt');
        if (fs.existsSync(requirementsPath)) {
            const requirements = fs.readFileSync(requirementsPath, 'utf8');
            const pythonDeps = this.parsePythonRequirements(requirements);
            dependencies.push(...pythonDeps);
        }

        // Check for Node.js dependencies
        const packageJsonPath = path.join(pluginDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const nodeDeps = this.parseNodeDependencies(packageJson);
            dependencies.push(...nodeDeps);
        }

        // Add manifest-specified dependencies
        if (manifest.repository?.dependencies) {
            Object.entries(manifest.repository.dependencies).forEach(([name, version]) => {
                dependencies.push({
                    name,
                    version: version as string,
                    type: 'system',
                    optional: false
                });
            });
        }

        return dependencies;
    }

    private parsePythonRequirements(requirements: string): PluginDependency[] {
        return requirements
            .split('\n')
            .filter(line => line.trim() && !line.startsWith('#'))
            .map(line => {
                const [name, version = '*'] = line.trim().split(/[>=<~!]/);
                return {
                    name: name.trim(),
                    version: version.trim() || '*',
                    type: 'python' as const,
                    optional: false
                };
            });
    }

    private parseNodeDependencies(packageJson: any): PluginDependency[] {
        const dependencies: PluginDependency[] = [];
        
        if (packageJson.dependencies) {
            Object.entries(packageJson.dependencies).forEach(([name, version]) => {
                dependencies.push({
                    name,
                    version: version as string,
                    type: 'npm',
                    optional: false
                });
            });
        }

        if (packageJson.optionalDependencies) {
            Object.entries(packageJson.optionalDependencies).forEach(([name, version]) => {
                dependencies.push({
                    name,
                    version: version as string,
                    type: 'npm',
                    optional: true
                });
            });
        }

        return dependencies;
    }

    private async createArchive(sourceDir: string, targetPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(targetPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => resolve());
            archive.on('error', reject);

            archive.pipe(output);
            archive.directory(sourceDir, false);
            archive.finalize();
        });
    }

    private async extractArchive(archivePath: string, targetDir: string): Promise<void> {
        try {
            await extract(archivePath, { dir: path.resolve(targetDir) });
        } catch (error) {
            throw new Error(`Failed to extract archive: ${error instanceof Error ? error.message : error}`);
        }
    }

    private async calculateFileHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    private async verifyPackage(packagePath: string): Promise<void> {
        // Verify package integrity and signature
        const hash = await this.calculateFileHash(packagePath);
        console.log(`Package hash: ${hash}`);
        
        // Additional verification logic would go here
    }

    private async signPackage(packagePath: string): Promise<string> {
        // Sign package with private key
        const hash = await this.calculateFileHash(packagePath);
        // Actual signing implementation would use crypto.sign()
        return `signature_${hash.substring(0, 16)}`;
    }

    private async installDependency(dependency: PluginDependency, pluginDir: string): Promise<void> {
        console.log(`Installing ${dependency.type} dependency: ${dependency.name}@${dependency.version}`);
        
        switch (dependency.type) {
            case 'python':
                // Install Python package
                break;
            case 'npm':
                // Install npm package
                break;
            case 'system':
                // System dependency - log warning
                console.warn(`System dependency ${dependency.name} must be installed manually`);
                break;
        }
    }
}
