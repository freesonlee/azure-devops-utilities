import { TerraformPlan } from './terraform-plan.interface';

/** Validate the fields used by the renderer and create an independently owned JSON copy. */
export function preparePlan(input: unknown): TerraformPlan {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A Terraform plan must be a JSON object.');
  const candidate = input as Record<string, unknown>;
  if (typeof candidate['format_version'] !== 'string' || typeof candidate['terraform_version'] !== 'string') {
    throw new Error('The plan must include format_version and terraform_version strings.');
  }
  const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const assertRecord = (value: unknown, name: string): void => {
    if (value != null && !isRecord(value)) throw new Error(`${name} must be a JSON object.`);
  };
  for (const name of ['variables', 'output_changes', 'planned_values']) assertRecord(candidate[name], name);
  for (const name of ['resource_changes', 'resource_drift']) {
    const changes = candidate[name];
    if (changes !== undefined && (!Array.isArray(changes) || changes.some(change =>
      !change || typeof change.address !== 'string' || typeof change.type !== 'string' || typeof change.name !== 'string' || !change.change || !Array.isArray(change.change.actions) ||
      change.change.actions.some((action: unknown) => typeof action !== 'string')))) {
      throw new Error(`Each ${name} entry must include an address, type, name, and an actions array.`);
    }
  }
  for (const name of ['variables', 'output_changes']) {
    const entries = candidate[name];
    if (isRecord(entries) && Object.values(entries).some(value => !isRecord(value))) throw new Error(`${name} entries must be JSON objects.`);
  }
  const planned = candidate['planned_values'];
  if (isRecord(planned)) {
    assertRecord(planned['outputs'], 'planned_values.outputs');
    if (isRecord(planned['outputs']) && Object.values(planned['outputs']).some(value => !isRecord(value))) throw new Error('Planned outputs must be JSON objects.');
    const validateModule = (value: unknown): void => {
      assertRecord(value, 'Planned module');
      if (!isRecord(value)) return;
      for (const name of ['resources', 'child_modules']) {
        const entries = value[name];
        if (entries != null && !Array.isArray(entries)) throw new Error(`Planned module ${name} must be an array.`);
        if (Array.isArray(entries) && entries.some(entry => !isRecord(entry))) throw new Error(`Planned module ${name} entries must be JSON objects.`);
      }
      if (Array.isArray(value['child_modules'])) value['child_modules'].forEach(validateModule);
    };
    validateModule(planned['root_module']);
  }
  const plan = JSON.parse(JSON.stringify(input)) as TerraformPlan;
  plan.variables ??= {};
  plan.resource_changes ??= [];
  plan.output_changes ??= {};
  plan.planned_values ??= { outputs: {}, root_module: { resources: [] } };
  plan.planned_values.outputs ??= {};
  plan.planned_values.root_module ??= { resources: [] };
  plan.planned_values.root_module.resources ??= [];
  return plan;
}
