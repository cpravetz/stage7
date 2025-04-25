const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy requests to the PostOffice service
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://postoffice:5020',
      changeOrigin: true,
      pathRewrite: {
        '^/api': '/'
      }
    })
  );

}
