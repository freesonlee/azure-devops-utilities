import { Component, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { TerraformPlan } from '../../interfaces/terraform-plan.interface';

@Component({
  selector: 'app-terraform-plan-file-upload',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatToolbarModule,
    MatProgressBarModule,
    MatDividerModule
  ],
  template: `
    <!-- Toolbar Integration -->
    <div class="toolbar-integration" *ngIf="showToolbarIntegration">
      <!-- Compact Drag Zone for loaded plans -->
      <div 
        class="toolbar-drop-zone"
        [class.dragover]="isToolbarDragOver"
        (dragenter)="onToolbarDragEnter($event)"
        (dragover)="onToolbarDragOver($event)"
        (dragleave)="onToolbarDragLeave($event)"
        (drop)="onToolbarDrop($event)">
        
        <mat-icon class="toolbar-drop-icon">swap_horiz</mat-icon>
        <span class="toolbar-drop-text">Drop file or URL to switch</span>
      </div>
      
      <button mat-raised-button color="accent" (click)="fileInput.click()">
        <mat-icon>upload_file</mat-icon>
        Load Plan JSON
      </button>
      
      <!-- CDKTF Section - only shown when plan is loaded -->
      <div class="cdktf-upload-section" *ngIf="showCdktfOptions">
        <button mat-raised-button color="accent" (click)="cdktfFileInput.click()" style="margin-left: 16px;">
          <mat-icon>account_tree</mat-icon>
          Load CDKTF JSON
        </button>
        
        <!-- CDKTF Drop Zone -->
        <div 
          class="cdktf-drop-zone"
          [class.dragover]="isCdktfDragOver"
          (dragenter)="onCdktfDragEnter($event)"
          (dragover)="onCdktfDragOver($event)"
          (dragleave)="onCdktfDragLeave($event)"
          (drop)="onCdktfDrop($event)">
          
          <mat-icon class="drop-icon">account_tree</mat-icon>
          <span class="drop-text">Drop CDKTF JSON</span>
        </div>
      </div>
      
      <input
        #fileInput
        type="file"
        (change)="onFileSelected($event)"
        accept=".json"
        style="display: none"
      />
      <input
        #cdktfFileInput
        type="file"
        (change)="onCdktfFileSelected($event)"
        accept=".json"
        style="display: none"
      />
    </div>

    <!-- Welcome Card for new uploads -->
    <div class="upload-container" *ngIf="!showToolbarIntegration">
      <!-- Blue Title Bar -->
      <mat-toolbar color="primary" class="welcome-toolbar">
        <mat-icon>cloud</mat-icon>
        <span>Welcome to Terraform Plan Viewer</span>
        <span class="spacer"></span>
        <button mat-raised-button color="accent" (click)="fileInput.click()">
          <mat-icon>upload_file</mat-icon>
          Load Plan JSON
        </button>
        <input
          #fileInput
          type="file"
          (change)="onFileSelected($event)"
          accept=".json"
          style="display: none"
        />
      </mat-toolbar>
      
      <mat-card class="welcome-card">
        <mat-card-header>
          <mat-card-subtitle>Load a Terraform plan JSON file to get started</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          
          <!-- Loading indicator for URL downloads -->
          <div *ngIf="isDownloading" class="loading-container">
            <mat-progress-bar mode="indeterminate"></mat-progress-bar>
            <p class="loading-text">Downloading and processing file...</p>
          </div>
          
          <div *ngIf="!isDownloading">
            <p>Upload your Terraform or CDKTF plan JSON file to visualize:</p>
            <ul>
              <li>Variables and their values</li>
              <li>Planned outputs</li>
              <li>Resource changes</li>
              <li><strong>CDKTF projects:</strong> Construct view with hierarchical structure</li>
            </ul>
            <mat-divider class="instructions-divider"></mat-divider>
            <h3 class="instructions-title">How to generate the plan JSON file:</h3>
            
            <!-- Terraform Instructions -->
            <h4 class="sub-instructions-title">For Terraform projects:</h4>
            <ol class="instructions-list">
              <li>First, create a Terraform plan file:
                <pre class="code-block"><code>terraform plan -out=tfplan</code></pre>
              </li>
              <li>Convert the plan file to JSON format:
                <pre class="code-block"><code>terraform show -json tfplan > tfplan.json</code></pre>
              </li>
              <li>Upload the <code>tfplan.json</code> file using the "Load Plan JSON" button.</li>
            </ol>

            <!-- CDKTF Instructions -->
            <h4 class="sub-instructions-title">For CDKTF projects:</h4>
            <ol class="instructions-list">
              <li>Generate a plan and convert to JSON (from your CDKTF project directory):
                <pre class="code-block"><code>cdktf plan --json-plan > tfplan.json</code></pre>
              </li>
              <li>Upload the <code>tfplan.json</code> file using the "Choose Plan JSON" button.</li>
              <li><strong>Optional:</strong> After the plan is loaded, you'll see a "Load CDKTF JSON" button to upload your <code>cdktf.json</code> file for enhanced construct view.</li>
            </ol>

            <!-- Drag and Drop Zone -->
            <div 
              class="drop-zone"
              [class.dragover]="isDragOver"
              (dragenter)="onDragEnter($event)"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onDrop($event)">
              
              <div class="drop-zone-content">
                <mat-icon class="drop-icon">cloud_upload</mat-icon>
                <div class="drop-text">
                  <span class="primary-text">Drop your Terraform plan JSON file or URL here</span>
                  <span class="secondary-text">Supports files and direct links • Click below to browse files</span>
                </div>
              </div>
            </div>
          </div>
        </mat-card-content>
        <mat-card-actions>
          <button mat-raised-button color="primary" (click)="fileInput.click()">
            <mat-icon>upload_file</mat-icon>
            Choose Plan JSON
          </button>
        </mat-card-actions>
      </mat-card>

      <!-- Hidden file input -->
      <input
        #fileInput
        type="file"
        (change)="onFileSelected($event)"
        accept=".json"
        style="display: none"
      />
      <input
        #cdktfFileInput
        type="file"
        (change)="onCdktfFileSelected($event)"
        accept=".json"
        style="display: none"
      />
    </div>
  `,
  styleUrls: ['./terraform-plan-file-upload.component.scss']
})
export class TerraformPlanFileUploadComponent {
  @Output() planLoaded = new EventEmitter<TerraformPlan>();
  @Output() cdktfLoaded = new EventEmitter<any>();
  @Output() error = new EventEmitter<string>();
  @Output() planFileNameChanged = new EventEmitter<string>();
  @Output() cdktfFileNameChanged = new EventEmitter<string>();

