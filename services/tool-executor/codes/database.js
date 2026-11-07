const { DatabaseExecutor } = require('../dist/executors/DatabaseExecutor');
const executor = new DatabaseExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
