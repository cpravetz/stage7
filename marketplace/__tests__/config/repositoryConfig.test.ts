import { repositoryConfig } from '../src/config/repositoryConfig';

describe('repositoryConfig', () => {
    let originalEnv: NodeJS.ProcessEnv;
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.resetModules(); // Clear module cache before each test
        originalEnv = process.env; // Store original process.env
        process.env = { ...originalEnv }; // Create a writable copy

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        process.env = originalEnv; // Restore original process.env
        consoleLogSpy.mockRestore();
    });

    it('should include local, mongo, and librarian-definition repositories by default', () => {
        // Ensure GitHub related env vars are not set
        delete process.env.ENABLE_GITHUB;
        delete process.env.GITHUB_TOKEN;
        delete process.env.GITHUB_USERNAME;

        const { repositoryConfig } = require('../src/config/repositoryConfig');

        expect(repositoryConfig.Repositories.length).toBe(3);
        expect(repositoryConfig.Repositories.some(r => r.type === 'local')).toBe(true);
        expect(repositoryConfig.Repositories.some(r => r.type === 'mongo')).toBe(true);
        expect(repositoryConfig.Repositories.some(r => r.type === 'librarian-definition')).toBe(true);
        expect(repositoryConfig.Repositories.some(r => r.type === 'git')).toBe(false);
        expect(repositoryConfig.Repositories.some(r => r.type === 'github')).toBe(false);
        expect(consoleLogSpy).toHaveBeenCalledWith('GitHub repositories disabled - missing ENABLE_GITHUB=true, GITHUB_TOKEN, or GITHUB_USERNAME');
    });

    it('should include git and github repositories when GitHub is enabled and configured', () => {
        process.env.ENABLE_GITHUB = 'true';
        process.env.GITHUB_TOKEN = 'mock_token';
        process.env.GITHUB_USERNAME = 'mock_user';
        process.env.GIT_REPOSITORY_URL = 'https://github.com/mock/repo.git';
        process.env.GIT_DEFAULT_BRANCH = 'dev';

        const { repositoryConfig } = require('../src/config/repositoryConfig');

        expect(repositoryConfig.Repositories.length).toBe(5);
        expect(repositoryConfig.Repositories.some(r => r.type === 'git')).toBe(true);
        expect(repositoryConfig.Repositories.some(r => r.type === 'github')).toBe(true);

        const gitRepo = repositoryConfig.Repositories.find(r => r.type === 'git');
        expect(gitRepo).toEqual({
            type: 'git',
            url: 'https://github.com/mock/repo.git',
            credentials: {
                username: 'mock_user',
                token: 'mock_token',
                email: '',
            },
            options: {
                defaultBranch: 'dev',
            },
        });

        const githubRepo = repositoryConfig.Repositories.find(r => r.type === 'github');
        expect(githubRepo).toEqual({
            type: 'github',
            url: 'https://github.com/mock/repo.git',
            credentials: {
                username: 'mock_user',
                token: 'mock_token',
                email: '',
            },
            options: {
                defaultBranch: 'dev',
            },
        });
        expect(consoleLogSpy).toHaveBeenCalledWith('GitHub repositories enabled in configuration');
    });

    it('should use defaultRepository from process.env if set', () => {
        process.env.DEFAULT_PLUGIN_REPOSITORY = 'mongo';
        const { repositoryConfig } = require('../src/config/repositoryConfig');
        expect(repositoryConfig.defaultRepository).toBe('mongo');
    });

    it('should default defaultRepository to local if not set in process.env', () => {
        delete process.env.DEFAULT_PLUGIN_REPOSITORY;
        const { repositoryConfig } = require('../src/config/repositoryConfig');
        expect(repositoryConfig.defaultRepository).toBe('local');
    });

    it('should use LOCAL_PLUGIN_PATH from process.env for local repository', () => {
        process.env.LOCAL_PLUGIN_PATH = '/custom/local/path';
        const { repositoryConfig } = require('../src/config/repositoryConfig');
        const localRepo = repositoryConfig.Repositories.find(r => r.type === 'local');
        expect(localRepo?.options?.localPath).toBe('/custom/local/path');
    });

    it('should use LIBRARIAN_URL from process.env for mongo and librarian-definition repositories', () => {
        process.env.LIBRARIAN_URL = 'http://custom-librarian:1234';
        const { repositoryConfig } = require('../src/config/repositoryConfig');

        const mongoRepo = repositoryConfig.Repositories.find(r => r.type === 'mongo');
        expect(mongoRepo?.url).toBe('http://custom-librarian:1234');

        const librarianDefRepo = repositoryConfig.Repositories.find(r => r.type === 'librarian-definition');
        expect(librarianDefRepo?.librarianUrl).toBe('http://custom-librarian:1234');
    });

    it('should use MONGO_COLLECTION from process.env for mongo repository', () => {
        process.env.MONGO_COLLECTION = 'my-plugins';
        const { repositoryConfig } = require('../src/config/repositoryConfig');
        const mongoRepo = repositoryConfig.Repositories.find(r => r.type === 'mongo');
        expect(mongoRepo?.options?.collection).toBe('my-plugins');
    });
});