  // Component state
  isDragOver: boolean = false;
  isToolbarDragOver: boolean = false;
  isCdktfDragOver: boolean = false;
  isDownloading: boolean = false;
  showToolbarIntegration: boolean = false;
  showCdktfOptions: boolean = false;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) { }

  /**
   * Switch to toolbar integration mode (compact mode for when a plan is already loaded)
   */
  enableToolbarIntegration(): void {
    this.showToolbarIntegration = true;
  }

  /**
   * Switch to full upload interface mode
   */
  enableFullInterface(): void {
    this.showToolbarIntegration = false;
    this.showCdktfOptions = false;
  }

  /**
   * Enable CDKTF upload options (shown after plan is loaded)
   */
  enableCdktfOptions(): void {
    this.showCdktfOptions = true;
  }

  /**
   * Disable CDKTF upload options
   */
  disableCdktfOptions(): void {
    this.showCdktfOptions = false;
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.processFile(file).catch(error => {
        console.error('Error processing file:', error);
        this.error.emit(error instanceof Error ? error.message : 'Failed to process the file.');
      });
    }
  }

  onCdktfFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.processCdktfFile(file).catch(error => {
        console.error('Error processing CDKTF file:', error);
        this.error.emit(error instanceof Error ? error.message : 'Failed to process the CDKTF file.');
      });
    }
  }

  // Drag and Drop Event Handlers
  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Only set isDragOver to false if we're actually leaving the drop zone
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom) {
      this.isDragOver = false;
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const items = event.dataTransfer?.items;
    if (items) {
      // Check for text/URL first
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.kind === 'string' && (item.type === 'text/plain' || item.type === 'text/uri-list')) {
          item.getAsString((text: string) => {
            const trimmedText = text.trim();
            if (this.isValidUrl(trimmedText)) {
              this.handleUrlDrop(trimmedText);
            } else {
              this.error.emit('Invalid URL. Please drop a valid HTTP/HTTPS link to a JSON file.');
            }
          });
          return;
        }
      }
    }

    // Fall back to file handling
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      this.processDroppedFile(file).catch(error => {
        console.error('Error processing file:', error);
        this.error.emit(error instanceof Error ? error.message : 'Failed to process the file.');
      });
    }
  }

  // Toolbar Drag and Drop Event Handlers
  onToolbarDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isToolbarDragOver = true;
  }

  onToolbarDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isToolbarDragOver = true;
  }

  onToolbarDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Only set isToolbarDragOver to false if we're actually leaving the drop zone
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom) {
      this.isToolbarDragOver = false;
    }
  }

  onToolbarDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isToolbarDragOver = false;

    const items = event.dataTransfer?.items;
    if (items) {
      // Check for text/URL first
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.kind === 'string' && (item.type === 'text/plain' || item.type === 'text/uri-list')) {
          item.getAsString((text: string) => {
            const trimmedText = text.trim();
            if (this.isValidUrl(trimmedText)) {
              this.handleUrlDrop(trimmedText);
            } else {
              this.error.emit('Invalid URL. Please drop a valid HTTP/HTTPS link to a JSON file.');
            }
          });
          return;
        }
      }
    }

    // Fall back to file handling
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      this.processDroppedFile(file).catch(error => {
        console.error('Error processing file:', error);
        this.error.emit(error instanceof Error ? error.message : 'Failed to process the file.');
      });
    }
  }

  // CDKTF Drag and Drop Event Handlers
  onCdktfDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isCdktfDragOver = true;
  }

  onCdktfDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isCdktfDragOver = true;
  }

  onCdktfDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Only set isCdktfDragOver to false if we're actually leaving the drop zone
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom) {
      this.isCdktfDragOver = false;
    }
  }

  onCdktfDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isCdktfDragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      this.processCdktfFile(file).catch(error => {
        console.error('Error processing CDKTF file:', error);
        this.error.emit(error instanceof Error ? error.message : 'Failed to process the CDKTF file.');
      });
    }
  }

  // File type detection and processing for dropped files
  private async processDroppedFile(file: File): Promise<void> {
    // Check if this might be a CDKTF file based on naming convention
    if (file.name.toLowerCase().includes('cdktf') || file.name.toLowerCase() === 'cdktf.json') {
      return this.processCdktfFile(file);
    } else {
      return this.processFile(file);
    }
  }

  // Common file processing method
  private async processFile(file: File): Promise<void> {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.json')) {
      throw new Error('Please select a JSON file.');
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      throw new Error('File size is too large. Please select a file smaller than 50MB.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const planData = JSON.parse(e.target?.result as string);

          // Basic validation to ensure it's a Terraform plan
          if (!planData.format_version && !planData.terraform_version && !planData.resource_changes) {
            reject(new Error('This doesn\'t appear to be a valid Terraform plan JSON file.'));
            return;
          }

          // Emit file name first, then plan data
          this.planFileNameChanged.emit(file.name);
          this.planLoaded.emit(planData);
          this.cdr.detectChanges(); // Trigger change detection
          resolve();
        } catch (error) {
          console.error('Error parsing JSON file:', error);
          reject(new Error('Error parsing JSON file. Please check the file format.'));
        }
      };

      reader.onerror = () => {
        reject(new Error('Error reading file. Please try again.'));
      };

      reader.readAsText(file);
    });
  }

  // CDKTF file processing method
  private async processCdktfFile(file: File): Promise<void> {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.json')) {
      throw new Error('Please select a JSON file.');
    }

    // Validate file size (max 10MB for CDKTF files)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error('File size is too large. Please select a file smaller than 10MB.');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const cdktfData = JSON.parse(e.target?.result as string);

          this.cdktfLoaded.emit(cdktfData);
          this.cdktfFileNameChanged.emit(file.name);
          this.cdr.detectChanges(); // Trigger change detection
          resolve();
        } catch (error) {
          console.error('Error parsing CDKTF JSON file:', error);
          reject(new Error('Error parsing CDKTF JSON file. Please check the file format.'));
        }
      };

      reader.onerror = () => {
        reject(new Error('Error reading CDKTF file. Please try again.'));
      };

      reader.readAsText(file);
    });
  }

  // URL Detection and Download Methods
  private isValidUrl(text: string): boolean {
    try {
      const url = new URL(text);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private async downloadFileFromUrl(url: string): Promise<File> {
    try {
      // Add CORS handling and timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(url, {
        signal: controller.signal,
        mode: 'cors', // Enable CORS
        headers: {
          'Accept': 'application/json, text/plain, */*'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const sizeInMB = parseInt(contentLength) / (1024 * 1024);
        if (sizeInMB > 50) {
          throw new Error(`File too large (${sizeInMB.toFixed(1)}MB). Maximum size is 50MB.`);
        }
      }

      const blob = await response.blob();

      // Validate file size after download
      if (blob.size > 50 * 1024 * 1024) {
        throw new Error(`File too large (${(blob.size / (1024 * 1024)).toFixed(1)}MB). Maximum size is 50MB.`);
      }

      // Extract filename from URL or use default
      let filename = 'terraform-plan.json';
      try {
        const urlPath = new URL(url).pathname;
        const extractedFilename = urlPath.split('/').pop();
        if (extractedFilename && extractedFilename.includes('.')) {
          filename = extractedFilename;
        }
      } catch {
        // Use default filename if extraction fails
      }

      // Ensure .json extension
      if (!filename.endsWith('.json')) {
        filename += '.json';
      }

      return new File([blob], filename, { type: 'application/json' });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Download timed out. Please try again or check the URL.');
      }
      throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleUrlDrop(url: string): Promise<void> {
    try {
      // Show loading state
      this.isDownloading = true;
      this.cdr.detectChanges(); // Trigger change detection
      console.log('Downloading file from URL:', url);

      const file = await this.downloadFileFromUrl(url);
      await this.processFile(file);

    } catch (error) {
      console.error('Error processing URL:', error);
      this.error.emit(error instanceof Error ? error.message : 'Failed to download and process the file from the URL.');
    } finally {
      this.isDownloading = false;
      this.cdr.detectChanges(); // Trigger change detection
    }
  }

  /**
   * Public method to handle URL paste from parent component
   * This allows the TerraformPlanViewer to trigger URL loading from paste events
   */
  public async handleUrlPaste(url: string): Promise<void> {
    return this.handleUrlDrop(url);
  }
}