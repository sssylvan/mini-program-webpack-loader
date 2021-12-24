const fs = require('fs')
const {
  pathsInSameFolder,
  pathsInSamePackage
} = require('./helpers/module')
const { dirname, join } = require('path')
const { get: getAppJson } = require('./helpers/app')
const { fileTree } = require('./data')

const { DEPS_MAP, options } = require('./data')
const COMPONENT_DEPS_MAP = {}
const ONLY_SUBPACKAGE_USED_MODULE_MAP = {}
let context
/**
   * 重写 webpack.watch
   */
exports.setEnvHook = (compiler) => {
  let watch = compiler.watch
  let run = compiler.run
  context = compiler.context
  compiler.watch = (options) =>
    watch.call(compiler, compiler.options, messageOutPut)

  compiler.run = (customFunc) => {
    return run.call(compiler, function () {
      // 可能有自定义的回调方法，应该继承下
      customFunc && customFunc.apply(null, arguments)
      // 按照原有的箭头函数代码，还是返回 messageOutPut 的绑定
      return messageOutPut.apply(null, arguments)
    })
  }
}

/**
   * 输出
   * @param {*} err
   * @param {*} stat
   */
function messageOutPut (err, stat) {
  if (err) {
    return console.log('\n', err)
  }

  stat = stat || {
    compilation: {}
  }

  const { hash, startTime, endTime } = stat

  const { warnings = [], errors = [], assets } = stat.compilation
  let appJson = getAppJson()

  let size = 0

  for (const key in assets) {
    size += assets[key].size()
  }

  // fs.writeFileSync('./r.json', JSON.stringify(Object.keys(assets), null, 2), 'utf-8')
  let ot = [
    {
      time: new Date().toLocaleTimeString().gray,
      status: !errors.length ? 'success'.green : 'fail'.red,
      watch: fileTree.size + '/' + Object.keys(assets).length,
      page: fileTree.pageSize,
      component: fileTree.comSize,
      subpackage:
          appJson.subPackages.length + '/' + fileTree.subPageSize,
      duration: ((endTime - startTime) / 1000 + 's').green,
      size: ((size / 1024).toFixed(2) + ' k').green,
      hash
    }
  ]

  if (warnings.length) {
    ot[0].warning = (warnings.length + '').yellow
    consoleMsg(warnings)
  }

  if (errors.length) {
    ot[0].error = (errors.length + '').red
    consoleMsg(errors)
  }

  if (options.analyze) {
    let analyzeMap = {
      fileUsed: {},
      componentUsed: {},
      onlySubPackageUsed: {}
    }
    let fileWarnings = []
    let componentWarnings = []
    let compare = (a, b) => {
      if (a.length <= b.length) {
        return -1
      }

      return 1
    }

    let commonWarnings = []
    for (const key in ONLY_SUBPACKAGE_USED_MODULE_MAP) {
      const commons = (analyzeMap.onlySubPackageUsed[key] = Array.from(
        ONLY_SUBPACKAGE_USED_MODULE_MAP[key]
      ))

      let otherPackageFiles = getOtherPackageFiles(key, commons)
      if (otherPackageFiles.length) {
        commonWarnings.push(
          `子包 ${key.blue} 单独使用了 ${
            (otherPackageFiles.length + '').red
          } 个其他非子包内的文件`
        )
      }
    }
    commonWarnings = commonWarnings.sort(compare)

    for (const key in DEPS_MAP) {
      const files = (analyzeMap.fileUsed[key] = Array.from(DEPS_MAP[key]))

      if (files.length >= 20) {
        fileWarnings.push(
          `文件 ${key.blue} 被引用 ${(files.length + '').red} 次`
        )
      }
    }

    fileWarnings = fileWarnings.sort(compare)

    for (const key in COMPONENT_DEPS_MAP) {
      const components = (analyzeMap.componentUsed[key] = Array.from(
        COMPONENT_DEPS_MAP[key]
      ))
      const packageRoot = pathsInSamePackage(components)

      // 组件只在子包或者某个目录下的文件中使用，提示
      if (packageRoot) {
        // 使用组件的文件在同一个子包内
        let isInPackage = pathsInSamePackage([key, components[0]])
        !isInPackage &&
            componentWarnings.push(
              `自定义组件 ${key.blue} 建议移动到子包 ${packageRoot.red} 内`
            )
      } else if (
        components.length === 1 &&
          !pathsInSameFolder([key, ...components])
      ) {
        // 只有一个页面（组件）使用了该自定义组件
        componentWarnings.push(
          `自定义组件 ${key.blue} 建议移动到 ${
            dirname(components[0]).red
          } 目录内`
        )
      }
    }

    componentWarnings = componentWarnings.sort(compare)

    fileWarnings.forEach((message) => console.log('提示'.yellow, message))

    console.log('')

    componentWarnings.forEach((message) =>
      console.log('提示'.yellow, message)
    )

    console.log('')
    commonWarnings.length > 0 &&
        console.log('建议检查以下子包，并移动独用文件到子包内'.red)
    commonWarnings.forEach((message) => console.log('提示'.yellow, message))

    if (
      fileWarnings.length ||
        commonWarnings.length ||
        componentWarnings.length
    ) {
      console.log('')
      console.log(
        `你可以在 ${join(
          context,
          'analyze.json'
        )} 中查看详细信息`.yellow
      )
      console.log('')
      console.log(
        '  fileUsed'.green,
        '——'.gray,
        '文件被依赖关系。键为被依赖文件，值为依赖该文件的文件列表'
      )
      console.log(
        '  componentUsed'.green,
        '——'.gray,
        '自定义组件被依赖关系。键为被依赖的组件名，值为依赖该组件的组件(页面)列表'
      )
      console.log(
        '  onlySubPackageUsed'.green,
        '——'.gray,
        '子包单独使用的文件列表。键为子包名，值为该子包单独依赖的文件列表'
      )
      console.log('')
    }
    fs.writeFileSync(
      join(context, 'analyze.json'),
      JSON.stringify(analyzeMap, null, 2),
      'utf-8'
    )
  }

  console.log('')
  console.table(ot)

  options.compilationFinish &&
      options.compilationFinish(err, stat, appJson)
}

function consoleMsg (messages) {
  messages.forEach((err) => {
    if (!err.module || !err.module.id) {
      return console.log(err)
    }

    let message = err.message.split(/\n\n|\n/)
    let mainMessage = message[0] || ''
    let lc = mainMessage.match(/\((\d+:\d+)\)/)
    lc = lc ? lc[1] : '1:1'

    console.log('Error in file', (err.module && err.module.id + ':' + lc).red)
    console.log(mainMessage.gray)
    message[1] && console.log(message[1].gray)
    message[2] && console.log(message[2].gray)
    console.log('')
  })
}

/**
   *
   * @param {*} root
   * @param {*} files
   */
function getOtherPackageFiles (root, files) {
  return files.filter((file) => file.indexOf(root) === -1)
}
