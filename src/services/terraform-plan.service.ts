import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TerraformPlan, ResourceSummary, ResourceChange, ResourceDrift, ResourceTypeGroup, ModuleGroup, IteratorGroup } from '../interfaces/terraform-plan.interface';

@Injectable({
  providedIn: 'root'
})
export class TerraformPlanService {
  private planSubject = new BehaviorSubject<TerraformPlan | null>(null);
  public plan$ = this.planSubject.asObservable();

  constructor() { }

  loadPlan(plan: TerraformPlan): void {
    this.planSubject.next(plan);
  }

  getResourceSummary(): ResourceSummary {
    const plan = this.planSubject.value;
    const summary: ResourceSummary = {
      create: 0,
      update: 0,
      delete: 0,
      replace: 0,
      total: 0
    };

    if (!plan || !plan.resource_changes) {
      return summary;
    }

    plan.resource_changes.forEach(resource => {
      const actions = resource.change.actions;
      summary.total++;

      if (actions.includes('create')) {
        summary.create++;
      }
      if (actions.includes('update')) {
        summary.update++;
      }
      if (actions.includes('delete') && !actions.includes('create')) {
        summary.delete++;
      }
      if (actions.includes('delete') && actions.includes('create')) {
        summary.replace++;
      }
    });

    return summary;
  }

  getResourcesByType(): Map<string, ResourceChange[]> {
    const plan = this.planSubject.value;
    const resourcesByType = new Map<string, ResourceChange[]>();

    if (!plan || !plan.resource_changes) {
      return resourcesByType;
    }

    plan.resource_changes.forEach(resource => {
      const type = resource.type;
      if (!resourcesByType.has(type)) {
        resourcesByType.set(type, []);
      }
      resourcesByType.get(type)!.push(resource);
    });

    return resourcesByType;
  }

  getAllVariables(): any[] {
    const plan = this.planSubject.value;
    const variables: any[] = [];

    if (!plan || !plan.variables) {
      return variables;
    }

    Object.keys(plan.variables).forEach(key => {
      const variable = plan.variables![key];
      variables.push({
        key: key,
        value: variable.value,
        type: this.getVariableType(variable.value),
        ...variable
      });
    });

    return variables;
  }

  getAllOutputs(): any[] {
    const plan = this.planSubject.value;
    const outputs: any[] = [];

    if (!plan) {
      return outputs;
    }

    // Check planned_values outputs
    if (plan.planned_values?.outputs) {
      Object.keys(plan.planned_values.outputs).forEach(key => {
        const output = plan.planned_values!.outputs![key];
        outputs.push({
          key: key,
          value: output.value,
          type: output.type || this.getVariableType(output.value),
          sensitive: output.sensitive || false,
          ...output
        });
      });
    }

    // Check output_changes
    if (plan.output_changes) {
      Object.keys(plan.output_changes).forEach(key => {
        // Only add if not already in outputs from planned_values
        if (!outputs.find(o => o.key === key)) {
          const output = plan.output_changes![key];
          outputs.push({
            key: key,
            value: output.after,
            type: output.type || this.getVariableType(output.after),
            sensitive: output.sensitive || false,
            ...output
          });
        }
      });
    }

    return outputs;
  }

  getOutputGroups(): Map<string, any[]> {
    const outputs = this.getAllOutputs();
    const groups = new Map<string, any[]>();

    outputs.forEach(output => {
      // Simple grouping by prefix (before first underscore)
      const parts = output.key.split('_');
      const groupName = parts.length > 1 ? parts[0] : 'default';

      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(output);
    });

    return groups;
  }

  private getVariableType(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (Array.isArray(value)) {
      return 'list';
    }
    if (typeof value === 'object') {
      return 'map';
    }
    if (typeof value === 'boolean') {
      return 'bool';
    }
    if (typeof value === 'number') {
      return 'number';
    }
    return 'string';
  }

