const FileTree = require('./FileTree')
const { noop } = require('./utils')
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
module.exports = {
  DEPS_MAP,
  fileTree,
  setOption: (opt) => {
    return Object.assign(options, opt)
  },
  options
}
