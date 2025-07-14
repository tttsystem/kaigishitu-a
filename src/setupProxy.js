const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api/notion',
    createProxyMiddleware({
      target: 'https://api.notion.com',
      changeOrigin: true,
      pathRewrite: {
        '^/api/notion': '', // /api/notion を削除
      },
      headers: {
        'Authorization': `Bearer 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`,
        'Notion-Version': '2022-06-28',
      },
    })
  );
};