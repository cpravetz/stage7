const { SearchExecutor } = require('../dist/executors/SearchExecutor');
const executor = new SearchExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
