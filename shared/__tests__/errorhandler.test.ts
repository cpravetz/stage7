import { analyzeError } from '../src/errorhandler';

describe('errorhandler', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('should log basic error properties', () => {
        const error = new Error('Test message');
        error.name = 'TestError';
        error.stack = 'Test stack trace';

        analyzeError(error);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Error details:');
        expect(consoleErrorSpy).toHaveBeenCalledWith('- Message: Test message');
        expect(consoleErrorSpy).toHaveBeenCalledWith('- Name: TestError');
        expect(consoleErrorSpy).toHaveBeenCalledWith('- Stack trace: Test stack trace');
    });

    it('should log additional properties if present', () => {
        const error: any = new Error('Extended error');
        error.code = 'ERR_CODE';
        error.statusCode = 404;
        error.response = {
            data: { detail: 'Not found' },
            status: 404,
        };

        analyzeError(error);

        expect(consoleErrorSpy).toHaveBeenCalledWith('- Error code: ERR_CODE');
        expect(consoleErrorSpy).toHaveBeenCalledWith('- Status code: 404');
        expect(consoleErrorSpy).toHaveBeenCalledWith('- Response data:', { detail: 'Not found' });
        expect(consoleErrorSpy).toHaveBeenCalledWith('- Response status: 404');
    });

    it('should not log stack trace if not present', () => {
        const error = new Error('No stack');
        delete error.stack;

        analyzeError(error);

        expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('- Stack trace:'));
    });

    it('should handle non-Error objects gracefully', () => {
        const nonErrorObject = { message: 'Just an object', customProp: 123 };
        analyzeError(nonErrorObject as any);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Error details:');
        expect(consoleErrorSpy).toHaveBeenCalledWith('- Message: Just an object');
        expect(consoleErrorSpy).toHaveBeenCalledWith('- Name: Error'); // Default name for non-Error objects
        expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('- Stack trace:'));
        expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('- Error code:'));
    });
});
