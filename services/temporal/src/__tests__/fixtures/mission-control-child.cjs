const express = require('express');
const { TemporalClient } = require('../../../dist/client/TemporalClient.js');

const parentUrl = process.env.PARITY_FIXTURE_URL;
const taskId = 'task-1';

async function runMissionDirect(_input, checkpoint, controlCheckpoint) {
  const completed = (checkpoint?.completedTasks || []).some((task) =>
    task.phaseId === 'phase-1' && task.taskId === taskId,
  );
  if (!completed) {
    await fetch(`${parentUrl}/test/effect`, { method: 'POST' });
    await fetch(`${parentUrl}/test/wait-for-release`);
    await fetch(`${parentUrl}/test/task-completed`, { method: 'POST' });
    await controlCheckpoint();
  }
  return { outputs: { status: 'completed', result: 'resumed without repeating the task' } };
}

const client = new TemporalClient('default', runMissionDirect);
const app = express();
app.use(express.json());

app.get('/api/temporal/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/api/temporal/missions', async (req, res) => {
  try {
    const input = req.body;
    const workflowId = await client.startMission(input);
    res.status(202).json({ workflowId, status: 'started' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
app.post('/api/temporal/missions/:workflowId/pause', async (req, res) => {
  try {
    const status = await client.pauseMission(req.params.workflowId);
    res.status(202).json({ status });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
app.post('/api/temporal/missions/:workflowId/start', async (req, res) => {
  try {
    const status = await client.resumeMission(req.params.workflowId);
    res.status(202).json({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(message.includes('execution lease') ? 409 : 500).json({ error: message });
  }
});
app.listen(Number(process.env.PORT), '127.0.0.1');
