import { Component, Input, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
    selector: 'app-file-indicator',
    standalone: true,
    imports: [
        CommonModule,
        MatChipsModule,
        MatIconModule,
        MatTooltipModule
    ],
    template: `
    <div class="file-indicators" *ngIf="planFileName || cdktfLoaded">
      <!-- Plan file name indicator -->
      <div class="file-indicator plan-indicator" *ngIf="planFileName">
        <mat-icon class="file-icon">check_circle</mat-icon>
        <span class="file-status">
          <span class="file-name" [matTooltip]="planFileName" matTooltipPosition="below">
            {{ getShortFileName(planFileName) }}
          </span>
          <span class="uploaded-text">uploaded</span>
        </span>
      </div>
      
      <!-- CDKTF status indicator -->
      <div class="file-indicator cdktf-indicator" *ngIf="cdktfLoaded">
        <mat-icon class="file-icon">account_tree</mat-icon>
        <span class="cdktf-status">CDKTF Constructs loaded</span>
      </div>
    </div>
  `,
    styles: [`
    .file-indicators {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .file-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      border-radius: 8px;
      padding: 8px 16px;
      border: 2px solid;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      animation: fadeInScale 0.3s ease-out;
      
      &.plan-indicator {
        background-color: rgba(76, 175, 80, 0.15);
        border-color: #4caf50;
        color: #ffffff;
        
        .file-icon {
          color: #4caf50;
        }
      }
      
      &.cdktf-indicator {
        background-color: rgba(129, 199, 132, 0.2);
        border-color: rgba(129, 199, 132, 0.6);
        color: #ffffff;
        
        .file-icon {
          color: #81c784;
        }
      }
    }

    @keyframes fadeInScale {
      from {
        opacity: 0;
        transform: scale(0.9);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .file-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .file-status {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .file-name {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-weight: 500;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: help;
      color: #ffffff;
    }

    .uploaded-text {
      font-weight: 400;
      color: rgba(255, 255, 255, 0.9);
      font-size: 12px;
      white-space: nowrap;
    }

    .cdktf-status {
      font-weight: 500;
      color: #ffffff;
      white-space: nowrap;
    }

    /* Mobile responsive */
    @media (max-width: 992px) {
      .file-name {
        max-width: 160px;
      }
    }

    @media (max-width: 768px) {
      .file-indicators {
        gap: 8px;
      }
      
      .file-indicator {
        gap: 6px;
        font-size: 12px;
        padding: 6px 12px;
      }
      
      .file-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      
      .file-name {
        max-width: 140px;
      }
      
      .uploaded-text {
        font-size: 11px;
      }
      
      .cdktf-status {
        font-size: 12px;
      }
    }

    @media (max-width: 600px) {
      .file-indicators {
        gap: 6px;
      }
      
      .file-indicator {
        font-size: 11px;
        padding: 5px 10px;
        gap: 5px;
      }
      
      .file-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
      
      .file-name {
        max-width: 120px;
      }
      
      .uploaded-text {
        font-size: 10px;
      }
      
      .cdktf-status {
        font-size: 11px;
      }
    }

    @media (max-width: 480px) {
      .file-indicators {
        flex-direction: column;
        gap: 4px;
      }
      
      .file-indicator {
        padding: 4px 8px;
      }
      
      .file-name {
        max-width: 100px;
      }
    }
  `]
})
export class FileIndicatorComponent implements OnInit, OnChanges {
    @Input() planFileName: string | null = null;
    @Input() cdktfLoaded: boolean = false;

    ngOnInit() {
    }

    ngOnChanges() {
    }

    /**
     * Get a shortened version of the filename for display
     */
    getShortFileName(fileName: string | null): string {
        if (!fileName) return '';

        // If filename is too long, show first part and extension
        if (fileName.length > 25) {
            const parts = fileName.split('.');
            if (parts.length > 1) {
                const extension = parts.pop();
                const baseName = parts.join('.');
                return `${baseName.substring(0, 18)}...${extension}`;
            }
            return `${fileName.substring(0, 22)}...`;
        }

        return fileName;
    }


}