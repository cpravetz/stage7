import { NativeConnection, Worker } from '@temporalio/worker'
import { missionActivities } from './activities/missionActivity'
import { watchActivities } from './activities/watchActivity'
import { logger } from '@stage7-nextgen/shared'

export async function runTemporalWorker(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS
  if (!address) {
    logger.info('TEMPORAL_ADDRESS is not set; Temporal worker is disabled')
    return
  }

  const connection = await NativeConnection.connect({ address })
  try {
    const worker = await Worker.create({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE || 'default',
      taskQueue: 'stage7-workers',
      workflowsPath: require.resolve('./workflows'),
      activities: { ...missionActivities, ...watchActivities },
    })
    logger.info({ address, taskQueue: 'stage7-workers' }, 'Temporal worker started')
    await worker.run()
  } finally {
    await connection.close()
  }
}
