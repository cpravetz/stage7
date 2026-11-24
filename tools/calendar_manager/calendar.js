const { CalendarExecutor } = require('../../services/tool-executor/dist/executors/CalendarExecutor');
const executor = new CalendarExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
