const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { run } = require('./index.js');

const secret = 'SYNTHETIC_PLAN_SECRET';
const plan = { format_version: '1.2', terraform_version: '1.9.8', planned_values: {},
  resource_changes: [], variables: { token: { value: secret } } };

async function fixture(t, output = JSON.stringify(plan), exitCode = 0) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'terraform-task-test-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const cwd = path.join(temp, 'working directory');await fs.mkdir(cwd);
  await fs.writeFile(path.join(cwd, 'binary plan.tfplan'), 'synthetic-binary-plan');
  // Node stands in for the Terraform executable: `show` is this fixture script.
  // This executes a real child process on Windows, Linux, and macOS without Terraform.
  await fs.writeFile(path.join(cwd, 'show'), `const fs=require('node:fs');
    fs.writeFileSync('arguments.json',JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),automation:process.env.TF_IN_AUTOMATION,log:process.env.TF_LOG,extra:process.env.TF_CLI_ARGS_show}));
    process.stderr.write('${secret}');process.stdout.write(${JSON.stringify(output)});process.exitCode=${exitCode};`);
  const env = { ...process.env, BUILD_BUILDID: '123', AGENT_TEMPDIRECTORY: temp,
    INPUT_WORKINGDIRECTORY: cwd, INPUT_PLANFILE: 'binary plan.tfplan', INPUT_JSONFILENAME: 'production.plan.json',
    INPUT_ARTIFACTNAME: 'production-plans', INPUT_TERRAFORMCLIPATH: process.execPath,
    TF_LOG: 'TRACE', TF_CLI_ARGS_show: '-help' };
  delete env.RELEASE_RELEASEID;
  return { temp, cwd, env };
}

test('converts a binary snapshot and publishes exactly both requested files without logging secrets', async t => {
  const { cwd, env } = await fixture(t);
  const logs = [];
  const staging = await run(env, value => logs.push(value));
  assert.deepEqual((await fs.readdir(staging)).sort(), ['binary plan.tfplan', 'production.plan.json']);
  assert.equal(await fs.readFile(path.join(staging, 'binary plan.tfplan'), 'utf8'), 'synthetic-binary-plan');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(staging, 'production.plan.json'), 'utf8')), plan);
  assert.equal(await fs.readFile(path.join(cwd, 'binary plan.tfplan'), 'utf8'), 'synthetic-binary-plan');
  const conversion = JSON.parse(await fs.readFile(path.join(cwd, 'arguments.json'), 'utf8'));
  assert.deepEqual(conversion.args, ['-json', '-no-color', path.join(staging, 'binary plan.tfplan')]);
  assert.equal(conversion.cwd, cwd);assert.equal(conversion.automation, '1');
  assert.equal(conversion.log, undefined);assert.equal(conversion.extra, undefined);
  assert.equal(logs.filter(line => line.startsWith('##vso[artifact.upload ')).length, 1);
  assert(logs[1].includes('containerfolder=production-plans;artifactname=production-plans;'));
  assert(logs[1].endsWith(staging));assert(!logs.join('\n').includes(secret));
});

for (const [label, output, exitCode, expected] of [
  ['Terraform failure', JSON.stringify(plan), 1, /Terraform show failed/],
  ['malformed JSON', secret + ' invalid', 0, /valid plan JSON/],
  ['state instead of a plan', JSON.stringify({ format_version: '1.0', terraform_version: '1.9.8', values: {} }), 0, /not a plan/]
]) test(label + ' publishes nothing and removes incomplete staging', async t => {
  const { temp, env } = await fixture(t, output, exitCode);
  const logs = [];
  await assert.rejects(run(env, value => logs.push(value)), expected);
  assert.deepEqual(logs, []);
  assert.deepEqual(await fs.readdir(temp), ['working directory']);
});

