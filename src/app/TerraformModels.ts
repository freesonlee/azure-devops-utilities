// Models for Terraform plan JSON structure
export interface TerraformPlan {
  resource_changes?: ResourceChange[];
  prior_state?: PriorState;
  resource_drift?: ResourceDrift[];
}

export interface ResourceChange {
  address: string;
  mode: string;
  type: string;
  name: string;
  change: Change;
}

export interface Change {
  actions: string[];
  before: any;
  after: any;
  before_sensitive?: SensitiveMap;
  after_sensitive?: SensitiveMap;
}

export interface PriorState {
  values?: {
    root_module?: {
      resources?: Resource[];
    };
  };
}

export interface ResourceDrift {
  address: string;
  mode: string;
  type: string;
  name: string;
  change: Change;
}

export interface Resource {
  address: string;
  mode: string;
  type: string;
  name: string;
  values: any;
}

export type SensitiveMap = { [key: string]: boolean | SensitiveMap | boolean[] | SensitiveMap[] };

export interface PropertyInfo {
  path: string;
  value: any;
  isSensitive: boolean;
  isVisible: boolean;
}
