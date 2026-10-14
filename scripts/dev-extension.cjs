const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const organization = 'https://dev.azure.com/FreesonLee';
const extensions = {
  terraform: { manifest: 'terraform-plan-viewer.dev.vss.json', id: 'ads-terraform-plan-viewer-dev', port: 4302 },
  history: { manifest: 'variable-group-history.dev.vss.json', id: 'ads-var-history-dev', port: 4300 },
  pipeline: { manifest: 'pipeline-profiles.dev.vss.json', id: 'ads-pipeline-profiles-dev', port: 4301 },
};
const [action, selection, ...options] = process.argv.slice(2);
const auth = options.length === 0 ? 'entra' : options.length === 2 && options[0] === '--auth' ? options[1] : undefined;
const config = extensions[selection];
if (!config || !['pack', 'publish', 'install'].includes(action) || !['pat', 'entra'].includes(auth)) {
  console.error('Usage: node scripts/dev-extension.cjs <pack|publish|install> <history|pipeline|terraform> [--auth pat|entra]');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, config.manifest), 'utf8'));
if (manifest.public !== false || manifest.publisher !== 'FreesonLi' || manifest.id !== config.id ||
    manifest.baseUri !== `https://localhost:${config.port}/`) {
  console.error('The dev manifest must use its private dev ID, publisher, and localhost URL.');
  process.exit(1);
}
let token;
if (action !== 'pack' && auth === 'entra') {
  const result = spawnSync('az', ['account', 'get-access-token',
    '--resource', '499b84ac-1321-427f-aa17-267ca6975798',
    '--query', 'accessToken', '--output', 'tsv'], {
    encoding: 'utf8', timeout: 60000,
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    console.error('Could not obtain a Microsoft Entra token. Run az login --allow-no-subscriptions with your publisher account, then retry.');
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(1);
  }
  token = result.stdout.trim();
} else if (action !== 'pack') {
  token = process.env.ADS_MKT_PAT;
}
if (action !== 'pack' && !token) {
  console.error('Set ADS_MKT_PAT in your shell before publishing or installing a dev extension.');
  process.exit(1);
}
const output = path.join(root, 'artifacts', 'dev');
const vsix = path.join(output, `${manifest.publisher}.${manifest.id}-${manifest.version}.vsix`);
function tfx(args) {
  const result = spawnSync(process.execPath, [require.resolve('tfx-cli'), 'extension', ...args], {
    cwd: root, encoding: 'utf8', timeout: 360000,
  });
  for (const [stream, text] of [[process.stdout, result.stdout], [process.stderr, result.stderr]]) {
    if (text) stream.write(token ? text.replaceAll(token, '[REDACTED]') : text);
  }
  if (result.error || result.status !== 0) {
    if (result.error) console.error(token ? result.error.message.replaceAll(token, '[REDACTED]') : result.error.message);
    process.exit(result.status || 1);
  }
}
if (action === 'pack' || action === 'publish') {
  if (selection === 'terraform') {
    const build = spawnSync(process.execPath, [path.join(root, 'scripts/build-terraform-task.cjs')], { cwd: root, stdio: 'inherit' });
    if (build.error || build.status !== 0) process.exit(build.status || 1);
  }
  fs.mkdirSync(output, { recursive: true });
  tfx(['create', '--manifests', config.manifest, '--output-path', vsix]);
}
if (action === 'publish') {
  tfx(['publish', '--vsix', vsix, '--service-url', 'https://marketplace.visualstudio.com',
    '--share-with', 'FreesonLee', '--auth-type', 'pat', '--token', token]);
}
if (action === 'install') {
  tfx(['install', '--publisher', manifest.publisher, '--extension-id', manifest.id,
    '--service-url', organization, '--auth-type', 'pat', '--token', token]);
}
