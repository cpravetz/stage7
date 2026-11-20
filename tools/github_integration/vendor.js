const { VendorApiExecutor } = require('../../services/tool-executor/dist/executors/VendorApiExecutor');
const executor = new VendorApiExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
