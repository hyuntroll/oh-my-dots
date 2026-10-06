const { packager } = require('@electron/packager');
const path = require('node:path');
packager({ dir: __dirname, out: path.resolve(__dirname, '../../output/desktop'), name: 'OhMyDots', platform: 'darwin', arch: 'arm64', overwrite: true, asar: true, appBundleId: 'dev.ohmydots.preview', appVersion: require('./package.json').version, icon: path.join(__dirname, 'icon.icns'), ignore: [/node_modules/, /package\.cjs/, /README\.md/, /icon\.iconset/] }).then(paths => console.log(paths.join('\n'))).catch(error => { console.error(error.message); process.exitCode = 1; });
