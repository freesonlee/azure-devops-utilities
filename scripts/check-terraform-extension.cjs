const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const JSZip = require('jszip');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'dist/azure-devops-terraform-plan-viewer-extension');
const origin = 'https://run-preview.invalid/TestOrg/';
const sdkToken = 'synthetic-run-token';
const plan = name => ({ format_version: '1.2', terraform_version: '1.9.8', variables: {},
  resource_changes: [{ address: 'null_resource.' + name, type: 'null_resource', name, mode: 'managed', provider_name: 'registry.terraform.io/hashicorp/null',
    change: { actions: ['create'], before: null, after: { id: 'synthetic-id', triggers: { value: name, secret: 'MOCK_MARKED_SECRET' } }, after_sensitive: { triggers: { secret: true } } } }],
  planned_values: { outputs: {}, root_module: { resources: [] } }, output_changes: {}
});
async function zip(files) {
  const archive = new JSZip();for (const [name, content] of Object.entries(files)) archive.file(name, content);
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
function hostPage(port, config) {
  const source = process.env.TERRAFORM_EXTENSION_URL || `http://localhost:${port}/extension/`;
  return `<!doctype html><html><head><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;overflow:hidden}</style></head><body>
  <iframe id="extension" title="Terraform Plans run tab"></iframe>
  <script>window.define=(_dependencies,factory)=>factory(null,window.xdm={});</script><script src="/xdm.js"></script><script>
  const config=${JSON.stringify(config)},iframe=document.getElementById('extension');window.currentRun=config.runId;window.calls=[];
  const project={id:config.projectId,name:config.projectName};
  const services={
    'ms.vss-tfs-web.tfs-page-data-service':{getProject:()=>project},
    'ms.vss-build-web.build-page-data-service':{getBuildPageData:()=>({build:{id:window.currentRun},definition:{id:config.pipelineId}})},
    'ms.vss-features.location-service':{getServiceLocation:()=>config.collectionUrl}
  };
  const channel=xdm.channelManager.addChannel(iframe.contentWindow,new URL(${JSON.stringify(source)}).origin);
  channel.getObjectRegistry().register('DevOps.HostControl',{
    initialHandshake:()=>({context:{pageContext:{webContext:{project,collection:{id:'org-1',name:'TestOrg',uri:config.collectionUrl}}},
      extension:{id:'FreesonLi.ads-terraform-plan-viewer' + ${JSON.stringify(process.env.EXTENSION_ENV === 'public' ? '' : '-dev')},publisherId:'FreesonLi'},user:{id:'user-1',displayName:'Fixture User'},
      host:{id:'org-1',name:'TestOrg',type:4,isHosted:true}},initialConfig:{},contributionId:'fl.terraform-plans.run-tab'}),
    notifyLoadSucceeded:()=>null,getAccessToken:()=>({token:config.token}),resize:()=>null
  });
  channel.getObjectRegistry().register('DevOps.ServiceManager',{getService:(id)=>{calls.push(id);if(!services[id])throw Error('Unexpected host service');return services[id]}});
  iframe.src=${JSON.stringify(source)};
  </script></body></html>`;
}

(async () => {
  await fs.access(path.join(directory, 'index.html'));
  const configs = { fixture: { collectionUrl: origin, projectId: 'project-1', projectName: 'Test Project', runId: 42, pipelineId: 7, token: sdkToken } };
  const liveUrl = process.env.TERRAFORM_LIVE_RUN_URL;
  if (liveUrl) {
    const url = new URL(liveUrl), parts = url.pathname.split('/').filter(Boolean);
    assert(url.protocol === 'https:' && url.hostname === 'dev.azure.com' && parts.length >= 4, 'Use an Azure DevOps Services run URL');
    const runId = Number(url.searchParams.get('buildId'));assert(Number.isSafeInteger(runId) && runId > 0, 'Run URL must have buildId');
    const result = spawnSync('az', ['account', 'get-access-token', '--resource', '499b84ac-1321-427f-aa17-267ca6975798', '--query', 'accessToken', '-o', 'tsv'], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Microsoft Entra sign-in is required for the optional live check.');
    const token = result.stdout.trim();
    const collectionUrl = `https://dev.azure.com/${parts[0]}/`;
    const response = await fetch(`${collectionUrl}${parts[1]}/_apis/build/builds/${runId}?api-version=7.1`, { headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) throw new Error('Could not read the requested live run.');
    const build = await response.json();
    configs.live = { collectionUrl, projectId: build.project.id, projectName: build.project.name, runId, pipelineId: build.definition.id, token };
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://fixture.invalid');
      if (url.pathname === '/host') {
        const config = configs[url.searchParams.get('mode') || 'fixture'];
        if (!config) { res.writeHead(404);res.end();return; }
        res.setHeader('content-type', 'text/html');res.end(hostPage(server.address().port, config));return;
      }
      let file;
      if (url.pathname === '/xdm.js') file = path.join(root, 'node_modules/azure-devops-extension-sdk/XDM.js');
      else {
        if (!url.pathname.startsWith('/extension/')) { res.writeHead(404);res.end();return; }
        file = path.resolve(directory, url.pathname.slice('/extension/'.length) || 'index.html');
        if (!file.startsWith(directory + path.sep)) { res.writeHead(400);res.end();return; }
      }
      res.setHeader('content-type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404);res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch();
    const output = path.join(os.tmpdir(), 'ado-terraform-run-extension');await fs.mkdir(output, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
    try {
      const requests = [], errors = [], unexpected = [];
      const archives = {
        'a-classic': await zip({ 'a-classic/nested/same.plan.json': JSON.stringify(plan('classic')), 'a-classic/readme.txt': 'Ignore this file' }),
        'b-modern': await zip({ 'b-modern/same.plan.json': '\uFEFF' + JSON.stringify(plan('modern')), 'b-modern/broken.plan.json': 'MOCK_JSON_SECRET invalid JSON',
          'b-modern/invalid.plan.json': '{}', 'b-modern/null.plan.json': 'null' })
      };
      let denyList = false, delayedDownload = false;
      await context.route('https://run-preview.invalid/**', async route => {
        const request = route.request(), url = new URL(request.url());
        requests.push({ url: request.url(), method: request.method(), headers: request.headers() });
        assert.equal(request.method(), 'GET');assert.equal(request.headers().authorization, 'Bearer ' + sdkToken);
        const id = url.pathname.match(/builds\/(\d+)/)?.[1];
        if (url.pathname.endsWith('/builds/' + id)) return route.fulfill({ json: { buildNumber: id === '42' ? 'FIXTURE_RUN' : 'NEXT_RUN', definition: { id: 7 } } });
        if (url.pathname.includes('/pipelines/')) return route.fulfill({ json: { signedContent: { url: 'https://plan-download.invalid/content.zip' } } });
        const name = url.searchParams.get('artifactName');
        if (!name) {
          if (denyList) return route.fulfill({ status: 403, json: {} });
          return route.fulfill({ json: { value: id === '43' ? [] : [
            { id: 1, name: 'a-classic', resource: { type: 'Container' } }, { id: 2, name: 'b-modern', resource: { type: 'PipelineArtifact' } },
            { id: 3, name: 'denied-artifact', resource: { type: 'Container' } }, { id: 4, name: 'network-share', resource: { type: 'FilePath' } }
          ] } });
        }
        if (name === 'denied-artifact') return route.fulfill({ status: 403, json: {} });
        if (!archives[name]) { unexpected.push(name);return route.fulfill({ status: 404, json: {} }); }
        if (delayedDownload) await new Promise(resolve => setTimeout(resolve, 800));
        return route.fulfill({ body: archives[name], contentType: 'application/zip' });
      });
      await context.route('https://plan-download.invalid/**', async route => {
        assert.equal(route.request().headers().authorization, undefined, 'Signed URLs receive no SDK bearer token');
        if (delayedDownload) await new Promise(resolve => setTimeout(resolve, 800));
        await route.fulfill({ body: archives['b-modern'], contentType: 'application/zip' });
      });
      const page = await context.newPage();page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/host`);
      const frame = page.frameLocator('#extension');
      await frame.getByText('FIXTURE_RUN', { exact: false }).waitFor();
      await frame.getByText('Plan Overview', { exact: true }).waitFor();
      assert.equal(await frame.locator('.file-tabs [role=tab]').count(), 5);
      await frame.getByText('Some artifacts could not be fully scanned', { exact: true }).waitFor();
      assert((await frame.locator('body').innerText()).includes('denied-artifact'));
      const classic = frame.getByRole('tab', { name: 'same.plan.json in a-classic, nested/same.plan.json', exact: true });
      const modern = frame.getByRole('tab', { name: 'same.plan.json in b-modern, same.plan.json', exact: true });
      assert.equal(await classic.getAttribute('aria-selected'), 'true');
      await modern.click();await frame.getByText('Plan Overview', { exact: true }).waitFor();
      assert.equal(await modern.getAttribute('aria-selected'), 'true');
      assert(!(await frame.locator('body').innerText()).includes('MOCK_MARKED_SECRET'));
      const broken = frame.getByRole('tab', { name: 'broken.plan.json in b-modern, broken.plan.json', exact: true });
      await broken.click();await frame.getByText('This file is not valid JSON.', { exact: false }).waitFor();
      assert(!(await frame.locator('body').innerText()).includes('MOCK_JSON_SECRET'));
      await frame.getByRole('tab', { name: 'invalid.plan.json in b-modern, invalid.plan.json', exact: true }).click();
      await frame.getByText('The plan must include format_version and terraform_version strings.', { exact: true }).waitFor();
      await frame.getByRole('tab', { name: 'null.plan.json in b-modern, null.plan.json', exact: true }).click();
      await frame.getByText('A Terraform plan must be a JSON object.', { exact: true }).waitFor();
      await modern.click();await frame.getByText('Plan Overview', { exact: true }).waitFor();
      await modern.press('Home');assert.equal(await classic.getAttribute('aria-selected'), 'true');
      for (const width of [1440, 1024, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        const child = page.frames().find(frame => frame.parentFrame() === page.mainFrame());
        assert(await child.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Run tab fits the iframe viewport');
        await page.screenshot({ path: path.join(output, `run-tab-${width}.png`), animations: 'disabled' });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await modern.click();
      await frame.getByRole('button', { name: 'Refresh', exact: true }).click();
      await frame.getByText('Plan Overview', { exact: true }).waitFor();
      assert.equal(await modern.getAttribute('aria-selected'), 'true', 'Refresh preserves the selected file');
      delayedDownload = true;
      await frame.getByRole('button', { name: 'Refresh', exact: true }).click();
      await frame.getByRole('button', { name: 'Cancel scan', exact: true }).click();
      await frame.getByText('Artifact scan cancelled. Refresh to try again.', { exact: true }).waitFor();
      delayedDownload = false;denyList = true;
      await frame.getByRole('button', { name: 'Refresh', exact: true }).click();
      await frame.getByText('You do not have permission to read this run or artifact.', { exact: true }).waitFor();
      denyList = false;
      await frame.getByRole('button', { name: 'Refresh', exact: true }).click();
      await frame.getByText('Plan Overview', { exact: true }).waitFor();
      await page.evaluate(() => window.currentRun = 43);
      await frame.getByText('NEXT_RUN', { exact: false }).waitFor();
      await frame.getByText('No Terraform plan files found', { exact: true }).waitFor();
      assert.equal(await frame.locator('.file-tabs [role=tab]').count(), 0);
      assert.deepEqual(unexpected, []);assert.deepEqual(errors, []);
      const child = page.frames().find(frame => frame.parentFrame() === page.mainFrame());
      assert.equal(await child.evaluate(() => localStorage.length), 0);
      console.log('Terraform run extension: SDK context, both artifact types, nested/duplicate file tabs, JSON errors, masking, keyboard navigation, refresh/cancellation, run changes, and responsive layout passed.');
      console.log('Synthetic screenshots: ' + output);
    } finally { await context.close(); }

    if (configs.live) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
      try {
        const page = await context.newPage();
        const errors = [];page.on('pageerror', () => errors.push('Browser runtime error'));
        await page.goto(`http://127.0.0.1:${server.address().port}/host?mode=live`);
        const frame = page.frameLocator('#extension');
        await frame.getByText('Plan Overview', { exact: true }).waitFor({ timeout: 90000 });
        const count = await frame.locator('.file-tabs [role=tab]').count();
        if (!count || errors.length) throw new Error('Live run did not render its plan successfully.');
        console.log(`Live browser transport and viewer passed for run ${configs.live.runId}: ${count} matching plan file(s). No live plan content or screenshots were saved.`);
      } finally { await context.close(); }
    }
  } finally { if (browser) await browser.close();await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error);process.exitCode = 1; });
