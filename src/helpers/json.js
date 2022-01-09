const { dirname, basename } = require('path')
const { flattenDeep, getFiles } = require('../utils')
const { join } = require('path')

async function getAssetsFromAppJson (appJsonPath, resolver) {
  const dir = dirname(appJsonPath)
  let assets = await getAssetsFromPage(appJsonPath, resolver)
  const appJson = require(appJsonPath)
  delete require.cache[appJsonPath]
  let { pages, tabBar, subPackages } = appJson
  if (pages) {
    if (subPackages) {
      const subPackagePages = flattenDeep(subPackages.map(item => item.pages.map(p => item.root + p)))
      pages = pages.concat(subPackagePages)
    }

    const asbPageJsonPaths = pages.map(p => join(dir, p + '.json'))
    const pageFiles = flattenDeep(await Promise.all(asbPageJsonPaths.map(async p => await getAssetsFromPage(p, resolver))))
    assets = assets.concat(pageFiles)
  }

  if (tabBar && tabBar.list) {
    const tabBarImgs = getTabBarIcons(dir, tabBar.list)
    assets = assets.concat(tabBarImgs)
  }

  return assets
}

async function getAssetsFromPage (absPath, resolver) {
  const dir = dirname(absPath)
  const fileName = basename(absPath, '.json')
  const pageFiles = getFiles(dir, fileName)
  let componentsFiles = []

  const { usingComponents } = require(absPath)
  delete require.cache[absPath]
  if (usingComponents) {
    const aliasPaths = Object.values(usingComponents)
    const realPaths = await Promise.all((aliasPaths.map(async aliasPath => resolver(dir, aliasPath + '.json'))))
    componentsFiles = flattenDeep(await Promise.all(realPaths.map(async p => await getAssetsFromPage(p, resolver))))
  }
  return pageFiles.concat(componentsFiles)
}

function getTabBarIcons (context, tabs) {
  let files = []
  for (const tab of tabs) {
    let file = join(context, tab.iconPath)
    files.push(file)
    file = join(context, tab.selectedIconPath)
    files.push(file)
  }

  return files
}

exports.getAssetsFromAppJson = getAssetsFromAppJson
