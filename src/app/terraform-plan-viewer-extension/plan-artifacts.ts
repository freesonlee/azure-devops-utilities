import JSZip, { JSZipObject, JSZipStreamHelper } from 'jszip';

// JSZip documents this streaming API, but its bundled 3.1 declarations omit it.
interface StreamedZipEntry extends JSZipObject { internalStream(type: 'uint8array'): JSZipStreamHelper<Uint8Array>; }

export interface RunContext {
  collectionUrl: string;
  projectId: string;
  projectName: string;
  runId: number;
  runName: string;
  pipelineId?: number;
}
export interface RunArtifact {
  id: number;
  name: string;
  resource: { type: string; properties?: Record<string, string> };
}
export interface PlanFile {
  id: string;
  artifactName: string;
  path: string;
  name: string;
  read: (signal: AbortSignal) => Promise<{ text: string; bytes: number }>;
}
export interface ArtifactIssue { artifactName: string; message: string; }
export interface ScanProgress { completed: number; total: number; }
export interface ScanResult { files: PlanFile[]; issues: ArtifactIssue[]; }
export interface ArtifactLimits { archiveBytes: number; totalBytes: number; fileBytes: number; entries: number; files: number; }
export const DEFAULT_LIMITS: ArtifactLimits = {
  archiveBytes: 64 * 1024 * 1024, totalBytes: 128 * 1024 * 1024,
  fileBytes: 10 * 1024 * 1024, entries: 20000, files: 200
};
export class ArtifactError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}
export function aborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Request cancelled.', 'AbortError');
}
export function errorMessage(error: unknown): string {
  return error instanceof ArtifactError ? error.message : 'Could not read this artifact. Check your connection and try again.';
}
function endpoint(context: RunContext, route: string, query: Record<string, string> = {}): string {
  const base = new URL(context.collectionUrl.endsWith('/') ? context.collectionUrl : context.collectionUrl + '/');
  if (base.protocol !== 'https:') throw new ArtifactError('This extension requires a secure Azure DevOps organization URL.');
  const url = new URL(`${encodeURIComponent(context.projectId)}/_apis/${route}`, base);
  url.search = new URLSearchParams({ ...query, 'api-version': '7.1' }).toString();
  return url.href;
}

/** A read-only artifact transport. Bearer tokens are only sent to constructed organization API URLs. */
export class PlanArtifactReader {
  constructor(private readonly accessToken: () => Promise<string>, private readonly request: typeof fetch = (input, init) => fetch(input, init),
    readonly limits: ArtifactLimits = DEFAULT_LIMITS) {}

