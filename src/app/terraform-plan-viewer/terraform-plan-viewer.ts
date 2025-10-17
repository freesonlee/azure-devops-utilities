import { Component, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule, MatTabGroup } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTableDataSource } from '@angular/material/table';
import { TerraformPlanService } from '../../services/terraform-plan.service';
import { TerraformPlan, ResourceSummary, ResourceChange, ModuleGroup, ResourceTypeGroup, IteratorGroup } from '../../interfaces/terraform-plan.interface';
import * as Diff from 'diff';

@Component({
  selector: 'app-terraform-plan-viewer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTabsModule,
    MatIconModule,
    MatChipsModule,
    MatExpansionModule,
    MatButtonModule,
    MatTableModule,
    MatToolbarModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressBarModule,
    MatSidenavModule
  ],
  providers: [TerraformPlanService],
  templateUrl: './terraform-plan-viewer.html',
  styleUrl: './terraform-plan-viewer.scss'
})
export class TerraformPlanViewerComponent implements OnInit {
  @ViewChild('tabGroup') tabGroup!: MatTabGroup;

  plan: TerraformPlan | null = null;
  resourceSummary: ResourceSummary = { create: 0, update: 0, delete: 0, replace: 0, total: 0 };
  resourcesByType: Map<string, ResourceChange[]> = new Map();
  resourceTypeGroups: Map<string, ResourceTypeGroup> = new Map();
  moduleGroups: ModuleGroup[] = [];
  resourcesByModule: Map<string, Map<string, ResourceChange[]>> = new Map();
  resourcesByModuleWithIterators: Map<string, Map<string, ResourceTypeGroup>> = new Map();
  allVariables: any[] = [];
  filteredVariables = new MatTableDataSource<any>([]);
  allOutputs: any[] = [];
  filteredOutputs = new MatTableDataSource<any>([]);
  outputGroups: Map<string, any[]> = new Map();

  // Filter properties
  variableNameFilter: string = '';
  variableValueFilter: string = '';
  outputNameFilter: string = '';
  activeResourceFilter: string | null = null;

  // Track expanded variables and outputs
  expandedVariables: Set<string> = new Set<string>();
  expandedOutputs: Set<string> = new Set<string>();

  // Cache for change calculations to prevent recalculation during change detection
  private changeFieldsCache = new Map<string, { [key: string]: { before: any, after: any, changed: boolean } }>();

  // Selected resource for right panel display
  selectedResource: ResourceChange | null = null;

  displayedColumnsVariables: string[] = ['key', 'type', 'value'];
  displayedColumnsOutputs: string[] = ['key', 'type', 'sensitive', 'value'];
  displayedColumnsResources: string[] = ['address', 'type', 'actions', 'provider'];

  constructor(
    private terraformService: TerraformPlanService,
    private http: HttpClient
  ) { }

  ngOnInit(): void {
    this.terraformService.plan$.subscribe(plan => {
      this.plan = plan;
      if (plan) {
        this.loadPlanData();
      }
    });

    // Load sample data automatically
    this.loadSampleData();

    // Expose test method for debugging (development only)
    if (typeof window !== 'undefined') {
      (window as any).testRecursiveComparison = () => this.testRecursiveComparison();
    }
  }

  private loadSampleData(): void {
    this.http.get<TerraformPlan>('/update-sample.json').subscribe({
      next: (data) => {
        this.terraformService.loadPlan(data);
      },
      error: (error) => {
        console.log('Sample data not found, trying original sample.json');
        this.http.get<TerraformPlan>('/sample.json').subscribe({
          next: (data) => {
            this.terraformService.loadPlan(data);
          },
          error: (fallbackError) => {
            console.log('No sample data found, waiting for user to upload a file');
          }
        });
      }
    });
  }

  private loadPlanData(): void {
    this.resourceSummary = this.terraformService.getResourceSummary();
    this.resourcesByType = this.terraformService.getResourcesByType();
    this.resourceTypeGroups = this.terraformService.getResourceTypeGroups();
    this.moduleGroups = this.terraformService.getModuleGroups();
    this.resourcesByModule = this.terraformService.getResourcesByModule();
    this.resourcesByModuleWithIterators = this.terraformService.getResourcesByModuleWithIterators();
    this.allVariables = this.terraformService.getAllVariables();
    this.filteredVariables.data = this.allVariables;
    this.allOutputs = this.terraformService.getAllOutputs();
    this.filteredOutputs.data = this.allOutputs;
    this.outputGroups = this.terraformService.getOutputGroups();

    // Clear the cache and expanded states when new data is loaded
    this.clearExpandedResources();

    // Debug logging
    console.log('Resource Summary:', this.resourceSummary);
    console.log('Resources by Type:', this.resourcesByType);
    console.log('Module Groups:', this.moduleGroups);
    console.log('Resources by Module:', this.resourcesByModule);
    console.log('Plan loaded:', this.plan);
  }

