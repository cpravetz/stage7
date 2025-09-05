import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../src/middleware/errorHandler';

describe('errorHandler middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        mockReq = {};
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        mockNext = jest.fn();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should log the error stack and send a 500 response', () => {
        const mockError = new Error('Test error message');
        mockError.stack = 'Test stack trace';

        errorHandler(mockError, mockReq as Request, mockRes as Response, mockNext);

        expect(consoleErrorSpy).toHaveBeenCalledWith(mockError.stack);
        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({ message: 'An unexpected error occurred' });
        expect(mockNext).not.toHaveBeenCalled(); // Error handlers typically don't call next
    });

    it('should handle errors without a stack property', () => {
        const mockError = new Error('Another test error');
        delete mockError.stack; // Simulate error without stack

        errorHandler(mockError, mockReq as Request, mockRes as Response, mockNext);

        expect(consoleErrorSpy).toHaveBeenCalledWith(undefined); // console.error will receive undefined
        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({ message: 'An unexpected error occurred' });
    });

    it('should handle non-Error objects as errors', () => {
        const nonErrorObject = { someProp: 'value' };
        errorHandler(nonErrorObject as any, mockReq as Request, mockRes as Response, mockNext);

        expect(consoleErrorSpy).toHaveBeenCalledWith(undefined); // stack will be undefined for plain object
        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({ message: 'An unexpected error occurred' });
    });
});
