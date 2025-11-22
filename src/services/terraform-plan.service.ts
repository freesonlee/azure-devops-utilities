import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { TerraformPlan, ResourceSummary, ResourceChange, ModuleGroup, IteratorGroup, ResourceTypeGroup, PathSegmentGroup, ResourceWithPath } from '../interfaces/terraform-plan.interface';

@Injectable({
  providedIn: 'root'
})
export class TerraformPlanService {
  private planSubject = new BehaviorSubject<TerraformPlan | null>(null);
  public plan$ = this.planSubject.asObservable();
  private combinedVariables: Record<string, any> = {};


  loadPlan(planData: TerraformPlan, cdkTfJson?: any): void {
    // Enhance resource changes with module information
    if (planData.resource_changes) {
      planData.resource_changes.forEach(change => {
        const moduleAddress = this.extractModuleAddress(change.address);
        change.module_address = moduleAddress || undefined;
      });
    }

    // If cdkTfJson is provided, enhance resources with path information
    if (cdkTfJson && cdkTfJson.resource) {
      this.enhanceResourcesWithPaths(planData, cdkTfJson);
    }

    this.planSubject.next(planData);
  }

  getPlan(): TerraformPlan | null {
    return this.planSubject.value;
  }

  clearPlan(): void {
    this.planSubject.next(null);
    this.combinedVariables = {};
  }

  setCombinedVariables(variables: Record<string, any>): void {
    this.combinedVariables = variables || {};
  }

  getCombinedVariables(): Record<string, any> {
    return this.combinedVariables;
  }

  getResourceSummary(): ResourceSummary {
    const plan = this.getPlan();
    if (!plan) {
      return { create: 0, update: 0, delete: 0, replace: 0, changes: 0, total: 0 };
    }

    const summary = { create: 0, update: 0, delete: 0, replace: 0, changes: 0, total: 0 };

    // Count resources with changes (for create/update/delete/replace counts)
    if (plan.resource_changes) {
      plan.resource_changes.forEach(change => {
        const actions = change.change.actions;

        // Skip no-op resources - they don't require any changes
        if (actions.length === 1 && actions[0] === 'no-op') {
          return;
        }

        // Increment changes count for any resource that has actions other than no-op
        summary.changes++;

        // If a resource has both delete and create actions, it's a replace operation
        if (actions.includes('delete') && actions.includes('create')) {
          summary.replace++;
        } else if (actions.includes('replace')) {
          summary.replace++;
        } else if (actions.includes('create')) {
          summary.create++;
        } else if (actions.includes('update')) {
          summary.update++;
        } else if (actions.includes('delete')) {
          summary.delete++;
        }
      });
    }

    // Count ALL resources in the plan (including those with no changes)
    if (plan.planned_values?.root_module?.resources) {
      summary.total = plan.planned_values.root_module.resources.length;
    } else if (plan.resource_changes) {
      // Fallback: count all resources in resource_changes if planned_values not available
      summary.total = plan.resource_changes.length;
    }

    return summary;
  }

  /**
   * Check if a resource has actionable changes (not just no-op)
   */
  private hasActionableChanges(actions: string[]): boolean {
    // Return false if the only action is 'no-op'
    if (actions.length === 1 && actions[0] === 'no-op') {
      return false;
    }

    // Return true if any of the actionable operations are present
    return actions.some(action =>
      ['create', 'update', 'delete', 'replace'].includes(action)
    );
  }

  /**
   * Public method to check if a resource change has actionable changes
   */
  hasResourceActionableChanges(resource: ResourceChange): boolean {
    return this.hasActionableChanges(resource.change.actions);
  }

  getResourcesByType(): Map<string, ResourceChange[]> {
    const plan = this.getPlan();
    if (!plan || !plan.resource_changes) {
      return new Map();
    }

    const resourcesByType = new Map<string, ResourceChange[]>();

    plan.resource_changes.forEach(change => {
      const type = change.type;
      if (!resourcesByType.has(type)) {
        resourcesByType.set(type, []);
      }
      resourcesByType.get(type)!.push(change);
    });

    return resourcesByType;
  }

