import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { PluginDefinition, PluginOutput, PluginParameterType } from '@cktmcs/shared';
import { generateStructuredError, GlobalErrorCodes, ErrorSeverity } from './errorReporter';
import * as crypto from 'crypto';

const execAsync = promisify(execCallback);
const LOCK_TIMEOUT_MS = 180000; // 3 minutes
const LOCK_POLL_INTERVAL_MS = 2000; // 2 seconds

// --- Locking Mechanism ---

async function acquireLock(lockFilePath: string, trace_id: string): Promise<boolean> {
    try {
        // 'wx' flag fails if the path exists, making it an atomic operation
        await fs.promises.writeFile(lockFilePath, String(process.pid), { flag: 'wx' });
        console.log(`[${trace_id}] Lock acquired for ${lockFilePath}`);
        return true;
    } catch (error: any) {
        if (error.code === 'EEXIST') {
            console.log(`[${trace_id}] Lock for ${lockFilePath} is held by another process.`);
            return false;
        }
        throw error; // Re-throw other errors
    }
}

async function releaseLock(lockFilePath: string, trace_id: string): Promise<void> {
    try {
        await fs.promises.unlink(lockFilePath);
        console.log(`[${trace_id}] Lock released for ${lockFilePath}`);
    } catch (error: any) {
        if (error.code !== 'ENOENT') { // Ignore if file doesn't exist
            console.error(`[${trace_id}] Error releasing lock ${lockFilePath}: ${error.message}`);
        }
    }
}

async function waitForLock(lockFilePath: string, trace_id: string): Promise<void> {
    const startTime = Date.now();
    console.log(`[${trace_id}] Waiting for lock on ${lockFilePath}...`);

    while (Date.now() - startTime < LOCK_TIMEOUT_MS) {
        if (!fs.existsSync(lockFilePath)) {
            console.log(`[${trace_id}] Lock for ${lockFilePath} released.`);
            return;
        }
        await new Promise(resolve => setTimeout(resolve, LOCK_POLL_INTERVAL_MS));
    }

    throw new Error(`Timed out waiting for lock on ${lockFilePath} after ${LOCK_TIMEOUT_MS / 1000} seconds.`);
}

async function hashDirectory(directoryPath: string): Promise<string> {
    const hash = crypto.createHash('md5');
    const files = await fs.promises.readdir(directoryPath);
    files.sort(); // for consistent order
    for (const file of files) {
        const filePath = path.join(directoryPath, file);
        const stat = await fs.promises.stat(filePath);
        if (stat.isDirectory()) {
            hash.update(await hashDirectory(filePath));
        } else {
            hash.update(await fs.promises.readFile(filePath));
        }
    }
    return hash.digest('hex');
}

export async function calculatePythonDependenciesHash(pluginRootPath: string): Promise<string> {
    const requirementsPath = path.join(pluginRootPath, 'requirements.txt');
    const sharedPackagePath = path.resolve(__dirname, '../../../../shared/python');

    const requirementsHash = fs.existsSync(requirementsPath)
        ? crypto.createHash('md5').update(fs.readFileSync(requirementsPath, 'utf8')).digest('hex')
        : '';

    const sharedCodeHash = fs.existsSync(sharedPackagePath)
        ? await hashDirectory(sharedPackagePath)
        : '';
    
    return crypto.createHash('md5').update(requirementsHash + sharedCodeHash).digest('hex');
}

