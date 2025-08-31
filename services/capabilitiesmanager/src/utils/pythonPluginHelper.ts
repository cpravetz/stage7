import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { PluginDefinition, PluginOutput, PluginParameterType } from '@cktmcs/shared';
import { generateStructuredError, GlobalErrorCodes, ErrorSeverity } from './errorReporter';

const execAsync = promisify(execCallback);

export async function ensurePythonDependencies(pluginRootPath: string, trace_id: string): Promise<void> {
    const source_component = "pythonPluginHelper.ensurePythonDependencies";
    const requirementsPath = path.join(pluginRootPath, 'requirements.txt');
    const markerPath = path.join(pluginRootPath, '.dependencies_installed');

    const venvPath = path.join(pluginRootPath, 'venv');
    const isWindows = process.platform === 'win32';
    const venvBinDir = isWindows ? path.join(venvPath, 'Scripts') : path.join(venvPath, 'bin');
    const venvPythonPath = path.join(venvBinDir, isWindows ? 'python.exe' : 'python');
    const venvPipPath = path.join(venvBinDir, isWindows ? 'pip.exe' : 'pip');

    function venvHealthy() {
        return fs.existsSync(venvPythonPath);
    }

    function sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function deleteVenvWithRetries(pathToDelete: string, maxRetries: number, delayMs: number): Promise<void> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (fs.existsSync(pathToDelete)) {
                    fs.rmSync(pathToDelete, { recursive: true, force: true });
                    console.log(`[${trace_id}] ${source_component}: Successfully deleted venv directory on attempt ${attempt}`);
                    return;
                } else {
                    console.log(`[${trace_id}] ${source_component}: venv directory does not exist, no need to delete`);
                    return;
                }
            } catch (err: any) {
                console.warn(`[${trace_id}] ${source_component}: Failed to delete venv directory on attempt ${attempt}: ${err.message}`);
                if (attempt < maxRetries) {
                    await sleep(delayMs);
                } else {
                    throw err;
                }
            }
        }
    }

    if (fs.existsSync(venvPath) && !venvHealthy()) {
        console.warn(`[${trace_id}] ${source_component}: Existing venv at ${venvPath} is broken. Deleting and recreating.`);
        try {
            await deleteVenvWithRetries(venvPath, 5, 1000);
        } catch (deleteError: any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_DEPENDENCY_FAILED,
                severity: ErrorSeverity.CRITICAL,
                message: `Failed to delete broken venv directory after multiple attempts: ${deleteError.message}`,
                source_component,
                original_error: deleteError,
                trace_id_param: trace_id,
                contextual_info: { pluginRootPath }
            });
        }
    }

    async function checkPythonExecutable(): Promise<string> {
        const exec = require('child_process').exec;
        const checkCmds = ['python3 --version', 'python --version'];
        for (const cmd of checkCmds) {
            try {
                await new Promise<void>((resolve, reject) => {
                    exec(cmd, (error: any, stdout: string, stderr: string) => {
                        if (!error) {
                            console.log(`[${trace_id}] ${source_component}: Found python executable with command: ${cmd}`);
                            resolve();
                        } else {
                            reject(error);
                        }
                    });
                });
                return cmd.split(' ')[0];
            } catch {
                continue;
            }
        }
        throw new Error('No python3 or python executable found in PATH');
    }

    let requirementsHash: string | null = null;
    try {
        const pythonCmd = await checkPythonExecutable();

        if (fs.existsSync(venvPath)) { // Check if venv directory exists
        console.warn(`[${trace_id}] ${source_component}: Existing venv at ${venvPath} found. Deleting before recreation.`);
        try {
            await deleteVenvWithRetries(venvPath, 5, 1000); // Delete it
        } catch (deleteError: any) {
            throw generateStructuredError({
                error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_DEPENDENCY_FAILED,
                severity: ErrorSeverity.CRITICAL,
                message: `Failed to delete existing venv directory before recreation: ${deleteError.message}`,
                source_component,
                original_error: deleteError,
                trace_id_param: trace_id,
                contextual_info: { pluginRootPath }
            });
        }
    }

    // Original venv creation logic, now guaranteed to operate on a non-existent directory
    console.log(`[${trace_id}] ${source_component}: Creating virtual environment at ${venvPath}.`);
    const createVenvCmd = `${pythonCmd} -m venv "${venvPath}"`;
    await execAsync(createVenvCmd, { cwd: pluginRootPath, timeout: 60000 });

        if (fs.existsSync(venvPipPath)) {
            const upgradePipCmd = `"${venvPipPath}" install --upgrade pip`;
            await execAsync(upgradePipCmd, { cwd: pluginRootPath, timeout: 60000 });
        } else {
            console.log(`[${trace_id}] ${source_component}: pip not found, attempting to bootstrap with ensurepip`);
            try {
                const bootstrapPipCmd = `"${venvPythonPath}" -m ensurepip --upgrade`;
                await execAsync(bootstrapPipCmd, { cwd: pluginRootPath, timeout: 60000 });
                if (fs.existsSync(venvPipPath)) {
                    const upgradePipCmd = `"${venvPipPath}" install --upgrade pip`;
                    await execAsync(upgradePipCmd, { cwd: pluginRootPath, timeout: 60000 });
                }
            } catch (ensurepipError: any) {
                console.warn(`[${trace_id}] ${source_component}: Failed to bootstrap pip with ensurepip: ${ensurepipError.message}`);
                console.log(`[${trace_id}] ${source_component}: Trying to install pip with get-pip.py`);
                try {
                    const getPipCmd = `curl https://bootstrap.pypa.io/get-pip.py | ${venvPythonPath}`;
                    await execAsync(getPipCmd, { cwd: pluginRootPath, timeout: 60000 });
                } catch (getPipError: any) {
                    throw new Error(`Failed to install pip with get-pip.py: ${getPipError.message}`);
                }
            }
        }

        if (fs.existsSync(requirementsPath)) {
            const requirementsContent = fs.readFileSync(requirementsPath, 'utf8');
            requirementsHash = require('crypto').createHash('md5').update(requirementsContent).digest('hex');

            let installReqsCmd: string;
            if (fs.existsSync(venvPipPath)) {
                installReqsCmd = `"${venvPipPath}" install -r "${requirementsPath}"`;
            } else {
                installReqsCmd = `"${venvPythonPath}" -m pip install -r "${requirementsPath}"`;
            }
            const { stdout, stderr } = await execAsync(installReqsCmd, { cwd: pluginRootPath, timeout: 120000 });

            if (stderr && !stderr.includes('Successfully installed') && !stderr.includes('Requirement already satisfied')) {
                console.warn(`[${trace_id}] ${source_component}: Python dependency installation stderr: ${stderr}`);
            }

            if (requirementsHash !== null) {
                fs.writeFileSync(markerPath, requirementsHash);
            }
        }
    } catch (error: any) {
        const errorMessage = error.message || '';
        const errorStderr = error.stderr || '';

        if (errorMessage.includes('ENOTEMPTY') || errorStderr.includes('ENOTEMPTY')) {
            console.warn(`[${trace_id}] ${source_component}: Dependency installation failed with ENOTEMPTY. Attempting to repair.`);
            try {
                await deleteVenvWithRetries(venvPath, 5, 1000);
                // Retry the whole process
                await ensurePythonDependencies(pluginRootPath, trace_id);
                return;
            } catch (retryError: any) {
                throw generateStructuredError({
                    error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_DEPENDENCY_FAILED,
                    severity: ErrorSeverity.CRITICAL,
                    message: `Failed to install Python dependencies for ${pluginRootPath} even after retry: ${retryError.message}`,
                    source_component, original_error: retryError, trace_id_param: trace_id,
                    contextual_info: { pluginRootPath, initial_error: error.message, retry_stderr: retryError.stderr }
                });
            }
        }

        throw generateStructuredError({
            error_code: GlobalErrorCodes.CAPABILITIES_MANAGER_PLUGIN_DEPENDENCY_FAILED,
            severity: ErrorSeverity.CRITICAL,
            message: `Failed to install Python dependencies for ${pluginRootPath}: ${error.message}`,
            source_component, original_error: error, trace_id_param: trace_id,
            contextual_info: { pluginRootPath, stderr: error.stderr }
        });
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
            const requiredFields = ['success', 'name', 'resultType', 'result', 'resultDescription'];
            for (const field of requiredFields) {
                if (!(field in output)) {
                    throw new Error(`Missing required field: ${field}`);
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