  getAllVariables(): any[] {
    const plan = this.getPlan();
    const planVariables: any[] = [];

    // Get variables from the plan (these are terraform variable definitions with their values)
    if (plan && plan.variables) {
      planVariables.push(...Object.entries(plan.variables).map(([key, value]) => ({
        key,
        value: value.value,
        type: this.getVariableType(value.value),
        isEmpty: value.value === null || value.value === undefined || value.value === '',
        source: 'plan'
      })));
    }

    // Get combined variables (these include variables from repository, global variables, etc.)
    const combinedVars = Object.entries(this.combinedVariables).map(([key, value]) => ({
      key,
      value,
      type: this.getVariableType(value),
      isEmpty: value === null || value === undefined || value === '',
      source: 'combined'
    }));

    // Merge variables, with plan variables taking precedence over combined variables for the same key
    const allVariables = [...combinedVars];
    const planVarKeys = new Set(planVariables.map(v => v.key));

    // Add plan variables, replacing any combined variables with the same key
    planVariables.forEach(planVar => {
      const existingIndex = allVariables.findIndex(v => v.key === planVar.key);
      if (existingIndex >= 0) {
        allVariables[existingIndex] = planVar;
      } else {
        allVariables.push(planVar);
      }
    });

    // Sort by key for consistent display
    return allVariables.sort((a, b) => a.key.localeCompare(b.key));
  }

  private getVariableType(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'unknown';
  }

  getAllOutputs(): any[] {
    const plan = this.getPlan();
    if (!plan || !plan.planned_values || !plan.planned_values.outputs) {
      return [];
    }

    return Object.entries(plan.planned_values.outputs).map(([key, value]) => ({
      key,
      value: value.value,
      type: value.type || this.getVariableType(value.value),
      sensitive: value.sensitive || false
    }));
  }

  getOutputGroups(): Map<string, any[]> {
    const plan = this.getPlan();
    if (!plan || !plan.planned_values || !plan.planned_values.outputs) {
      return new Map();
    }

    const groups = new Map<string, any[]>();

    // Group outputs by type
    Object.entries(plan.planned_values.outputs).forEach(([key, value]) => {
      let groupName = 'General';

      if (key.includes('identity')) {
        groupName = 'Identity Outputs';
      } else if (key.includes('storage')) {
        groupName = 'Storage Outputs';
      } else if (key.includes('aks') || key.includes('kubernetes')) {
        groupName = 'Kubernetes Outputs';
      } else if (key.includes('cognitive') || key.includes('insights')) {
        groupName = 'Azure Services Outputs';
      } else if (key.includes('var')) {
        groupName = 'Variable Outputs';
      }

      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }

      groups.get(groupName)!.push({ key, value });
    });