export async function ensurePythonDependencies(pluginRootPath: string, trace_id: string): Promise<void> {
    const source_component = "pythonPluginHelper.ensurePythonDependencies";
    const lockFilePath = path.join(pluginRootPath, '.venv.lock');

    if (!await acquireLock(lockFilePath, trace_id)) {
        await waitForLock(lockFilePath, trace_id);
        console.log(`[${trace_id}] Lock acquired by other process. Re-verifying dependencies.`);
    }

    try {
        const requirementsPath = path.join(pluginRootPath, 'requirements.txt');
        const markerPath = path.join(pluginRootPath, '.dependencies_installed');
        const venvPath = path.join(pluginRootPath, 'venv');
        const isWindows = process.platform === 'win32';
        const venvBinDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
        const venvPythonPath = path.join(venvBinDir, isWindows ? 'python.exe' : 'python');
        const venvPipPath = path.join(venvBinDir, isWindows ? 'pip.exe' : 'pip');

        const venvHealthy = (): boolean => fs.existsSync(venvPythonPath);

        const deleteVenvWithRetries = async (maxRetries: number, delayMs: number): Promise<void> => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    if (fs.existsSync(venvPath)) {
                        fs.rmSync(venvPath, { recursive: true, force: true });
                        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure OS releases handles
                        console.log(`[${trace_id}] ${source_component}: Successfully deleted venv directory on attempt ${attempt}`);
                        return;
                    }
                    return;
                } catch (err: any) {
                    console.warn(`[${trace_id}] ${source_component}: Failed to delete venv directory on attempt ${attempt}: ${err.message}`);
                    if (attempt >= maxRetries) throw err;
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        };

        const checkPythonExecutable = async (): Promise<string> => {
            const cmds = ['python3', 'python'];
            for (const cmd of cmds) {
                try {
                    await execAsync(`${cmd} --version`);
                    console.log(`[${trace_id}] ${source_component}: Found python executable: ${cmd}`);
                    return cmd;
                } catch (e) { /* continue */ }
            }
            throw new Error('No python3 or python executable found in PATH');
        };

        const checkVenvFunctionality = async (): Promise<boolean> => {
            try {
                await execAsync(`"${venvPythonPath}" -c "import requests"`, { cwd: pluginRootPath, timeout: 10000 });
                console.log(`[${trace_id}] ${source_component}: Existing venv is functional.`);
                return true;
            } catch (e: any) {
                console.warn(`[${trace_id}] ${source_component}: Existing venv is not functional: ${e.message}`);
                return false;
            }
        };

        const sharedPackagePath = path.resolve(__dirname, '../../../../shared/python');

        const combinedHash = await calculatePythonDependenciesHash(pluginRootPath);
        


        const pythonCmd = await checkPythonExecutable();
        let shouldRecreateVenv = false;

        if (!fs.existsSync(venvPath) || !venvHealthy()) {
            console.log(`[${trace_id}] ${source_component}: Venv missing or broken. Recreating.`);
            await deleteVenvWithRetries(5, 1000);
            shouldRecreateVenv = true;
        } else {
            if (!fs.existsSync(markerPath) || fs.readFileSync(markerPath, 'utf8') !== combinedHash) {
                console.log(`[${trace_id}] ${source_component}: Dependencies changed or marker missing. Verifying existing venv functionality.`);
                if (await checkVenvFunctionality()) {
                    console.log(`[${trace_id}] ${source_component}: Existing venv is functional despite outdated marker. Updating marker.`);
                    fs.writeFileSync(markerPath, combinedHash); // Update marker without recreating venv
                    shouldRecreateVenv = false;
                } else {
                    console.log(`[${trace_id}] ${source_component}: Existing venv is not functional. Recreating.`);
                    await deleteVenvWithRetries(5, 1000);
                    shouldRecreateVenv = true;
                }
            } else {
                console.log(`[${trace_id}] ${source_component}: Existing venv is healthy and up to date.`);
            }
        }

        if (shouldRecreateVenv) {
            console.log(`[${trace_id}] ${source_component}: Creating virtual environment at ${venvPath}.`);
            await execAsync(`${pythonCmd} -m venv "${venvPath}"`, { cwd: pluginRootPath, timeout: 60000 });

            const pipUpgradeCmd = `"${venvPythonPath}" -m pip install --upgrade pip`;
            await execAsync(pipUpgradeCmd, { cwd: pluginRootPath, timeout: 60000 });

            console.log(`[${trace_id}] ${source_component}: Installing shared ckt_plan_validator package.`);
            const installSharedCmd = `"${venvPipPath}" install "${sharedPackagePath}"`;
            await execAsync(installSharedCmd, { cwd: pluginRootPath, timeout: 60000 });

            // Install the shared Python library containing token_provider and plan_validator
            const sharedLibPath = path.resolve(__dirname, '../../../../shared/python/lib');
            if (fs.existsSync(sharedLibPath)) {
                console.log(`[${trace_id}] ${source_component}: Installing shared Python library with token_provider.`);
                const installSharedLibCmd = `"${venvPipPath}" install -e "${sharedLibPath}"`;
                await execAsync(installSharedLibCmd, { cwd: pluginRootPath, timeout: 60000 });
            }

            if (fs.existsSync(requirementsPath)) {
                console.log(`[${trace_id}] ${source_component}: Installing requirements from requirements.txt.`);
                const installReqsCmd = `"${venvPipPath}" install -r "${requirementsPath}"`;
                await execAsync(installReqsCmd, { cwd: pluginRootPath, timeout: 120000 });
            }

            fs.writeFileSync(markerPath, combinedHash);
            console.log(`[${trace_id}] ${source_component}: Dependencies installed and marker file created.`);

            // Verify 'requests' is importable
            try {
                await execAsync(`"${venvPythonPath}" -c "import requests"`, { cwd: pluginRootPath, timeout: 10000 });
                console.log(`[${trace_id}] ${source_component}: 'requests' module successfully imported.`);
            } catch (reqError: any) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_DEPENDENCY_FAILED,
                    severity: ErrorSeverity.CRITICAL,
                    message: `'requests' module failed to import after installation for ${pluginRootPath}: ${reqError.message}`,
                    source_component, original_error: reqError, trace_id_param: trace_id,
                    contextual_info: { pluginRootPath, stderr: reqError.stderr }
                });
            }
        }

    } catch (error: any) {
        throw generateStructuredError({
            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_DEPENDENCY_FAILED,
            severity: ErrorSeverity.CRITICAL,
            message: `Failed to install Python dependencies for ${pluginRootPath}: ${error.message}`,
            source_component, original_error: error, trace_id_param: trace_id,
            contextual_info: { pluginRootPath, stderr: error.stderr }
        });
    } finally {
        await releaseLock(lockFilePath, trace_id);
    }
}

