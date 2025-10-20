import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface ApplyDialogData {
  validation: any;
}

@Component({
  selector: 'app-apply-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule
  ],
  template: `
    <h2 mat-dialog-title>Apply Terraform Plan</h2>
    <mat-dialog-content>
      <p>Are you sure you want to apply this Terraform plan?</p>
      <p style="color: #ff9800; margin-top: 10px;">
        <strong>Warning:</strong> This will make changes to your infrastructure.
      </p>
      <div *ngIf="data.validation" style="margin-top: 15px;">
        <p><strong>Validation Result:</strong></p>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">{{ data.validation | json }}</pre>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" (click)="onApply()">Apply</button>
    </mat-dialog-actions>
  `
})
export class ApplyDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ApplyDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ApplyDialogData
  ) {}

  onCancel(): void {
    this.dialogRef.close();
  }

  onApply(): void {
    this.dialogRef.close(true);
  }
}
