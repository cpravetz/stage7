import express from 'express';
import { PluginMarketplace } from '@cktmcs/marketplace';
import { analyzeError } from '@cktmcs/errorhandler';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const pluginMarketplace = new PluginMarketplace();

// Get GitHub configuration
router.get('/config', (req, res) => {
    try {
        // Check if GitHub access is enabled
        const enableGithub = process.env.ENABLE_GITHUB === 'true';

        const config = {
            enabled: enableGithub,
            username: process.env.GITHUB_USERNAME || '',
            repository: process.env.GIT_REPOSITORY_URL || '',
            configured: enableGithub && !!(process.env.GITHUB_TOKEN && process.env.GITHUB_USERNAME && process.env.GIT_REPOSITORY_URL),
            // Don't send the actual token for security reasons
            token: process.env.GITHUB_TOKEN ? true : false
        };

        res.json(config);
    } catch (error) {
        analyzeError(error as Error);
        res.status(500).json({ error: 'Failed to get GitHub configuration' });
    }
});

// Update GitHub configuration
router.post('/config', (req, res) => {
    try {
        // Check if GitHub access is enabled
        if (process.env.ENABLE_GITHUB !== 'true') {
            return res.status(403).json({
                error: 'GitHub access is disabled by configuration. Set ENABLE_GITHUB=true to enable.'
            });
        }

        const { token, username, repository } = req.body;

        if (!token || !username || !repository) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // In a production environment, you would store these securely
        // For this implementation, we'll just update the environment variables
        process.env.GITHUB_TOKEN = token;
        process.env.GITHUB_USERNAME = username;
        process.env.GIT_REPOSITORY_URL = repository;

        // Reinitialize the plugin marketplace to use the new configuration
        // This is a simplified approach - in production, you might want to restart the service
        // or use a more robust configuration management system

        res.json({ success: true, message: 'GitHub configuration updated successfully' });
    } catch (error) {
        analyzeError(error as Error);
        res.status(500).json({ error: 'Failed to update GitHub configuration' });
    }
});

// List plugins from GitHub
router.get('/plugins', async (req, res) => {
    try {
        // Check if GitHub access is enabled
        if (process.env.ENABLE_GITHUB !== 'true') {
            return res.status(403).json({
                error: 'GitHub access is disabled by configuration. Set ENABLE_GITHUB=true to enable.'
            });
        }

        const repositories = pluginMarketplace.getRepositories();
        const githubRepo = repositories.get('github');

        if (!githubRepo) {
            res.status(404).json({ error: 'GitHub repository not configured' });
        } else {
            const plugins = await githubRepo.list();
            res.json({ plugins });
        }
    } catch (error) {
        analyzeError(error as Error);
        res.status(500).json({ error: 'Failed to list plugins from GitHub' });
    }
});

// Get a specific plugin from GitHub
router.get('/plugins/:id', async (req, res) => {
    try {
        // Check if GitHub access is enabled
        if (process.env.ENABLE_GITHUB !== 'true') {
            return res.status(403).json({
                error: 'GitHub access is disabled by configuration. Set ENABLE_GITHUB=true to enable.'
            });
        }

        const { id } = req.params;
        const repositories = pluginMarketplace.getRepositories();
        const githubRepo = repositories.get('github');

        if (!githubRepo) {
            res.status(404).json({ error: 'GitHub repository not configured' });
        } else {
            const plugin = await githubRepo.fetch(id);
            if (!plugin) {
                res.status(404).json({ error: 'Plugin not found' });
            }
            res.json({ plugin });

        }

    } catch (error) {
        analyzeError(error as Error);
        res.status(500).json({ error: 'Failed to get plugin from GitHub' });
    }
});

// Delete a plugin from GitHub
router.delete('/plugins/:id', async (req, res) => {
    try {
        // Check if GitHub access is enabled
        if (process.env.ENABLE_GITHUB !== 'true') {
            return res.status(403).json({
                error: 'GitHub access is disabled by configuration. Set ENABLE_GITHUB=true to enable.'
            });
        }

        const { id } = req.params;
        const repositories = pluginMarketplace.getRepositories();
        const githubRepo = repositories.get('github');

        if (!githubRepo) {
            return res.status(404).json({ error: 'GitHub repository not configured' });
        } else {
            await githubRepo.delete(id);
            return res.json({ success: true, message: 'Plugin deleted successfully' });
        }
    } catch (error) {
        analyzeError(error as Error);
        res.status(500).json({ error: 'Failed to delete plugin from GitHub' });
    }
});

export default router;