export function validatePythonOutput(stdout: string, pluginDefinition: PluginDefinition, trace_id: string): PluginOutput[] {
    const source_component = "pythonPluginHelper.validatePythonOutput";
    try {
        const result = JSON.parse(stdout);

        if (!Array.isArray(result)) {
            throw new Error("Plugin output must be an array of PluginOutput objects");
        }

        for (const output of result) {
            if (typeof output !== 'object' || output === null) {
                throw new Error("Each output must be an object");
            }
        }

        // Validate presence of required fields except 'result' which may be omitted for error outputs.
        // We'll normalize missing 'result' below based on the resultType.
        for (const output of result) {
            const requiredFields = ['success', 'name', 'resultType', 'resultDescription'];
            for (const field of requiredFields) {
                if (!(field in output)) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }
        }

        // The 'result' field is expected for successful/non-error outputs.
        // Some plugins may return an error object that omits 'result' entirely.
        // Normalize such cases by ensuring 'result' exists and is null when resultType indicates an error.
        for (const output of result) {
            if (!('result' in output)) {
                const lowerType = String(output.resultType).toLowerCase();
                if (lowerType === 'error' || output.resultType === PluginParameterType.ERROR) {
                    // normalize missing result on error outputs
                    (output as any).result = null;
                } else {
                    // For non-error outputs, missing 'result' is a validation failure
                    throw new Error(`Missing required field: result`);
                }
            }
        }

        return result;
    } catch (error: any) {
        console.error(`[${trace_id}] ${source_component}: Invalid Python plugin output for ${pluginDefinition.verb} v${pluginDefinition.version}: JSON parsing failed. Error: ${error.message}`);
        return [{
            success: false,
            name: 'validation_error',
            resultType: PluginParameterType.ERROR,
            result: null,
            resultDescription: `Invalid plugin output format: ${error.message}. Raw output: ${stdout.substring(0, 200)}...`,
            error: error.message
        }];
    }
}