  getResourceTypeGroups(): Map<string, ResourceTypeGroup> {
    const plan = this.planSubject.value;
    const resourceTypeGroups = new Map<string, ResourceTypeGroup>();

    if (!plan || !plan.resource_changes) {
      return resourceTypeGroups;
    }

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

  getResourcesByModule(): Map<string, Map<string, ResourceChange[]>> {
    const plan = this.planSubject.value;
    const resourcesByModule = new Map<string, Map<string, ResourceChange[]>>();

    if (!plan || !plan.resource_changes) {
      return resourcesByModule;
    }

    plan.resource_changes.forEach(resource => {
      // Extract module path
      const moduleParts = resource.address.split('.');
      let modulePath = 'root';

      if (moduleParts[0] === 'module') {
        let moduleEndIndex = 1;
        for (let i = 1; i < moduleParts.length; i += 2) {
          if (i + 1 < moduleParts.length && moduleParts[i + 1] !== 'module') {
            moduleEndIndex = i;
            break;
          }
        }
        modulePath = moduleParts.slice(0, moduleEndIndex + 1).join('.');
      }

      if (!resourcesByModule.has(modulePath)) {
        resourcesByModule.set(modulePath, new Map<string, ResourceChange[]>());
      }

      const moduleResources = resourcesByModule.get(modulePath)!;
      const type = resource.type;

      if (!moduleResources.has(type)) {
        moduleResources.set(type, []);
      }

      moduleResources.get(type)!.push(resource);
    });

    return resourcesByModule;
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
   * Get resources grouped by modules with iterator support
   * This groups resources by: Module -> Resource Type -> Iterator Base Address
   */
  getResourcesByModuleWithIterators(): Map<string, Map<string, ResourceTypeGroup>> {
    const plan = this.planSubject.value;
    const resourcesByModule = new Map<string, Map<string, ResourceTypeGroup>>();

    if (!plan || !plan.resource_changes) {
      return resourcesByModule;
    }

    // First group by module, then by type with iterator support
    plan.resource_changes.forEach(change => {
      // Extract module path
      const moduleParts = change.address.split('.');
      let moduleAddress = 'root';

      if (moduleParts[0] === 'module') {
        let moduleEndIndex = 1;
        for (let i = 1; i < moduleParts.length; i += 2) {
          if (i + 1 < moduleParts.length && moduleParts[i + 1] !== 'module') {
            moduleEndIndex = i;
            break;
          }
        }
        moduleAddress = moduleParts.slice(0, moduleEndIndex + 1).join('.');
      }

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
   * Get the current state (from resource_drift) for a resource if it exists
   */
  getResourceDriftState(resourceAddress: string): any | null {
    const plan = this.planSubject.value;

    if (!plan || !plan.resource_drift) {
      return null;
    }

    const driftResource = plan.resource_drift.find(drift => drift.address === resourceAddress);
    return driftResource ? driftResource.change.before : null;
  }

  /**
   * Check if a resource has drift data available
   */
  hasResourceDrift(resourceAddress: string): boolean {
    const plan = this.planSubject.value;

    if (!plan || !plan.resource_drift) {
      return false;
    }

    return plan.resource_drift.some(drift => drift.address === resourceAddress);
  }

  /**
   * Check if a property is sensitive based on the sensitivity metadata
   * @param sensitiveMetadata - The before_sensitive or after_sensitive object
   * @param propertyPath - The property path (e.g., "name", "network_rules[0].default_action")
   * @returns true if the property is marked as sensitive
   */
  isPropertySensitive(sensitiveMetadata: any, propertyPath: string): boolean {
    if (!sensitiveMetadata || !propertyPath) {
      return false;
    }

    const pathParts = this.parsePropertyPath(propertyPath);
    return this.checkSensitivityRecursive(sensitiveMetadata, pathParts);
  }

  /**
   * Parse a property path into parts, handling array indices
   * Example: "network_rules[0].default_action" -> ["network_rules", 0, "default_action"]
   */
  private parsePropertyPath(path: string): (string | number)[] {
    const parts: (string | number)[] = [];
    const segments = path.split('.');

    segments.forEach(segment => {
      const arrayMatch = segment.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        parts.push(arrayMatch[1]); // property name
        parts.push(parseInt(arrayMatch[2], 10)); // array index
      } else {
        parts.push(segment);
      }
    });

    return parts;
  }

  /**
   * Recursively check if a property is sensitive by navigating the sensitivity metadata
   */
  private checkSensitivityRecursive(sensitiveMetadata: any, pathParts: (string | number)[]): boolean {
    if (pathParts.length === 0) {
      // If we've traversed the entire path
      if (sensitiveMetadata === true) {
        return true;
      }
      // If the value is an array, check if any element is true
      if (Array.isArray(sensitiveMetadata)) {
        return sensitiveMetadata.some(item => item === true);
      }
      return false;
    }

    if (typeof sensitiveMetadata !== 'object' || sensitiveMetadata === null) {
      return false;
    }

    const currentPart = pathParts[0];
    const remainingParts = pathParts.slice(1);

    if (typeof currentPart === 'number') {
      // Handle array index
      if (Array.isArray(sensitiveMetadata)) {
        const arrayValue = sensitiveMetadata[currentPart];
        if (remainingParts.length === 0) {
          return arrayValue === true;
        }
        return this.checkSensitivityRecursive(arrayValue, remainingParts);
      }
      return false;
    } else {
      // Handle object property
      const propertyValue = sensitiveMetadata[currentPart];
      if (propertyValue === undefined) {
        return false;
      }
      if (remainingParts.length === 0) {
        // Check if it's a boolean true
        if (propertyValue === true) {
          return true;
        }
        // If it's an array, check if any element is true
        if (Array.isArray(propertyValue)) {
          return propertyValue.some(item => item === true);
        }
        return false;
      }
      return this.checkSensitivityRecursive(propertyValue, remainingParts);
    }
  }

  /**
   * Check if a property in a resource change is sensitive (checks both before and after)
   */
  isResourcePropertySensitive(resource: ResourceChange, propertyPath: string): {
    beforeSensitive: boolean;
    afterSensitive: boolean;
  } {
    return {
      beforeSensitive: this.isPropertySensitive(resource.change.before_sensitive, propertyPath),
      afterSensitive: this.isPropertySensitive(resource.change.after_sensitive, propertyPath)
    };
  }
}
