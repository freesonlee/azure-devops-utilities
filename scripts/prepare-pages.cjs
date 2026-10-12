const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { domain, extensions } = require('./public-extensions.cjs');
const root = path.resolve(__dirname, '..');

(async () => {
  const output = path.join(root, 'dist/pages');
  const website = path.join(root, 'dist/azure-devops-variable-group-editor');
  await fs.access(path.join(website, 'index.html'));
  await fs.rm(output, { recursive: true, force: true });
  await fs.cp(website, output, { recursive: true });
  await fs.copyFile(path.join(output, 'index.html'), path.join(output, '404.html'));
  const release = {
    commit: process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    extensions: []
  };
  for (const config of Object.values(extensions)) {
    const manifest = JSON.parse(await fs.readFile(path.join(root, config.manifest), 'utf8'));
    const baseUri = `${domain}/extensions/${config.directory}/`;
    if (!manifest.public || manifest.id !== config.id || manifest.baseUri !== baseUri) throw new Error(`Unexpected public manifest: ${config.manifest}`);
    const source = path.join(root, 'dist', config.build);
    await fs.access(path.join(source, 'index.html'));
    await fs.cp(source, path.join(output, 'extensions', config.directory), { recursive: true });
    const main = await fs.readFile(path.join(source, 'main.js'));
    release.extensions.push({ id: manifest.id, version: manifest.version, baseUri,
      mainSha256: createHash('sha256').update(main).digest('hex') });
  }
  await fs.writeFile(path.join(output, 'extensions/release.json'), JSON.stringify(release, null, 2) + '\n');
  await fs.writeFile(path.join(output, '.nojekyll'), '');
  await fs.writeFile(path.join(output, 'CNAME'), new URL(domain).hostname + '\n');
  console.log('Pages site assembled at dist/pages with the website and all three extension applications.');
})().catch(error => { console.error(error.message);process.exitCode = 1; });
