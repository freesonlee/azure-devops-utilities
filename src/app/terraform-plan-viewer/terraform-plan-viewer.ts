import { Component, OnInit, ChangeDetectorRef, ViewChild, AfterViewInit, HostListener } from '@angular/core';
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
    this.stackType = 'terraform';
    this.cdr.detectChanges();
  }

  /**
   * Handle paste events anywhere on the component
   * If a URL is pasted, attempt to load it as a plan JSON
   */
  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    // Get the pasted text from clipboard
    const pastedText = event.clipboardData?.getData('text/plain');

    if (!pastedText) {
      return;
    }

    const trimmedText = pastedText.trim();

    // Check if the pasted text is a valid URL
    if (this.uploadToolbar && this.isValidUrl(trimmedText)) {
      // Prevent default paste behavior
      event.preventDefault();

      // Use the upload component's URL handling
      this.uploadToolbar.handleUrlPaste(trimmedText);
    }
  }

  /**
   * Check if a string is a valid HTTP/HTTPS URL
   */
  private isValidUrl(text: string): boolean {
    try {
      const url = new URL(text);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
