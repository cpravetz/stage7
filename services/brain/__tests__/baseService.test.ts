
import { BaseService } from '../src/services/baseService';

describe('BaseService', () => {
  it('should create a new BaseService with the correct properties', () => {
    const service = new BaseService('TestService', 'test-key', 'http://test.com', ['test-interface']);

    expect(service.serviceName).toBe('TestService');
    expect(service.apiKey).toBe('test-key');
    expect(service.apiUrl).toBe('http://test.com');
    expect(service.interfaces).toEqual(['test-interface']);
  });

  it('should return true for isAvailable when apiKey and apiUrl are provided', () => {
    const service = new BaseService('TestService', 'test-key', 'http://test.com', ['test-interface']);

    expect(service.isAvailable()).toBe(true);
  });

  it('should return false for isAvailable when apiKey is missing', () => {
    const service = new BaseService('TestService', '', 'http://test.com', ['test-interface']);

    expect(service.isAvailable()).toBe(false);
  });

  it('should return false for isAvailable when apiUrl is missing', () => {
    const service = new BaseService('TestService', 'test-key', '', ['test-interface']);

    expect(service.isAvailable()).toBe(false);
  });
});
