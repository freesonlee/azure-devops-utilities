import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConstructNode, ResourceChange } from '../../interfaces/terraform-plan.interface';

@Component({
  selector: 'app-construct-view',
  standalone: true,
  imports: [
    CommonModule,
    MatExpansionModule,
    MatIconModule,
    MatChipsModule,
    MatButtonModule,
    MatTooltipModule
  ],
  template: `
    <div class="construct-view-container">
      <div *ngIf="constructNode && shouldShowConstruct()" class="construct-node">
        <!-- Construct Node Header -->
        <mat-expansion-panel 
          class="construct-panel"
          [expanded]="constructNode.isExpanded"
          (opened)="onConstructExpanded()"
          (closed)="onConstructCollapsed()">
          
          <mat-expansion-panel-header>
            <mat-panel-title class="construct-title">
              <mat-icon class="construct-icon">{{ getConstructIcon() }}</mat-icon>
              <span class="construct-name">{{ constructNode.name }}</span>
              <mat-chip class="construct-path-chip" *ngIf="showFullPath">
                {{ constructNode.path }}
              </mat-chip>
            </mat-panel-title>
            
            <mat-panel-description class="construct-description">
              <div class="construct-stats">
                <mat-chip class="resource-count-chip" *ngIf="getFilteredTotalResourceCount() > 0">
                  <mat-icon>layers</mat-icon>
                  {{ getFilteredTotalResourceCount() }} resources
                </mat-chip>
                
                <mat-chip class="children-count-chip" *ngIf="getVisibleChildrenCount() > 0">
                  <mat-icon>account_tree</mat-icon>
                  {{ getVisibleChildrenCount() }} construct(s)
                </mat-chip>
                
                <mat-chip class="direct-resources-chip" *ngIf="getFilteredDirectResources().length > 0">
                  <mat-icon>description</mat-icon>
                  {{ getFilteredDirectResources().length }} direct
                </mat-chip>
              </div>
            </mat-panel-description>
          </mat-expansion-panel-header>

          <!-- Construct Content -->
          <div class="construct-content">
            <!-- Child Constructs (Recursive) -->
            <div *ngIf="getVisibleChildren().length > 0" class="child-constructs">
              <h4 class="section-title">
                <mat-icon>account_tree</mat-icon>
                Child Constructs
              </h4>
              
              <div class="child-constructs-list">
                <app-construct-view
                  *ngFor="let childNode of getVisibleChildren(); trackBy: trackByConstruct"
                  [constructNode]="childNode"
                  [selectedResource]="selectedResource"
                  [searchFilter]="searchFilter"
                  [activeResourceFilter]="activeResourceFilter"
                  [showFullPath]="showFullPath"
                  (resourceSelected)="onResourceSelected($event)"
                  (constructToggled)="onChildConstructToggled($event)"
                  class="child-construct-view">
                </app-construct-view>
              </div>
            </div>

            <!-- Direct Resources -->
            <div *ngIf="constructNode.directResources.length > 0" class="direct-resources-section">
              
              <div class="direct-resources-list">
                <div *ngFor="let resource of getFilteredDirectResources(); trackBy: trackByResource"
                     class="resource-item construct-resource-item"
                     [class.selected]="selectedResource?.address === resource.address"
                     (click)="onResourceSelected(resource)">
                  
                  <div class="resource-header">
                    <div class="resource-address">
                      <code>{{ resource.address }}</code>
                    </div>
                    <div class="resource-actions">
                      <mat-chip *ngFor="let action of resource.change.actions"
                               [style.background-color]="getActionColor([action])"
                               [style.color]="'white'" class="action-chip">
                        <mat-icon [style.font-size]="'14px'">{{ getActionIcon([action]) }}</mat-icon>
                        {{ action }}
                      </mat-chip>
                    </div>
                  </div>

                  <div class="resource-meta">
                    <span class="resource-type">{{ resource.type }}</span>
                    <span class="resource-provider">{{ resource.provider_name }}</span>
                    <span class="construct-path">{{ getResourceConstructPath(resource) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Empty State -->
            <div *ngIf="getVisibleChildren().length === 0 && getFilteredDirectResources().length === 0" 
                 class="empty-construct">
              <mat-icon>folder_open</mat-icon>
              <p>This construct contains no matching resources or child constructs</p>
            </div>
          </div>
        </mat-expansion-panel>
      </div>

      <!-- Root level - no construct node, just show children -->
      <div *ngIf="!constructNode && getVisibleRootChildren().length > 0" class="root-constructs">
        <app-construct-view
          *ngFor="let childNode of getVisibleRootChildren(); trackBy: trackByConstruct"
          [constructNode]="childNode"
          [selectedResource]="selectedResource"
          [searchFilter]="searchFilter"
          [activeResourceFilter]="activeResourceFilter"
          [showFullPath]="showFullPath"
          (resourceSelected)="onResourceSelected($event)"
          (constructToggled)="onChildConstructToggled($event)"
          class="root-construct-view">
        </app-construct-view>
      </div>

      <!-- No matching resources state -->
      <div *ngIf="!constructNode && shouldShowNoMatchingResourcesMessage()" class="no-matching-resources">
        <mat-icon>info</mat-icon>
        <p>No resources match the current filter criteria</p>
      </div>
    </div>
  `,
  styles: [`
    .construct-view-container {
      width: 100%;
    }

    .construct-panel {
      margin-bottom: 8px;
      border-left: 3px solid #2196f3;
    }

    .construct-panel.mat-expansion-panel {
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .construct-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }

    .construct-icon {
      color: #2196f3;
      font-size: 20px;
    }

    .construct-name {
      font-weight: 600;
      color: #333;
    }

    .construct-path-chip {
      background-color: #e3f2fd;
      color: #1976d2;
      font-size: 0.8em;
      font-family: 'Courier New', monospace;
    }

    .construct-description {
      display: flex;
      align-items: center;
    }

    .construct-stats {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .resource-count-chip {
      background-color: #4caf50;
      color: white;
      font-size: 0.8em;
    }

    .children-count-chip {
      background-color: #ff9800;
      color: white;
      font-size: 0.8em;
    }

    .direct-resources-chip {
      background-color: #9c27b0;
      color: white;
      font-size: 0.8em;
    }

    .construct-content {
      padding: 16px 0;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 16px 0 12px 0;
      color: #666;
      font-size: 1.1em;
      font-weight: 500;
    }

    .child-constructs-list {
      margin-left: 16px;
      border-left: 2px dashed #e0e0e0;
      padding-left: 16px;
    }

    .child-construct-view {
      margin-bottom: 12px;
    }

    .direct-resources-section {
      margin-top: 16px;
    }

    .direct-resources-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .resource-item {
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
      background-color: white;
    }

    .resource-item:hover {
      background-color: #f5f5f5;
      border-color: #2196f3;
      box-shadow: 0 2px 8px rgba(33, 150, 243, 0.1);
    }

    .resource-item.selected {
      background-color: #e3f2fd;
      border-color: #2196f3;
      border-width: 2px;
      box-shadow: 0 2px 8px rgba(33, 150, 243, 0.2);
    }

    .construct-resource-item {
      border-left: 4px solid #2196f3;
    }

    .resource-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .resource-address {
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      color: #333;
    }

    .resource-actions {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .action-chip {
      font-size: 0.75em;
      min-height: 24px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .resource-meta {
      display: flex;
      gap: 12px;
      font-size: 0.9em;
      color: #666;
      flex-wrap: wrap;
    }

    .resource-type {
      font-weight: 500;
      color: #1976d2;
    }

    .resource-provider {
      color: #ff9800;
    }

    .construct-path {
      color: #9c27b0;
      font-family: 'Courier New', monospace;
      font-size: 0.8em;
    }

    .empty-construct {
      text-align: center;
      padding: 24px;
      color: #999;
    }

    .empty-construct mat-icon {
      font-size: 48px;
      color: #ccc;
      margin-bottom: 8px;
    }

    .root-constructs {
      width: 100%;
    }

    .root-construct-view {
      margin-bottom: 16px;
    }

    .no-matching-resources {
      text-align: center;
      padding: 48px 24px;
      color: #666;
      background-color: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      margin: 16px 0;
    }

    .no-matching-resources mat-icon {
      font-size: 48px;
      color: #adb5bd;
      margin-bottom: 16px;
    }

    .no-matching-resources p {
      margin: 0;
      font-size: 1.1em;
      color: #6c757d;
    }
  `]
})
export class ConstructViewComponent implements OnChanges {
  @Input() constructNode: ConstructNode | null = null;
  @Input() rootChildren: ConstructNode[] = []; // For root level display
  @Input() selectedResource: ResourceChange | null = null;
  @Input() searchFilter: string = '';
  @Input() activeResourceFilter: string | null = null;
  @Input() showFullPath: boolean = false;

