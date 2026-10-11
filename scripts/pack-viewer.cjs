const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist/packages');
fs.mkdirSync(output, { recursive: true });
const listing = JSON.parse(execFileSync('npm', ['pack', './dist/terraform-plan-viewer', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' }));
for (const file of listing[0].files) {
  if (/\.spec\.|\.env|examples\/|node_modules\//.test(file.path)) throw new Error('Unexpected package content: ' + file.path);
}
execFileSync('npm', ['pack', './dist/terraform-plan-viewer', '--pack-destination', output], { cwd: root, stdio: 'inherit' });
