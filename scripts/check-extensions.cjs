const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium } = require('playwright');
const yaml = require('js-yaml');
const { loadPackage } = require('./public-extension-package.cjs');

// Exercise the production bundles through the real SDK's cross-frame protocol.
// All Azure DevOps API calls and extension data storage use isolated fixtures.
const root = path.resolve(__dirname, '..');
const host = 'https://extension-preview.invalid/contoso/';
const token = 'isolated-extension-fixture';
const publicIds = process.env.EXTENSION_ENV === 'public';
const plan = {
  parameters: [{ name: 'replicas', displayName: 'Instance count', type: 'number', default: 2 }],
  stages: [{ stage: 'Build' }, { stage: 'Deploy' }], resources: { repositories: [], pipelines: [] }
};
const profile = { name: 'Test release', pipelines: [{ pipelineId: '11', name: 'Platform\\Deploy web app', configurations: {
  branch: 'main', parameterValues: {}, variables: [], stagesToSkip: {}, resources: { repositories: {}, pipelines: {} }, enableDiag: false
} }] };
function fixturePage(kind, port) {
  return `<!doctype html><html><head><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;overflow:hidden}</style></head><body>
  <iframe id="extension" title="Azure DevOps extension"></iframe>
  <script>window.define=(_deps,factory)=>factory(null,window.xdm={});</script><script src="/xdm.js"></script><script>
  const kind=${JSON.stringify(kind)}, iframe=document.getElementById('extension');
  const source=${JSON.stringify(process.env[(kind === 'history' ? 'HISTORY' : 'PIPELINE') + '_EXTENSION_URL'] || '')} || 'http://localhost:${port}/'+kind+'/';
  window.calls=[];window.saved=[];
  const project={id:'project-1',name:'Platform'};
  const data={getValue:(key,options)=>{calls.push({method:'getValue',key,options});return [${JSON.stringify(profile)}]},
    setValue:(key,value,options)=>{saved.push({key,value,options});return value}};
  const services={
    'ms.vss-tfs-web.tfs-page-data-service':{getProject:()=>project},
    'ms.vss-features.location-service':{getServiceLocation:()=>${JSON.stringify(host)},getResourceAreaLocation:()=>${JSON.stringify(host)}},
    'ms.vss-features.extension-data-service':{getExtensionDataManager:(id)=>{calls.push({method:'getExtensionDataManager',id});return data}}
  };
  const channel=xdm.channelManager.addChannel(iframe.contentWindow,new URL(source).origin);
  channel.getObjectRegistry().register('DevOps.HostControl',{
    initialHandshake:()=>({context:{pageContext:{webContext:{project,collection:{id:'collection-1',name:'Contoso',uri:${JSON.stringify(host)}}}},
      extension:{id:(kind==='history'?'FreesonLi.ads-var-history':'FreesonLi.ads-pipeline-profiles')+${JSON.stringify(publicIds ? '' : '-dev')},publisherId:'FreesonLi'},
      user:{id:'user-1',displayName:'Fixture User'},host:{id:'collection-1',name:'Contoso',type:4,isHosted:true}},initialConfig:{},contributionId:kind+'.hub'}),
    notifyLoadSucceeded:()=>null, getAccessToken:()=>({token:${JSON.stringify(token)}}),resize:()=>null
  });
  channel.getObjectRegistry().register('DevOps.ServiceManager',{getService:(id)=>{
    if(!services[id])throw Error('Unexpected host service: '+id);return services[id]}});
  iframe.src=source;
  </script></body></html>`;
}

