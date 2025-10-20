export interface TerraformPlan {
  format_version: string;
  terraform_version: string;
  variables?: { [key: string]: any };
  planned_values?: {
    outputs?: { [key: string]: any };
    root_module?: any;
  };
  resource_changes?: ResourceChange[];
  resource_drift?: ResourceDrift[];
  output_changes?: { [key: string]: any };
  prior_state?: any;
  configuration?: any;
  plan_metadata?: {
    generated_at?: string;
    is_stale?: boolean;
    last_state_change?: string;
  };
}

export interface ResourceChange {
  address: string;
  mode: string;
  type: string;
  name: string;
  provider_name: string;
  change: {
    actions: string[];
    before: any;
    after: any;
    after_unknown?: any;
    before_sensitive?: any;
    after_sensitive?: any;
    replace_paths?: string[][] | null;
  };
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

export interface ResourceSummary {
  create: number;
  update: number;
  delete: number;
  replace: number;
  total: number;
}

export interface ModuleGroup {
  name: string;
  display_name: string;
  resources: ResourceChange[];
  resource_count: number;
}

export interface IteratorGroup {
  base_address: string;
  display_name: string;
  resources: ResourceChange[];
  iterator_type: 'count' | 'for_each';
}

export interface ResourceTypeGroup {
  type: string;
  display_name: string;
  resources: ResourceChange[];
  iterator_groups: IteratorGroup[];
  total_count: number;
}
