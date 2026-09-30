import express, { Application } from 'express';
import request from 'supertest';
import toolsRouter from '../routes/tools';
import fs from 'fs';
import path from 'path';

describe('Inter-skill reference data handoff', () => {
  const app: Application = express();
  app.use(express.json());
  app.use('/', toolsRouter);

  const careerHome = process.env.CAREER_HOME || '/tmp/career';
  const listingsPath = path.join(careerHome, 'listings', 'default.json');

  beforeEach(() => {
    fs.mkdirSync(path.dirname(listingsPath), { recursive: true });
    fs.writeFileSync(
      listingsPath,
      JSON.stringify({
        listings: [
          {
            id: 'job_123',
            title: 'Senior Software Engineer',
            company: 'Acme Corp',
            location: 'Remote',
            applyUrl: 'https://example.com/apply/123',
          },
          {
            id: 'job_456',
            title: 'Principal Product Manager',
            company: 'TechCorp',
            location: 'New York, NY',
            applyUrl: 'https://example.com/apply/456',
          },
        ],
        total: 2,
        generatedAt: new Date().toISOString(),
      }),
      'utf-8'
    );
  });

  afterEach(() => {
    try {
      if (fs.existsSync(listingsPath)) {
        fs.unlinkSync(listingsPath);
      }
    } catch {}
  });

  it('serves job search reference data from the listings store via GET /tools/reference-data/:sourceId', async () => {
    const response = await request(app)
      .get('/tools/reference-data/career-job-discovery-fit-ranking')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toBeDefined();
    expect(Array.isArray(response.body.data.listings)).toBe(true);
    expect(response.body.data.listings.length).toBe(2);
    expect(response.body.data.listings[0]).toMatchObject({
      id: 'job_123',
      title: 'Senior Software Engineer',
      company: 'Acme Corp',
    });
  });

  it('returns empty listings array gracefully when no reference data exists', async () => {
    try {
      if (fs.existsSync(listingsPath)) {
        fs.unlinkSync(listingsPath);
      }
    } catch {}

    const response = await request(app)
      .get('/tools/reference-data/nonexistent-skill-id')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data.listings).toEqual([]);
  });
});
