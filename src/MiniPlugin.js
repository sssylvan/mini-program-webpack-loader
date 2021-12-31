require('console.table')
require('colors')
const readline = require('readline')
const MiniProgam = require('./MiniProgram')
const {
  moduleOnlyUsedBySubPackage
} = require('./helpers/module')
const stdout = process.stdout

const { setEmitHook } = require('./hooks/setEmitHook')
const { setEnvHook } = require('./hooks/setEnvHook')
const { beforeCompile } = require('./hooks/beforeCompile')
const { setAppending, setCompilation, setAdditionalPassHook } = require('./hooks/setCompilation')

class MiniPlugin extends MiniProgam {
  apply (compiler) {
    if (MiniPlugin.inited) {
      throw new Error(
        'mini-program-webpack-loader 是一个单例插件，不支持多次实例化'
      )
    }

    MiniPlugin.inited = true

    this.moduleOnlyUsedBySubPackage = moduleOnlyUsedBySubPackage

    super.apply(compiler)

    // hooks
    this.compiler.hooks.environment.tap('MiniPlugin', () => setEnvHook(compiler))
    this.compiler.hooks.beforeCompile.tapAsync('MiniPlugin', (params, callback) => beforeCompile(compiler, params, callback))
    this.compiler.hooks.compilation.tap('MiniPlugin', (compilation, callback) => setCompilation(compilation, callback))
    this.compiler.hooks.emit.tapAsync('MiniPlugin', (compilation, callback) => setEmitHook(compilation, callback))
    this.compiler.hooks.additionalPass.tapAsync('MiniPlugin', (callback) => setAdditionalPassHook(callback)
    )
  }

  /**
   * 添加下一次编译新增的文件
   * @param {*} files
   */
  newFilesEntryFromLoader (files) {
    setAppending(files)
  }

  /**
   * 输出打包进度
   * @param {String} progress 进度
   * @param {String} event
   * @param {*} modules
   */
  progress (progress, event, modules) {
    readline.clearLine(process.stdout)
    readline.cursorTo(process.stdout, 0)

    if (+progress === 1) return
    stdout.write(
      `${'正在打包: '.gray} ${`${(progress * 100).toFixed(2)}%`.green} ${
        event || ''
      } ${modules || ''}`
    )
  }
}

module.exports = MiniPlugin
