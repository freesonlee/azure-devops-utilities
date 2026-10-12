import JSZip from 'jszip';
import { ArtifactError, DEFAULT_LIMITS, PlanArtifactReader, RunArtifact, RunContext } from './plan-artifacts';

const context: RunContext = {
  collectionUrl: 'https://dev.azure.com/TestOrg/', projectId: 'project-1', projectName: 'Test Project',
  runId: 42, runName: '42', pipelineId: 7
};
const artifact = (id: number, name: string, type = 'Container'): RunArtifact => ({ id, name, resource: { type } });
const makeZip = async (files: Record<string, string>) => {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
};
const signal = () => new AbortController().signal;

function setup(artifacts: RunArtifact[], archives: Record<string, Uint8Array>, options: {
  signedStatus?: number; signedUrl?: string; bareList?: boolean; failArtifact?: string; headerSize?: number
} = {}) {
  const requests: { url: URL; headers: Headers; method: string }[] = [];
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, headers: new Headers(init?.headers), method: init?.method ?? 'GET' });
    const name = url.searchParams.get('artifactName') ?? '';
    if (url.hostname !== 'dev.azure.com') return new Response(archives[name] ?? Object.values(archives)[0]);
    if (url.pathname.includes('/pipelines/')) {
      if (options.signedStatus) return new Response('', { status: options.signedStatus });
      return Response.json({ signedContent: { url: options.signedUrl ?? `https://artifacts.example.invalid/content?artifactName=${encodeURIComponent(name)}` } });
    }
    if (!name) return Response.json(options.bareList ? artifacts : { value: artifacts });
    if (name === options.failArtifact) return new Response('', { status: 403 });
    return new Response(archives[name], { headers: options.headerSize ? { 'content-length': String(options.headerSize) } : {} });
  };
  return { requests, request, reader: new PlanArtifactReader(async () => 'fixture-sdk-token', request) };
}