  applyVariableFilter(): void {
    const nameFilter = this.variableNameFilter.toLowerCase();
    const valueFilter = this.variableValueFilter.toLowerCase();

    this.filteredVariables.data = this.allVariables.filter(variable => {
      const nameMatch = !nameFilter || variable.key.toLowerCase().includes(nameFilter);
      const valueMatch = !valueFilter ||
        (variable.value && variable.value.toString().toLowerCase().includes(valueFilter));

      return nameMatch && valueMatch;
    });
  }

  clearVariableFilters(): void {
    this.variableNameFilter = '';
    this.variableValueFilter = '';
    this.filteredVariables.data = this.allVariables;
  }

  applyOutputFilter(): void {
    const nameFilter = this.outputNameFilter.toLowerCase();

    this.filteredOutputs.data = this.allOutputs.filter(output => {
      const nameMatch = !nameFilter || output.key.toLowerCase().includes(nameFilter);
      return nameMatch;
    });
  }

  clearOutputFilters(): void {
    this.outputNameFilter = '';
    this.filteredOutputs.data = this.allOutputs;
  }

  getActionIcon(actions: string[]): string {
    // Check for replace first (both delete and create, or explicit replace)
    if (actions.includes('replace') || (actions.includes('delete') && actions.includes('create'))) {
      return 'swap_horiz';
    }
    if (actions.includes('create')) return 'add_circle';
    if (actions.includes('update')) return 'edit';
    if (actions.includes('delete')) return 'delete';
    return 'help';
  }

