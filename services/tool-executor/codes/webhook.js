const { WebhookExecutor } = require('../dist/executors/WebhookExecutor');
const executor = new WebhookExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
