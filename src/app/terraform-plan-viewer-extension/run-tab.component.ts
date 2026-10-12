import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TerraformPlan, TerraformPlanViewerComponent, TerraformViewerError } from '@freesonlee/terraform-plan-viewer-angular';
import { ArtifactError, ArtifactIssue, PlanFile, RunContext, ScanProgress, errorMessage } from './plan-artifacts';
import { RunHostService } from './run-host.service';

type FileState = 'idle' | 'loading' | 'ready' | 'error';
interface ViewFile extends PlanFile { state: FileState; error?: string; plan?: TerraformPlan; }

@Component({
  selector: 'app-root', standalone: true, imports: [CommonModule, TerraformPlanViewerComponent],
  templateUrl: './run-tab.component.html', styleUrls: ['./run-tab.component.css']
})
export class RunTabComponent implements OnInit, OnDestroy {
  context?: RunContext;
  files: ViewFile[] = [];
  selected?: ViewFile;
  issues: ArtifactIssue[] = [];
  progress: ScanProgress = { completed: 0, total: 0 };
  isScanning = false;
  error = '';
  readonly viewerOptions = { layout: 'embedded' as const, enableActions: false, allowSensitiveReveal: true };
  @ViewChild('tabs') tabs?: ElementRef<HTMLElement>;
  private scanController?: AbortController;
  private fileController?: AbortController;
  private generation = 0;
  private destroyed = false;
  private timer?: ReturnType<typeof setInterval>;
  private checkingRun = false;
  private cache = new Map<string, { plan: TerraformPlan; bytes: number }>();

  constructor(private readonly host: RunHostService, private readonly zone: NgZone) {}

  ngOnInit(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.checkRun(), 2000);
  }

  ngOnDestroy(): void {
    this.destroyed = true;this.generation++;
    this.scanController?.abort();this.fileController?.abort();
    clearInterval(this.timer);this.cache.clear();
  }

  private update(action: () => void): void {
    if (!this.destroyed) this.zone.run(action);
  }

  private async checkRun(): Promise<void> {
    if (!this.context || this.checkingRun || this.destroyed) return;
    this.checkingRun = true;
    try {
      const id = await this.host.currentRunId();
      if (!this.destroyed && id && id !== this.context.runId) await this.refresh();
    } catch { /* A transient host-context failure should not discard the current plan. */ }
    finally { this.checkingRun = false; }
  }

  async refresh(): Promise<void> {
    const previousId = this.selected?.id;
    const generation = ++this.generation;
    this.scanController?.abort();this.fileController?.abort();
    const controller = this.scanController = new AbortController();
    this.update(() => {
      this.files = [];this.selected = undefined;this.issues = [];this.error = '';
      this.cache.clear();this.isScanning = true;this.progress = { completed: 0, total: 0 };
    });
    try {
      const context = await this.host.context(controller.signal);
      if (generation !== this.generation || controller.signal.aborted || this.destroyed) return;
      this.update(() => this.context = context);
      const result = await this.host.artifacts.scan(context, controller.signal, progress => {
        if (generation === this.generation && !controller.signal.aborted) this.update(() => this.progress = progress);
      });
      if (generation !== this.generation || controller.signal.aborted || this.destroyed) return;
      this.update(() => {
        this.files = result.files.map(file => ({ ...file, state: 'idle' }));
        this.issues = result.issues;this.isScanning = false;
      });
      const selection = this.files.find(file => file.id === previousId) ?? this.files[0];
      if (selection) await this.select(selection);
    } catch (error) {
      if (generation !== this.generation || this.destroyed) return;
      this.update(() => {
        this.isScanning = false;
        this.error = controller.signal.aborted ? 'Artifact scan cancelled. Refresh to try again.' : errorMessage(error);
      });
    }
  }

  cancelScan(): void { this.scanController?.abort(); }

  async select(file: ViewFile): Promise<void> {
    if (this.destroyed || !this.files.includes(file)) return;
    this.fileController?.abort();
    if (this.selected?.state === 'loading') this.selected.state = 'idle';
    const controller = this.fileController = new AbortController();
    const generation = this.generation;
    this.update(() => this.selected = file);
    if (file.state === 'ready' && file.plan) { this.touchCache(file.id);return; }
    this.update(() => { file.state = 'loading';file.error = undefined; });
    try {
      const data = await file.read(controller.signal);
      if (controller.signal.aborted || generation !== this.generation || this.destroyed) return;
      const text = data.text.replace(/^\uFEFF/, '').trim();
      if (!text) throw new ArtifactError('This plan file is empty. Publish Terraform JSON output and refresh.');
      let plan: TerraformPlan;
      try { plan = JSON.parse(text) as TerraformPlan; }
      catch { throw new ArtifactError('This file is not valid JSON. Publish the output of terraform show -json.'); }
      if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new ArtifactError('A Terraform plan must be a JSON object.');
      this.update(() => {
        file.plan = plan;file.state = 'ready';
        this.cache.set(file.id, { plan, bytes: data.bytes });this.trimCache();
      });
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation || this.destroyed) return;
      this.update(() => { file.state = 'error';file.error = errorMessage(error); });
    }
  }

  onViewerError(file: ViewFile, error: TerraformViewerError): void {
    if (!this.files.includes(file)) return;
    this.update(() => {
      this.cache.delete(file.id);file.plan = undefined;file.state = 'error';file.error = error.message;
    });
  }

  private touchCache(id: string): void {
    const cached = this.cache.get(id);
    if (cached) { this.cache.delete(id);this.cache.set(id, cached); }
  }

  private trimCache(): void {
    let bytes = Array.from(this.cache.values()).reduce((total, file) => total + file.bytes, 0);
    while (this.cache.size > 3 || bytes > 20 * 1024 * 1024) {
      const id = this.cache.keys().next().value as string;
      if (id === this.selected?.id) break;
      bytes -= this.cache.get(id)!.bytes;this.cache.delete(id);
      const file = this.files.find(file => file.id === id);
      if (file) { file.plan = undefined;file.state = 'idle'; }
    }
  }

  tabKey(event: KeyboardEvent): void {
    if (!(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'tab') return;
    const index = this.files.indexOf(this.selected!);
    const next = event.key === 'ArrowRight' ? (index + 1) % this.files.length :
      event.key === 'ArrowLeft' ? (index + this.files.length - 1) % this.files.length :
      event.key === 'Home' ? 0 : event.key === 'End' ? this.files.length - 1 : undefined;
    if (next === undefined) return;
    event.preventDefault();void this.select(this.files[next]);
    this.tabs?.nativeElement.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  trackFile(_index: number, file: ViewFile): string { return file.id; }
}
