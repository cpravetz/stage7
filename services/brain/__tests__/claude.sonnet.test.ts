import ClaudeSonnetModel from '../src/models/claude.sonnet';

describe('ClaudeSonnetModel', () => {
    it('should be an instance of ClaudeSonnetModel', () => {
        expect(ClaudeSonnetModel).toBeDefined();
        expect(ClaudeSonnetModel.name).toBe("anthropic/claude-sonnet-4-20250514");
    });

    // Add more tests here to cover the functionality of ClaudeSonnetModel
});
