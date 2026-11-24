const { FtpExecutor } = require('../../services/tool-executor/dist/executors/FtpExecutor');
const executor = new FtpExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
