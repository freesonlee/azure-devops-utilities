const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'dist/azure-devops-variable-group-editor');

(async () => {
  await fs.access(path.join(directory, 'index.html'));
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://fixture.invalid');
      let file = path.resolve(directory, '.' + url.pathname);
      if (!file.startsWith(directory + path.sep)) file = path.join(directory, 'index.html');
      try { if (!(await fs.stat(file)).isFile()) file = path.join(directory, 'index.html'); }
      catch { file = path.join(directory, 'index.html'); }
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
      res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(500);res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const script of ['check-variable-editor.cjs', 'check-pipeline-profiles.cjs']) {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(__dirname, script)], {
          cwd: root, stdio: 'inherit', env: { ...process.env, UI_BASE_URL: `http://127.0.0.1:${server.address().port}` }
        });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${script} failed (${code})`)));
      });
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error);process.exitCode = 1; });
