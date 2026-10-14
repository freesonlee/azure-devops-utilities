'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

// Use the documented agent logging protocol; the task has no runtime dependencies.
function escapeData(value) {
  return String(value).replaceAll('%', '%AZP25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function command(name, properties, message) {
  const fields = Object.entries(properties).map(([key, value]) =>
    `${key}=${escapeData(value).replaceAll(';', '%3B').replaceAll(']', '%5D')};`).join('');
  return `##vso[${name} ${fields}]${escapeData(message)}`;
}

function input(env, name, fallback = '') {
  return (env['INPUT_' + name.toUpperCase()] ?? fallback).trim();
}

function filename(value, label) {
  if (!value || value === '.' || value === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(value) ||
      /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) {
    throw new Error(`${label} must be a filename without directories or reserved characters.`);
  }
  return value;
}

async function convert(cli, binary, output, cwd, env, signal) {
  const file = await fs.open(output, 'wx', 0o600);
  try {
    // Redirect stdout to disk. Never forward JSON or raw Terraform diagnostics to task logs.
    // Disable inherited logging and argument injection for this conversion command.
    const childEnv = { ...env, TF_IN_AUTOMATION: '1' };
    for (const key of ['TF_LOG', 'TF_LOG_CORE', 'TF_LOG_PROVIDER', 'TF_LOG_PATH', 'TF_CLI_ARGS', 'TF_CLI_ARGS_show']) delete childEnv[key];
    await new Promise((resolve, reject) => {
      let failure;
      const child = spawn(cli, ['show', '-json', '-no-color', binary], {
        cwd, env: childEnv, signal, windowsHide: true, shell: false,
        stdio: ['ignore', file.fd, 'ignore']
      });
      child.once('error', error => { failure = new Error(error.name === 'AbortError' ? 'Plan publication was cancelled.' :
        `Could not start Terraform (${error.code || 'launch error'}). Executable: ${cli}. Working directory: ${cwd}. Install it on PATH in the same job or provide terraformCliPath to an executable file.`); });
      // Wait for the child and its file handles to close before deleting staging,
      // including cancellation on Windows where open files cannot be removed.
      child.once('close', (code, killed) => {
        if (failure) reject(failure);
        else if (code === 0) resolve();
        else reject(new Error(`Terraform show failed (${killed || 'exit code ' + code}). Check the Terraform version, binary plan, and initialized workingDirectory. Raw Terraform output is withheld from logs.`));
      });
    });
  } finally {
    await file.close();
  }
}

async function run(env = process.env, log = console.log, signal) {
  if (!env.BUILD_BUILDID || env.RELEASE_RELEASEID) {
    throw new Error('Publish Terraform plan requires an Azure Pipelines build job. Classic release jobs cannot publish build artifacts.');
  }
  const workingDirectory = path.resolve(input(env, 'workingDirectory', env.SYSTEM_DEFAULTWORKINGDIRECTORY || process.cwd()));
  if (!(await fs.stat(workingDirectory)).isDirectory()) throw new Error('workingDirectory must be a directory.');
  const binaryInput = input(env, 'planFile');
  if (!binaryInput) throw new Error('planFile is required. Create a saved binary plan with terraform plan -out first.');
  const binaryPath = path.resolve(workingDirectory, binaryInput);
  if (!(await fs.stat(binaryPath)).isFile()) throw new Error('planFile must point to an existing binary plan file.');
  const binaryName = filename(path.basename(binaryPath), 'Binary plan filename');
  const jsonName = filename(input(env, 'jsonFileName', 'terraform.plan.json'), 'jsonFileName');
  if (!jsonName.endsWith('.plan.json')) throw new Error('jsonFileName must end in .plan.json for the Terraform Plans viewer.');
  if (jsonName.toLowerCase() === binaryName.toLowerCase()) throw new Error('The binary and JSON plan filenames must be different.');
  const artifactName = filename(input(env, 'artifactName', 'terraform-plans'), 'artifactName');
  const cliInput = input(env, 'terraformCliPath');
  const cli = cliInput ? path.resolve(workingDirectory, cliInput) : 'terraform';
  if (cliInput) {
    const executable = await fs.stat(cli).catch(() => null);
    if (!executable) throw new Error(`Terraform executable was not found at terraformCliPath: ${cli}`);
    if (!executable.isFile()) throw new Error(`terraformCliPath points to a directory: ${cli}. Specify the executable file or leave it empty to use PATH.`);
  }
  const tempRoot = env.AGENT_TEMPDIRECTORY || os.tmpdir();
  const staging = await fs.mkdtemp(path.join(tempRoot, 'publish-terraform-plan-'));
  try {
    const binary = path.join(staging, binaryName);
    const json = path.join(staging, jsonName);
    // Convert the same snapshot that is published, without changing the source plan.
    await fs.copyFile(binaryPath, binary);
    await fs.chmod(binary, 0o600);
    await convert(cli, binary, json, workingDirectory, env, signal);
    let plan;
    try { plan = JSON.parse((await fs.readFile(json, 'utf8')).replace(/^\uFEFF/, '')); }
    catch { throw new Error('Terraform did not produce valid plan JSON. No artifact was published.'); }
    if (!plan || typeof plan !== 'object' || typeof plan.format_version !== 'string' ||
        typeof plan.terraform_version !== 'string' || !plan.planned_values || typeof plan.planned_values !== 'object' || Array.isArray(plan.planned_values)) {
      throw new Error('Terraform output is not a plan. Supply a saved binary plan, not a state file. No artifact was published.');
    }
    if (signal?.aborted) throw new Error('Plan publication was cancelled.');
    log(`Publishing binary and JSON plan as artifact: ${escapeData(artifactName)}`);
    log(command('artifact.upload', { containerfolder: artifactName, artifactname: artifactName }, staging));
    // The agent uploads asynchronously after processing stdout. Leave staging intact
    // until agent job cleanup; deleting it here can race the artifact upload.
    return staging;
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (require.main === module) {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  run(process.env, console.log, controller.signal).catch(error => {
    console.log(command('task.logissue', { type: 'error' }, error.message));
    console.log(command('task.complete', { result: 'Failed' }, 'Terraform plan publication failed.'));
    process.exitCode = 1;
  });
}

module.exports = { run };