  private async bytes(url: string, accept: string, authenticated: boolean, signal: AbortSignal, limit: number,
    reserve: (bytes: number) => void = () => undefined): Promise<Uint8Array> {
    aborted(signal);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, 90000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const headers: Record<string, string> = { Accept: accept };
      if (authenticated) headers['Authorization'] = 'Bearer ' + await this.accessToken();
      aborted(signal);
      const response = await this.request(url, { headers, signal: controller.signal, credentials: 'omit', redirect: 'follow' });
      if (!response.ok) {
        const messages: Record<number, string> = {
          401: 'Your Azure DevOps session expired. Refresh the run and try again.',
          403: 'You do not have permission to read this run or artifact.',
          404: 'This run or artifact is no longer available. It may have been removed by retention.'
        };
        throw new ArtifactError(messages[response.status] ?? 'Azure DevOps could not download this artifact. Try again.', response.status);
      }
      const size = Number(response.headers.get('content-length'));
      if (size > limit) throw new ArtifactError(`Download exceeds the ${Math.round(limit / 1024 / 1024)} MiB browser limit.`);
      if (!response.body) throw new ArtifactError('Azure DevOps returned an empty download.');
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        aborted(signal);
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > limit) throw new ArtifactError(`Download exceeds the ${Math.round(limit / 1024 / 1024)} MiB browser limit.`);
        reserve(chunk.value.byteLength);
        chunks.push(chunk.value);
      }
      const result = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      return result;
    } catch (error) {
      aborted(signal);
      if (controller.signal.aborted) throw new ArtifactError('Artifact download timed out. Try again.');
      if (error instanceof ArtifactError) throw error;
      throw new ArtifactError('Could not download this artifact in the browser. Check your connection and try again.');
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      await reader?.cancel().catch(() => undefined);
      controller.abort();
    }
  }

  async json(context: RunContext, route: string, query: Record<string, string>, signal: AbortSignal): Promise<unknown> {
    const data = await this.bytes(endpoint(context, route, query), 'application/json', true, signal, 4 * 1024 * 1024);
    try { return JSON.parse(new TextDecoder().decode(data)); }
    catch { throw new ArtifactError('Azure DevOps returned an unexpected artifact response.'); }
  }

  private async archive(context: RunContext, artifact: RunArtifact, signal: AbortSignal, reserve: (bytes: number) => void): Promise<Uint8Array> {
    // Pipeline artifacts can be downloaded through a short-lived signed URL without forwarding the SDK token.
    if (artifact.resource.type.toLowerCase() === 'pipelineartifact' && context.pipelineId) {
      let signed: { signedContent?: { url?: string } } | undefined;
      try {
        signed = await this.json(context, `pipelines/${context.pipelineId}/runs/${context.runId}/artifacts`,
          { artifactName: artifact.name, '$expand': 'signedContent' }, signal) as typeof signed;
      } catch (error) {
        aborted(signal);
        // Older runs/services may not expose the Pipelines artifact endpoint. The Build ZIP API remains the fallback.
        if (!(error instanceof ArtifactError) || ![400, 404, 405, 501].includes(error.status ?? 0)) throw error;
      }
      if (signed?.signedContent?.url) {
        const url = new URL(signed.signedContent.url);
        if (url.protocol !== 'https:') throw new ArtifactError('Azure DevOps returned an insecure artifact download location.');
        try { return await this.bytes(url.href, 'application/zip', false, signal, this.limits.archiveBytes, reserve); }
        catch (error) {
          // Retry once with a new signed URL if its signature has expired.
          if (!(error instanceof ArtifactError) || ![401, 403].includes(error.status ?? 0)) throw error;
          const refreshed = await this.json(context, `pipelines/${context.pipelineId}/runs/${context.runId}/artifacts`,
            { artifactName: artifact.name, '$expand': 'signedContent' }, signal) as typeof signed;
          const next = refreshed?.signedContent?.url && new URL(refreshed.signedContent.url);
          if (!next || next.protocol !== 'https:') throw new ArtifactError('Could not renew this artifact download. Refresh and try again.');
          return this.bytes(next.href, 'application/zip', false, signal, this.limits.archiveBytes, reserve);
        }
      }
    }
    return this.bytes(endpoint(context, `build/builds/${context.runId}/artifacts`,
      { artifactName: artifact.name, '$format': 'zip' }), 'application/zip', true, signal, this.limits.archiveBytes, reserve);
  }

  async scan(context: RunContext, signal: AbortSignal, progress: (value: ScanProgress) => void): Promise<ScanResult> {
    const response = await this.json(context, `build/builds/${context.runId}/artifacts`, {}, signal);
    const artifacts: RunArtifact[] = Array.isArray(response) ? response : (response as { value?: RunArtifact[] })?.value ?? [];
    if (!Array.isArray(response) && !Array.isArray((response as { value?: unknown })?.value)) {
      throw new ArtifactError('Azure DevOps returned an unexpected artifact list.');
    }
    artifacts.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    const files: PlanFile[] = [], issues: ArtifactIssue[] = [];
    let index = 0, completed = 0, downloaded = 0;
    progress({ completed, total: artifacts.length });
    const reserve = (bytes: number) => {
      downloaded += bytes;
      if (downloaded > this.limits.totalBytes) throw new ArtifactError('Scan reached the 128 MiB total download limit. Publish plans in smaller, dedicated artifacts.');
    };
    const worker = async () => {
      while (index < artifacts.length) {
        aborted(signal);
        const artifact = artifacts[index++];
        try {
          if (!artifact.name || !artifact.resource) throw new ArtifactError('This artifact has incomplete metadata.');
          if (!['container', 'pipelineartifact'].includes(artifact.resource.type?.toLowerCase())) {
            throw new ArtifactError('This artifact storage type is not supported in the browser. Publish the files as hosted pipeline artifacts.');
          }
          const bytes = await this.archive(context, artifact, signal, reserve);
          let zip: JSZip;
          try { zip = await JSZip.loadAsync(bytes); }
          catch { throw new ArtifactError('This artifact is not a readable ZIP archive. Try downloading it from the run artifacts page.'); }
          aborted(signal);
          const entries = Object.values(zip.files);
          if (entries.length > this.limits.entries) throw new ArtifactError('Artifact contains more than 20,000 entries. Publish plans in a smaller artifact.');
          let fileLimit = false;
          for (const entry of entries) {
            if (entry.dir || !entry.name.endsWith('.plan.json')) continue;
            if (files.length >= this.limits.files) { fileLimit = true; continue; }
            const relative = entry.name.startsWith(artifact.name + '/') ? entry.name.slice(artifact.name.length + 1) : entry.name;
            const id = JSON.stringify([context.projectId, context.runId, artifact.id, artifact.name, relative]);
            files.push({ id, artifactName: artifact.name, path: relative, name: relative.split('/').pop()!,
              read: readSignal => this.readFile(entry, readSignal) });
          }
          if (fileLimit) issues.push({ artifactName: artifact.name, message: 'Scan reached the 200-file limit. Some matching files could not be listed.' });
        } catch (error) {
          aborted(signal);
          issues.push({ artifactName: artifact.name || 'Unknown artifact', message: errorMessage(error) });
        } finally {
          completed++;
          if (!signal.aborted) progress({ completed, total: artifacts.length });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    aborted(signal);
    files.sort((a, b) => a.artifactName.localeCompare(b.artifactName) || a.path.localeCompare(b.path));
    return { files, issues };
  }

  private readFile(entry: JSZipObject, signal: AbortSignal): Promise<{ text: string; bytes: number }> {
    aborted(signal);
    return new Promise((resolve, reject) => {
      const stream = (entry as StreamedZipEntry).internalStream('uint8array');
      let length = 0, done = false;
      const chunks: Uint8Array[] = [];
      const stop = (error: unknown) => {
        if (done) return;
        done = true;stream.pause();chunks.length = 0;signal.removeEventListener('abort', cancel);reject(error);
      };
      const cancel = () => stop(new DOMException('Request cancelled.', 'AbortError'));
      signal.addEventListener('abort', cancel, { once: true });
      stream.on('data', chunk => {
        if (done) return;
        length += chunk.byteLength;
        if (length > this.limits.fileBytes) { stop(new ArtifactError('Plan exceeds the 10 MiB expanded file limit. Publish a smaller plan.')); return; }
        chunks.push(chunk);
      });
      stream.on('error', () => stop(new ArtifactError('Could not extract this file from the artifact. Try refreshing the run.')));
      stream.on('end', () => {
        if (done) return;
        done = true;signal.removeEventListener('abort', cancel);
        const data = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { data.set(chunk, offset);offset += chunk.length; }
        try { resolve({ text: new TextDecoder('utf-8', { fatal: true }).decode(data), bytes: length }); }
        catch { reject(new ArtifactError('Plan file must contain UTF-8 JSON.')); }
      });
      stream.resume();
    });
  }
}
