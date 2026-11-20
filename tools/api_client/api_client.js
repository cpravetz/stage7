const { ApiClientExecutor } = require('../../services/tool-executor/dist/executors/ApiClientExecutor');
const executor = new ApiClientExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
