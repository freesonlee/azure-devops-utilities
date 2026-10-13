const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { extensions } = require('./public-extensions.cjs');
const { readManifest, packagePath, loadPackage } = require('./public-extension-package.cjs');
const root = path.resolve(__dirname, '..');
const [action, selection] = process.argv.slice(2);
const config = extensions[selection];
if (!config || !['pack', 'verify', 'publish', 'install'].includes(action) || process.argv.length !== 4) {
  console.error('Usage: node scripts/public-extension.cjs <pack|verify|publish|install> <history|pipeline|terraform>');process.exit(1);
}
let token;
function tfx(args) {
  const result = spawnSync(process.execPath, [require.resolve('tfx-cli'), 'extension', ...args], { cwd: root, encoding: 'utf8', timeout: 360000 });
  for (const [stream, content] of [[process.stdout, result.stdout], [process.stderr, result.stderr]]) {
    if (content) stream.write(token ? content.replaceAll(token, '[REDACTED]') : content);
  }
  if (result.error || result.status !== 0) {
    if (result.error) console.error(token ? result.error.message.replaceAll(token, '[REDACTED]') : result.error.message);
    process.exit(result.status || 1);
  }
}
(async () => {
  const manifest = await readManifest(selection);
  const vsix = packagePath(manifest);
  if (action === 'pack' || action === 'publish') {
    if (!fs.existsSync(path.join(root, 'dist', config.build, 'index.html'))) {
      throw new Error('Build the extension applications with npm run build:extensions before packaging.');
    }
    fs.mkdirSync(path.dirname(vsix), { recursive: true });
    tfx(['create', '--manifests', config.manifest, '--output-path', vsix]);
  }
  if (action !== 'install') await loadPackage(selection);
  if (action === 'publish' || action === 'install') {
    const credential = spawnSync('az', ['account', 'get-access-token', '--resource', '499b84ac-1321-427f-aa17-267ca6975798', '--query', 'accessToken', '--output', 'tsv'], { encoding: 'utf8', timeout: 60000 });
    if (credential.error || credential.status !== 0 || !credential.stdout.trim()) throw new Error('Sign in with az login --allow-no-subscriptions before publishing or installing.');
    token = credential.stdout.trim();
  }
  if (action === 'publish') {
    tfx(['publish', '--vsix', vsix, '--service-url', 'https://marketplace.visualstudio.com', '--auth-type', 'pat', '--token', token, '--no-wait-validation']);
  }
  if (action === 'install') {
    tfx(['install', '--publisher', manifest.publisher, '--extension-id', manifest.id,
      '--service-url', 'https://dev.azure.com/FreesonLee', '--auth-type', 'pat', '--token', token]);
  }
})().catch(error => { console.error(token ? error.message.replaceAll(token, '[REDACTED]') : error.message);process.exitCode = 1; });
