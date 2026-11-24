const { DatabaseExecutor } = require('../../services/tool-executor/dist/executors/DatabaseExecutor');
const executor = new DatabaseExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
