const { MathExecutor } = require('../dist/executors/MathExecutor');
const executor = new MathExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
