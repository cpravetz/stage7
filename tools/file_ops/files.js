const { FileStorageExecutor } = require('../../services/tool-executor/dist/executors/FileStorageExecutor');
const executor = new FileStorageExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