  getActionColor(actions: string[]): string {
    // Check for replace first (both delete and create, or explicit replace)
    if (actions.includes('replace') || (actions.includes('delete') && actions.includes('create'))) {
      return '#9c27b0';
    }
    if (actions.includes('create')) return '#4caf50';
    if (actions.includes('update')) return '#ff9800';
    if (actions.includes('delete')) return '#f44336';
    return '#757575';
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const planData = JSON.parse(e.target?.result as string);
          this.terraformService.loadPlan(planData);
        } catch (error) {
          console.error('Error parsing JSON file:', error);
          alert('Error parsing JSON file. Please check the file format.');
        }
      };
      reader.readAsText(file);
    }
  }

  formatValue(value: any, itemKey?: string, type?: 'variable' | 'output'): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value.toString();
    }
    if (Array.isArray(value)) {
      // For arrays, show summary unless expanded
      if (itemKey) {
        const expandedSet = type === 'output' ? this.expandedOutputs : this.expandedVariables;
        if (expandedSet.has(itemKey)) {
          return JSON.stringify(value, null, 2);
        }
      }
      return `[${value.length} items]`;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return value.toString();
  }

  toggleArrayExpansion(variableKey: string, type: 'variable' | 'output' = 'variable'): void {
    const expandedSet = type === 'variable' ? this.expandedVariables : this.expandedOutputs;
    if (expandedSet.has(variableKey)) {
      expandedSet.delete(variableKey);
    } else {
      expandedSet.add(variableKey);
    }
  }

  isArrayExpanded(variableKey: string, type: 'variable' | 'output' = 'variable'): boolean {
    const expandedSet = type === 'variable' ? this.expandedVariables : this.expandedOutputs;
    return expandedSet.has(variableKey);
  }

  isArrayType(value: any): boolean {
    return Array.isArray(value);
  }

  getResourceTypeDisplayName(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  getVariableTypeIcon(type: string): string {
    switch (type) {
      case 'string': return 'text_fields';
      case 'boolean': return 'toggle_on';
      case 'number': return 'numbers';
      case 'array': return 'view_list';
      case 'object': return 'data_object';
      case 'null': return 'block';
      default: return 'help';
    }
  }

  getVariableTypeColor(type: string): string {
    switch (type) {
      case 'string': return '#2196f3';
      case 'boolean': return '#4caf50';
      case 'number': return '#ff9800';
      case 'array': return '#9c27b0';
      case 'object': return '#607d8b';
      case 'null': return '#757575';
      default: return '#757575';
    }
  }

  onStatButtonClick(action: string): void {
    // Set the active filter
    this.activeResourceFilter = action;

    // Switch to Resource Changes tab (index 0)
    if (this.tabGroup) {
      this.tabGroup.selectedIndex = 0;
    }
  }

  clearResourceFilter(): void {
    this.activeResourceFilter = null;
  }

  getFilteredResourcesByType(): Map<string, ResourceChange[]> {
    if (!this.activeResourceFilter) {
      return this.resourcesByType;
    }

    const filteredMap = new Map<string, ResourceChange[]>();

    for (const [type, resources] of this.resourcesByType.entries()) {
      const filteredResources = resources.filter(resource =>
        this.resourceMatchesAction(resource, this.activeResourceFilter!)
      );

      if (filteredResources.length > 0) {
        filteredMap.set(type, filteredResources);
      }
    }

    return filteredMap;
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

  getFilteredResourceCount(): number {
    if (!this.activeResourceFilter) {
      return Array.from(this.resourcesByType.values())
        .reduce((total, resources) => total + resources.length, 0);
    }

    return Array.from(this.resourcesByType.values())
      .reduce((total, resources) => {
        const filteredCount = resources.filter(resource =>
          this.resourceMatchesAction(resource, this.activeResourceFilter!)
        ).length;
        return total + filteredCount;
      }, 0);
  }

  trackByResourceType(index: number, item: any): string {
    return item.key;
  }

  trackByResource(index: number, item: ResourceChange): string {
    return item.address;
  }

  trackByModuleGroup(index: number, item: ModuleGroup): string {
    return item.name;
  }

  trackByIteratorGroup(index: number, item: IteratorGroup): string {
    return item.base_address;
  }

  trackByResourceTypeGroup(index: number, item: any): string {
    return item.key;
  }

  trackByFieldChange(index: number, item: any): string {
    return item.key;
  }

  trackByFieldKey(index: number, item: any): string {
    return item.key;
  }

  trackByDiffLine(index: number, item: any): string {
    return `${item.type}-${item.lineNumber}-${item.line}`;
  }

  trackBySyncedDiffLine(index: number, item: any): string {
    return `${index}-${item.before.type}-${item.after.type}`;
  }

  trackByPropertyDiff(index: number, item: any): string {
    return `${item.path || item.key}-${item.changed}-${item.depth || 0}`;
  }

  toggleResourceDetails(resource: ResourceChange): void {
    // Add expanded property to the resource if it doesn't exist
    (resource as any).expanded = !(resource as any).expanded;
    console.log('Toggled resource details for:', resource.address, 'expanded:', (resource as any).expanded);
  }

  selectResource(resource: ResourceChange): void {
    this.selectedResource = resource;
    console.log('Selected resource for details:', resource.address);
  }

  isResourceSelected(resource: ResourceChange): boolean {
    return this.selectedResource?.address === resource.address;
  }

  clearExpandedResources(): void {
    // Clear all expanded states and cache when switching data
    this.changeFieldsCache.clear();
    this.selectedResource = null;
    for (const [type, resources] of this.resourcesByType.entries()) {
      resources.forEach(resource => {
        (resource as any).expanded = false;
      });
    }
  }

  getResourceConfigData(resource: ResourceChange): any {
    // Return the 'after' data for creates, 'before' for deletes, or both for other actions
    if (resource.change.actions.includes('create')) {
      return resource.change.after;
    } else if (resource.change.actions.includes('delete')) {
      return resource.change.before;
    } else {
      return {
        before: resource.change.before,
        after: resource.change.after
      };
    }
  }

  getChangeDetails(resource: ResourceChange): any {
    // Return detailed change information from resource_changes.change
    return {
      actions: resource.change.actions,
      before: resource.change.before,
      after: resource.change.after,
      after_unknown: resource.change.after_unknown,
      before_sensitive: resource.change.before_sensitive,
      after_sensitive: resource.change.after_sensitive
    };
  }

  getChangedFields(resource: ResourceChange): { [key: string]: { before: any, after: any, changed: boolean } } {
    // Use resource address as cache key
    const cacheKey = resource.address;

    // Return cached result if available
    if (this.changeFieldsCache.has(cacheKey)) {
      return this.changeFieldsCache.get(cacheKey)!;
    }

    const changes: { [key: string]: { before: any, after: any, changed: boolean } } = {};
    const before = resource.change.before || {};
    const after = resource.change.after || {};

    // Get all unique keys from both before and after
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    allKeys.forEach(key => {
      const beforeValue = before[key];
      const afterValue = after[key];
      const changed = JSON.stringify(beforeValue) !== JSON.stringify(afterValue);

      changes[key] = {
        before: beforeValue,
        after: afterValue,
        changed: changed
      };
    });

    // Cache the result
    this.changeFieldsCache.set(cacheKey, changes);
    return changes;
  }

  getSortedChangedFields(resource: ResourceChange): Array<{ key: string, value: { before: any, after: any, changed: boolean } }> {
    const changes = this.getChangedFields(resource);

    // Convert object to array for sorting
    const changeEntries = Object.entries(changes).map(([key, value]) => ({ key, value }));

    // Sort entries: changed properties first, then unchanged properties
    changeEntries.sort((a, b) => {
      if (a.value.changed && !b.value.changed) return -1;
      if (!a.value.changed && b.value.changed) return 1;
      // If both have same change status, sort alphabetically by key
      return a.key.localeCompare(b.key);
    });

    return changeEntries;
  }

  hasChanges(resource: ResourceChange): boolean {
    // Use cached result to avoid recalculation during change detection
    const changes = this.getChangedFields(resource);
    return Object.values(changes).some(change => change.changed);
  }

  formatChangeValue(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value.toString();
    }
    if (Array.isArray(value)) {
      return JSON.stringify(value, null, 2);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return value.toString();
  }

  isComplexValue(value: any): boolean {
    return Array.isArray(value) || (typeof value === 'object' && value !== null);
  }

  getValueType(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (Array.isArray(value)) {
      return 'array';
    }
    if (typeof value === 'object') {
      return 'object';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    if (typeof value === 'number') {
      return 'number';
    }
    return 'string';
  }

  /**
   * Compare two values and return line-by-line differences with highlighting
   */
  getLineDifferences(beforeValue: any, afterValue: any): Array<{ line: string, type: 'equal' | 'added' | 'removed' }> {
    const beforeText = this.normalizeValueForComparison(beforeValue);
    const afterText = this.normalizeValueForComparison(afterValue);

    const beforeLines = beforeText.split('\n');
    const afterLines = afterText.split('\n');

    const diff = Diff.diffLines(beforeText, afterText, { ignoreWhitespace: true });
    const result: Array<{ line: string, type: 'equal' | 'added' | 'removed' }> = [];

    diff.forEach(part => {
      if (part.value) {
        const lines = part.value.split('\n');
        // Remove the last empty line if it exists due to splitting
        if (lines[lines.length - 1] === '') {
          lines.pop();
        }

        lines.forEach(line => {
          if (part.added) {
            result.push({ line, type: 'added' });
          } else if (part.removed) {
            result.push({ line, type: 'removed' });
          } else {
            result.push({ line, type: 'equal' });
          }
        });
      }
    });

    return result;
  }

  /**
   * Normalize a value for text comparison by converting to formatted string
   */
  private normalizeValueForComparison(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      return value.toString();
    }
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      return JSON.stringify(value, null, 2);
    }
    return value.toString();
  }

  /**
   * Check if two values have meaningful differences when compared as text
   */
  hasTextDifferences(beforeValue: any, afterValue: any): boolean {
    const differences = this.getLineDifferences(beforeValue, afterValue);
    return differences.some(diff => diff.type === 'added' || diff.type === 'removed');
  }

  /**
   * Check if a value is an object (but not an array or null)
   */
  isObjectValue(value: any): boolean {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Get object property differences for side-by-side comparison with recursive support
   */
  getObjectPropertyDifferences(beforeValue: any, afterValue: any, path: string = ''): Array<{
    key: string,
    before: any,
    after: any,
    changed: boolean,
    isNested: boolean,
    depth: number,
    path: string
  }> {
    const differences: Array<{
      key: string,
      before: any,
      after: any,
      changed: boolean,
      isNested: boolean,
      depth: number,
      path: string
    }> = [];

    // Handle arrays
    if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
      const beforeArr = Array.isArray(beforeValue) ? beforeValue : [];
      const afterArr = Array.isArray(afterValue) ? afterValue : [];
      const maxLength = Math.max(beforeArr.length, afterArr.length);

      for (let i = 0; i < maxLength; i++) {
        const beforeItem = beforeArr[i];
        const afterItem = afterArr[i];
        const currentPath = path ? `${path}.${i}` : `${i}`;
        const depth = path ? path.split('.').length + 1 : 0;

        // Check if array items are deeply equal
        const changed = !this.deepEqual(beforeItem, afterItem);

        // Add the array item difference
        differences.push({
          key: `[${i}]`,
          before: beforeItem,
          after: afterItem,
          changed: changed,
          isNested: this.isObjectValue(beforeItem) || this.isObjectValue(afterItem) || Array.isArray(beforeItem) || Array.isArray(afterItem),
          depth: depth,
          path: currentPath
        });

        // Recursively process nested objects/arrays in array items if they have differences
        if (changed && (this.isObjectValue(beforeItem) || this.isObjectValue(afterItem) || Array.isArray(beforeItem) || Array.isArray(afterItem))) {
          const nestedDifferences = this.getObjectPropertyDifferences(beforeItem, afterItem, currentPath);
          differences.push(...nestedDifferences);
        }
      }
    }
    // Handle objects
    else if (this.isObjectValue(beforeValue) || this.isObjectValue(afterValue)) {
      const beforeObj = this.isObjectValue(beforeValue) ? beforeValue : {};
      const afterObj = this.isObjectValue(afterValue) ? afterValue : {};

      // Get all unique keys from both objects
      const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

      allKeys.forEach(key => {
        const beforeVal = beforeObj[key];
        const afterVal = afterObj[key];
        const currentPath = path ? `${path}.${key}` : key;
        const depth = path ? path.split('.').length + 1 : 0;

        // Check if values are deeply equal
        const changed = !this.deepEqual(beforeVal, afterVal);

        // Add the property difference
        differences.push({
          key,
          before: beforeVal,
          after: afterVal,
          changed: changed,
          isNested: this.isObjectValue(beforeVal) || this.isObjectValue(afterVal) || Array.isArray(beforeVal) || Array.isArray(afterVal),
          depth: depth,
          path: currentPath
        });

        // Recursively process nested objects/arrays if they have differences
        if (changed && (this.isObjectValue(beforeVal) || this.isObjectValue(afterVal) || Array.isArray(beforeVal) || Array.isArray(afterVal))) {
          const nestedDifferences = this.getObjectPropertyDifferences(beforeVal, afterVal, currentPath);
          differences.push(...nestedDifferences);
        }
      });
    }

    // Sort by path for hierarchical display
    differences.sort((a, b) => {
      // First sort by depth (parent properties first)
      if (a.depth !== b.depth) {
        return a.depth - b.depth;
      }
      // Then sort by path name for consistent display
      return a.path.localeCompare(b.path);
    });

    return differences;
  }

  /**
   * Deep equality check for objects and arrays
   */
  private deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) {
      return true;
    }

    // Handle null/undefined cases
    if (obj1 == null || obj2 == null) {
      return obj1 === obj2;
    }

    // Check if both are objects
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
      return false;
    }

    // Handle arrays
    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
      return false;
    }

    if (Array.isArray(obj1)) {
      if (obj1.length !== obj2.length) {
        return false;
      }
      for (let i = 0; i < obj1.length; i++) {
        if (!this.deepEqual(obj1[i], obj2[i])) {
          return false;
        }
      }
      return true;
    }

    // Handle objects
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
      return false;
    }

    for (const key of keys1) {
      if (!(key in obj2)) {
        return false;
      }
      if (!this.deepEqual(obj1[key], obj2[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get flattened property differences (only changed properties, recursively flattened)
   */
  getChangedPropertiesFlat(beforeValue: any, afterValue: any): Array<{
    key: string,
    before: any,
    after: any,
    changed: boolean,
    isNested: boolean,
    depth: number,
    path: string
  }> {
    const allDifferences = this.getObjectPropertyDifferences(beforeValue, afterValue);

    // Filter to only show changed properties, excluding parent objects that contain changed children
    return allDifferences.filter(diff => {
      if (!diff.changed) return false;

      // If this is a nested object/array, check if it has any changed children
      if (diff.isNested) {
        const hasChangedChildren = allDifferences.some(childDiff =>
          childDiff.changed &&
          childDiff.path.startsWith(diff.path + '.') &&
          !childDiff.isNested // Only count leaf nodes as children
        );

        // Only include nested objects/arrays if they don't have changed leaf children
        // (to avoid duplicate display)
        return !hasChangedChildren;
      }

      return true;
    });
  }

  /**
   * Check if we should show object diff (values are objects/arrays and have property differences)
   */
  shouldShowObjectDiff(beforeValue: any, afterValue: any): boolean {
    // Check if either value is an object or array that can be decomposed
    const beforeIsComplex = this.isObjectValue(beforeValue) || Array.isArray(beforeValue);
    const afterIsComplex = this.isObjectValue(afterValue) || Array.isArray(afterValue);

    if (!beforeIsComplex && !afterIsComplex) {
      return false;
    }

    const differences = this.getObjectPropertyDifferences(beforeValue, afterValue);
    return differences.length > 0;
  }

  // Test method for debugging - can be called from browser console
  testRecursiveComparison() {
    const beforeNetworkRules = [
      {
        "default_action": "Allow",
        "ip_rules": [],
        "virtual_network_subnet_ids": []
      }
    ];

    const afterNetworkRules = [
      {
        "default_action": "Deny",
        "ip_rules": [
          "10.0.0.0/8",
          "192.168.1.0/24"
        ],
        "virtual_network_subnet_ids": [
          "/subscriptions/xxx/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet/subnets/subnet1"
        ]
      }
    ];

    console.log('Testing recursive comparison:');
    console.log('Should show object diff:', this.shouldShowObjectDiff(beforeNetworkRules, afterNetworkRules));
    console.log('Differences:', this.getObjectPropertyDifferences(beforeNetworkRules, afterNetworkRules));
    console.log('Changed properties flat:', this.getChangedPropertiesFlat(beforeNetworkRules, afterNetworkRules));
  }

  /**
   * Get synchronized diff lines for side-by-side display where corresponding lines are paired
   */
  getSynchronizedDiffLines(beforeValue: any, afterValue: any): Array<{
    before: { line: string, type: 'equal' | 'removed' | 'empty', lineNumber: number },
    after: { line: string, type: 'equal' | 'added' | 'empty', lineNumber: number }
  }> {
    const sideBySide = this.getSideBySideDiff(beforeValue, afterValue);
    const result = [];

    // Ensure both arrays have the same length (they should by design)
    const maxLength = Math.max(sideBySide.beforeLines.length, sideBySide.afterLines.length);

    for (let i = 0; i < maxLength; i++) {
      const beforeLine = sideBySide.beforeLines[i] || { line: '', type: 'empty' as const, lineNumber: 0 };
      const afterLine = sideBySide.afterLines[i] || { line: '', type: 'empty' as const, lineNumber: 0 };

      result.push({
        before: beforeLine,
        after: afterLine
      });
    }

    return result;
  }

  /**
   * Get a side-by-side diff view for display in the UI
   */
  getSideBySideDiff(beforeValue: any, afterValue: any): {
    beforeLines: Array<{ line: string, type: 'equal' | 'removed' | 'empty', lineNumber: number }>,
    afterLines: Array<{ line: string, type: 'equal' | 'added' | 'empty', lineNumber: number }>
  } {
    const beforeText = this.normalizeValueForComparison(beforeValue);
    const afterText = this.normalizeValueForComparison(afterValue);

    const diff = Diff.diffLines(beforeText, afterText, { ignoreWhitespace: true });

    const beforeLines: Array<{ line: string, type: 'equal' | 'removed' | 'empty', lineNumber: number }> = [];
    const afterLines: Array<{ line: string, type: 'equal' | 'added' | 'empty', lineNumber: number }> = [];

    let beforeLineNumber = 1;
    let afterLineNumber = 1;

    diff.forEach(part => {
      if (part.value) {
        const lines = part.value.split('\n');
        // Remove the last empty line if it exists due to splitting
        if (lines[lines.length - 1] === '') {
          lines.pop();
        }

        if (part.added) {
          // Add empty lines to before side
          lines.forEach(line => {
            beforeLines.push({ line: '', type: 'empty', lineNumber: 0 });
            afterLines.push({ line, type: 'added', lineNumber: afterLineNumber++ });
          });
        } else if (part.removed) {
          // Add empty lines to after side
          lines.forEach(line => {
            beforeLines.push({ line, type: 'removed', lineNumber: beforeLineNumber++ });
            afterLines.push({ line: '', type: 'empty', lineNumber: 0 });
          });
        } else {
          // Equal lines on both sides
          lines.forEach(line => {
            beforeLines.push({ line, type: 'equal', lineNumber: beforeLineNumber++ });
            afterLines.push({ line, type: 'equal', lineNumber: afterLineNumber++ });
          });
        }
      }
    });

    return { beforeLines, afterLines };
  }

  /**
   * Get a unified diff view for display in the UI (kept for backward compatibility)
   */
  getUnifiedDiff(beforeValue: any, afterValue: any): Array<{ line: string, type: 'equal' | 'added' | 'removed', lineNumber?: number }> {
    const differences = this.getLineDifferences(beforeValue, afterValue);
    let beforeLineNumber = 1;
    let afterLineNumber = 1;

    return differences.map(diff => {
      const result = { ...diff, lineNumber: 0 };

      if (diff.type === 'equal') {
        result.lineNumber = beforeLineNumber;
        beforeLineNumber++;
        afterLineNumber++;
      } else if (diff.type === 'removed') {
        result.lineNumber = beforeLineNumber;
        beforeLineNumber++;
      } else if (diff.type === 'added') {
        result.lineNumber = afterLineNumber;
        afterLineNumber++;
      }

      return result;
    });
  }

  /**
   * Get filtered module groups based on active resource filter
   */
  getFilteredModuleGroups(): any[] {
    if (!this.activeResourceFilter) {
      return this.moduleGroups;
    }

    return this.moduleGroups
      .map(moduleGroup => {
        const filteredResources = moduleGroup.resources.filter((resource: ResourceChange) =>
          this.resourceMatchesAction(resource, this.activeResourceFilter!)
        );

        return {
          ...moduleGroup,
          resources: filteredResources,
          resource_count: filteredResources.length
        };
      })
      .filter(moduleGroup => moduleGroup.resource_count > 0);
  }

  /**
   * Get filtered resources by module with iterator support
   */
  getFilteredResourcesByModuleWithIterators(): Map<string, Map<string, any>> {
    if (!this.activeResourceFilter) {
      return this.resourcesByModuleWithIterators;
    }

    const filteredMap = new Map<string, Map<string, any>>();

    for (const [moduleAddress, resourceTypes] of this.resourcesByModuleWithIterators.entries()) {
      const filteredResourceTypes = new Map<string, any>();

      for (const [type, typeGroup] of resourceTypes.entries()) {
        // Filter regular resources
        const filteredRegularResources = typeGroup.resources.filter((resource: ResourceChange) =>
          this.resourceMatchesAction(resource, this.activeResourceFilter!)
        );

        // Filter iterator groups
        const filteredIteratorGroups: IteratorGroup[] = [];
        if (typeGroup.iterator_groups) {
          for (const iteratorGroup of typeGroup.iterator_groups) {
            const filteredIteratorResources = iteratorGroup.resources.filter((resource: ResourceChange) =>
              this.resourceMatchesAction(resource, this.activeResourceFilter!)
            );

            if (filteredIteratorResources.length > 0) {
              filteredIteratorGroups.push({
                ...iteratorGroup,
                resources: filteredIteratorResources
              });
            }
          }
        }

        // If there are filtered resources or iterator groups, include this type
        if (filteredRegularResources.length > 0 || filteredIteratorGroups.length > 0) {
          const totalCount = filteredRegularResources.length +
            filteredIteratorGroups.reduce((sum: number, group: any) => sum + group.resources.length, 0);

          filteredResourceTypes.set(type, {
            ...typeGroup,
            display_name: this.getResourceTypeDisplayName(type),
            resources: filteredRegularResources,
            iterator_groups: filteredIteratorGroups,
            total_count: totalCount
          });
        }
      }

      if (filteredResourceTypes.size > 0) {
        filteredMap.set(moduleAddress, filteredResourceTypes);
      }
    }

    return filteredMap;
  }

  private getModuleDisplayName(modulePath: string): string {
    if (modulePath === 'root') {
      return 'Root Module';
    }
    return modulePath;
  }

  private getIteratorBaseAddress(iteratorGroup: IteratorGroup): string {
    return iteratorGroup.base_address;
  }

  private getIteratorType(iteratorGroup: IteratorGroup): string {
    return iteratorGroup.iterator_type;
  }

}
