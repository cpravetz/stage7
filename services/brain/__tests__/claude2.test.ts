import Claude2Model from '../src/models/claude2';

describe('Claude2Model', () => {
    it('should be an instance of Claude2Model', () => {
        expect(Claude2Model).toBeDefined();
        expect(Claude2Model.name).toBe("anthropic/claude-2");
    });

    // Add more tests here to cover the functionality of Claude2Model
});
