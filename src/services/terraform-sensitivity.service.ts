import { Injectable } from "@angular/core";
import { ResourceChange } from "../interfaces/terraform-plan.interface";

@Injectable({
    providedIn: 'root'
})
export class TerraformSensitivityService {

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
            if (typeof propertyValue == "boolean" && propertyValue === true) {
                return true;
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
            afterSensitive: this.isPropertySensitive(resource.change.after_sensitive, propertyPath),
        };
    }
}