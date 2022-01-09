const { extname } = require('path')
const CONFIG = {
  wx: {
    TScss (path) {
      return path.replace('.scss', '.wxss')
    },

    TPcss (path) {
      return path.replace('.pcss', '.wxss')
    },

    TLess (path) {
      return path.replace('.less', '.wxss')
    }
  }
}

module.exports.toTargetPath = function (file) {
  let target = process.env.TARGET || 'wx'
  let TARGET = CONFIG[target]
  let ext = extname(file)

  if (!ext) throw new Error('接受到一个不正常的文件')

  let method = 'T' + ext.substr(1, 1).toUpperCase() + ext.substr(2)
  return method && TARGET[method] ? TARGET[method](file) : file
}
