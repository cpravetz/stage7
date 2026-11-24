const { EmailExecutor } = require('../../services/tool-executor/dist/executors/EmailExecutor');
const executor = new EmailExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
