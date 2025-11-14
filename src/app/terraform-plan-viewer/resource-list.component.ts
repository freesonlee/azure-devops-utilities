import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ResourceChange, ModuleGroup, ResourceTypeGroup, IteratorGroup } from '../../interfaces/terraform-plan.interface';

@Component({
  selector: 'app-resource-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatChipsModule,
    MatExpansionModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatTooltipModule
  ],
  template: `
    <div class="resource-list-container">

      <!-- Module Groups -->
      <div class="module-groups" *ngIf="moduleGroups && moduleGroups.length > 0">
        <mat-accordion *ngFor="let moduleGroup of getFilteredModuleGroups(); trackBy: trackByModuleGroup"
                       class="module-accordion">
          <mat-expansion-panel class="module-panel" expanded="true">
            <mat-expansion-panel-header>
              <mat-panel-title class="module-title">
                <mat-icon>extension</mat-icon>
                {{ moduleGroup.display_name }}
              </mat-panel-title>
              <mat-panel-description class="module-description">
                <mat-chip class="resource-count-chip">
                  <mat-icon>layers</mat-icon>
                  {{ moduleGroup.resource_count }} resources
                </mat-chip>
              </mat-panel-description>
            </mat-expansion-panel-header>

            <!-- Resource Types in Module -->
            <div class="resource-types-in-module">
              <div *ngFor="let resourceType of getModuleResourceTypes(moduleGroup); trackBy: trackByResourceType"
                   class="resource-type-group">
                <mat-accordion class="resource-type-accordion">
                  <mat-expansion-panel class="resource-type-panel">
                    <mat-expansion-panel-header>
                      <mat-panel-title class="resource-type-title">
                        {{ resourceType.display_name }}
                      </mat-panel-title>
                      <mat-panel-description class="resource-type-description">
                        <mat-chip class="resource-count-chip">
                          <mat-icon>layers</mat-icon>
                          {{ resourceType.total_count }} resources
                        </mat-chip>
                        <mat-chip class="iterator-groups-chip" *ngIf="resourceType.iterator_groups.length > 0">
                          <mat-icon>view_list</mat-icon>
                          {{ resourceType.iterator_groups.length }} groups
                        </mat-chip>
                      </mat-panel-description>
                    </mat-expansion-panel-header>

                    <!-- Direct resources -->
                    <div *ngIf="resourceType.resources.length > 0" class="direct-resources">
                      <div *ngFor="let resource of resourceType.resources; trackBy: trackByResource"
                           class="resource-item"
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
                        </div>
                      </div>
                    </div>

                    <!-- Iterator groups -->
                    <div *ngIf="resourceType.iterator_groups.length > 0" class="iterator-groups">
                      <div *ngFor="let iteratorGroup of resourceType.iterator_groups; trackBy: trackByIteratorGroup"
                           class="iterator-group">
                        
                        <!-- Single instance: show directly -->
                        <div *ngIf="iteratorGroup.resources.length === 1" class="single-instance">
                          <div *ngFor="let resource of iteratorGroup.resources; trackBy: trackByResource"
                               class="resource-item iterator-resource-item"
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
                            </div>
                          </div>
                        </div>

                        <!-- Multiple instances: show with sub-accordion -->
                        <mat-accordion *ngIf="iteratorGroup.resources.length > 1" class="iterator-group-accordion">
                          <mat-expansion-panel class="iterator-group-panel">
                            <mat-expansion-panel-header>
                              <mat-panel-title class="iterator-group-title">
                                <mat-icon class="iterator-icon">
                                  {{ iteratorGroup.iterator_type === 'count' ? 'format_list_numbered' : 'view_list' }}
                                </mat-icon>
                                <code>{{ iteratorGroup.base_address }}</code>
                              </mat-panel-title>
                              <mat-panel-description class="iterator-group-description">
                                {{ iteratorGroup.resources.length }} instances ({{ iteratorGroup.iterator_type }})
                              </mat-panel-description>
                            </mat-expansion-panel-header>

                            <div class="iterator-resource-list">
                              <div *ngFor="let resource of iteratorGroup.resources; trackBy: trackByResource"
                                   class="resource-item iterator-resource-item"
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
                                </div>
                              </div>
                            </div>
                          </mat-expansion-panel>
                        </mat-accordion>
                      </div>
                    </div>
                  </mat-expansion-panel>
                </mat-accordion>
              </div>
            </div>
          </mat-expansion-panel>
        </mat-accordion>
      </div>

      <!-- No resources state -->
      <div *ngIf="!moduleGroups || moduleGroups.length === 0" class="no-matching-resources">
        <mat-icon>info</mat-icon>
        <p>No resources match the current filter criteria</p>
      </div>
    </div>
  `,
  styleUrls: ['./terraform-plan-display.component.scss']
})
export class ResourceListComponent implements OnChanges {
  @Input() moduleGroups: ModuleGroup[] = [];
  @Input() resourcesByModuleWithIterators: Map<string, Map<string, ResourceTypeGroup>> = new Map();
  @Input() selectedResource: ResourceChange | null = null;
  @Input() activeResourceFilter: string | null = null;
  @Input() searchFilter: string = '';

