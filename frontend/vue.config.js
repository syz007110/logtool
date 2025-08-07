const { defineConfig } = require('@vue/cli-service')

module.exports = defineConfig({
  transpileDependencies: true,
  devServer: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    },
    // 完全禁用错误覆盖
    client: {
      overlay: false
    },
    // 禁用热重载的错误显示
    hot: false,
    liveReload: false
  },
  publicPath: process.env.NODE_ENV === 'production' ? './' : '/'
}) 