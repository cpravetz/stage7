const { FileStorageExecutor } = require('../dist/executors/FileStorageExecutor');
const executor = new FileStorageExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
