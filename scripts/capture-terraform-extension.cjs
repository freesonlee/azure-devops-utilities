// Capture focused README images through the same SDK host as the extension checks.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const JSZip = require('jszip');

module.exports = async (browser, port) => {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'images/terraform-plan-viewer');
  await fs.mkdir(output, { recursive: true });
  const plan = JSON.parse(await fs.readFile(path.join(root, 'examples/terraform-plan-viewer/plan.json'), 'utf8'));
  plan.variables = {
    environment: { value: 'demo' },
    enable_monitoring: { value: true },
  };
  // Include a changed child-module resource so both modules appear in the tree.
  const network = plan.resource_changes.find(resource => resource.address === 'module.network.null_resource.network');
  network.change.actions = ['update'];
  network.change.before = { id: 'network-previous' };
  const zip = new JSZip();
  zip.file('terraform-demo/production.plan.json', JSON.stringify(plan));
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1600 }, deviceScaleFactor: 1 });
  const errors = [];
  try {
    await context.route('**/*', route => {
      if (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)) return route.continue();
      errors.push('Unexpected request: ' + route.request().url());
      return route.abort();
    });
    await context.route('https://run-preview.invalid/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/builds/42')) return route.fulfill({ json: { buildNumber: '2026.10.17.1', definition: { id: 7 } } });
      if (url.searchParams.has('artifactName')) return route.fulfill({ body: archive, contentType: 'application/zip' });
      return route.fulfill({ json: { value: [{ id: 1, name: 'terraform-demo', resource: { type: 'Container' } }] } });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/host`);
    const frame = page.frameLocator('#extension');
    await frame.getByText('Plan Overview', { exact: true }).waitFor();
    const child = page.frames().find(item => item.parentFrame() === page.mainFrame());
    const settle = async () => {
      await child.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
      });
      await page.mouse.move(0, 0);
    };
    const capture = async (name, locator, { height = 400 } = {}) => {
      await locator.scrollIntoViewIfNeeded();
      await settle();
      const box = await locator.boundingBox();
      assert(box, name + ' must be visible');
      await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled',
        clip: { x: Math.floor(box.x), y: Math.floor(box.y), width: 600, height } });
    };
    const open = async locator => {
      if (await locator.getAttribute('aria-expanded') !== 'true') await locator.click();
      await settle();
    };

    // Narrow viewport naturally wraps the six status cards into two rows.
    await page.setViewportSize({ width: 696, height: 1600 });
    await capture('status', frame.locator('.overview-card'), { height: 300 });

    await page.setViewportSize({ width: 1470, height: 1600 });
    const left = frame.locator('.left-panel');
    const tree = left.locator('app-resource-list');
    const rootHeader = tree.locator('.module-panel > mat-expansion-panel-header').filter({ hasText: 'Root Module' });
    await rootHeader.click();
    await open(tree.locator('.module-panel').filter({ hasText: 'network' }).locator('.resource-type-panel > mat-expansion-panel-header'));
    await capture('modules-resources', left);

    await page.setViewportSize({ width: 1240, height: 1600 });
    await open(rootHeader);
    await open(tree.locator('.resource-type-panel > mat-expansion-panel-header').filter({ hasText: 'Null Resource' }).first());
    await tree.locator('.resource-item').filter({ hasText: 'null_resource.application' }).click();
    const right = frame.locator('.right-panel');
    await open(right.locator('.field-changes mat-expansion-panel-header').filter({ hasText: 'triggers' }));
    await capture('properties-values', right.locator('.field-changes'));

    await page.setViewportSize({ width: 696, height: 1600 });
    await frame.getByRole('tab', { name: /Variables/ }).click();
    await capture('variables', frame.locator('.content-card'));
    await frame.getByRole('tab', { name: /Outputs/ }).click();
    await capture('outputs', frame.locator('.content-card'));
    assert.deepEqual(errors, []);
    assert(!(await frame.locator('body').innerText()).includes('SYNTHETIC_OUTPUT_SECRET'));
    console.log('README screenshots: ' + output);
  } finally {
    await context.close();
  }
};
