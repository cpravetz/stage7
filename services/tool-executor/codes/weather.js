const { WeatherExecutor } = require('../dist/executors/WeatherExecutor');
const executor = new WeatherExecutor();
module.exports = {
  execute: async (input, credentials) => executor.execute(input, credentials),
};
