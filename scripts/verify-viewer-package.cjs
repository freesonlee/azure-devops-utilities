const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} failed (${code})`)));
  });
}

(async () => {
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'projects/terraform-plan-viewer/package.json'), 'utf8'));
  const tarball = path.join(root, 'dist/packages', `freesonlee-terraform-plan-viewer-angular-${metadata.version}.tgz`);
  await fs.access(tarball);
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'terraform-viewer-consumer-'));
  const src = path.join(output, 'src'); await fs.mkdir(src);
  const write = (name, text) => fs.writeFile(path.join(output, name), typeof text === 'string' ? text : JSON.stringify(text, null, 2) + '\n');
  await write('package.json', { name: 'terraform-viewer-external-consumer', private: true, scripts: { build: 'ng build consumer', server: 'ng run consumer:server', dev: 'ng serve consumer --host 127.0.0.1 --port 4202' }, dependencies: {
    '@freesonlee/terraform-plan-viewer-angular': `file:${tarball}`,
    ...Object.fromEntries(['animations', 'common', 'compiler', 'core', 'forms', 'platform-browser', 'platform-browser-dynamic', 'platform-server', 'router', 'cdk', 'material'].map(name => [`@angular/${name}`, '17.1.1'])), rxjs: '7.8.0', tslib: '^2.3.0', 'zone.js': '0.14.3'
  }, devDependencies: { '@angular-devkit/build-angular': '17.1.1', '@angular/cli': '17.1.1', '@angular/compiler-cli': '17.1.1', typescript: '5.3.3', '@types/node': '^20.0.0' } });
  await write('angular.json', { version: 1, projects: { consumer: { projectType: 'application', root: '', sourceRoot: 'src', architect: {
    build: { builder: '@angular-devkit/build-angular:browser', options: { outputPath: 'dist/browser', index: 'src/index.html', main: 'src/main.ts', polyfills: ['zone.js'], tsConfig: 'tsconfig.json', styles: ['node_modules/@freesonlee/terraform-plan-viewer-angular/theme.css'], optimization: true }, configurations: { development: { optimization: false, buildOptimizer: false } } },
    serve: { builder: '@angular-devkit/build-angular:dev-server', options: { buildTarget: 'consumer:build:development' } },
    server: { builder: '@angular-devkit/build-angular:server', options: { outputPath: 'dist/server', main: 'src/main.server.ts', tsConfig: 'tsconfig.server.json', optimization: true } }
  } } } });
  await write('tsconfig.json', { compilerOptions: { target: 'ES2022', module: 'ES2022', moduleResolution: 'node', experimentalDecorators: true, useDefineForClassFields: false, strict: true, skipLibCheck: false, resolveJsonModule: true, esModuleInterop: true, lib: ['ES2022', 'dom'], types: [] }, angularCompilerOptions: { strictTemplates: true }, files: ['src/main.ts'] });
  await write('tsconfig.server.json', { extends: './tsconfig.json', compilerOptions: { types: ['node'] }, files: ['src/main.server.ts'] });
  await write('src/index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="/"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><app-root></app-root></body></html>');
  await fs.copyFile(path.join(root, 'examples/terraform-plan-viewer/plan.json'), path.join(src, 'plan.json'));
  await fs.copyFile(path.join(root, 'examples/terraform-plan-viewer/cdktf.json'), path.join(src, 'cdktf.json'));
  await write('src/demo.ts', `import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TerraformPlanViewerComponent, TerraformPlan, CdktfMetadata, ResourceChange, TerraformViewerOptions} from '@freesonlee/terraform-plan-viewer-angular';
