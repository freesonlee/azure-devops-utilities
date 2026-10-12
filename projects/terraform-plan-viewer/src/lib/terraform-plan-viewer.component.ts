import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TerraformPlanDisplayComponent } from './viewer/terraform-plan-display.component';
import { ResourceChange, TerraformPlan } from './models/terraform-plan.interface';
import { CdktfMetadata, TerraformResourceFilter, TerraformViewerError, TerraformViewerOptions, TerraformViewerView } from './models/viewer-options';
import { preparePlan } from './models/prepare-plan';

@Component({
  selector: 'tf-plan-viewer',
  host: { '[style.container-type]': "options?.layout === 'page' ? 'normal' : 'inline-size'" },
  standalone: true,
  imports: [CommonModule, TerraformPlanDisplayComponent],
  template: `
    <div class="viewer-message" *ngIf="validationError" role="alert">{{validationError}}</div>
    <div class="viewer-message" *ngIf="!preparedPlan && !validationError" role="status">No plan supplied.</div>
    <app-terraform-plan-display *ngIf="preparedPlan"
      [plan]="preparedPlan" [cdkTfJson]="cdktfMetadata" [stackType]="cdktfMetadata ? 'cdktf' : 'terraform'"
      [defaultFilter]="defaultFilter" [layout]="options?.layout || 'embedded'"
      [class.embedded]="options?.layout !== 'page'" [viewportTopOffset]="viewportTopOffset"
      [allowSensitiveReveal]="options?.allowSensitiveReveal !== false" [mode]="options?.enableActions ? 'normal' : 'viewonly'"
      (resourceSelected)="resourceSelected.emit($event)" (viewChanged)="viewChanged.emit($event)"
      (cdktfStatusChanged)="cdktfStatusChanged.emit($event)" (viewSwitchRequested)="onViewSwitch($event)"
      (targetResourceRequested)="targetResourceRequested.emit($event)"
      (importStateRequested)="importStateRequested.emit($event)" (removeFromStateRequested)="removeFromStateRequested.emit($event)">
    </app-terraform-plan-display>
  `,
  styles: `
    :host { display: block; min-width: 0; font-family: Roboto, Arial, sans-serif; container-type: inline-size; container-name: tf-plan-viewer; }
    .viewer-message { padding: 24px; color: #666; font: 14px/1.6 Roboto, sans-serif; }
    [role=alert] { color: #c62828; background: #ffebee; border-radius: 8px; }
  `
})
export class TerraformPlanViewerComponent implements OnChanges {
  @Input() plan: TerraformPlan | null = null;
  @Input() cdktfMetadata: CdktfMetadata | null = null;
  @Input() defaultFilter: TerraformResourceFilter = 'auto';
  @Input() options: TerraformViewerOptions | null = null;

  // Input changes can emit resets; async delivery avoids mutating a host during its render pass.
  @Output() resourceSelected = new EventEmitter<ResourceChange | null>(true);
  @Output() viewChanged = new EventEmitter<TerraformViewerView>(true);
  @Output() cdktfStatusChanged = new EventEmitter<boolean>(true);
  @Output() targetResourceRequested = new EventEmitter<string>(true);
  @Output() importStateRequested = new EventEmitter<ResourceChange>(true);
  @Output() removeFromStateRequested = new EventEmitter<ResourceChange>(true);
  @Output() error = new EventEmitter<TerraformViewerError>(true);

  preparedPlan: TerraformPlan | null = null;
  validationError = '';

  get viewportTopOffset(): number {
    const offset = this.options?.viewportTopOffset ?? 0;
    return Number.isFinite(offset) ? Math.max(0, offset) : 0;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['plan']) return;
    this.validationError = '';
    this.preparedPlan = null;
    this.resourceSelected.emit(null);
    if (this.plan === null || this.plan === undefined) return;
    try {
      this.preparedPlan = preparePlan(this.plan);
    } catch (error) {
      this.validationError = error instanceof Error ? error.message : 'Invalid Terraform plan JSON.';
      this.error.emit({ code: 'invalid-plan', message: this.validationError });
    }
  }

  onViewSwitch(view: string): void {
    if (view === 'terraform' || view === 'construct') this.viewChanged.emit(view);
  }

}