  @Output() resourceSelected = new EventEmitter<ResourceChange>();
  @Output() constructToggled = new EventEmitter<{ node: ConstructNode; expanded: boolean }>();

  private filteredDirectResources: ResourceChange[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['constructNode'] || changes['searchFilter'] || changes['activeResourceFilter']) {
      this.applyFilters();
    }
  }

  private applyFilters(): void {
    if (!this.constructNode) {
      this.filteredDirectResources = [];
      return;
    }

    this.filteredDirectResources = this.constructNode.directResources.filter(resource =>
      this.matchesFilters(resource)
    );
  }

  private matchesFilters(resource: ResourceChange): boolean {
    // Search filter
    if (this.searchFilter) {
      const searchTerm = this.searchFilter.toLowerCase();
      const searchableText = [
        resource.name,
        resource.address,
        resource.type,
        resource.provider_name
      ].join(' ').toLowerCase();

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }

    // Active resource filter
    if (this.activeResourceFilter) {
      if (!this.resourceMatchesAction(resource, this.activeResourceFilter)) {
        return false;
      }
    }

    return true;
  }

  private resourceMatchesAction(resource: ResourceChange, action: string): boolean {
    const actions = resource.change.actions;

    // Check if this resource is actually a replace (has both delete and create, or explicit replace)
    const isReplace = actions.includes('replace') ||
      (actions.includes('delete') && actions.includes('create'));

    // Handle replace case: both delete and create actions should match "replace" filter
    if (action === 'replace') {
      return isReplace;
    }

    // For create and delete actions, exclude resources that are actually being replaced
    if (action === 'create' || action === 'delete') {
      if (isReplace) {
        return false; // Don't show replaced resources in create or delete sections
      }
    }

    // For other actions, check if the specific action is included
    return actions.includes(action);
  }

  getFilteredDirectResources(): ResourceChange[] {
    return this.filteredDirectResources;
  }

  shouldShowConstruct(): boolean {
    if (!this.constructNode) return false;

    // Show the construct if it has any filtered resources (direct or in children)
    return this.getFilteredTotalResourceCount() > 0;
  }

  getFilteredTotalResourceCount(): number {
    if (!this.constructNode) return 0;

    // Count filtered direct resources
    const directCount = this.getFilteredDirectResources().length;

    // Recursively count filtered resources from child constructs
    const childrenCount = this.constructNode.children.reduce((sum, child) => {
      // Create a temporary child component to calculate its filtered count
      // This is a simplified calculation - in a real implementation, you might want to cache this
      const childFiltered = child.directResources.filter(resource => this.matchesFilters(resource));
      return sum + childFiltered.length + this.getChildConstructFilteredCount(child);
    }, 0);

    return directCount + childrenCount;
  }

  private getChildConstructFilteredCount(node: ConstructNode): number {
    const directCount = node.directResources.filter(resource => this.matchesFilters(resource)).length;
    const childrenCount = node.children.reduce((sum, child) => {
      return sum + this.getChildConstructFilteredCount(child);
    }, 0);
    return directCount + childrenCount;
  }

  getVisibleChildrenCount(): number {
    if (!this.constructNode) return 0;

    // Count children that have at least one filtered resource (recursively)
    return this.constructNode.children.filter(child => {
      return this.getChildConstructFilteredCount(child) > 0;
    }).length;
  }

  getVisibleChildren(): ConstructNode[] {
    if (!this.constructNode) return [];

    // Filter children to only show those with filtered resources
    return this.constructNode.children.filter(child => {
      return this.getChildConstructFilteredCount(child) > 0;
    });
  }

  getVisibleRootChildren(): ConstructNode[] {
    if (!this.rootChildren) return [];

    // Filter root children to only show those with filtered resources
    return this.rootChildren.filter(child => {
      return this.getChildConstructFilteredCount(child) > 0;
    });
  }

  shouldShowNoMatchingResourcesMessage(): boolean {
    // Show the message only when we're at the root level, have root children, 
    // but none of them are visible due to filtering, and there's an active filter
    return !!(this.rootChildren &&
      this.rootChildren.length > 0 &&
      this.getVisibleRootChildren().length === 0 &&
      (this.activeResourceFilter || (this.searchFilter && this.searchFilter.trim().length > 0)));
  }

  onConstructExpanded(): void {
    if (this.constructNode) {
      this.constructNode.isExpanded = true;
      this.constructToggled.emit({ node: this.constructNode, expanded: true });
    }
  }

  onConstructCollapsed(): void {
    if (this.constructNode) {
      this.constructNode.isExpanded = false;
      this.constructToggled.emit({ node: this.constructNode, expanded: false });
    }
  }

  onResourceSelected(resource: ResourceChange): void {
    this.resourceSelected.emit(resource);
  }

  onChildConstructToggled(event: { node: ConstructNode; expanded: boolean }): void {
    this.constructToggled.emit(event);
  }

  getConstructIcon(): string {
    if (!this.constructNode) return 'folder';

    if (this.constructNode.children.length > 0) {
      return this.constructNode.isExpanded ? 'folder_open' : 'folder';
    } else {
      return 'description';
    }
  }

  getResourceConstructPath(resource: ResourceChange): string {
    // Extract path from resource address or metadata
    if (this.constructNode) {
      return this.constructNode.path;
    }
    return '';
  }

  // Utility methods
  getActionIcon(actions: string[]): string {
    if (actions.includes('replace') || (actions.includes('delete') && actions.includes('create'))) {
      return 'swap_horiz';
    }
    if (actions.includes('create')) return 'add_circle';
    if (actions.includes('update')) return 'edit';
    if (actions.includes('delete')) return 'delete';
    return 'help';
  }

  getActionColor(actions: string[]): string {
    if (actions.includes('replace') || (actions.includes('delete') && actions.includes('create'))) {
      return '#9c27b0';
    }
    if (actions.includes('create')) return '#4caf50';
    if (actions.includes('update')) return '#ff9800';
    if (actions.includes('delete')) return '#f44336';
    return '#757575';
  }

  // TrackBy functions
  trackByConstruct(index: number, item: ConstructNode): string {
    return item.path;
  }

  trackByResource(index: number, item: ResourceChange): string {
    return item.address;
  }
}