for (const [name, value, expected] of [
  ['INPUT_PLANFILE', '', /planFile is required/],
  ['INPUT_PLANFILE', 'missing.tfplan', /ENOENT/],
  ['INPUT_PLANFILE', '.', /existing binary plan file/],
  ['INPUT_JSONFILENAME', '../escape.plan.json', /without directories/],
  ['INPUT_JSONFILENAME', 'plan.json', /end in .plan.json/],
  ['INPUT_JSONFILENAME', 'CON.plan.json', /reserved characters/],
  ['INPUT_ARTIFACTNAME', 'bad\n##vso[task.complete]', /reserved characters/],
  ['INPUT_TERRAFORMCLIPATH', 'missing-executable', /Could not start Terraform/]
]) test('rejects invalid input ' + name + '=' + JSON.stringify(value), async t => {
  const { env } = await fixture(t);
  const logs = [];
  await assert.rejects(run({ ...env, [name]: value }, value => logs.push(value)), expected);
  assert.deepEqual(logs, []);
});

test('does not overwrite a binary when the JSON filename collides', async t => {
  const { cwd, env } = await fixture(t);
  await fs.rename(path.join(cwd, 'binary plan.tfplan'), path.join(cwd, 'same.plan.json'));
  await assert.rejects(run({ ...env, INPUT_PLANFILE: 'same.plan.json', INPUT_JSONFILENAME: 'same.plan.json' }), /must be different/);
  assert.equal(await fs.readFile(path.join(cwd, 'same.plan.json'), 'utf8'), 'synthetic-binary-plan');
});

test('escapes artifact logging properties and keeps uploads in separate staging folders', async t => {
  const { env } = await fixture(t);
  const logs = [];
  const special = { ...env, INPUT_ARTIFACTNAME: 'plans;]%' };
  const first = await run(special, value => logs.push(value));
  const second = await run(special, () => {});
  assert.notEqual(first, second);
  assert(logs[1].includes('artifactname=plans%3B%5D%AZP25;'));
});

test('requires a build job and rejects classic release jobs', async t => {
  const { env } = await fixture(t);
  await assert.rejects(run({ ...env, BUILD_BUILDID: '' }), /build job/);
  await assert.rejects(run({ ...env, RELEASE_RELEASEID: '1' }), /Classic release/);
});

test('cancellation publishes nothing', async t => {
  const { temp, env } = await fixture(t);
  const controller = new AbortController();controller.abort();
  const logs = [];
  await assert.rejects(run(env, value => logs.push(value), controller.signal), /cancelled/);
  assert.deepEqual(logs, []);assert.deepEqual(await fs.readdir(temp), ['working directory']);
});

test('cancelling a running conversion waits for child exit and removes incomplete files', async t => {
  const { temp, cwd, env } = await fixture(t);
  await fs.writeFile(path.join(cwd, 'show'), "require('node:fs').writeFileSync('started', 'yes');setTimeout(() => process.stdout.write('{}'), 5000);");
  const controller = new AbortController();
  const logs = [];
  const result = run(env, value => logs.push(value), controller.signal);
  const rejected = assert.rejects(result, /cancelled/);
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await fs.stat(path.join(cwd, 'started')).catch(() => null)) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert(await fs.stat(path.join(cwd, 'started')).catch(() => null), 'conversion started');
  } finally { controller.abort(); }
  await rejected;
  assert.deepEqual(logs, []);assert.deepEqual(await fs.readdir(temp), ['working directory']);
});

test('agent entry point marks failures and never prints Terraform output', async t => {
  const { env } = await fixture(t, secret, 1);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'index.js')], { env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert(result.stdout.includes('##vso[task.logissue type=error;]'));
  assert(result.stdout.includes('##vso[task.complete result=Failed;]'));
  assert(!result.stdout.includes(secret));assert.equal(result.stderr, '');
});

test('optional CLI path uses Terraform from PATH', async t => {
  const { temp, env } = await fixture(t);
  const bin = path.join(temp, 'bin');await fs.mkdir(bin);
  const executable = path.join(bin, process.platform === 'win32' ? 'terraform.exe' : 'terraform');
  if (process.platform === 'win32') await fs.copyFile(process.execPath, executable);
  else await fs.symlink(process.execPath, executable);
  const originalPath = env.PATH || env.Path || '';
  delete env.PATH;delete env.Path;
  env.PATH = bin + path.delimiter + originalPath;
  env.INPUT_TERRAFORMCLIPATH = '';
  const staging = await run(env, () => {});
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(staging, 'production.plan.json'), 'utf8')), plan);
});
