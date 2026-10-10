const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');

const baseUrl = process.env.UI_BASE_URL || 'http://localhost:4200';
const output = process.env.UI_SCREENSHOT_DIR || path.join(os.tmpdir(), 'azure-devops-pipeline-profiles-ui');
const host = 'https://ui-preview.invalid/contoso/platform';
const server = { host, pat: 'preview-only', repository: 'variable-history', branch: 'main', filePath: '/groups/' };
const alternate = { ...server, host: 'https://ui-preview.invalid/contoso/alternate' };
const pipelines = [
  { id: '11', name: 'Deploy web app', folder: '\\Platform' },
  { id: '12', name: 'Build web app', folder: '\\Platform' },
  { id: '13', name: 'Deploy infrastructure', folder: '\\Platform' }
];
const profilePipeline = (id, name) => ({ pipelineId: id, name, configurations: {
  branch: 'main', parameterValues: { region: 'eastus', environment: 'production', replicas: 2, deployInfra: true, settings: 'tier: standard\n' },
  variables: [], stagesToSkip: {}, resources: { repositories: {}, pipelines: {} }, enableDiag: false
} });
const profiles = [
  { name: 'Production release', pipelines: [profilePipeline('11', 'Platform\\Deploy web app'), profilePipeline('13', 'Platform\\Deploy infrastructure')] },
  { name: 'Staging release', pipelines: [profilePipeline('11', 'Platform\\Deploy web app')] },
  { name: 'Infrastructure', pipelines: [profilePipeline('13', 'Platform\\Deploy infrastructure')] }
];
const plan = {
  parameters: [
    { name: 'environment', displayName: 'Environment', type: 'string', default: 'production', values: ['development', 'staging', 'production'] },
    { name: 'region', displayName: 'Azure region', type: 'string', default: 'eastus' },
    { name: 'replicas', displayName: 'Instance count', type: 'number', default: 2 },
    { name: 'deployInfra', displayName: 'Deploy infrastructure', type: 'boolean', default: true },
    { name: 'settings', displayName: 'Deployment settings', type: 'object', default: { tier: 'standard' } }
  ],
  stages: [{ stage: 'Build', displayName: 'Build application' }, { stage: 'Deploy', displayName: 'Deploy production' }],
  resources: {
    repositories: [{ repository: 'templates', name: 'Contoso/pipeline-templates', ref: 'refs/heads/main' }],
    pipelines: [{ pipeline: 'build', source: 'Build web app', branch: 'refs/heads/main' }]
  }
};

