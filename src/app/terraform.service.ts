import { Injectable } from '@angular/core';
import { PropertyInfo, SensitiveMap, ResourceChange, TerraformPlan } from './TerraformModels';

@Injectable({
  providedIn: 'root'
})
export class TerraformService {
  
  /**
   * Check if a property is sensitive based on the sensitive map
   * @param propertyPath The property path (e.g., "custom_domain_verification_id" or "triggers_replace[0]")
   * @param sensitiveMap The before_sensitive or after_sensitive map
   * @returns true if the property is sensitive
   */
  isSensitive(propertyPath: string, sensitiveMap?: SensitiveMap): boolean {
    if (!sensitiveMap) {
      return false;
    }

    // Parse the property path to handle nested objects and array indices
    const parts = this.parsePropertyPath(propertyPath);
    return this.checkSensitivity(parts, sensitiveMap);
  }

  /**
   * Parse a property path into parts
   * Examples:
   *   "custom_domain_verification_id" -> ["custom_domain_verification_id"]
   *   "triggers_replace[0]" -> ["triggers_replace", "0"]
   *   "nested.property[1].value" -> ["nested", "property", "1", "value"]
   */
  private parsePropertyPath(path: string): string[] {
    const parts: string[] = [];
    let current = '';
    
    for (let i = 0; i < path.length; i++) {
      const char = path[i];
      
      if (char === '.') {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else if (char === '[') {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else if (char === ']') {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    
    if (current) {
      parts.push(current);
    }
    
    return parts;
  }

  /**
   * Check if a property path is sensitive by traversing the sensitive map
   */
  private checkSensitivity(parts: string[], sensitiveMap: any): boolean {
    if (parts.length === 0) {
      return false;
    }

    let current: any = sensitiveMap;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (current === undefined || current === null) {
        return false;
      }

      // Check if it's a boolean value (leaf node)
      if (typeof current === 'boolean') {
        return current;
      }

      // Check if it's an array
      if (Array.isArray(current)) {
        const index = parseInt(part, 10);
        if (!isNaN(index) && index >= 0 && index < current.length) {
          current = current[index];
        } else {
          return false;
        }
      } else if (typeof current === 'object') {
        // It's an object, navigate to the next level
        current = current[part];
      } else {
        return false;
      }
    }

    // If we've reached the end and current is a boolean, return it
    if (typeof current === 'boolean') {
      return current;
    }

    return false;
  }

  /**
   * Flatten an object into a list of properties with their paths
   */
  flattenObject(obj: any, prefix: string = '', sensitiveMap?: SensitiveMap): PropertyInfo[] {
    const result: PropertyInfo[] = [];
    
    if (obj === null || obj === undefined) {
      return result;
    }

    if (typeof obj !== 'object') {
      // Primitive value
      result.push({
        path: prefix,
        value: obj,
        isSensitive: this.isSensitive(prefix, sensitiveMap),
        isVisible: false
      });
      return result;
    }

    if (Array.isArray(obj)) {
      // Array
      obj.forEach((item, index) => {
        const path = `${prefix}[${index}]`;
        result.push(...this.flattenObject(item, path, sensitiveMap));
      });
    } else {
      // Object
      Object.keys(obj).forEach(key => {
        const path = prefix ? `${prefix}.${key}` : key;
        result.push(...this.flattenObject(obj[key], path, sensitiveMap));
      });
    }

    return result;
  }

  /**
   * Get properties for a resource change with sensitivity information
   */
  getResourceProperties(resourceChange: ResourceChange, useAfter: boolean = true): PropertyInfo[] {
    const values = useAfter ? resourceChange.change.after : resourceChange.change.before;
    const sensitiveMap = useAfter ? resourceChange.change.after_sensitive : resourceChange.change.before_sensitive;
    
    return this.flattenObject(values, '', sensitiveMap);
  }

  /**
   * Get current value for a resource from prior_state
   */
  getCurrentValueFromPriorState(plan: TerraformPlan, resourceAddress: string): PropertyInfo[] {
    if (!plan.prior_state?.values?.root_module?.resources) {
      return [];
    }

    const resource = plan.prior_state.values.root_module.resources.find(
      r => r.address === resourceAddress
    );

    if (!resource) {
      return [];
    }

    return this.flattenObject(resource.values, '');
  }

  /**
   * Get current value for a resource from resource_drift
   */
  getCurrentValueFromDrift(plan: TerraformPlan, resourceAddress: string): PropertyInfo[] {
    if (!plan.resource_drift) {
      return [];
    }

    const drift = plan.resource_drift.find(d => d.address === resourceAddress);

    if (!drift) {
      return [];
    }

    return this.getResourceProperties(drift, false);
  }
}
