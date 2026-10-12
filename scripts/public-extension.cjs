const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { domain, extensions } = require('./public-extensions.cjs');
const root = path.resolve(__dirname, '..');
const [action, selection] = process.argv.slice(2);
const config = extensions[selection];
if (!config || !['pack', 'verify', 'publish', 'install'].includes(action) || process.argv.length !== 4) {
  console.error('Usage: node scripts/public-extension.cjs <pack|verify|publish|install> <history|pipeline|terraform>');process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, config.manifest), 'utf8'));
const baseUri = `${domain}/extensions/${config.directory}/`;
if (manifest.public !== true || manifest.publisher !== 'FreesonLi' || manifest.id !== config.id ||
  manifest.baseUri !== baseUri || manifest.files.length !== 0 || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  console.error('The release manifest must use its public identity and verified HTTPS hosting path.');process.exit(1);
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
async function verifyHostedRelease() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const response = await fetch(`${domain}/extensions/release.json?commit=${commit}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('The public site has not deployed the extension release yet. Wait for GitHub Pages deployment.');
  const release = await response.json();
  const entry = release.extensions?.find(item => item.id === manifest.id);
  if (release.commit !== commit || entry?.version !== manifest.version || entry?.baseUri !== baseUri) {
    throw new Error('The hosted release does not match this commit and manifest. Deploy and verify it before Marketplace publication.');
  }
  for (const file of ['index.html', 'main.js', 'styles.css', 'polyfills.js', 'runtime.js']) {
    const resource = await fetch(`${baseUri}${file}?commit=${commit}`, { signal: AbortSignal.timeout(20000) });
    if (!resource.ok) throw new Error(`Hosted ${config.directory}/${file} is unavailable.`);
    const bytes = Buffer.from(await resource.arrayBuffer());
    if (file === 'main.js' && createHash('sha256').update(bytes).digest('hex') !== entry.mainSha256) {
      throw new Error('The hosted application bundle does not match the declared release.');
    }
  }
  console.log(`Verified public hosting for ${manifest.id} ${manifest.version} at ${baseUri}`);
}
(async () => {
  if (action === 'verify' || action === 'publish') await verifyHostedRelease();
  if (action === 'publish' || action === 'install') {
    const credential = spawnSync('az', ['account', 'get-access-token', '--resource', '499b84ac-1321-427f-aa17-267ca6975798', '--query', 'accessToken', '--output', 'tsv'], { encoding: 'utf8', timeout: 60000 });
    if (credential.error || credential.status !== 0 || !credential.stdout.trim()) throw new Error('Sign in with az login --allow-no-subscriptions before publishing or installing.');
    token = credential.stdout.trim();
  }
  const output = path.join(root, 'artifacts/public');
  const vsix = path.join(output, `${manifest.publisher}.${manifest.id}-${manifest.version}.vsix`);
  if (action === 'pack' || action === 'publish') {
    fs.mkdirSync(output, { recursive: true });
    tfx(['create', '--manifests', config.manifest, '--output-path', vsix]);
  }
  if (action === 'publish') {
    tfx(['publish', '--vsix', vsix, '--service-url', 'https://marketplace.visualstudio.com', '--auth-type', 'pat', '--token', token, '--no-wait-validation']);
  }
  if (action === 'install') {
    tfx(['install', '--publisher', manifest.publisher, '--extension-id', manifest.id,
      '--service-url', 'https://dev.azure.com/FreesonLee', '--auth-type', 'pat', '--token', token]);
  }
})().catch(error => { console.error(token ? error.message.replaceAll(token, '[REDACTED]') : error.message);process.exitCode = 1; });
