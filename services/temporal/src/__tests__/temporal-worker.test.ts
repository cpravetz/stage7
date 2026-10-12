jest.mock('@temporalio/worker', () => ({
  NativeConnection: { connect: jest.fn() },
  Worker: { create: jest.fn() },
}))

import { NativeConnection, Worker } from '@temporalio/worker'
import { runTemporalWorker } from '../temporalWorker'

describe('Temporal worker registration', () => {
  const originalAddress = process.env.TEMPORAL_ADDRESS
  const originalNamespace = process.env.TEMPORAL_NAMESPACE

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    if (originalAddress === undefined) delete process.env.TEMPORAL_ADDRESS
    else process.env.TEMPORAL_ADDRESS = originalAddress
    if (originalNamespace === undefined) delete process.env.TEMPORAL_NAMESPACE
    else process.env.TEMPORAL_NAMESPACE = originalNamespace
  })

  it('registers mission and watch workflows with their activities on the service task queue', async () => {
    process.env.TEMPORAL_ADDRESS = 'temporal:7233'
    process.env.TEMPORAL_NAMESPACE = 'stage7'
    const connection = { close: jest.fn().mockResolvedValue(undefined) }
    const run = jest.fn().mockResolvedValue(undefined)
    jest.mocked(NativeConnection.connect).mockResolvedValue(connection as never)
    jest.mocked(Worker.create).mockResolvedValue({ run } as never)

    await runTemporalWorker()

    expect(Worker.create).toHaveBeenCalledWith(expect.objectContaining({
      connection,
      namespace: 'stage7',
      taskQueue: 'stage7-workers',
      workflowsPath: require.resolve('../workflows'),
      activities: expect.objectContaining({
        runMissionActivity: expect.any(Function),
        runWatchActivity: expect.any(Function),
        fetchWatchActivity: expect.any(Function),
      }),
    }))
    expect(run).toHaveBeenCalledTimes(1)
    expect(connection.close).toHaveBeenCalledTimes(1)
  })

  it('does not connect when Temporal is not configured', async () => {
    delete process.env.TEMPORAL_ADDRESS

    await runTemporalWorker()

    expect(NativeConnection.connect).not.toHaveBeenCalled()
    expect(Worker.create).not.toHaveBeenCalled()
  })
})