import data from './plan.json'; import metadata from './cdktf.json';
function freeze(value:any):any {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
@Component({selector:'app-root',standalone:true,imports:[CommonModule,TerraformPlanViewerComponent],template:\`
<header><button (click)="first=null">Clear first</button><button (click)="first=original">Restore first</button><button (click)="replace()">Replace first</button><button (click)="cdktf=cdktf ? null : metadata">Toggle CDKTF</button><button (click)="options={allowSensitiveReveal:false}">Disable reveal</button><button (click)="invalid()">Invalid input</button><button (click)="large()">Large plan</button>
<output id="untouched">{{untouched()}}</output><output id="selected1">{{selected1}}</output><output id="selected2">{{selected2}}</output><output id="error">{{error}}</output></header>
<div class="viewers"><section id="first"><tf-plan-viewer [plan]="first" [cdktfMetadata]="cdktf" [options]="options" (resourceSelected)="selected1=$event?.address || 'none'" (error)="error=$event.code" /></section>
<section id="second"><tf-plan-viewer [plan]="original" (resourceSelected)="selected2=$event?.address || 'none'" /></section></div>
\`,styles:[\`header{display:flex;flex-wrap:wrap;gap:8px;padding:12px;background:#fafafa}button{padding:8px}output{padding:8px;font:12px monospace}.viewers{display:flex;gap:12px;align-items:flex-start}section{width:640px;max-width:100%;min-width:0;border:1px solid #ddd;max-height:850px;overflow:auto}body{margin:0}@media(max-width:900px){.viewers{display:block}section{margin-bottom:20px}}\`]})
export class DemoComponent {
original=freeze(data) as TerraformPlan; first:TerraformPlan|null=this.original; metadata=metadata as unknown as CdktfMetadata; cdktf:CdktfMetadata|null=null;
options:TerraformViewerOptions={}; selected1='none';selected2='none';error='';snapshot=JSON.stringify(this.original);
untouched(){return String(JSON.stringify(this.original)===this.snapshot)}
replace(){this.first={...this.original,resource_changes:[{...this.original.resource_changes[0],address:'null_resource.replacement',type:'null_resource',name:'replacement'}]};}
invalid(){this.first={resource_changes:'bad'} as unknown as TerraformPlan;}
large(){this.cdktf=null;this.first={...this.original,resource_changes:Array.from({length:1000},(_,i)=>({...this.original.resource_changes[0],address:'null_resource.large_'+i,type:'null_resource',name:'large_'+i}))};}
}`);
  await write('src/module-demo.ts', `import {Component,NgModule} from '@angular/core';import {BrowserModule} from '@angular/platform-browser';import {NoopAnimationsModule} from '@angular/platform-browser/animations';import {TerraformPlanViewerComponent,TerraformPlan} from '@freesonlee/terraform-plan-viewer-angular';import data from './plan.json';
@Component({selector:'app-root',template:'<tf-plan-viewer [plan]="plan" />'})export class ModuleDemoComponent{plan=data as TerraformPlan;}
@NgModule({declarations:[ModuleDemoComponent],imports:[BrowserModule.withServerTransition({appId:'viewer-test'}),NoopAnimationsModule,TerraformPlanViewerComponent],bootstrap:[ModuleDemoComponent]})export class DemoModule{}`);
  await write('src/main.ts', `import {bootstrapApplication} from '@angular/platform-browser';import {provideNoopAnimations} from '@angular/platform-browser/animations';import {DemoComponent} from './demo';bootstrapApplication(DemoComponent,{providers:[provideNoopAnimations()]}).catch(console.error);`);
  await write('src/main.module.ts', `import {platformBrowserDynamic} from '@angular/platform-browser-dynamic';import {DemoModule} from './module-demo';platformBrowserDynamic().bootstrapModule(DemoModule).catch(console.error);`);
  await write('src/main.server.ts', `import 'zone.js/node';import {NgModule} from '@angular/core';import {renderModule,ServerModule} from '@angular/platform-server';import {DemoModule,ModuleDemoComponent} from './module-demo';@NgModule({imports:[DemoModule,ServerModule],bootstrap:[ModuleDemoComponent]})export class ServerDemoModule{};export function render(){return renderModule(ServerDemoModule,{document:'<!doctype html><html><body><app-root></app-root></body></html>',url:'http://localhost/'});}`);
  console.log('Independent consumer: ' + output);
  await run('npm', ['install', '--no-audit', '--no-fund'], output);
  await run('npm', ['run', 'build'], output);
  await run('npm', ['run', 'server'], output);
  await write('render-ssr.cjs', `const assert=require('node:assert/strict');require('./dist/server/main.js').render().then(html=>{assert(html.includes('Plan Overview'));assert(!html.includes('SYNTHETIC_AFTER_SECRET'));console.log('SSR passed without browser globals or HttpClient providers.');}).catch(error=>{console.error(error);process.exitCode=1});`);
  await run('node', ['render-ssr.cjs'], output);
  const dev = spawn('npm', ['run', 'dev'], { cwd: output, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const browser = await chromium.launch();
  try {
    let logs = '';dev.stdout.on('data', chunk => { logs += chunk; });dev.stderr.on('data', chunk => { logs += chunk; });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];page.on('pageerror', error => errors.push(error.message));
    const network = [];page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4202/')) network.push(request.url()); });
    const deadline = Date.now() + 90000;
    while (true) {
      try { await page.goto('http://127.0.0.1:4202/', { timeout: 5000 });break; }
      catch (error) { if (Date.now() > deadline) throw new Error(logs + '\n' + error.message);await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    const first = page.locator('#first');const second = page.locator('#second');
    await first.getByText('Plan Overview', { exact: true }).waitFor();
    const open = async locator => { if (await locator.getAttribute('aria-expanded') !== 'true') await locator.click(); };
    await open(first.locator('mat-expansion-panel-header').filter({ hasText: 'Root Module' }).first());
    await open(first.locator('mat-expansion-panel-header').filter({ hasText: 'Azurerm Resource Group' }).first());
    const row = first.locator('.resource-item').filter({ hasText: 'azurerm_resource_group.platform' }).first();
    await row.focus(); await row.press('Enter');
    await page.waitForFunction(() => document.querySelector('#selected1').textContent === 'azurerm_resource_group.platform');
    assert.equal(await page.locator('#selected2').innerText(), 'none');
    assert.equal(await page.locator('#untouched').innerText(), 'true');
    await open(first.locator('.right-panel mat-expansion-panel-header').filter({ hasText: 'connection_string' }).first());
    assert(!(await first.innerText()).includes('SYNTHETIC_AFTER_SECRET'), 'Sensitive values stay masked');
    assert.equal(await first.locator('.right-panel').evaluate(element => getComputedStyle(element).position), 'static', 'Embedded details stay inside the host');
    await page.getByRole('button', { name: 'Disable reveal', exact: true }).click();
    assert(await first.locator('.sensitive-toggle-btn').first().isDisabled());
    await page.screenshot({ path: path.join(output, 'two-viewers.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Replace first', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#selected1').textContent === 'none');
    assert((await first.innerText()).includes('Null Resource'));
    assert(!(await first.innerText()).includes('SYNTHETIC_AFTER_SECRET'));
    await page.getByRole('button', { name: 'Clear first', exact: true }).click();
    await first.getByText('No plan supplied.', { exact: true }).waitFor();
    assert(await second.getByText('Plan Overview', { exact: true }).isVisible());
    await page.getByRole('button', { name: 'Invalid input', exact: true }).click();
    await first.getByRole('alert').waitFor();
    await page.waitForFunction(() => document.querySelector('#error').textContent === 'invalid-plan');
    await page.getByRole('button', { name: 'Restore first', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle CDKTF', exact: true }).click();
    await first.locator('.construct-view-container').first().waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No document overflow at phone width');
    await page.screenshot({ path: path.join(output, 'mobile.png'), animations: 'disabled' });
    assert.equal(await page.locator('#untouched').innerText(), 'true');
    await page.setViewportSize({ width: 1440, height: 1000 });
    const started = Date.now();
    await page.getByRole('button', { name: 'Large plan', exact: true }).click();
    await first.locator('.resource-item').filter({ hasText: 'null_resource.large_999' }).first().waitFor({ state: 'attached' });
    console.log('1,000-resource input rendered in ' + (Date.now() - started) + ' ms (local development build; no virtualization).');
    assert.deepEqual(errors, [], 'No browser errors');assert.deepEqual(network, [], 'No external fonts, icons, APIs, or backend requests');
    console.log('Independent standalone consumer passed: frozen JSON, two viewers, selection/reset, masking, CDKTF, and container layout.');
  } finally {
    await browser.close();
    try { process.kill(-dev.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  await write('tsconfig.module.json', { extends: './tsconfig.json', files: ['src/main.module.ts'] });
  await run('npm', ['run', 'build', '--', '--main=src/main.module.ts', '--ts-config=tsconfig.module.json', '--output-path=dist/module'], output);
  console.log('NgModule consumer build passed. Artifact and screenshots: ' + output);
})().catch(error => { console.error(error);process.exitCode = 1; });
