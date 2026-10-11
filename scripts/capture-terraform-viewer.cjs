const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const output = process.env.UI_SCREENSHOT_DIR || path.join(os.tmpdir(), 'terraform-viewer-baseline');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto((process.env.UI_BASE_URL || 'http://localhost:4200') + '/planviewer');
    await page.locator('app-terraform-plan-file-upload input[type=file]').first().setInputFiles(path.resolve(__dirname, '../examples/terraform-plan-viewer/plan.json'));
    await page.getByText('Plan Overview', { exact: true }).waitFor();
    const capture = async name => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });
    };
    const open = async locator => {
      await locator.waitFor();
      if (await locator.getAttribute('aria-expanded') !== 'true') await locator.click();
    };
    await capture('resources');
    await open(page.locator('.left-panel mat-expansion-panel-header').filter({ hasText: 'Root Module' }).first());
    await open(page.locator('.left-panel mat-expansion-panel-header').filter({ hasText: 'Azurerm Resource Group' }).first());
    await page.locator('.left-panel .resource-item').filter({ hasText: 'azurerm_resource_group.platform' }).first().click();
    await capture('selected-resource');
    await page.getByRole('tab', { name: /Outputs/ }).click();
    await capture('outputs');
    await page.getByRole('tab', { name: /Variables/ }).click();
    await capture('variables');
    await page.getByRole('tab', { name: /Resources/ }).click();
    await page.locator('app-terraform-plan-file-upload input[type=file]').nth(1).setInputFiles(path.resolve(__dirname, '../examples/terraform-plan-viewer/cdktf.json'));
    await page.locator('.construct-view-container').first().waitFor();
    await capture('cdktf');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('mobile');
    if (errors.length) throw Error(errors.join('\n'));
    console.log('Terraform viewer screenshots: ' + output);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