    return groups;
  }

  /**
   * Extract module address from a resource address
   * Examples:
   * - "azurerm_resource_group.main" -> null (root module)
   * - "module.networking.azurerm_virtual_network.main" -> "module.networking"
   * - "module.compute.module.nodes.azurerm_kubernetes_cluster.main" -> "module.compute.module.nodes"
   */
  extractModuleAddress(address: string): string | null {
    if (!address.includes('module.')) {
      return null; // Root module
    }

    const parts = address.split('.');
    const moduleAddressParts = [];

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'module') {
        moduleAddressParts.push('module');
        if (i + 1 < parts.length) {
          moduleAddressParts.push(parts[i + 1]);
          i++; // Skip the next part as it's the module name
        }
      } else {
        // Stop when we encounter a non-module part (resource type)
        break;
      }
    }

    return moduleAddressParts.length > 0 ? moduleAddressParts.join('.') : null;
  }

  /**
   * Get resources grouped by modules and then by type within each module
   */
  getResourcesByModule(): Map<string, Map<string, ResourceChange[]>> {
    const plan = this.getPlan();
    if (!plan || !plan.resource_changes) {
      return new Map();
    }

    const resourcesByModule = new Map<string, Map<string, ResourceChange[]>>();

    plan.resource_changes.forEach(change => {
      const moduleAddress = change.module_address || 'root';
      const resourceType = change.type;

      if (!resourcesByModule.has(moduleAddress)) {
        resourcesByModule.set(moduleAddress, new Map<string, ResourceChange[]>());
      }

      const moduleResources = resourcesByModule.get(moduleAddress)!;
      if (!moduleResources.has(resourceType)) {
        moduleResources.set(resourceType, []);
      }

      moduleResources.get(resourceType)!.push(change);
    });

    return resourcesByModule;
  }

  /**
   * Get module groups with metadata
   */
  getModuleGroups(): ModuleGroup[] {
    const resourcesByModule = this.getResourcesByModule();
    const moduleGroups: ModuleGroup[] = [];

    for (const [moduleAddress, resourceTypes] of resourcesByModule.entries()) {
      const resources: ResourceChange[] = [];

      // Flatten all resources from all types in this module
      for (const [type, typeResources] of resourceTypes.entries()) {
        resources.push(...typeResources);
      }

      moduleGroups.push({
        name: moduleAddress,
        display_name: this.getModuleDisplayName(moduleAddress),
        resources: resources,
        resource_count: resources.length
      });
    }

    // Sort modules: root first, then alphabetically
    moduleGroups.sort((a, b) => {
      if (a.name === 'root') return -1;
      if (b.name === 'root') return 1;
      return a.display_name.localeCompare(b.display_name);
    });

    return moduleGroups;
  }

  /**
   * Get a user-friendly display name for a module
   */
  private getModuleDisplayName(moduleAddress: string): string {
    if (moduleAddress === 'root') {
      return 'Root Module';
    }

    // Convert "module.networking" to "Networking Module"
    // Convert "module.compute.module.nodes" to "Compute > Nodes Module"
    const parts = moduleAddress.split('.');
    const moduleNames = [];

    for (let i = 0; i < parts.length; i += 2) {
      if (parts[i] === 'module' && i + 1 < parts.length) {
        moduleNames.push(parts[i + 1]);
      }
    }

    if (moduleNames.length === 1) {
      return `${this.capitalizeFirst(moduleNames[0])} Module`;
    } else if (moduleNames.length > 1) {
      const formattedNames = moduleNames.map(name => this.capitalizeFirst(name));
      return `${formattedNames.join(' > ')} Module`;
    }

    return moduleAddress;
  }

  /**
   * Capitalize the first letter of a string
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Extract iterator information from resource address
   * Examples:
   * - "azurerm_storage_container.example[0]" -> { baseAddress: "azurerm_storage_container.example", iterator: "0", type: "count" }
   * - "azurerm_storage_container.example[\"key1\"]" -> { baseAddress: "azurerm_storage_container.example", iterator: "key1", type: "for_each" }
   * - "azurerm_storage_container.example" -> null (no iterator)
   */
  private extractIteratorInfo(address: string): { baseAddress: string; iterator: string; type: 'count' | 'for_each' } | null {
    const iteratorMatch = address.match(/^(.+)\[(.+)\]$/);
    if (!iteratorMatch) {
      return null;
    }

    const baseAddress = iteratorMatch[1];
    const iteratorValue = iteratorMatch[2];

    // Determine if it's count (numeric) or for_each (string key)
    const isNumeric = /^\d+$/.test(iteratorValue);
    const type = isNumeric ? 'count' : 'for_each';

    // Clean up the iterator value (remove quotes for for_each)
    const cleanIterator = iteratorValue.replace(/^["']|["']$/g, '');

    return {
      baseAddress,
      iterator: cleanIterator,
      type
    };
  }

  /**
   * Get resources grouped by type with iterator groups
   */
  getResourceTypeGroups(): Map<string, ResourceTypeGroup> {
    const plan = this.getPlan();
    if (!plan || !plan.resource_changes) {
      return new Map();
    }

    const resourceTypeGroups = new Map<string, ResourceTypeGroup>();

    // First, group all resources by type
    const resourcesByType = new Map<string, ResourceChange[]>();
    plan.resource_changes.forEach(change => {
      const type = change.type;
      if (!resourcesByType.has(type)) {
        resourcesByType.set(type, []);
      }
      resourcesByType.get(type)!.push(change);
    });

    // Then, for each type, separate iterator resources from regular resources
    for (const [type, resources] of resourcesByType.entries()) {
      const regularResources: ResourceChange[] = [];
      const iteratorResourceMap = new Map<string, ResourceChange[]>();

      resources.forEach(resource => {
        const iteratorInfo = this.extractIteratorInfo(resource.address);
        if (iteratorInfo) {
          // This is an iterator resource
          if (!iteratorResourceMap.has(iteratorInfo.baseAddress)) {
            iteratorResourceMap.set(iteratorInfo.baseAddress, []);
          }
          iteratorResourceMap.get(iteratorInfo.baseAddress)!.push(resource);
        } else {
          // Regular resource
          regularResources.push(resource);
        }
      });

      // Create iterator groups
      const iteratorGroups: IteratorGroup[] = [];
      for (const [baseAddress, iteratorResources] of iteratorResourceMap.entries()) {
        // Determine iterator type from the first resource
        const firstIteratorInfo = this.extractIteratorInfo(iteratorResources[0].address);
        if (firstIteratorInfo) {
          // Sort iterator resources by their iterator value
          iteratorResources.sort((a, b) => {
            const aInfo = this.extractIteratorInfo(a.address);
            const bInfo = this.extractIteratorInfo(b.address);
            if (!aInfo || !bInfo) return 0;

            if (firstIteratorInfo.type === 'count') {
              // For count, sort numerically
              return parseInt(aInfo.iterator) - parseInt(bInfo.iterator);
            } else {
              // For for_each, sort alphabetically
              return aInfo.iterator.localeCompare(bInfo.iterator);
            }
          });

          iteratorGroups.push({
            base_address: baseAddress,
            display_name: baseAddress,
            resources: iteratorResources,
            iterator_type: firstIteratorInfo.type
          });
        }
      }

      // Create the resource type group
      resourceTypeGroups.set(type, {
        type,
        display_name: this.getResourceTypeDisplayName(type),
        resources: regularResources,
        iterator_groups: iteratorGroups,
        total_count: regularResources.length + iteratorGroups.reduce((sum, group) => sum + group.resources.length, 0)
      });
    }

    return resourceTypeGroups;
  }

  /**
   * Get resources grouped by modules with iterator support
   */
  getResourcesByModuleWithIterators(): Map<string, Map<string, ResourceTypeGroup>> {
    const plan = this.getPlan();
    if (!plan || !plan.resource_changes) {
      return new Map();
    }

    const resourcesByModule = new Map<string, Map<string, ResourceTypeGroup>>();

    // First group by module, then by type with iterator support
    plan.resource_changes.forEach(change => {
      const moduleAddress = change.module_address || 'root';
      const resourceType = change.type;

      if (!resourcesByModule.has(moduleAddress)) {
        resourcesByModule.set(moduleAddress, new Map<string, ResourceTypeGroup>());
      }

      const moduleResources = resourcesByModule.get(moduleAddress)!;
      if (!moduleResources.has(resourceType)) {
        moduleResources.set(resourceType, {
          type: resourceType,
          display_name: this.getResourceTypeDisplayName(resourceType),
          resources: [],
          iterator_groups: [],
          total_count: 0
        });
      }

      // Determine if this resource has an iterator
      const iteratorInfo = this.extractIteratorInfo(change.address);
      const typeGroup = moduleResources.get(resourceType)!;

      if (iteratorInfo) {
        // Find or create iterator group
        let iteratorGroup = typeGroup.iterator_groups.find(group => group.base_address === iteratorInfo.baseAddress);
        if (!iteratorGroup) {
          iteratorGroup = {
            base_address: iteratorInfo.baseAddress,
            display_name: iteratorInfo.baseAddress,
            resources: [],
            iterator_type: iteratorInfo.type
          };
          typeGroup.iterator_groups.push(iteratorGroup);
        }
        iteratorGroup.resources.push(change);
      } else {
        // Regular resource
        typeGroup.resources.push(change);
      }

      // Update total count
      typeGroup.total_count = typeGroup.resources.length +
        typeGroup.iterator_groups.reduce((sum, group) => sum + group.resources.length, 0);
    });

    // Sort iterator groups and their resources
    for (const [moduleAddress, resourceTypes] of resourcesByModule.entries()) {
      for (const [type, typeGroup] of resourceTypes.entries()) {
        // Sort iterator groups by base address
        typeGroup.iterator_groups.sort((a, b) => a.base_address.localeCompare(b.base_address));

        // Sort resources within each iterator group
        typeGroup.iterator_groups.forEach(group => {
          group.resources.sort((a, b) => {
            const aInfo = this.extractIteratorInfo(a.address);
            const bInfo = this.extractIteratorInfo(b.address);
            if (!aInfo || !bInfo) return 0;

            if (group.iterator_type === 'count') {
              return parseInt(aInfo.iterator) - parseInt(bInfo.iterator);
            } else {
              return aInfo.iterator.localeCompare(bInfo.iterator);
            }
          });
        });
      }
    }

    return resourcesByModule;
  }

  /**
   * Get a user-friendly display name for a resource type
   */
  private getResourceTypeDisplayName(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Enhance resources with path information from CDKTF metadata
   */
  private enhanceResourcesWithPaths(planData: TerraformPlan, cdkTfJson: any): void {
    if (!planData.resource_changes || !cdkTfJson.resource) {
      return;
    }

    planData.resource_changes.forEach(change => {
      // Find matching resource in cdk.tf.json
      const resourceKey = this.findResourceKeyInCdkTf(change, cdkTfJson.resource);
      if (resourceKey) {
        const resourceConfig = cdkTfJson.resource[change.type]?.[resourceKey];
        if (resourceConfig && resourceConfig['//']?.metadata?.path) {
          const pathString = resourceConfig['//'].metadata.path as string;
          // Split path and ignore the first segment (stack name)
          const pathSegments = pathString.split('/').filter(segment => segment.length > 0).slice(1);
          (change as ResourceWithPath).path_segments = pathSegments;
        }
      }
    });
  }

  /**
   * Find the resource key in cdk.tf.json that matches the terraform resource
   */
  private findResourceKeyInCdkTf(resource: ResourceChange, cdkTfResources: any): string | null {
    const resourceType = resource.type;
    if (!cdkTfResources[resourceType]) {
      return null;
    }

    // Extract the resource name from the address
    // e.g., "aws_vpc.main" -> "main", "module.networking.aws_vpc.main" -> "main"
    const addressParts = resource.address.split('.');
    const resourceName = addressParts[addressParts.length - 1];

    // Check if this resource name exists in the CDKTF resources
    if (cdkTfResources[resourceType][resourceName]) {
      return resourceName;
    }

    // If direct match fails, try to find by partial matching
    const resourceKeys = Object.keys(cdkTfResources[resourceType]);
    for (const key of resourceKeys) {
      // Handle cases where CDKTF generates different names
      if (key.includes(resourceName) || resourceName.includes(key)) {
        return key;
      }
    }

    return null;
  }

  /**
   * Get path segment groups for CDKTF resources
   */
  getPathSegmentGroups(): PathSegmentGroup[] {
    const plan = this.getPlan();
    if (!plan || !plan.resource_changes) {
      return [];
    }

    const pathMap = new Map<string, ResourceChange[]>();

    // Group resources by their path segments
    plan.resource_changes.forEach(change => {
      const resourceWithPath = change as ResourceWithPath;
      if (resourceWithPath.path_segments && resourceWithPath.path_segments.length > 0) {
        const pathKey = resourceWithPath.path_segments.join('/');
        if (!pathMap.has(pathKey)) {
          pathMap.set(pathKey, []);
        }
        pathMap.get(pathKey)!.push(change);
      }
    });

    // Convert to hierarchical structure
    return this.buildPathHierarchy(pathMap);
  }

  /**
   * Build hierarchical path structure from flat path map
   */
  private buildPathHierarchy(pathMap: Map<string, ResourceChange[]>): PathSegmentGroup[] {
    const rootGroups: PathSegmentGroup[] = [];
    const allPaths = Array.from(pathMap.keys()).sort();

    // Create a map to track created path groups
    const pathGroupMap = new Map<string, PathSegmentGroup>();

    allPaths.forEach(fullPath => {
      const segments = fullPath.split('/');
      const resources = pathMap.get(fullPath) || [];

      // Build path groups for each level
      for (let i = 0; i < segments.length; i++) {
        const currentPath = segments.slice(0, i + 1).join('/');
        const currentSegment = segments[i];

        if (!pathGroupMap.has(currentPath)) {
          const pathGroup: PathSegmentGroup = {
            path: currentPath,
            display_name: this.buildDisplayName(segments.slice(0, i + 1)),
            depth: i,
            children: [],
            modules: [],
            resource_types: [],
            total_resource_count: 0
          };

          pathGroupMap.set(currentPath, pathGroup);

          // Add to parent or root
          if (i === 0) {
            rootGroups.push(pathGroup);
          } else {
            const parentPath = segments.slice(0, i).join('/');
            const parentGroup = pathGroupMap.get(parentPath);
            if (parentGroup) {
              parentGroup.children.push(pathGroup);
            }
          }
        }

        // If this is the final segment for this path, add resources
        if (i === segments.length - 1) {
          const pathGroup = pathGroupMap.get(currentPath)!;
          pathGroup.resource_types = this.groupResourcesByType(resources);
          pathGroup.total_resource_count = resources.length;
        }
      }
    });

    // Update total counts to include children
    this.updateTotalCounts(rootGroups);

    return rootGroups;
  }

  /**
   * Build display name for path segments
   */
  private buildDisplayName(segments: string[]): string {
    const capitalizedSegments = segments.map(segment =>
      segment.charAt(0).toUpperCase() + segment.slice(1)
    );
    return capitalizedSegments.join(' > ');
  }

  /**
   * Group resources by type for a path segment
   */
  private groupResourcesByType(resources: ResourceChange[]): ResourceTypeGroup[] {
    const resourcesByType = new Map<string, ResourceChange[]>();

    resources.forEach(resource => {
      const type = resource.type;
      if (!resourcesByType.has(type)) {
        resourcesByType.set(type, []);
      }
      resourcesByType.get(type)!.push(resource);
    });

    const resourceTypeGroups: ResourceTypeGroup[] = [];
    for (const [type, typeResources] of resourcesByType.entries()) {
      // Apply existing iterator grouping logic
      const regularResources: ResourceChange[] = [];
      const iteratorResourceMap = new Map<string, ResourceChange[]>();

      typeResources.forEach(resource => {
        const iteratorInfo = this.extractIteratorInfo(resource.address);
        if (iteratorInfo) {
          if (!iteratorResourceMap.has(iteratorInfo.baseAddress)) {
            iteratorResourceMap.set(iteratorInfo.baseAddress, []);
          }
          iteratorResourceMap.get(iteratorInfo.baseAddress)!.push(resource);
        } else {
          regularResources.push(resource);
        }
      });

      // Create iterator groups
      const iteratorGroups: IteratorGroup[] = [];
      for (const [baseAddress, iteratorResources] of iteratorResourceMap.entries()) {
        const firstIteratorInfo = this.extractIteratorInfo(iteratorResources[0].address);
        if (firstIteratorInfo) {
          iteratorResources.sort((a, b) => {
            const aInfo = this.extractIteratorInfo(a.address);
            const bInfo = this.extractIteratorInfo(b.address);
            if (!aInfo || !bInfo) return 0;

            if (firstIteratorInfo.type === 'count') {
              return parseInt(aInfo.iterator) - parseInt(bInfo.iterator);
            } else {
              return aInfo.iterator.localeCompare(bInfo.iterator);
            }
          });

          iteratorGroups.push({
            base_address: baseAddress,
            display_name: baseAddress,
            resources: iteratorResources,
            iterator_type: firstIteratorInfo.type
          });
        }
      }

      resourceTypeGroups.push({
        type,
        display_name: this.getResourceTypeDisplayName(type),
        resources: regularResources,
        iterator_groups: iteratorGroups,
        total_count: regularResources.length + iteratorGroups.reduce((sum, group) => sum + group.resources.length, 0)
      });
    }

    return resourceTypeGroups;
  }

  /**
   * Update total counts to include children recursively
   */
  private updateTotalCounts(pathGroups: PathSegmentGroup[]): void {
    pathGroups.forEach(group => {
      if (group.children.length > 0) {
        this.updateTotalCounts(group.children);
        group.total_resource_count = group.resource_types.reduce((sum, rt) => sum + rt.total_count, 0) +
          group.children.reduce((sum, child) => sum + child.total_resource_count, 0);
      }
    });
  }

  /**
   * Get the current state (from resource_drift) for a resource if it exists
   */
  getResourceDriftState(resourceAddress: string): any | null {
    const plan = this.getPlan();

    if (!plan || !plan.resource_drift) {
      return null;
    }

    const driftResource = plan.resource_drift.find(drift => drift.address === resourceAddress);
    return driftResource ? driftResource.change.after : null;
  }

  /**
   * Check if a resource has drift data available
   */
  hasResourceDrift(resourceAddress: string): boolean {
    const plan = this.getPlan();

    if (!plan || !plan.resource_drift) {
      return false;
    }

    return plan.resource_drift.some(drift => drift.address === resourceAddress);
  }


}
