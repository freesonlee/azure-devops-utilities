const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const directory = path.resolve(__dirname, '..', '.certs');
const certificate = path.join(directory, 'localhost.pem');
const key = path.join(directory, 'localhost-key.pem');
if (fs.existsSync(certificate) && fs.existsSync(key)) {
  console.log('Using the existing certificate and key in .certs/.');
  process.exit(0);
}
if (fs.existsSync(certificate) || fs.existsSync(key)) {
  console.error('Only one TLS file exists. Provide both localhost.pem and localhost-key.pem in .certs/.');
  process.exit(1);
}
fs.mkdirSync(directory, { recursive: true });
const result = spawnSync('openssl', [
  'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '365',
  '-subj', '/CN=localhost',
  '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
  '-keyout', key, '-out', certificate,
], { encoding: 'utf8' });
if (result.error || result.status !== 0) {
  console.error(result.error?.message || result.stderr);
  process.exit(1);
}
fs.chmodSync(key, 0o600);
console.log('Created the local development certificate and key in .certs/.');
console.log('Trust this certificate in your browser before opening the dev extensions. See docs/development.md.');
