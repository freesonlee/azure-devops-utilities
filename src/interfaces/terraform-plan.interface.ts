export interface TerraformPlan {
  format_version: string;
  terraform_version: string;
  variables: Record<string, VariableValue>;
  planned_values: PlannedValues;
  resource_changes: ResourceChange[];
  resource_drift?: ResourceDrift[];
  output_changes: Record<string, OutputChange>;
  prior_state?: PriorState;
  // Metadata about the plan generation
  plan_metadata?: PlanMetadata;
}

export interface PlanMetadata {
  generated_at?: string; // ISO timestamp when the plan was generated
  is_stale?: boolean; // Whether the plan is outdated due to state changes
  last_state_change?: string; // ISO timestamp of last import/remove operation
  environment_name?: string;
  stack_name?: string;
}

export interface VariableValue {
  value: any;
}

export interface PlannedValues {
  outputs: Record<string, Output>;
  root_module: RootModule;
}

export interface Output {
  sensitive: boolean;
  type: string;
  value: any;
}

export interface RootModule {
  resources: Resource[];
}

export interface Resource {
  address: string;
  mode: string;
  type: string;
  name: string;
  provider_name: string;
  schema_version: number;
  values: Record<string, any>;
  sensitive_values: Record<string, any>;
}

export interface ResourceChange {
  address: string;
  previous_address?: string; // For moved resources
  mode: string;
  type: string;
  name: string;
  provider_name: string;
  change: Change;
  expanded?: boolean; // For UI state management
  module_address?: string; // Module path if resource is in a module
}

export interface Change {
  actions: string[];
  before: any;
  after: any;
  after_unknown?: Record<string, any>;
  before_sensitive?: boolean | Record<string, any>;
  after_sensitive?: boolean | Record<string, any>;
  replace_paths?: string[][]; // Paths that cause this resource to be replaced
  importing?: boolean; // Resource is being imported (same level as before/after)
}

export interface OutputChange {
  actions: string[];
  before: any;
  after: any;
  after_unknown: boolean;
  before_sensitive: boolean;
  after_sensitive: boolean;
}

export interface PriorState {
  format_version: string;
  terraform_version: string;
  values: {
    outputs: Record<string, Output>;
    root_module: RootModule;
  };
}

export interface ResourceSummary {
  create: number;
  update: number;
  delete: number;
  replace: number;
  changes: number;
  total: number;
  importing: number; // Count of resources being imported
}

export interface ModuleGroup {
  name: string;
  display_name: string;
  resources: ResourceChange[];
  resource_count: number;
}

export interface IteratorGroup {
  base_address: string; // e.g., "azurerm_storage_container.example"
  display_name: string; // e.g., "azurerm_storage_container.example"
  resources: ResourceChange[]; // All instances like [0], [1], [2]
  iterator_type: 'count' | 'for_each'; // Whether it uses count or for_each
}

export interface ResourceTypeGroup {
  type: string; // e.g., "azurerm_storage_container"
  display_name: string; // e.g., "Azurerm Storage Container"
  resources: ResourceChange[]; // Non-iterator resources
  iterator_groups: IteratorGroup[]; // Groups of resources with iterators
  total_count: number; // Total count including iterator groups
}

export interface ResourceDrift {
  address: string;
  mode: string;
  type: string;
  name: string;
  index?: any;
  provider_name: string;
  change: {
    actions: string[];
    before: any;
    after: any;
    after_unknown?: any;
    before_sensitive?: any;
    after_sensitive?: any;
  };
}

export interface PathSegmentGroup {
  path: string; // e.g., "vpc", "vpc/security"
  display_name: string; // e.g., "VPC", "VPC > Security"
  depth: number; // 0 for root level, 1 for first level, etc.
  children: PathSegmentGroup[]; // Nested path segments
  modules: ModuleGroup[]; // Modules within this path segment
  resource_types: ResourceTypeGroup[]; // Direct resources in this path segment
  total_resource_count: number; // Total count including children
}

export interface ResourceWithPath extends ResourceChange {
  path_segments?: string[]; // Path segments from CDKTF metadata
}

// CDKTF Construct View interfaces
export interface ConstructNode {
  path: string; // Full construct path, e.g., "vpc", "vpc/security"
  name: string; // Display name for this construct level
  depth: number; // 0 for root, 1 for first level, etc.
  children: ConstructNode[]; // Child construct nodes
  directResources: ResourceChange[]; // Resources directly at this construct level
  totalResourceCount: number; // Total resources including children
  isExpanded?: boolean; // UI state for expansion
}