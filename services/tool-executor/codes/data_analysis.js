const { DataAnalysisExecutor } = require('../dist/executors/DataAnalysisExecutor');
const executor = new DataAnalysisExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
