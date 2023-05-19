import { fs } from 'zx';
import path from 'path';

const repoFolder = path.join(path.dirname(__filename), '..');
const folderToServe = path.join(repoFolder, 'public-dist');

// cross-env TIDDLYWIKI_PLUGIN_PATH='node_modules/tiddlywiki/plugins/published' TIDDLYWIKI_THEME_PATH='${wikiFolderName}/themes'
process.env.TIDDLYWIKI_PLUGIN_PATH = `${repoFolder}/plugins`;
process.env.TIDDLYWIKI_THEME_PATH = `${repoFolder}/themes`;

// npm run build:prepare
await $`rm -rf ${folderToServe}`;
// npm run build:public
await $`cp -r ${repoFolder}/public/ ${folderToServe}`;
try {
  await $`cp ${repoFolder}/vercel.json ${folderToServe}/vercel.json`;
} catch (error) {
  console.log(error);
}
// try copy some static assets, don't cause error if some of them been removed by the user
try {
  // npm run build:public
  await $`cp ${repoFolder}/tiddlers/favicon.ico ${folderToServe}/favicon.ico`;
  await $`cp ${repoFolder}/tiddlers/TiddlyWikiIconWhite.png ${folderToServe}/TiddlyWikiIconWhite.png`;
  await $`cp ${repoFolder}/tiddlers/TiddlyWikiIconBlack.png ${folderToServe}/TiddlyWikiIconBlack.png`;
} catch (error) {
  console.log(error);
}
// npm run build:nodejs2html
// exclude edit related plugins, make it readonly, and reduce size
await $`tiddlywiki ${repoFolder} --build readonlyexternalimages`;
await $`tiddlywiki ${repoFolder} --build externaljs`;
// npm run build:sitemap
await $`tiddlywiki . --rendertiddler sitemap sitemap.xml text/plain && mv ${repoFolder}/output/sitemap.xml ${folderToServe}/sitemap.xml`;
// npm run build:minifyHTML
const htmlMinifyPath = `${repoFolder}/output/index-minify.html`;
const htmlOutputPath = `${folderToServe}/index.html`;
await $`html-minifier-terser -c ./html-minifier-terser.config.json -o ${htmlMinifyPath} ${repoFolder}/output/index.html`;
// build dll.js and config tw to load it
// original filename contains invalid char, will cause static server unable to load it
const htmlContent = fs.readFileSync(htmlMinifyPath, 'utf-8');
const htmlContentWithCorrectJsPath = htmlContent.replaceAll('%24%3A%2Fcore%2Ftemplates%2Ftiddlywiki5.js', 'tiddlywiki5.js');
fs.writeFileSync(htmlOutputPath, htmlContentWithCorrectJsPath);
await $`mv ${repoFolder}/output/tiddlywiki5.js ${folderToServe}/tiddlywiki5.js`;
// npm run build:precache
await $`workbox injectManifest workbox-config.js`;

// build downloadable html
await $`tiddlywiki ${repoFolder} --build externalimages`;
await $`html-minifier-terser -c ./html-minifier-terser.config.json -o ${htmlMinifyPath} ${repoFolder}/output/index.html`;
await $`mv ${htmlMinifyPath} ${folderToServe}/index-full.html`;

/**
 * 构建离线HTML版本：核心JS和资源文件包括在HTML中， 下载后可以使用(就是单文件版本的wiki)
 * @param {string} distDir 目标路径，空或者不填则默认为'dist'
 * @param {string} htmlName HTML名称，空或者不填则默认为'index.html'
 * @param {boolean} minify 是否最小化JS和HTML，默认为true
 * @param {string} excludeFilter 要排除的tiddler的过滤表达式，默认为'-[is[draft]]'
 */
function buildOfflineHTML(distDir, htmlName, minify, excludeFilter) {
    if (typeof distDir !== 'string' || distDir.length === 0) distDir = 'dist';
    if (typeof htmlName !== 'string' || htmlName.length === 0) htmlName = 'index.html';
    if (typeof minify !== 'boolean') minify = true;
    if (typeof excludeFilter !== 'string') excludeFilter = '-[is[draft]]';

    // 构建HTML
    shell(`npx tiddlywiki . --output ${distDir}` +
        ' --deletetiddlers \'[[$:/UpgradeLibrary]] [[$:/UpgradeLibrary/List]]\'' +
        ` --rendertiddler $:/plugins/tiddlywiki/tiddlyweb/save/offline index-raw.html text/plain "" publishFilter "${excludeFilter}"`
    );

    // 最小化：HTML
    if (minify) {
        shellI(`npx html-minifier-terser -c scripts/html-minifier-terser.config.json -o ${distDir}/${htmlName} ${distDir}/index-raw.html && rm ${distDir}/index-raw.html`);
    } else {
        shellI(`mv ${distDir}/index-raw.html ${distDir}/${htmlName}`);
    }
}

module.exports = {
    buildOnlineHTML: buildOnlineHTML,
    buildOfflineHTML: buildOfflineHTML,
    buildLibrary: buildLibrary,
};