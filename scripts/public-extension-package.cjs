const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const JSZip = require('jszip');
const { extensions } = require('./public-extensions.cjs');
const root = path.resolve(__dirname, '..');

async function readManifest(selection) {
  const config = extensions[selection];
  assert(config, 'Unknown extension selection');
  const manifest = JSON.parse(await fs.readFile(path.join(root, config.manifest), 'utf8'));
  assert(manifest.public === true && manifest.publisher === 'FreesonLi' && manifest.id === config.id &&
    !Object.hasOwn(manifest, 'baseUri') && /^\d+\.\d+\.\d+$/.test(manifest.version),
    'The release manifest must use its public identity and packaged assets without baseUri.');
  const files = [{ path: `dist/${config.build}`, packagePath: '/', addressable: true }];
  if (selection === 'terraform') files.push({ path: 'dist/tasks/PublishTerraformPlan' });
  assert.deepEqual(manifest.files, files,
    'The release manifest must package the complete build as addressable files at the package root.');
  const tabs = manifest.contributions.filter(item => item.type !== 'ms.vss-distributed-task.task');
  assert(tabs.every(item => item.properties.uri === 'index.html'),
    'Contributions must load the packaged index.html.');
  if (selection === 'terraform') {
    const task = JSON.parse(await fs.readFile(path.join(root, 'tasks/PublishTerraformPlan/task.json'), 'utf8'));
    assert.deepEqual(tabs[0].properties.supportsTasks, [task.id], 'The run tab must depend on the publishing task.');
    assert.equal(manifest.contributions.find(item => item.type === 'ms.vss-distributed-task.task')?.properties.name,
      'dist/tasks/PublishTerraformPlan', 'The extension must register the publishing task.');
  }
  return manifest;
}

function packagePath(manifest) {
  return path.join(root, 'artifacts/public', `${manifest.publisher}.${manifest.id}-${manifest.version}.vsix`);
}

// Both release verification and browser fixtures consume the actual VSIX.
async function loadPackage(selection) {
  const manifest = await readManifest(selection);
  const filename = packagePath(manifest);
  const archive = await JSZip.loadAsync(await fs.readFile(filename));
  const packaged = JSON.parse(await archive.file('extension.vsomanifest').async('string'));
  assert(!Object.hasOwn(packaged, 'baseUri'), 'The VSIX must not load an external application.');
  assert.deepEqual(packaged.contributions, manifest.contributions, 'Packaged contributions must match the release manifest.');
  assert.deepEqual(packaged.scopes, manifest.scopes, 'Packaged scopes must match the release manifest.');
  const metadata = await archive.file('extension.vsixmanifest').async('string');
  const identity = metadata.match(/<Identity\b[^>]*>/)?.[0];
  for (const [name, value] of Object.entries({ Id: manifest.id, Publisher: manifest.publisher, Version: manifest.version })) {
    assert(identity?.includes(`${name}="${value}"`), `Packaged ${name} must match the release manifest.`);
  }
  const addressable = new Set([...metadata.matchAll(/<Asset\b[^>]*>/g)]
    .filter(([tag]) => tag.includes('Addressable="true"'))
    .map(([tag]) => tag.match(/\bPath="([^"]+)"/)[1]));
  const assets = new Map();
  const directory = path.join(root, 'dist', extensions[selection].build);
  async function verifyDirectory(relative = '') {
    for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await verifyDirectory(name);
      else {
        assert(archive.file(name) && addressable.has(name), `Missing addressable packaged asset: ${name}`);
        const bytes = await archive.file(name).async('nodebuffer');
        assert(bytes.equals(await fs.readFile(path.join(directory, name))), `Packaged asset differs from the build: ${name}`);
        assets.set(name, bytes);
      }
    }
  }
  await verifyDirectory();
  if (selection === 'terraform') {
    const taskPath = 'dist/tasks/PublishTerraformPlan';
    for (const name of ['task.json', 'index.js', 'icon.png']) {
      const asset = `${taskPath}/${name}`;
      assert(archive.file(asset), `Missing packaged pipeline task file: ${asset}`);
      const bytes = await archive.file(asset).async('nodebuffer');
      assert(bytes.equals(await fs.readFile(path.join(root, asset))), `Packaged task file differs from the build: ${asset}`);
    }
    const task = JSON.parse(await archive.file(`${taskPath}/task.json`).async('string'));
    assert.equal(task.id, manifest.contributions[0].properties.supportsTasks[0], 'Packaged task ID must match tab visibility.');
    assert.equal(task.execution.Node20_1.target, 'index.js', 'The task must run its packaged entry point on Node 20.');
  }
  for (const name of ['index.html', 'main.js', 'polyfills.js', 'runtime.js', 'styles.css']) {
    assert(assets.has(name), `Missing required application asset: ${name}`);
  }
  // Catch external script, stylesheet, font, and image dependencies before publication.
  const html = assets.get('index.html').toString();
  assert(!/<(?:script|link|img)\b[^>]*(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(html),
    'Packaged HTML must use local application assets.');
  const css = assets.get('styles.css').toString();
  assert(!/(?:url\(\s*["']?|@import\s*["'])(?:https?:)?\/\//i.test(css),
    'Packaged CSS must use local fonts and images.');
  console.log(`Verified ${manifest.id} ${manifest.version}: ${assets.size} bundled assets in ${filename}`);
  return { manifest, assets };
}

module.exports = { readManifest, packagePath, loadPackage };
