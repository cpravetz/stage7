const { FtpExecutor } = require('../dist/executors/FtpExecutor');
const executor = new FtpExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
