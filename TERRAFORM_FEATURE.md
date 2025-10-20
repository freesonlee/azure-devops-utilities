# Terraform Sensitive Property Masking Feature

## Overview

This feature provides the ability to parse Terraform plan JSON files and mask sensitive property values in the UI. It supports the detection of sensitive properties based on the `before_sensitive` and `after_sensitive` sections in Terraform plan JSON files.

## Features

### 1. Sensitive Property Detection
- Automatically detects sensitive properties from `before_sensitive` and `after_sensitive` sections
- Supports simple properties (e.g., `custom_domain_verification_id`)
- Supports array properties with individual sensitivity flags (e.g., `triggers_replace[0]`, `triggers_replace[1]`)
- Supports nested object properties

### 2. Value Masking
- Sensitive property values are masked with `****` by default
- Eye icon (visibility toggle) is displayed next to each sensitive property
- Users can click the eye icon to temporarily reveal the actual value
- Icon changes to indicate visibility state (eye / eye-off)

### 3. Array Element Sensitivity
- Each element in an array can have its own sensitivity flag
- Example: In an array `triggers_replace` with 5 elements, items 0-2 can be sensitive while items 3-4 are not
- Each sensitive array element has its own visibility toggle

## Usage

### Components

#### TerraformService
The service provides utility methods for:
- Checking if a property is sensitive based on path and sensitive map
- Flattening objects into property lists with sensitivity information
- Parsing Terraform resource changes

```typescript
import { TerraformService } from './terraform.service';

// Check if a property is sensitive
const isSensitive = terraformService.isSensitive('custom_domain_verification_id', sensitiveMap);

// Flatten an object with sensitivity information
const properties = terraformService.flattenObject(resourceValues, '', sensitiveMap);
```

#### TerraformResourceComponent
A standalone Angular component that displays Terraform resource properties with masking:

```html
<app-terraform-resource 
  [resourceChange]="resourceChange"
  [plan]="plan"
  [showBeforeValues]="false">
</app-terraform-resource>
```

**Inputs:**
- `resourceChange`: The resource change object from Terraform plan
- `plan`: (Optional) The full Terraform plan for context
- `showBeforeValues`: (Optional) Whether to show before or after values

### Data Structure

#### Terraform Plan JSON Structure
```json
{
  "resource_changes": [
    {
      "address": "azurerm_app_service.example",
      "type": "azurerm_app_service",
      "change": {
        "actions": ["create"],
        "after": {
          "custom_domain_verification_id": "ABC123DEF456GHI789",
          "triggers_replace": ["value1", "value2", "value3", "value4", "value5"]
        },
        "after_sensitive": {
          "custom_domain_verification_id": true,
          "triggers_replace": [true, true, true, false, false]
        }
      }
    }
  ]
}
```

#### Sensitivity Map Examples

**Simple Property:**
```json
{
  "custom_domain_verification_id": true
}
```

**Array with Individual Flags:**
```json
{
  "triggers_replace": [true, true, true, false, false]
}
```

**Nested Object:**
```json
{
  "config": {
    "password": true,
    "username": false
  }
}
```

## Testing

The feature includes comprehensive unit tests covering:
- Sensitive property detection for simple properties
- Array property sensitivity with individual flags
- Nested property paths
- Object flattening with sensitivity information
- UI component behavior (masking, toggling, display)

Run tests:
```bash
npm test -- --include='**/terraform*.spec.ts' --watch=false
```

## Demo

A demo component is included (`TerraformDemoComponent`) that shows a working example with sample data. Access it by clicking the "Terraform Demo" button in the main application.

## Screenshots

### Masked View
![Terraform Demo - Masked](https://github.com/user-attachments/assets/18766dc5-5b0f-41a3-a317-b4b77a4064f2)

All sensitive properties are masked with `****` and have a visibility toggle icon.

### Revealed View
![Terraform Demo - Revealed](https://github.com/user-attachments/assets/77be05e2-4901-4021-a47e-caa2ed1b9bb6)

Clicking the eye icon reveals the actual sensitive value.

### Array Element Masking
![Terraform Demo - Array Revealed](https://github.com/user-attachments/assets/9550e9b9-ca1d-4b2f-8638-f5b8abcf2ebb)

Array elements can have individual sensitivity flags. In this example, `triggers_replace[0]` is revealed while `triggers_replace[1]` and `triggers_replace[2]` remain masked.

## Implementation Details

### Property Path Parsing
Property paths are parsed to handle:
- Simple properties: `custom_domain_verification_id`
- Array indices: `triggers_replace[0]`
- Nested paths: `config.database.password`
- Complex paths: `items[0].credentials.secret`

### Sensitivity Checking Algorithm
1. Parse the property path into segments
2. Traverse the sensitivity map following the path
3. Handle arrays by checking index-specific flags
4. Return the boolean sensitivity flag if found

### Security Considerations
- Values are masked by default for sensitive properties
- Revealing values is a client-side operation (no server calls)
- The feature assumes communication over HTTPS/SSL as mentioned in the requirements
- Server-side indication of sensitivity is handled through the `before_sensitive` and `after_sensitive` sections

## Future Enhancements

Potential improvements:
1. Support for `prior_state` section to show current values for unchanged resources
2. Support for `resource_drift` section to show values for drifted resources
3. Copy-to-clipboard functionality for sensitive values
4. Audit logging for when sensitive values are revealed
5. Configurable masking character (instead of `****`)
