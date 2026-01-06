const { defineConfig } = require('@vue/cli-service')

module.exports = defineConfig({
  transpileDependencies: true,
  chainWebpack: (config) => {
    config.module
      .rule('f2-jsx')
      .test(/\.jsx$/)
      .use('babel-loader')
      .loader('babel-loader')
      .options({
        plugins: [
          [
            '@babel/plugin-transform-react-jsx',
            {
              runtime: 'automatic',
              importSource: '@antv/f2'
            }
          ]
        ]
      })
      .end()
  },
  lintOnSave: false,
  devServer: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/static': {
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
  publicPath: '/'
})