describe('Pipeline run plan artifact discovery', () => {
  it('scans every artifact and nested folder while preserving duplicate basenames', async () => {
    const archives = {
      first: await makeZip({ 'first/env/main.plan.json': '{}', 'first/docs/readme.txt': 'not a plan', 'first/folder.plan.json/child.txt': 'directory' }),
      second: await makeZip({ 'second/main.plan.json': '{}', 'second/upper.PLAN.JSON': '{}' })
    };
    const test = setup([artifact(2, 'second'), artifact(1, 'first')], archives);
    const progress: number[] = [];
    const result = await test.reader.scan(context, signal(), value => progress.push(value.completed));
    expect(result.files.map(file => [file.artifactName, file.path])).toEqual([['first', 'env/main.plan.json'], ['second', 'main.plan.json']]);
    expect(new Set(result.files.map(file => file.id)).size).toBe(2);
    expect(result.issues).toEqual([]);expect(progress).toEqual([0, 1, 2]);
    expect(test.requests.every(request => request.method === 'GET')).toBeTrue();
    expect(test.requests.every(request => request.headers.get('authorization') === 'Bearer fixture-sdk-token')).toBeTrue();
  });

  it('reads matching content on selection without inflating unrelated entries', async () => {
    const test = setup([artifact(1, 'plans')], { plans: await makeZip({ 'plans/main.plan.json': '  {"format_version":"1"}', 'plans/large.txt': 'x'.repeat(100000) }) });
    const result = await test.reader.scan(context, signal(), () => undefined);
    const file = await result.files[0].read(signal());
    expect(file.text).toBe('  {"format_version":"1"}');expect(file.bytes).toBe(24);
  });

  it('accepts the SDK unwrapped artifact collection shape', async () => {
    const test = setup([artifact(1, 'plans')], { plans: await makeZip({ 'nested/test.plan.json': '{}' }) }, { bareList: true });
    expect((await test.reader.scan(context, signal(), () => undefined)).files.length).toBe(1);
  });

  it('uses signed Pipeline Artifact downloads without forwarding a bearer token', async () => {
    const test = setup([artifact(1, 'plans', 'PipelineArtifact')], { plans: await makeZip({ 'test.plan.json': '{}' }) });
    expect((await test.reader.scan(context, signal(), () => undefined)).files.length).toBe(1);
    const api = test.requests.find(request => request.url.pathname.includes('/pipelines/'))!;
    expect(api.url.searchParams.get('$expand')).toBe('signedContent');
    expect(api.headers.get('authorization')).toBe('Bearer fixture-sdk-token');
    expect(test.requests.find(request => request.url.hostname !== 'dev.azure.com')!.headers.has('authorization')).toBeFalse();
  });

  it('reacquires a signed URL once after an expired signature', async () => {
    const zip = await makeZip({ 'test.plan.json': '{}' });
    let metadataCalls = 0, downloadCalls = 0;
    const request: typeof fetch = async input => {
      const url = new URL(String(input));
      if (url.hostname !== 'dev.azure.com') return ++downloadCalls === 1 ? new Response('', { status: 403 }) : new Response(zip);
      if (url.pathname.includes('/pipelines/')) { metadataCalls++;return Response.json({ signedContent: { url: 'https://artifact.example.invalid/data' } }); }
      return Response.json({ value: [artifact(1, 'plans', 'PipelineArtifact')] });
    };
    const result = await new PlanArtifactReader(async () => 'token', request).scan(context, signal(), () => undefined);
    expect(result.files.length).toBe(1);expect(metadataCalls).toBe(2);expect(downloadCalls).toBe(2);
  });

  it('falls back to the Build ZIP API when the modern endpoint is unavailable', async () => {
    const test = setup([artifact(1, 'plans', 'PipelineArtifact')], { plans: await makeZip({ 'test.plan.json': '{}' }) }, { signedStatus: 404 });
    const result = await test.reader.scan(context, signal(), () => undefined);
    expect(result.files.length).toBe(1);expect(result.issues).toEqual([]);
    expect(test.requests.some(request => request.url.searchParams.get('$format') === 'zip')).toBeTrue();
  });

  it('rejects insecure signed downloads before requesting their contents', async () => {
    const test = setup([artifact(1, 'plans', 'PipelineArtifact')], {}, { signedUrl: 'http://artifact.example.invalid/content' });
    const result = await test.reader.scan(context, signal(), () => undefined);
    expect(result.files).toEqual([]);expect(result.issues[0].message).toContain('insecure');
    expect(test.requests.every(request => request.url.hostname === 'dev.azure.com')).toBeTrue();
  });

  it('continues when one artifact is denied', async () => {
    const test = setup([artifact(1, 'denied'), artifact(2, 'available')], { available: await makeZip({ 'test.plan.json': '{}' }) }, { failArtifact: 'denied' });
    const result = await test.reader.scan(context, signal(), () => undefined);
    expect(result.files.length).toBe(1);expect(result.issues).toEqual([{ artifactName: 'denied', message: 'You do not have permission to read this run or artifact.' }]);
  });

  it('reports unsupported file-share storage without losing hosted plans', async () => {
    const test = setup([artifact(1, 'share', 'FilePath'), artifact(2, 'plans')], { plans: await makeZip({ 'test.plan.json': '{}' }) });
    const result = await test.reader.scan(context, signal(), () => undefined);
    expect(result.files.length).toBe(1);expect(result.issues[0].artifactName).toBe('share');
    expect(test.requests.some(request => request.url.searchParams.get('artifactName') === 'share')).toBeFalse();
  });

  it('reports corrupt ZIPs as artifact errors and continues', async () => {
    const test = setup([artifact(1, 'broken'), artifact(2, 'plans')], { broken: new TextEncoder().encode('not a ZIP'), plans: await makeZip({ 'test.plan.json': '{}' }) });
    const result = await test.reader.scan(context, signal(), () => undefined);
    expect(result.files.length).toBe(1);expect(result.issues[0].message).toContain('not a readable ZIP');
  });

  it('distinguishes malformed artifact lists from successful empty scans', async () => {
    const reader = new PlanArtifactReader(async () => 'token', async () => Response.json({ unexpected: [] }));
    await expectAsync(reader.scan(context, signal(), () => undefined)).toBeRejectedWithError(ArtifactError, 'Azure DevOps returned an unexpected artifact list.');
    const empty = setup([], {});
    expect(await empty.reader.scan(context, signal(), () => undefined)).toEqual({ files: [], issues: [] });
  });

  it('enforces archive size even when content-length is absent', async () => {
    const test = setup([artifact(1, 'plans')], { plans: await makeZip({ 'test.plan.json': '{}' }) });
    const reader = new PlanArtifactReader(async () => 'token', test.request, { ...DEFAULT_LIMITS, archiveBytes: 1 });
    const result = await reader.scan(context, signal(), () => undefined);
    expect(result.files).toEqual([]);expect(result.issues[0].message).toContain('Download exceeds');
  });

  it('enforces a total scan download limit and reports incomplete discovery', async () => {
    const test = setup([artifact(1, 'plans')], { plans: await makeZip({ 'test.plan.json': '{}' }) });
    const reader = new PlanArtifactReader(async () => 'token', test.request, { ...DEFAULT_LIMITS, totalBytes: 1 });
    const result = await reader.scan(context, signal(), () => undefined);
    expect(result.files).toEqual([]);expect(result.issues[0].message).toContain('total download limit');
  });

  it('limits expanded plan size during decompression', async () => {
    const test = setup([artifact(1, 'plans')], { plans: await makeZip({ 'big.plan.json': 'x'.repeat(10000) }) });
    const reader = new PlanArtifactReader(async () => 'token', test.request, { ...DEFAULT_LIMITS, fileBytes: 16 });
    const result = await reader.scan(context, signal(), () => undefined);
    await expectAsync(result.files[0].read(signal())).toBeRejectedWithError(ArtifactError, 'Plan exceeds the 10 MiB expanded file limit. Publish a smaller plan.');
  });

  it('reports matching-file limits rather than silently truncating discovery', async () => {
    const test = setup([artifact(1, 'plans')], { plans: await makeZip({ 'a.plan.json': '{}', 'b.plan.json': '{}' }) });
    const reader = new PlanArtifactReader(async () => 'token', test.request, { ...DEFAULT_LIMITS, files: 1 });
    const result = await reader.scan(context, signal(), () => undefined);
    expect(result.files.length).toBe(1);expect(result.issues[0].message).toContain('Some matching files');
  });

  it('reports archive entry limits before extracting files', async () => {
    const test = setup([artifact(1, 'plans')], { plans: await makeZip({ 'a.plan.json': '{}', 'b.txt': 'data' }) });
    const reader = new PlanArtifactReader(async () => 'token', test.request, { ...DEFAULT_LIMITS, entries: 1 });
    const result = await reader.scan(context, signal(), () => undefined);
    expect(result.files).toEqual([]);expect(result.issues[0].message).toContain('entries');
  });

  it('cancels an in-flight scan instead of treating cancellation as an inaccessible artifact', async () => {
    const controller = new AbortController();let started = false;
    const request: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (!url.searchParams.has('artifactName')) return Response.json({ value: [artifact(1, 'plans')] });
      started = true;
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    };
    const scan = new PlanArtifactReader(async () => 'token', request).scan(context, controller.signal, () => undefined);
    while (!started) await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    await expectAsync(scan).toBeRejectedWith(jasmine.objectContaining({ name: 'AbortError' }));
  });

  it('does not expose credentials or URLs from network error messages', async () => {
    const reader = new PlanArtifactReader(async () => 'token', async () => { throw new TypeError('https://artifact.invalid/?sig=SECRET'); });
    try { await reader.scan(context, signal(), () => undefined);fail('Expected failure'); }
    catch (error) { expect((error as Error).message).not.toContain('SECRET');expect((error as Error).message).not.toContain('https:'); }
  });
});
