const { defineConfig } = require('@vue/cli-service')
const path = require('path')
const fs = require('fs')

// 读取 VERSION 并解析 CHANGELOG 中当前版本对应的内容
function getVersionAndChangelog() {
  const rootDir = path.resolve(__dirname, '..')
  const versionPath = path.join(rootDir, 'VERSION')
  const changelogPath = path.join(rootDir, 'CHANGELOG.md')
  const version = fs.existsSync(versionPath) ? fs.readFileSync(versionPath, 'utf8').trim() : '0.0.0'
  const changelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : ''
  const versionEscaped = version.replace(/\./g, '\\.')
  const regex = new RegExp(`## \\[${versionEscaped}\\] - ([^\\n]+)\\n([\\s\\S]*?)(?=\\n---\\s*\\n|\\n## \\[|$)`)
  const match = changelog.match(regex)
  const content = match ? match[2].trim() : ''
  return { version, content }
}

const { version: APP_VERSION, content: APP_CHANGELOG_CURRENT } = getVersionAndChangelog()
const APP_TARGET = ['all', 'web', 'mobile'].includes((process.env.VUE_APP_TARGET || '').toLowerCase())
  ? String(process.env.VUE_APP_TARGET).toLowerCase()
  : 'all'

const APP_BASE = APP_TARGET === 'mobile' ? '/m/' : '/'

module.exports = defineConfig({
  transpileDependencies: true,
  chainWebpack: (config) => {
    config.plugin('define').tap((definitions) => {
      definitions[0]['__APP_VERSION__'] = JSON.stringify(APP_VERSION)
      definitions[0]['__APP_CHANGELOG_CURRENT__'] = JSON.stringify(APP_CHANGELOG_CURRENT)
      definitions[0]['__APP_TARGET__'] = JSON.stringify(APP_TARGET)
      return definitions
    })
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
    allowedHosts: 'all',
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
  publicPath: APP_BASE,
  outputDir: APP_TARGET === 'all' ? 'dist' : `dist-${APP_TARGET}`
})
