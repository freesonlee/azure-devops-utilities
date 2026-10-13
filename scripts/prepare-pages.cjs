const fs = require('node:fs/promises');
const path = require('node:path');
const { domain } = require('./public-extensions.cjs');
const root = path.resolve(__dirname, '..');

(async () => {
  const output = path.join(root, 'dist/pages');
  const website = path.join(root, 'dist/azure-devops-variable-group-editor');
  await fs.access(path.join(website, 'index.html'));
  await fs.rm(output, { recursive: true, force: true });
  await fs.cp(website, output, { recursive: true });
  await fs.copyFile(path.join(output, 'index.html'), path.join(output, '404.html'));
  await fs.writeFile(path.join(output, '.nojekyll'), '');
  await fs.writeFile(path.join(output, 'CNAME'), new URL(domain).hostname + '\n');
  console.log('Standalone website assembled at dist/pages. Extension applications are bundled in their VSIX packages.');
})().catch(error => { console.error(error.message);process.exitCode = 1; });
