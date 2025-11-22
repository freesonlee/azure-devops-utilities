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
  templateUrl: './resource-list.component.html',
  styleUrls: ['./resource-list.component.scss', './terraform-plan-display.component.scss']
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

    // Handle "changes" filter: show all resources that have actions other than no-op
    if (action === 'changes') {
      return !(actions.length === 1 && actions[0] === 'no-op');
    }

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