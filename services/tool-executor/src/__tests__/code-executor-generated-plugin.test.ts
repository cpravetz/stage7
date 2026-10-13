import { createServer, Server } from 'node:http'
import { CodeExecutor } from '../executors/CodeExecutor'

describe('CodeExecutor generated plugin profile', () => {
  let server: Server | undefined
  let originalSecret: string | undefined

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => error ? reject(error) : resolve())
      })
    }
    server = undefined
    if (originalSecret === undefined) delete process.env.STAGE7_CODE_EXECUTOR_TEST_SECRET
    else process.env.STAGE7_CODE_EXECUTOR_TEST_SECRET = originalSecret
    originalSecret = undefined
  })

  it('restricts environment, filesystem, and child processes while allowing outbound HTTP', async () => {
    originalSecret = process.env.STAGE7_CODE_EXECUTOR_TEST_SECRET
    process.env.STAGE7_CODE_EXECUTOR_TEST_SECRET = 'must-not-leak'

    server = createServer((_request, response) => {
      response.end('network-available')
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port')

    const code = `(async () => {
      const fs = require('node:fs');
      const childProcess = require('node:child_process');
      let fileReadBlocked = false;
      let childProcessBlocked = false;
      try { fs.readFileSync('/etc/passwd'); } catch (error) { fileReadBlocked = error.code === 'ERR_ACCESS_DENIED'; }
      try { childProcess.spawnSync(process.execPath, ['-e', '']); } catch (error) { childProcessBlocked = error.code === 'ERR_ACCESS_DENIED'; }
      const response = await fetch('http://127.0.0.1:${address.port}/');
      console.log(JSON.stringify({
        secret: process.env.STAGE7_CODE_EXECUTOR_TEST_SECRET || null,
        fileReadBlocked,
        childProcessBlocked,
        network: await response.text(),
      }));
    })().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });`

    const result = await new CodeExecutor().execute({
      language: 'javascript',
      code,
      executionProfile: 'generated-plugin',
    })

    expect(result.success).toBe(true)
    expect(JSON.parse(result.output || '')).toEqual({
      secret: null,
      fileReadBlocked: true,
      childProcessBlocked: true,
      network: 'network-available',
    })
  })

  it('fails closed for generated Python plugins', async () => {
    const result = await new CodeExecutor().execute({
      language: 'python',
      code: 'print("must not run")',
      executionProfile: 'generated-plugin',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('currently require JavaScript')
  })
})
