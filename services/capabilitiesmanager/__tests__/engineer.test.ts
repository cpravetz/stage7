import { requestPluginFromEngineer } from '../src/utils/engineer';
import { PluginOutput, PluginParameterType, Step, BaseEntity } from '@cktmcs/shared';

describe('requestPluginFromEngineer', () => {
    let mockEntity: BaseEntity;
    let mockAuthenticatedApiPost: jest.Mock;
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    const mockStep: Step = {
        actionVerb: 'CREATE_FEATURE',
        inputValues: new Map([['featureName', { inputName: 'featureName', value: 'new-feature', valueType: PluginParameterType.STRING, args: {} }]]),
    } as any;
    const mockAccomplishGuidance = 'Create a new feature for the user';

    beforeEach(() => {
        jest.clearAllMocks();

        mockAuthenticatedApiPost = jest.fn();
        mockEntity = {
            getServiceUrls: jest.fn().mockResolvedValue({ engineerUrl: 'mock-engineer:5080' }),
            authenticatedApi: { post: mockAuthenticatedApiPost },
        } as any;

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('should successfully request plugin creation from Engineer', async () => {
        const mockEngineerResponse = {
            data: {
                success: true,
                plugin: { id: 'new-plugin', verb: 'CREATE_FEATURE' },
            },
        };
        mockAuthenticatedApiPost.mockResolvedValueOnce(mockEngineerResponse);

        const result = await requestPluginFromEngineer(mockEntity, mockStep, mockAccomplishGuidance);

        expect(mockEntity.getServiceUrls).toHaveBeenCalledTimes(1);
        expect(mockAuthenticatedApiPost).toHaveBeenCalledWith(
            'http://mock-engineer:5080/createPlugin',
            {
                verb: mockStep.actionVerb,
                context: mockStep.inputValues,
                accomplishGuidance: mockAccomplishGuidance,
            }
        );
        expect(result).toEqual({
            success: true,
            name: 'plugin_created',
            resultType: PluginParameterType.PLUGIN,
            result: mockEngineerResponse.data.plugin,
            resultDescription: 'Created new plugin for CREATE_FEATURE',
        });
        expect(consoleLogSpy).toHaveBeenCalledWith('Engineer created new plugin:', mockEngineerResponse.data.plugin);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return error PluginOutput if Engineer response indicates failure', async () => {
        const mockEngineerResponse = {
            data: {
                success: false,
                error: 'Engineer failed to create plugin',
            },
        };
        mockAuthenticatedApiPost.mockResolvedValueOnce(mockEngineerResponse);

        const result = await requestPluginFromEngineer(mockEntity, mockStep, mockAccomplishGuidance);

        expect(result).toEqual({
            success: false,
            name: 'error',
            resultType: PluginParameterType.ERROR,
            error: 'Engineer failed to create plugin',
            resultDescription: 'Failed to create plugin',
            result: null,
        });
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create plugin:', mockEngineerResponse.data.error);
        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should return error PluginOutput if API call fails', async () => {
        const networkError = new Error('Network down');
        mockAuthenticatedApiPost.mockRejectedValueOnce(networkError);

        const result = await requestPluginFromEngineer(mockEntity, mockStep, mockAccomplishGuidance);

        expect(result).toEqual({
            success: false,
            name: 'error',
            resultType: PluginParameterType.ERROR,
            error: networkError.message,
            resultDescription: 'Failed to create plugin',
            result: null,
        });
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create plugin:', networkError.message);
        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should handle non-Error objects thrown during API call', async () => {
        const unknownError = 'Unknown API error string';
        mockAuthenticatedApiPost.mockRejectedValueOnce(unknownError);

        const result = await requestPluginFromEngineer(mockEntity, mockStep, mockAccomplishGuidance);

        expect(result).toEqual({
            success: false,
            name: 'error',
            resultType: PluginParameterType.ERROR,
            error: 'Failed to create plugin',
            resultDescription: 'Failed to create plugin',
            result: null,
        });
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create plugin:', unknownError);
        expect(consoleLogSpy).not.toHaveBeenCalled();
    });
});
