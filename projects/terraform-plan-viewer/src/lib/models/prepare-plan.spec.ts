import { preparePlan } from './prepare-plan';

describe('Supplied Terraform JSON', () => {
  it('normalizes a minimal valid plan and retains its own copy', () => {
    const input = { format_version: '1.2', terraform_version: '1.9.0' };
    const plan = preparePlan(input);
    expect(plan.resource_changes).toEqual([]);
    expect(plan.variables).toEqual({});
    expect(plan.planned_values.root_module.resources).toEqual([]);
    expect(input).toEqual({ format_version: '1.2', terraform_version: '1.9.0' });
  });

  it('rejects malformed resource changes before rendering', () => {
    expect(() => preparePlan({ format_version: '1.2', terraform_version: '1.9.0', resource_changes: [{ address: 'bad' }] })).toThrowError(/actions/);
    expect(() => preparePlan([])).toThrowError(/JSON object/);
  });

  it('rejects malformed nested collections before renderer setup', () => {
    const base = { format_version: '1.2', terraform_version: '1.9.0' };
    for (const invalid of [
      { variables: ['bad'] }, { variables: { environment: null } }, { output_changes: 'bad' },
      { planned_values: false }, { planned_values: { outputs: { result: null } } },
      { planned_values: { root_module: { resources: 'bad' } } },
      { planned_values: { root_module: { child_modules: [{ resources: false }] } } },
      { resource_drift: [{ address: 'broken' }] }
    ]) expect(() => preparePlan({ ...base, ...invalid })).toThrow();
  });
});