(async () => {
  const builds = { history: 'dist/azure-devops-variable-group-history-extension', pipeline: 'dist/azure-devops-pipeline-profiles' };
  const packages = {};
  for (const [kind, directory] of Object.entries(builds)) {
    if (publicIds) packages[kind] = await loadPackage(kind);
    else await fs.access(path.join(root, directory, 'index.html'));
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://fixture.invalid');
      if (url.pathname === '/host') {
        res.setHeader('content-type', 'text/html');res.end(fixturePage(url.searchParams.get('kind'), server.address().port));return;
      }
      let file, bytes;
      if (url.pathname === '/xdm.js') file = path.join(root, 'node_modules/azure-devops-extension-sdk/XDM.js');
      else {
        const [, kind, ...parts] = url.pathname.split('/');
        if (!builds[kind]) { res.writeHead(404);res.end();return; }
        const directory = path.resolve(root, builds[kind]);
        const asset = parts.join('/') || 'index.html';
        if (publicIds) {
          bytes = packages[kind].assets.get(asset);
          if (!bytes) { res.writeHead(404);res.end();return; }
        }
        file = path.resolve(directory, asset);
        if (!file.startsWith(directory + path.sep)) { res.writeHead(400);res.end();return; }
      }
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2' };
      res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
      res.end(bytes || await fs.readFile(file));
    } catch { res.writeHead(404);res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch();
    const output = path.join(os.tmpdir(), 'ado-integrated-extension-ui');await fs.mkdir(output, { recursive: true });
    for (const kind of Object.keys(builds)) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
      try {
        const unexpected = [], errors = [], requests = [];
        // Only the local application and explicitly mocked Azure DevOps APIs may load.
        await context.route('**/*', route => {
          const url = new URL(route.request().url());
          const override = process.env[(kind === 'history' ? 'HISTORY' : 'PIPELINE') + '_EXTENSION_URL'];
          if (['localhost', '127.0.0.1'].includes(url.hostname) || (override && url.origin === new URL(override).origin)) return route.continue();
          unexpected.push(route.request().url());return route.abort();
        });
        context.on('response', response => {
          if (response.status() >= 400) unexpected.push(`${response.status()} ${response.url()}`);
        });
        await context.route('https://extension-preview.invalid/**', async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.pathname.includes('/_build')) return route.fulfill({ contentType: 'text/html', body: '<html>Fixture build result</html>' });
          requests.push({ url: request.url(), method: request.method(), payload: request.postDataJSON() });
          assert.equal(request.headers().authorization, 'Bearer ' + token, 'API authentication comes from the SDK');
          if (url.pathname.endsWith('/variablegroups')) return route.fulfill({ json: [
            { id: 1, name: 'Application', type: 'Vsts', variables: { APP_ENV: { value: 'production' }, PASSWORD: { value: 'fixture-secret', isSecret: true } } },
            { id: 2, name: 'VariableGroupHistorySettings', type: 'Vsts', variables: { Branch: { value: 'main' }, Path: { value: '/groups/' }, Repository: { value: 'history' } } }
          ] });
          if (url.pathname.endsWith('/items')) return route.fulfill({ json: { variables: { APP_ENV: { desc: 'Environment' } } } });
          if (url.pathname.endsWith('/_apis/pipelines')) return route.fulfill({ json: { count: 1, value: [{ id: '11', name: 'Deploy web app', folder: '\\Platform' }] } });
          if (url.pathname.endsWith('/definitions/11')) return route.fulfill({ json: {
            id: '11', project: { id: 'project-1', name: 'Platform' }, process: { yamlFilename: 'azure-pipelines.yml' }, variables: {},
            repository: { id: 'repo-1', type: 'TfsGit', defaultBranch: 'refs/heads/main' }
          } });
          if (url.pathname.endsWith('/refs')) return route.fulfill({ json: { value: [{ name: 'refs/heads/main' }, { name: 'refs/heads/release' }] } });
          if (url.pathname.endsWith('/runs') && request.method() === 'POST') return route.fulfill({ json: request.postDataJSON().previewRun ? { finalYaml: yaml.dump(plan) } : { id: 123, name: '123' } });
          unexpected.push(request.url());return route.fulfill({ status: 500, json: { message: 'Unexpected fixture request' } });
        });
        const page = await context.newPage();page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/host?kind=${kind}`);
        const frame = page.frameLocator('#extension');
        if (kind === 'history') {
          await frame.getByRole('button', { name: /Application/ }).click();
          const value = frame.getByRole('textbox', { name: 'Value: APP_ENV', exact: true });
          assert.equal(await value.inputValue(), 'production');
          assert.equal(await frame.locator('[aria-label="Value: PASSWORD"]').getAttribute('type'), 'password');
          await value.fill('staging');await value.press('Tab');
          assert(await frame.getByRole('button', { name: 'Save changes', exact: true }).isEnabled());
          await frame.getByRole('button', { name: 'Undo: APP_ENV', exact: true }).click();
          assert.equal(await value.inputValue(), 'production');
          assert(await frame.getByRole('button', { name: 'Save changes', exact: true }).isDisabled());
        } else {
          await frame.getByRole('button', { name: /Test release/ }).click();
          await frame.locator('.pipeline-button').click();
          const count = frame.getByRole('spinbutton', { name: 'Instance count', exact: true });
          await count.waitFor();assert.equal(await count.inputValue(), '2');
          await count.fill('4');
          await frame.getByRole('button', { name: 'Save profile', exact: true }).click();
          await page.waitForFunction(() => window.saved.length > 0);
          const saved = await page.evaluate(() => window.saved[0]);
          assert.equal(saved.options.scopeType, 'User');assert.equal(saved.key, 'pipeline-profiles');
          assert.equal(saved.value[0].pipelines[0].configurations.parameterValues.replicas, 4);
          assert.equal((await page.evaluate(() => window.calls)).find(call => call.method === 'getExtensionDataManager').id, 'FreesonLi.ads-pipeline-profiles' + (publicIds ? '' : '-dev'));
          await frame.getByRole('button', { name: 'Run pipeline', exact: true }).click();
          for (let attempt = 0; attempt < 50 && !requests.some(r => r.method === 'POST' && r.payload?.previewRun === false); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
          assert(requests.some(r => r.method === 'POST' && r.payload?.previewRun === false), 'Queue request is distinct from preview');
        }
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.screenshot({ path: path.join(output, `${kind}-${width}.png`), animations: 'disabled' });
          const child = page.frames().find(frame => frame.parentFrame() === page.mainFrame());
          assert(await child.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Extension fits the viewport');
        }
        const child = page.frames().find(frame => frame.parentFrame() === page.mainFrame());
        assert(await child.evaluate(async () => {
          const text = await document.fonts.load('400 14px Roboto');
          const icons = await document.fonts.load('24px "Material Icons"');
          return text.length > 0 && icons.length > 0;
        }), 'Text and icon fonts load from packaged assets');
        assert.deepEqual(errors, []);assert.deepEqual(unexpected, []);
        console.log(`${kind}: SDK handshake, authenticated APIs, editing/storage, and responsive layout passed.`);
      } finally { await context.close(); }
    }
    console.log('Screenshots: ' + output);
  } finally { if (browser) await browser.close();await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error);process.exitCode = 1; });