async function checkGitHubBranches(browser, errors) {
  const connectionId = '18cbec3a-2a42-4f5f-8501-c9fd724d8bb5';
  const repository = 'FreesonLee/release-tools';
  const githubPipeline = { id: '21', name: 'Deploy GitHub app', folder: '\\GitHub' };
  const githubProfiles = [{ name: 'GitHub release', pipelines: [profilePipeline('21', 'GitHub\\Deploy GitHub app')] }];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    await context.addInitScript(({ server, profiles }) => {
      localStorage.setItem('servers', JSON.stringify([server]));
      localStorage.setItem('lastServer', server.host);
      localStorage.setItem(`profiles-${server.host}`, JSON.stringify(profiles));
    }, { server, profiles: githubProfiles });
    let failBranches = true;
    let responseShape = 'array';
    let missingConnection = false;
    let branchRequests = 0;
    let definitionRequests = 0;
    const unexpected = [];
    const previews = [];
    await context.route('https://ui-preview.invalid/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname.endsWith('/_apis/pipelines')) {
        return route.fulfill({ json: { count: 1, value: [githubPipeline] } });
      }
      if (request.method() === 'GET' && url.pathname.endsWith('/_apis/build/definitions/21')) {
        definitionRequests++;
        return route.fulfill({ json: {
          id: '21', project: { id: 'project-1', name: 'Platform' },
          repository: { id: repository, type: 'GitHub', defaultBranch: 'refs/heads/main', url: `https://github.com/${repository}`, properties: missingConnection ? {} : { connectedServiceId: connectionId } },
          process: { yamlFilename: 'azure-pipelines.yml' }, variables: { LOG_LEVEL: { value: 'info', allowOverride: true } }
        } });
      }
      if (request.method() === 'GET' && url.pathname.endsWith('/_apis/sourceProviders/GitHub/branches')) {
        branchRequests++;
        assert.equal(url.pathname, '/contoso/platform/_apis/sourceProviders/GitHub/branches');
        assert.equal(url.searchParams.get('serviceEndpointId'), connectionId);
        assert.equal(url.searchParams.get('repository'), repository);
        assert.equal(url.searchParams.get('api-version'), '7.1');
        assert(url.search.includes('FreesonLee%2Frelease-tools'), 'Repository identifier is URL-encoded');
        assert.equal(request.headers().authorization, 'Basic ' + Buffer.from('user:preview-only').toString('base64'), 'Use Azure DevOps credentials');
        if (failBranches) return route.fulfill({ status: 403, json: { message: 'Service connection access denied' } });
        const branches = ['main', 'refs/heads/feature/github-connection', 'release/2026'];
        return route.fulfill({ json: responseShape === 'array' ? branches : { count: branches.length, value: branches } });
      }
      if (request.method() === 'POST' && url.pathname.endsWith('/_apis/pipelines/21/runs')) {
        const payload = request.postDataJSON();
        assert.equal(payload.previewRun, true, 'Only preview this mocked GitHub pipeline');
        previews.push(payload);
        return route.fulfill({ json: { finalYaml: JSON.stringify({ ...plan, resources: {} }) } });
      }
      unexpected.push(request.method() + ' ' + request.url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const selectPipeline = async () => {
      await page.locator('.profile-button').filter({ hasText: 'GitHub release' }).click();
      await page.locator('.pipeline-button').filter({ hasText: 'Deploy GitHub app' }).click();
    };
    const waitForConfiguration = async () => {
      await page.getByRole('textbox', { name: 'Azure region', exact: true }).waitFor();
      assert(await page.getByRole('button', { name: 'Run pipeline', exact: true }).isEnabled());
    };
    const chooseBranch = async (query, branch) => {
      await page.getByRole('button', { name: /^Branch / }).click();
      await page.getByRole('combobox', { name: 'Source branch', exact: true }).fill(query);
      await page.getByRole('option', { name: branch, exact: true }).click();
      await waitForConfiguration();
    };
    await page.goto(`${baseUrl}/profiles`);
    await selectPipeline();
    await page.getByRole('alert').waitFor();
    assert((await page.getByRole('alert').innerText()).includes('GitHub service connection permissions'));
    assert.equal(branchRequests, 1);
    assert(await page.getByRole('button', { name: 'Run pipeline', exact: true }).isDisabled());

    failBranches = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await waitForConfiguration();
    assert.equal(branchRequests, 2, 'Retry fetches branches even when defaultBranch is already cached');
    assert.equal(definitionRequests, 2);
    assert.equal(await page.getByRole('alert').count(), 0);
    await chooseBranch('github', 'feature/github-connection');
    assert.equal(previews.at(-1).resources.repositories.self.refName, 'refs/heads/feature/github-connection');
    await page.locator('.pipeline-button').filter({ hasText: 'Deploy GitHub app' }).click();
    await waitForConfiguration();
    assert.equal(branchRequests, 2, 'Successful branch lists are cached');
    assert.equal(definitionRequests, 2);

    responseShape = 'wrapped';
    await page.getByRole('button', { name: 'Reload pipelines', exact: true }).click();
    await selectPipeline();
    await waitForConfiguration();
    assert.equal(branchRequests, 3);
    await chooseBranch('release', 'release/2026');
    assert.equal(previews.at(-1).resources.repositories.self.refName, 'refs/heads/release/2026');

    missingConnection = true;
    await page.getByRole('button', { name: 'Reload pipelines', exact: true }).click();
    await selectPipeline();
    await page.getByRole('alert').waitFor();
    assert((await page.getByRole('alert').innerText()).includes('no service connection ID'));
    assert.equal(branchRequests, 3, 'Do not send a request without a connection ID');
    assert.deepEqual(unexpected, [], 'No internal contribution endpoint or direct GitHub request was used');
  } finally {
    await context.close();
  }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const errors = [];
    const emptyContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const empty = await emptyContext.newPage();
    empty.on('pageerror', error => errors.push(error.message));
    await empty.goto(`${baseUrl}/profiles`);
    await empty.getByRole('heading', { name: 'Connect your Azure DevOps project' }).waitFor();
    assert(await empty.getByRole('button', { name: 'Reload pipelines', exact: true }).isDisabled());
    await empty.getByRole('button', { name: 'Settings', exact: true }).click();
    await empty.getByRole('dialog').waitFor();
    await empty.getByRole('button', { name: 'Cancel', exact: true }).click();
    await empty.screenshot({ path: path.join(output, 'connect-desktop.png'), animations: 'disabled' });
    await emptyContext.close();

    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(({ server, alternate, profiles }) => {
      localStorage.setItem('servers', JSON.stringify([server, alternate]));
      localStorage.setItem('lastServer', server.host);
      localStorage.setItem(`profiles-${server.host}`, JSON.stringify(profiles));
    }, { server, alternate, profiles });
    let failReload = false;
    const unexpected = [];
    const queued = [];
    await context.route('https://ui-preview.invalid/**', async route => {
      const request = route.request();
      const url = request.url();
      if (request.method() === 'GET') {
        if (/\/_apis\/pipelines$/.test(url)) return route.fulfill({ status: failReload ? 503 : 200, json: failReload ? {} : { count: pipelines.length, value: pipelines } });
        const definition = url.match(/\/_apis\/build\/definitions\/(\d+)/);
        if (definition) return route.fulfill({ json: {
          id: definition[1], project: { id: 'project-1', name: 'Platform' },
          repository: { id: 'repo-1', type: 'TfsGit', defaultBranch: 'refs/heads/main', url: `${host}/_apis/git/repositories/repo-1` },
          process: { yamlFilename: 'azure-pipelines.yml' },
          variables: { LOG_LEVEL: { value: 'info', allowOverride: true }, ARTIFACT_NAME: { value: 'web-app', allowOverride: false } }
        } });
        if (url.includes('/refs?')) return route.fulfill({ json: { value: [{ name: 'refs/heads/main' }, { name: 'refs/heads/release' }] } });
        if (url.includes('/build/definitions?')) return route.fulfill({ json: { value: [{ id: '12' }] } });
        if (url.includes('/build/builds?')) return route.fulfill({ json: { count: 1, value: [{ id: 200, definition: { id: '12' }, buildNumber: '2026.10.10.1', triggerInfo: { 'ci.message': 'Update release pipeline' } }] } });
      }
      if (request.method() === 'POST' && url.includes('/runs?')) {
        const payload = request.postDataJSON();
        if (payload.previewRun) return route.fulfill({ json: { finalYaml: JSON.stringify(plan) } });
        // This is a mock queue only; no real Azure DevOps pipelines are run.
        queued.push(payload);
        return route.fulfill({ json: { id: 999, name: '2026.10.10.2' } });
      }
      unexpected.push(request.method() + ' ' + url);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const profileButton = name => page.locator('.profile-button').filter({ hasText: name });
    const pipelineButton = name => page.locator('.pipeline-button').filter({ hasText: name });
    const screenshot = async name => {
      await page.evaluate(() => document.fonts.ready);
      await page.locator('mat-snack-bar-container').waitFor({ state: 'hidden' });
      await page.locator('.config-scroll').evaluateAll(elements => elements.forEach(element => { element.scrollTop = 0; }));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
    };
    const assertNoOverflow = async () => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page fits the viewport horizontally');
    };
    await page.goto(`${baseUrl}/profiles`);
    await profileButton('Production release').waitFor();
    await screenshot('profiles-desktop.png');
    await profileButton('Production release').click();
    await pipelineButton('Deploy web app').click();
    await page.getByRole('textbox', { name: 'Azure region', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Run pipeline', exact: true }).waitFor();
    const run = page.getByRole('button', { name: 'Run pipeline', exact: true });
    assert(await run.isEnabled());
    await assertNoOverflow();
    assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'Desktop workspace fits the viewport');
    await screenshot('configuration-desktop.png');
    await page.getByRole('button', { name: /^Branch / }).click();
    await page.getByRole('combobox', { name: 'Source branch', exact: true }).fill('release');
    await page.getByRole('option', { name: 'release', exact: true }).click();
    await page.getByRole('textbox', { name: 'Azure region', exact: true }).waitFor();
    assert(await page.getByRole('button', { name: /^Branch release/ }).isVisible());

    await page.getByRole('searchbox', { name: 'Find a profile', exact: true }).fill('staging');
    assert.equal(await page.locator('.profile-button').count(), 1);
    await page.getByRole('searchbox', { name: 'Find a profile', exact: true }).fill('');
    await page.getByRole('searchbox', { name: 'Find a pipeline in profile', exact: true }).fill('infrastructure');
    assert.equal(await page.locator('.pipeline-button').count(), 1);
    await page.getByRole('searchbox', { name: 'Find a pipeline in profile', exact: true }).fill('');
    await page.getByRole('textbox', { name: 'Azure region', exact: true }).fill('');
    assert(await run.isDisabled(), 'Required parameters control run availability');
    await page.getByRole('textbox', { name: 'Azure region', exact: true }).fill('westus2');
    await page.getByRole('combobox', { name: 'Environment', exact: true }).selectOption({ label: 'staging' });
    await page.getByRole('spinbutton', { name: 'Instance count', exact: true }).fill('3');
    await page.getByRole('checkbox', { name: 'Deploy infrastructure', exact: true }).uncheck();
    await page.getByRole('textbox', { name: 'Deployment settings', exact: true }).fill('tier: premium\n');

    await page.getByRole('button', { name: /^Variables / }).click();
    await page.getByRole('textbox', { name: 'Value: LOG_LEVEL', exact: true }).fill('debug');
    await page.getByRole('button', { name: 'Reset: LOG_LEVEL', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Value: LOG_LEVEL', exact: true }).inputValue(), 'info');
    await page.getByRole('button', { name: 'Add variable', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name: new variable', exact: true }).fill('RELEASE_LABEL');
    await page.getByRole('textbox', { name: 'Value: RELEASE_LABEL', exact: true }).fill('canary');
    await page.getByRole('button', { name: 'Multiline: RELEASE_LABEL', exact: true }).click();
    await page.getByRole('textbox', { name: 'Multiline value: RELEASE_LABEL', exact: true }).fill('first\nsecond');
    await page.getByRole('combobox', { name: 'Newline handling: RELEASE_LABEL', exact: true }).selectOption('|');
    assert.equal(await page.getByRole('textbox', { name: 'Multiline value: RELEASE_LABEL', exact: true }).inputValue(), 'first\nsecond');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    const multilineSaved = await page.evaluate(host => JSON.parse(localStorage.getItem(`profiles-${host}`)), host);
    assert.equal(multilineSaved[0].pipelines[0].configurations.variables.find(variable => variable.name === 'RELEASE_LABEL').value, 'first\nsecond');
    await page.getByRole('button', { name: 'Delete: RELEASE_LABEL', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Name: RELEASE_LABEL', exact: true }).count(), 0);

    await page.getByRole('button', { name: /^Stages to run / }).click();
    await page.getByRole('checkbox', { name: 'Deploy production', exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'Deploy production', exact: true }).uncheck();
    assert(!(await page.getByRole('checkbox', { name: 'Run all stages', exact: true }).isChecked()));
    await page.getByRole('button', { name: /^Resources / }).click();
    await page.locator('mat-snack-bar-container').waitFor({ state: 'hidden' });
    await page.getByRole('textbox', { name: 'Repository branch: templates', exact: true }).fill('release');
    await page.getByRole('textbox', { name: 'Build version: build', exact: true }).fill('main');
    await page.getByRole('textbox', { name: 'Build version: build', exact: true }).press('Tab');
    await page.getByRole('link', { name: '2026.10.10.1', exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'Enable diagnostics', exact: true }).check();
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    const saved = await page.evaluate(host => JSON.parse(localStorage.getItem(`profiles-${host}`)), host);
    const settings = saved[0].pipelines[0].configurations;
    assert.equal(settings.parameterValues.region, 'westus2');
    assert.equal(settings.parameterValues.environment, 'staging');
    assert.equal(settings.parameterValues.replicas, 3);
    assert.equal(settings.parameterValues.deployInfra, false);
    assert.equal(settings.parameterValues.settings, 'tier: premium\n');
    assert.equal(settings.stagesToSkip.Deploy, true);
    assert.equal(settings.resources.repositories.templates.selectedRef, 'release');
    await run.click();
    await page.getByText('New build run 2026.10.10.2 queued', { exact: true }).waitFor();
    assert.equal(queued.length, 1);
    assert.equal(queued[0].previewRun, false);
    assert.equal(queued[0].templateParameters.region, 'westus2');
    assert.deepEqual(queued[0].stagesToSkip, ['Deploy']);
    assert.equal(queued[0].variables['system.debug'].value, true);
    assert.equal(queued[0].resources.repositories.templates.refName, 'refs/heads/release');
    assert.equal(queued[0].resources.repositories.self.refName, 'refs/heads/release');
    assert.equal(queued[0].resources.pipelines.build.version, '2026.10.10.1');

    // Return to a compact view for responsive screenshot review.
    await page.getByRole('button', { name: /^Variables / }).click();
    await page.getByRole('button', { name: /^Stages to run / }).click();
    await page.getByRole('button', { name: /^Resources / }).click();
    for (const [width, height] of [[1024, 768], [768, 1000], [390, 844], [320, 750]]) {
      await page.setViewportSize({ width, height });
      await assertNoOverflow();
      if (width <= 900) {
        assert(await page.locator('.profiles-panel').isHidden());
        const picker = page.getByRole('combobox', { name: 'Choose profile', exact: true });
        await picker.selectOption({ label: 'Staging release' });
        const pipelinePicker = page.getByRole('combobox', { name: 'Choose profile pipeline', exact: true });
        await pipelinePicker.selectOption({ label: 'Platform\\Deploy web app' });
        await page.getByRole('textbox', { name: 'Azure region', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByRole('dialog').waitFor();
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      }
      await screenshot(`configuration-${width}.png`);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: /^Variables / }).click();
    assert.equal(await page.locator('.variable-table input[aria-label^="Name:"]').count(), 2, 'Switching pipelines repeatedly does not duplicate default variables');
    await page.getByRole('button', { name: /^Variables / }).click();
    page.once('dialog', dialog => dialog.accept('Review profile'));
    await page.getByRole('button', { name: 'New profile', exact: true }).first().click();
    await page.getByRole('button', { name: 'Add pipeline', exact: true }).last().click();
    const pipelineInput = page.getByRole('combobox', { name: 'Available pipeline', exact: true });
    await pipelineInput.fill('Deploy infrastructure');
    await page.getByRole('option', { name: 'Platform\\Deploy infrastructure', exact: true }).click();
    await page.getByRole('textbox', { name: 'Azure region', exact: true }).waitFor();
    assert(await run.isEnabled());
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    assert(await profileButton('Review profile').isVisible());
    await page.getByRole('button', { name: 'Delete pipeline', exact: true }).click();
    await page.locator('mat-snack-bar-container').filter({ hasText: 'from profile Review profile?' }).getByRole('button', { name: 'DELETE', exact: true }).click();
    assert.equal(await page.locator('.pipeline-button').count(), 0);
    await page.getByRole('button', { name: 'Delete profile', exact: true }).click();
    await page.locator('mat-snack-bar-container').filter({ hasText: 'delete profile Review profile and all builds?' }).getByRole('button', { name: 'DELETE', exact: true }).click();
    await profileButton('Review profile').waitFor({ state: 'hidden' });
    assert.equal(await profileButton('Review profile').count(), 0);

    await page.getByRole('combobox', { name: /^Server \/ project/ }).click();
    await page.getByRole('option', { name: alternate.host, exact: true }).click();
    await page.getByRole('heading', { name: 'Create your first profile' }).waitFor();
    assert.equal(await page.locator('.profile-button').count(), 0, 'Profiles are scoped to the selected server');
    failReload = true;
    await page.getByRole('button', { name: 'Reload pipelines', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert(await page.getByRole('button', { name: 'Reload pipelines', exact: true }).isEnabled());
    assert.deepEqual(unexpected, [], 'All requests used local fixtures');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    await context.close();
    await checkGitHubBranches(browser, errors);
    assert.deepEqual(errors, [], 'No uncaught browser errors, including GitHub branches');
    console.log(`Pipeline Profiles UI checks passed, including Azure Repos and GitHub branch listing. Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
