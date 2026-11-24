const { MathExecutor } = require('../../services/tool-executor/dist/executors/MathExecutor');
const executor = new MathExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