  @Output() resourceSelected = new EventEmitter<ResourceChange>();
  @Output() searchFilterChanged = new EventEmitter<string>();

  private filteredModuleGroups: ModuleGroup[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['moduleGroups'] || changes['searchFilter'] || changes['activeResourceFilter']) {
      this.applyFilters();
    }
  }

  private applyFilters(): void {
    this.filteredModuleGroups = this.moduleGroups
      .map(moduleGroup => {
        // Get filtered resource types for this module
        const filteredResourceTypes = this.getModuleResourceTypes(moduleGroup);

        // Calculate total filtered resource count for the module
        const filteredResourceCount = filteredResourceTypes.reduce((sum, resourceType) =>
          sum + resourceType.total_count, 0);

        // Return the module group with updated count
        return {
          ...moduleGroup,
          resource_count: filteredResourceCount
        };
      })
      .filter(moduleGroup => moduleGroup.resource_count > 0); // Only include modules with filtered resources
  }

  private matchesSearchFilter(resource: ResourceChange): boolean {
    if (!this.searchFilter) return true;

    const searchTerm = this.searchFilter.toLowerCase();
    const searchableText = [
      resource.name,
      resource.address,
      resource.type,
      resource.provider_name
    ].join(' ').toLowerCase();

    return searchableText.includes(searchTerm);
  }

  getFilteredModuleGroups(): ModuleGroup[] {
    return this.filteredModuleGroups;
  }

  getModuleResourceTypes(moduleGroup: ModuleGroup): ResourceTypeGroup[] {
    const resourceTypes = this.resourcesByModuleWithIterators.get(moduleGroup.name);
    if (!resourceTypes) return [];

    return Array.from(resourceTypes.values())
      .map(resourceType => {
        // Filter direct resources
        const filteredResources = resourceType.resources.filter(resource =>
          this.matchesSearchFilter(resource) && this.matchesActiveFilter(resource)
        );

        // Filter iterator groups and their resources
        const filteredIteratorGroups = resourceType.iterator_groups
          .map(group => ({
            ...group,
            resources: group.resources.filter(resource =>
              this.matchesSearchFilter(resource) && this.matchesActiveFilter(resource)
            )
          }))
          .filter(group => group.resources.length > 0); // Only include groups that have filtered resources

        // Calculate the new total count
        const newTotalCount = filteredResources.length +
          filteredIteratorGroups.reduce((sum, group) => sum + group.resources.length, 0);

        // Return the filtered resource type group
        return {
          ...resourceType,
          resources: filteredResources,
          iterator_groups: filteredIteratorGroups,
          total_count: newTotalCount
        };
      })
      .filter(resourceType => resourceType.total_count > 0); // Only include types that have filtered resources
  }

  private matchesActiveFilter(resource: ResourceChange): boolean {
    if (!this.activeResourceFilter) return true;
    return this.resourceMatchesAction(resource, this.activeResourceFilter);
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

  onResourceSelected(resource: ResourceChange): void {
    this.resourceSelected.emit(resource);
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

  // TrackBy functions for performance
  trackByModuleGroup(index: number, item: ModuleGroup): string {
    return item.name;
  }

  trackByResourceType(index: number, item: ResourceTypeGroup): string {
    return item.type;
  }

  trackByResource(index: number, item: ResourceChange): string {
    return item.address;
  }

  trackByIteratorGroup(index: number, item: IteratorGroup): string {
    return item.base_address;
  }
}