import { Component, OnInit, ChangeDetectorRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TerraformPlanFileUploadComponent } from './terraform-plan-file-upload.component';
import { TerraformPlanDisplayComponent } from './terraform-plan-display.component';

@Component({
  selector: 'app-terraform-plan-viewer',
  standalone: true,
  imports: [
    CommonModule,
    TerraformPlanFileUploadComponent,
    TerraformPlanDisplayComponent
  ],
  templateUrl: './terraform-plan-viewer.html',
  styleUrl: './terraform-plan-viewer.scss'
})
export class TerraformPlanViewerComponent implements OnInit, AfterViewInit {
  // Current plan data for the orchestrator
  currentPlan: any = null;

  @ViewChild('uploadToolbar') uploadToolbar?: TerraformPlanFileUploadComponent;

  constructor(
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    // Component starts with no plan loaded - upload component will be shown
  }

  ngAfterViewInit(): void {
    // Enable toolbar integration mode if a plan is loaded
    if (this.currentPlan && this.uploadToolbar) {
      this.uploadToolbar.enableToolbarIntegration();
      this.cdr.detectChanges();
    }
  }

  onPlanLoaded(planData: any): void {
    this.currentPlan = planData;
    this.cdr.detectChanges();
    
    // Enable toolbar integration mode after plan is loaded
    if (this.uploadToolbar) {
      setTimeout(() => {
        this.uploadToolbar!.enableToolbarIntegration();
        this.cdr.detectChanges();
      });
    }
  }

  onUploadError(error: string): void {
    console.error('Upload error:', error);
    alert(error);
  }
}
