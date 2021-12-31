const FileTree = require('../FileTree')
const { noop } = require('../utils')
const utils = require('../utils')
const { flattenDeep } = require('../utils')

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

function getIgnoreEntrys () {
  /**
   * 多个入口，所有文件对应的原始文件将被丢弃
   */
  let eNames = [...new Set(entryNames)]
  eNames = eNames.map((name) => {
    if (name === 'app') return []
    return ['.json', '.wxss', '.js'].map((ext) => name + ext)
  })
  eNames = flattenDeep(eNames)
  /**
   * 静态资源的主文件
   */
  eNames = eNames.concat(
    chunkNames.map((chunkName) => chunkName + '.js')
  )

  return eNames
}

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
  entryNames,
  getIgnoreEntrys
}
