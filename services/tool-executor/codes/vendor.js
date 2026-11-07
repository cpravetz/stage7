const { VendorApiExecutor } = require('../dist/executors/VendorApiExecutor');
const executor = new VendorApiExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
