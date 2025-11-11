import { Component, OnInit, ChangeDetectorRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TerraformPlanFileUploadComponent } from './terraform-plan-file-upload.component';
import { TerraformPlanDisplayComponent } from './terraform-plan-display.component';
import { FileIndicatorComponent } from './file-indicator.component';

@Component({
  selector: 'app-terraform-plan-viewer',
  standalone: true,
  imports: [
    CommonModule,
    TerraformPlanFileUploadComponent,
    TerraformPlanDisplayComponent,
    FileIndicatorComponent
  ],
  templateUrl: './terraform-plan-viewer.html',
  styleUrl: './terraform-plan-viewer.scss'
})
export class TerraformPlanViewerComponent implements OnInit, AfterViewInit {
  // Current plan data for the orchestrator
  currentPlan: any = null;
  currentCdktfJson: any = null;
  stackType: string = 'terraform';

  // File name for indicator
  planFileName: string | null = null;
  cdktfLoaded: boolean = false;

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
      this.uploadToolbar.enableCdktfOptions();
      this.cdr.detectChanges();
    }
  }

  onPlanLoaded(planData: any): void {
    this.currentPlan = planData;
    // Reset CDKTF data when new plan is loaded
    this.currentCdktfJson = null;
    this.cdktfLoaded = false;

    // Auto-detect if this is a CDKTF-generated plan
    this.detectStackType(planData);
    this.cdr.detectChanges();

    // Enable toolbar integration mode after plan is loaded
    if (this.uploadToolbar) {
      setTimeout(() => {
        this.uploadToolbar!.enableToolbarIntegration();
        this.uploadToolbar!.enableCdktfOptions();
        this.cdr.detectChanges();
      });
    }
  }

  onCdktfLoaded(cdktfData: any): void {
    this.currentCdktfJson = cdktfData;
    this.stackType = 'cdktf';
    this.cdr.detectChanges();
    console.log('CDKTF metadata loaded:', cdktfData);
  }

  onCdktfStatusChanged(loaded: boolean): void {
    this.cdktfLoaded = loaded;
    this.cdr.detectChanges();
  }

  onViewSwitchRequested(viewType: string): void {
    // This will be handled by the terraform-plan-display component itself
    // We might add logic here if needed for external handling
    console.log('View switch requested to:', viewType);
  }

  onPlanFileNameChanged(fileName: string): void {
    this.planFileName = fileName;
    this.cdr.detectChanges();
  }

  onCdktfFileNameChanged(fileName: string): void {
    // We don't track CDKTF file names anymore
    this.cdr.detectChanges();
  }

  onUploadError(error: string): void {
    console.error('Upload error:', error);
    alert(error);
  }

  /**
   * Reset all loaded data and file names
   */
  resetAll(): void {
    this.currentPlan = null;
    this.currentCdktfJson = null;
    this.planFileName = null;
    this.cdktfLoaded = false;
    this.stackType = 'terraform';

    if (this.uploadToolbar) {
      this.uploadToolbar.enableFullInterface();
    }

    this.cdr.detectChanges();
  }

  /**
   * Clear only the CDKTF data
   */
  clearCdktfData(): void {
    this.currentCdktfJson = null;
    this.cdktfLoaded = false;
    this.stackType = this.isCdktfGeneratedPlan(this.currentPlan) ? 'cdktf' : 'terraform';
    this.cdr.detectChanges();
  }

  private detectStackType(planData: any): void {
    // Auto-detect CDKTF by looking for CDKTF-specific patterns in the plan
    if (this.isCdktfGeneratedPlan(planData)) {
      this.stackType = 'cdktf';
    } else {
      this.stackType = 'terraform';
    }
  }

  private isCdktfGeneratedPlan(planData: any): boolean {
    // Check for CDKTF indicators in the plan data
    if (!planData || !planData.resource_changes) return false;

    // Look for CDKTF-style resource addresses (contain construct paths)
    return planData.resource_changes.some((resource: any) =>
      resource.address && (
        resource.address.includes('.') &&
        (resource.address.split('.').length > 3 || // More than typical terraform nesting
          resource.address.includes('cdktf_') ||
          resource.address.match(/\.[a-zA-Z]+\d+\./) // Pattern like .construct1.
        )
      )
    );
  }
}
