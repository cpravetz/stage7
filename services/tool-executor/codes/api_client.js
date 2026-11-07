const { ApiClientExecutor } = require('../dist/executors/ApiClientExecutor');
const executor = new ApiClientExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
