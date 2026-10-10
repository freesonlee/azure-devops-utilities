const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');

// Run against `npm start`. All Azure DevOps calls use local fixtures in a fresh context.
const baseUrl = process.env.UI_BASE_URL || 'http://localhost:4200';
const output = process.env.UI_SCREENSHOT_DIR || path.join(os.tmpdir(), 'azure-devops-variable-editor-ui');
const host = 'https://ui-preview.invalid/contoso/platform';
const server = { host, pat: 'preview-only', repository: 'variable-history', branch: 'main', filePath: '/groups/' };
const specs = [
  ['API_BASE_URL', 'https://api.example.com', false, 'Application API endpoint'],
  ['APP_ENVIRONMENT', 'production', false, 'Deployment environment'],
  ['AZURE_REGION', 'eastus', false, 'Primary deployment region'],
  ['DATABASE_PASSWORD', 'fixture-secret-value', true, 'Database credential'],
  ['FEATURE_FLAGS', '{"newDashboard":true}', false, 'Application feature switches'],
  ['LOG_LEVEL', 'info', false, 'Application log verbosity'],
  ['SERVICE_CONNECTION', 'platform-production', false, 'Azure service connection'],
  ['STORAGE_ACCOUNT', 'platformprodassets', false, 'Static asset storage account']
];
const groups = ['Application - Production', 'Application - Staging', 'Infrastructure - Shared', 'Platform - Development', 'Platform - Production', 'Release - Defaults'].map((name, index) => ({
  id: index + 1, name, description: '', type: 'Vsts',
  variables: Object.fromEntries(specs.map(([key, value, isSecret]) => [key, { value, isSecret }]))
}));
const snapshot = { variables: Object.fromEntries(specs.map(([key, value, isSecret, desc]) => [key, { value, isSecret, desc, description: desc, mlType: '|', mlSource: value }])) };

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const errors = [];
    const emptyContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const empty = await emptyContext.newPage();
    empty.on('pageerror', error => errors.push(error.message));
    await empty.goto(`${baseUrl}/variables`);
    await empty.getByRole('heading', { name: 'Connect your Azure DevOps project' }).waitFor();
    assert(await empty.getByRole('button', { name: 'Save changes', exact: true }).isDisabled());
    assert(await empty.getByRole('button', { name: 'Reload', exact: true }).isDisabled());
    await empty.screenshot({ path: path.join(output, 'empty-desktop.png'), animations: 'disabled' });
    await empty.getByRole('button', { name: 'Settings', exact: true }).click();
    await empty.getByRole('dialog').waitFor();
    await empty.screenshot({ path: path.join(output, 'settings-desktop.png'), animations: 'disabled' });
    await empty.getByRole('button', { name: 'Cancel', exact: true }).click();
    await emptyContext.close();

    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ server }) => {
      localStorage.setItem('servers', JSON.stringify([server]));
      localStorage.setItem('lastServer', server.host);
    }, { server });
    let failReload = false;
    const mutations = [];
    await context.route('https://ui-preview.invalid/**', async route => {
      const request = route.request();
      if (request.method() !== 'GET') {
        // The save dialog loads work items with a read-only WIQL query.
        if (request.url().includes('/wit/wiql')) return route.fulfill({ json: { workItems: [] } });
        mutations.push(request.method() + ' ' + request.url());
        return route.abort();
      }
      if (request.url().includes('/variablegroups')) {
        return route.fulfill({ status: failReload ? 503 : 200, json: failReload ? {} : { count: groups.length, value: groups } });
      }
      if (request.url().includes('/_apis/pipelines')) {
        return route.fulfill({ json: { count: 0, value: [] } });
      }
      return route.fulfill({ json: snapshot });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const save = page.getByRole('button', { name: 'Save changes', exact: true });
    const group = name => page.locator('.group-button').filter({ hasText: name });
    const value = name => page.getByRole('textbox', { name: `Value: ${name}`, exact: true });
    const undo = name => page.getByRole('button', { name: `Undo: ${name}`, exact: true });
    const row = name => page.locator('tr').filter({ has: page.getByRole('textbox', { name: `Name: ${name}`, exact: true }) });
    const assertNoOverflow = async () => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page should not scroll horizontally');
    };
    const screenshot = async name => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
    };
    await page.goto(`${baseUrl}/variables`);
    await page.getByRole('button', { name: 'Reload', exact: true }).click();
    await group('Application - Production').click();
    await page.getByRole('textbox', { name: 'Description: API_BASE_URL', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-label="Description: API_BASE_URL"]').value === 'Application API endpoint');
    assert.equal(await page.locator('.group-button').count(), 6, 'Every group appears in a flat list');
    assert.equal(await page.locator('.group-list h2, .group-list h3').count(), 0, 'No category headings');
    assert(await save.isDisabled());
    await assertNoOverflow();
    assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'Desktop workspace fits the viewport');
    await screenshot('editor-desktop.png');

    await page.getByRole('searchbox', { name: 'Find a variable group', exact: true }).fill('staging');
    assert.equal(await page.locator('.group-button').count(), 1);
    await page.getByRole('searchbox', { name: 'Find a variable group', exact: true }).fill('');
    await page.getByRole('searchbox', { name: 'Search variables', exact: true }).fill('region');
    assert.equal(await page.locator('.variableNameInput').count(), 1);
    await page.getByRole('searchbox', { name: 'Search variables', exact: true }).fill('fixture-secret-value');
    assert.equal(await page.locator('.variableNameInput').count(), 0, 'Search does not reveal secret values');
    await page.getByRole('searchbox', { name: 'Search variables', exact: true }).fill('');
    await page.getByRole('button', { name: 'Hide descriptions', exact: true }).click();
    assert.equal(await page.locator('th.mat-column-desc').count(), 0);
    await page.getByRole('button', { name: 'Show descriptions', exact: true }).click();

    await value('API_BASE_URL').fill('https://api-v2.example.com');
    await value('API_BASE_URL').press('Tab');
    assert(await save.isEnabled());
    assert.equal(await row('API_BASE_URL').locator('.row-badge').innerText(), 'Modified');
    await undo('API_BASE_URL').click();
    assert.equal(await value('API_BASE_URL').inputValue(), 'https://api.example.com');
    assert(await save.isDisabled());
    await page.getByRole('textbox', { name: 'Variable group name', exact: true }).fill('Renamed group');
    assert(await save.isEnabled());
    await page.getByRole('textbox', { name: 'Variable group name', exact: true }).fill('Application - Production');
    assert(await save.isDisabled(), 'Reverting a group rename clears the change');

    await page.getByRole('button', { name: 'Add variable', exact: true }).click();
    assert.equal(await page.locator('.variableNameInput').count(), 9);
    assert(await save.isEnabled(), 'Adding a variable updates save state');
    await page.getByRole('textbox', { name: 'Name: new variable', exact: true }).fill('API_BASE_URL');
    await page.getByRole('textbox', { name: 'Name: API_BASE_URL', exact: true }).last().press('Tab');
    assert.equal(await page.locator('.row-badge.invalid').count(), 2, 'Duplicate names identify both rows');
    await undo('API_BASE_URL').last().click();
    assert.equal(await page.locator('.variableNameInput').count(), 8, 'Undo removes a newly added row');
    assert.equal(await page.locator('.row-badge.invalid').count(), 0);

    await page.getByRole('button', { name: 'Details: API_BASE_URL', exact: true }).click();
    await page.getByRole('textbox', { name: 'Multiline value: API_BASE_URL', exact: true }).fill('first\nsecond');
    await page.getByRole('combobox', { name: 'Newline handling: API_BASE_URL', exact: true }).selectOption('>');
    assert.equal(await value('API_BASE_URL').inputValue(), 'first second');
    await undo('API_BASE_URL').click();
    await page.getByRole('button', { name: 'Details: DATABASE_PASSWORD', exact: true }).click();
    assert.equal(await page.locator('[aria-label="Value: DATABASE_PASSWORD"]').getAttribute('type'), 'password');
    assert.equal(await page.locator('[aria-label="Multiline value: DATABASE_PASSWORD"]').getAttribute('type'), 'password');
    await page.getByRole('button', { name: 'Details: DATABASE_PASSWORD', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Secret: LOG_LEVEL', exact: true }).check();
    assert.equal(await page.locator('[aria-label="Value: LOG_LEVEL"]').getAttribute('type'), 'password');
    await undo('LOG_LEVEL').click();

    await page.getByRole('button', { name: 'Clone group', exact: true }).click();
    await value('LOG_LEVEL').fill('debug');
    await value('LOG_LEVEL').press('Tab');
    await group('Application - Production').filter({ hasText: /Clone/ }).waitFor();
    await page.locator('.group-button').filter({ hasText: 'Application - Production' }).filter({ hasNotText: 'Clone' }).click();
    assert.equal(await value('LOG_LEVEL').inputValue(), 'info', 'Editing a clone does not modify its source');

    await value('API_BASE_URL').fill('https://api-v2.example.com');
    await value('API_BASE_URL').press('Tab');
    await page.getByRole('button', { name: 'Delete: APP_ENVIRONMENT', exact: true }).click();
    assert.equal(await row('APP_ENVIRONMENT').locator('.row-badge').innerText(), 'Pending deletion');
    await screenshot('changes-desktop.png');
    await save.click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    for (const [width, height] of [[1024, 768], [390, 844], [320, 750]]) {
      await page.setViewportSize({ width, height });
      await assertNoOverflow();
      if (width < 700) {
        assert(await page.locator('.group-sidebar').isHidden());
        const picker = page.getByRole('combobox', { name: 'Variable group', exact: true });
        await picker.selectOption({ label: 'Application - Staging' });
        assert.equal(await page.getByRole('textbox', { name: 'Variable group name', exact: true }).inputValue(), 'Application - Staging');
        await picker.selectOption({ label: 'Application - Production •' });
        assert.equal(await value('API_BASE_URL').inputValue(), 'https://api-v2.example.com', 'Group switching preserves unsaved changes');
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByRole('dialog').waitFor();
        const dialog = await page.getByRole('dialog').boundingBox();
        assert(dialog.x >= 0 && dialog.x + dialog.width <= width, 'Settings dialog fits the screen');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      }
      await screenshot(`editor-${width}.png`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('link', { name: 'Pipeline profiles', exact: true }).click();
    await page.locator('pipeline-list').waitFor();
    await page.getByRole('link', { name: 'Terraform plans', exact: true }).click();
    await page.locator('app-terraform-plan-viewer').waitFor();
    await page.getByRole('link', { name: 'Variable groups', exact: true }).click();
    await value('API_BASE_URL').waitFor();
    await page.getByRole('button', { name: 'Create new group', exact: true }).last().click();
    assert.equal(await page.getByRole('textbox', { name: 'Variable group name', exact: true }).inputValue(), 'New variable group');
    assert.equal(await page.locator('.variableNameInput').count(), 1);
    assert.equal(await page.locator('.row-badge.invalid').innerText(), 'Name required');
    await page.getByRole('textbox', { name: 'Name: new variable', exact: true }).fill('NEW_SETTING');
    await page.getByRole('textbox', { name: 'Name: NEW_SETTING', exact: true }).press('Tab');
    assert.equal(await page.locator('.row-badge.invalid').count(), 0);
    assert(await save.isEnabled(), 'New groups can be edited and saved');
    failReload = true;
    await page.getByRole('button', { name: 'Reload', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert(await page.getByRole('button', { name: 'Reload', exact: true }).isEnabled(), 'Reload can be retried after an error');
    failReload = false;
    await page.getByRole('button', { name: 'Reload', exact: true }).click();
    await page.getByText('Groups loaded', { exact: true }).waitFor();
    assert.equal(await page.getByRole('alert').count(), 0, 'Successful retry clears the error');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    assert.deepEqual(mutations, [], 'Inspection did not save to Azure DevOps');
    console.log(`UI checks passed. Screenshots: ${output}`);
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
