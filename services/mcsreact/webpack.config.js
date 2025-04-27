const path = require('path');

module.exports = {
  resolve: {
    fallback: {
      // No need for crypto polyfill anymore
      "buffer": require.resolve("buffer/"),
      "stream": require.resolve("stream-browserify"),
      "util": require.resolve("util/"),
      "process": require.resolve("process/browser"),
    }
  }
};
