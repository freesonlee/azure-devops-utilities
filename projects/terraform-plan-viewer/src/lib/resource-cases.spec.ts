import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TerraformPlanService } from './services/terraform-plan.service';
import { TerraformPlanDisplayComponent } from './viewer/terraform-plan-display.component';
import { preparePlan } from './models/prepare-plan';
import { ResourceChange } from './models/terraform-plan.interface';

const change = (name: string, actions: string[]): ResourceChange => ({ address: `null_resource.${name}`, name, type: 'null_resource', mode: 'managed', provider_name: 'null', change: { actions, before: {}, after: {} } });
const input = (resources: ResourceChange[]) => preparePlan({ format_version: '1.2', terraform_version: '1.9.0', resource_changes: resources });

describe('Terraform resource cases', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [TerraformPlanDisplayComponent, NoopAnimationsModule] }));

  it('counts delete, replacement, import, and moved entries without double-counting the total', () => {
    const service = TestBed.inject(TerraformPlanService);
    const moved = { ...change('moved', ['no-op']), previous_address: 'null_resource.old' };
    const imported = change('imported', ['no-op']); imported.change.importing = { id: 'synthetic-import-id' };
    service.loadPlan(input([change('created', ['create']), change('updated', ['update']), change('deleted', ['delete']), change('replaced', ['delete', 'create']), moved, imported]));
    expect(service.getResourceSummary()).toEqual({ total: 6, changes: 4, create: 1, update: 1, delete: 1, replace: 1, importing: 1 });
  });

  it('counts nested planned resources when resource_changes are absent', () => {
    const service = TestBed.inject(TerraformPlanService);
    service.loadPlan(preparePlan({ format_version: '1.2', terraform_version: '1.9.0', planned_values: { root_module: { resources: [{}], child_modules: [{ resources: [{}], child_modules: [{ resources: [{}] }] }] } } }));
    expect(service.getResourceSummary().total).toBe(3);
  });

  it('filters replacements separately from creates/deletes and combines search with action filters', () => {
    const fixture = TestBed.createComponent(TerraformPlanDisplayComponent);
    fixture.componentRef.setInput('plan', input([change('new', ['create']), change('gone', ['delete']), change('replace', ['create', 'delete']), change('steady', ['no-op'])]));
    fixture.detectChanges(); const display = fixture.componentInstance;
    for (const action of ['create', 'delete', 'replace', 'no-op']) {
      display.activeResourceFilter = action;
      expect(display.getFilteredResourceCount()).toBe(1);
    }
    display.activeResourceFilter = 'changes'; expect(display.getFilteredResourceCount()).toBe(3);
    display.resourceSearchFilter = 'replace'; expect(display.getFilteredResourceCount()).toBe(1);
    fixture.destroy();
  });

  it('keeps unknown values unknown and shows drift as before/current/after', () => {
    const fixture = TestBed.createComponent(TerraformPlanDisplayComponent);
    const resource = change('drift', ['update']);
    resource.change = { actions: ['update'], before: { name: 'before', id: null }, after: { name: 'after', id: null }, after_unknown: { id: true }, after_sensitive: { id: true } };
    const plan = input([resource]); const drift = change('drift', ['update']); drift.change.after = { name: 'current', id: null }; plan.resource_drift = [drift];
    fixture.componentRef.setInput('plan', plan); fixture.detectChanges();
    const display = fixture.componentInstance;
    expect(display.formatPropertyValue(null, resource, 'id', 'after')).toBe('(known after apply)');
    expect(display.getChangedFieldsWithDrift(resource)['name']).toEqual({ before: 'before', current: 'current', after: 'after', changed: true, hasDrift: true });
    fixture.destroy();
  });
});
