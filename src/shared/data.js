const FileTree = require('../FileTree')
const { noop } = require('../utils')
const utils = require('../utils')

const DEPS_MAP = {}
const fileTree = new FileTree()
const options = {
  extfile: true,
  commonSubPackages: true,
  analyze: false,
  resources: [],
  beforeEmit: noop,
  compilationFinish: null,
  forPlugin: false,
  entry: {
    // 入口文件的配置
    // ignore
    // accept
  }
}

const miniEntrys = []
const chunkNames = ['main']
const entryNames = []

module.exports = {
  DEPS_MAP,
  fileTree,
  options,
  setOption: (opt) => {
    return Object.assign(options, opt)
  },
  miniEntrys,
  setMiniEntrys: (compiler) => {
    utils.formatEntry(
      compiler.context,
      compiler.options.entry,
      chunkNames
    ).forEach(item => {
      miniEntrys.push(item)
    })
    return miniEntrys
  },
  chunkNames,
  entryNames
}
