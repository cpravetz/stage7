const { EmailExecutor } = require('../dist/executors/EmailExecutor');
const executor = new EmailExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
