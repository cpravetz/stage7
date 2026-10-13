import express from 'express';
import request from 'supertest';
import brainRouter from '../routes/brain';
import { brainInstance } from '../utils/sharedInstance';
import * as sharedInstance from '../utils/sharedInstance';

const app = express();
app.use(express.json());
app.use('/api/brain', brainRouter);

describe('Brain completion route model selection', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ignores model and provider fields and delegates selection to Brain', async () => {
    jest.spyOn(sharedInstance, 'getBrainInstance').mockResolvedValue(brainInstance);
    const complete = jest.spyOn(brainInstance, 'complete').mockResolvedValue({
      content: 'Brain selected a suitable model.',
      model: 'selected-by-brain',
      provider: 'healthy-provider',
      cached: false,
    });

    const response = await request(app)
      .post('/api/brain/complete')
      .send({
        prompt: 'Analyze the market.',
        model: 'caller-model',
        provider: 'caller-provider',
        options: {
          model: 'nested-caller-model',
          provider: 'nested-caller-provider',
          maxTokens: 512,
          temperature: 0.2,
          optimizeFor: 'accuracy',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.model).toBe('selected-by-brain');
    expect(complete).toHaveBeenCalledTimes(1);
    const completionOptions = complete.mock.calls[0]?.[1];
    expect(completionOptions).toMatchObject({
      maxTokens: 512,
      temperature: 0.2,
      optimizeFor: 'accuracy',
    });
    expect(completionOptions).not.toHaveProperty('model');
    expect(completionOptions).not.toHaveProperty('provider');
  });
});
