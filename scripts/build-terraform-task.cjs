const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const devId = '84d7f344-97f7-4696-8708-125d20e556ba';

async function build() {
  const source = path.join(root, 'tasks/PublishTerraformPlan');
  const definition = JSON.parse(await fs.readFile(path.join(source, 'task.json'), 'utf8'));
  for (const development of [false, true]) {
    const name = development ? 'PublishTerraformPlanDev' : 'PublishTerraformPlan';
    const output = path.join(root, 'dist/tasks', name);
    await fs.rm(output, { recursive: true, force: true });
    await fs.mkdir(output, { recursive: true });
    const task = { ...definition };
    if (development) {
      task.id = devId;
      task.name = name;
      task.friendlyName += ' (Dev)';
    }
    await fs.writeFile(path.join(output, 'task.json'), JSON.stringify(task, null, 2) + '\n');
    await fs.copyFile(path.join(source, 'index.js'), path.join(output, 'index.js'));
    await fs.copyFile(path.join(root, 'images/terraform-plan-viewer.png'), path.join(output, 'icon.png'));
    console.log(`Built ${name}@${task.version.Major} (${task.id}) at ${output}`);
  }
}

if (require.main === module) build().catch(error => { console.error(error.message);process.exitCode = 1; });
module.exports = { build, devId };
