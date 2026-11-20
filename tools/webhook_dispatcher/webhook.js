const { WebhookExecutor } = require('../../services/tool-executor/dist/executors/WebhookExecutor');
const executor = new WebhookExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
