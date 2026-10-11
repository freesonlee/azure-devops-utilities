import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { TerraformPlanViewerComponent } from './terraform-plan-viewer.component';
import { TerraformPlanDisplayComponent } from './viewer/terraform-plan-display.component';
import { ResourceChange, TerraformPlan } from './models/terraform-plan.interface';
import { TerraformPlanService } from './services/terraform-plan.service';

const resource = (address: string): ResourceChange => ({ address, mode: 'managed', type: 'null_resource', name: 'example', provider_name: 'null', change: { actions: ['update'], before: { value: 'SYNTHETIC_BEFORE_SECRET' }, after: { value: 'SYNTHETIC_AFTER_SECRET' }, before_sensitive: { value: true }, after_sensitive: { value: true } } });
const plan = (address = 'module.example.null_resource.example'): TerraformPlan => ({ format_version: '1.2', terraform_version: '1.9.0', variables: {}, planned_values: { outputs: {}, root_module: { resources: [] } }, resource_changes: [resource(address)], output_changes: {} });
const freeze = (value: any): any => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

@Component({ standalone: true, imports: [TerraformPlanViewerComponent], template: '<tf-plan-viewer [plan]="first"/><tf-plan-viewer [plan]="second"/>' })
class TwoViewers { first = plan('null_resource.first'); second = plan('null_resource.second'); }

describe('Embeddable viewer contract', () => {
  let fixture: ComponentFixture<TerraformPlanViewerComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TerraformPlanViewerComponent, TwoViewers, NoopAnimationsModule] }).compileComponents();
    fixture = TestBed.createComponent(TerraformPlanViewerComponent);
  });
  const renderer = () => fixture.debugElement.query(By.directive(TerraformPlanDisplayComponent)).componentInstance as TerraformPlanDisplayComponent;

  it('renders without HttpClient or application providers and does not mutate frozen input', () => {
    const original = freeze(plan());
    const json = JSON.stringify(original);
    fixture.componentRef.setInput('plan', original);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Plan Overview');
    expect(JSON.stringify(original)).toBe(json);
    expect(original.resource_changes[0].module_address).toBeUndefined();
    expect(renderer().resourceSummary.total).toBe(1);
  });

  it('resets selection and revealed sensitive values when the plan changes', () => {
    fixture.componentRef.setInput('plan', plan()); fixture.detectChanges();
    const display = renderer();
    display.selectResource(display.plan!.resource_changes[0]);
    display.toggleSensitiveValueVisibility(resource('null_resource.first'), 'value', 'after');
    fixture.componentRef.setInput('plan', plan('null_resource.replaced')); fixture.detectChanges();
    expect(renderer().selectedResource).toBeNull();
    expect(renderer().sensitiveValuesVisible.size).toBe(0);
    fixture.componentRef.setInput('plan', null); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No plan supplied');
    expect(fixture.debugElement.query(By.directive(TerraformPlanDisplayComponent))).toBeNull();
  });

  it('does not copy a masked sensitive value, and respects disabled reveal', () => {
    fixture.componentRef.setInput('plan', plan()); fixture.detectChanges();
    const display = renderer(); const secret = resource('null_resource.example');
    const copy = spyOn((display as any).clipboard, 'copy').and.returnValue(true);
    display.copySensitiveValueToClipboard(secret.change.after.value, secret, 'value', 'after');
    expect(copy).not.toHaveBeenCalled();
    display.toggleSensitiveValueVisibility(secret, 'value', 'after');
    display.copySensitiveValueToClipboard(secret.change.after.value, secret, 'value', 'after');
    expect(copy).toHaveBeenCalledWith('SYNTHETIC_AFTER_SECRET');
    fixture.componentRef.setInput('options', { allowSensitiveReveal: false }); fixture.detectChanges();
    display.toggleSensitiveValueVisibility(secret, 'value', 'after');
    expect(display.isSensitiveValueMasked(secret, 'value', 'after')).toBeTrue();
  });

  it('renders independent viewers and services', () => {
    const pair = TestBed.createComponent(TwoViewers); pair.detectChanges();
    const displays = pair.debugElement.queryAll(By.directive(TerraformPlanDisplayComponent));
    expect(displays.length).toBe(2);
    expect(displays[0].injector.get(TerraformPlanService)).not.toBe(displays[1].injector.get(TerraformPlanService));
    displays[0].componentInstance.activeResourceFilter = 'delete';
    expect(displays[1].componentInstance.activeResourceFilter).toBe('changes');
    pair.destroy();
  });

  it('reports invalid JSON through an output and an accessible error', async () => {
    const errors: string[] = []; fixture.componentInstance.error.subscribe(error => errors.push(error.code));
    fixture.componentRef.setInput('plan', { resource_changes: 'bad' }); fixture.detectChanges();
    await fixture.whenStable();
    expect(errors).toEqual(['invalid-plan']);
    expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
  });

  it('starts empty and keeps action controls opt-in', () => {
    fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('No plan supplied');
    fixture.componentRef.setInput('plan', plan()); fixture.detectChanges();
    renderer().selectResource(renderer().plan!.resource_changes[0]); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.resource-action-buttons')).toBeNull();
    fixture.componentRef.setInput('options', { enableActions: true }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.resource-action-buttons')).not.toBeNull();
  });

  it('keeps secret values out of the DOM and disables reveal buttons', () => {
    fixture.componentRef.setInput('plan', plan()); fixture.componentRef.setInput('options', { allowSensitiveReveal: false }); fixture.detectChanges();
    renderer().selectResource(renderer().plan!.resource_changes[0]); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('SYNTHETIC_AFTER_SECRET');
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.sensitive-toggle-btn')) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0); expect(buttons.every(button => button.disabled)).toBeTrue();
  });

  it('allows public value copying when sensitive reveal is disabled', () => {
    fixture.componentRef.setInput('plan', plan()); fixture.componentRef.setInput('options', { allowSensitiveReveal: false }); fixture.detectChanges();
    const display = renderer(); const copy = spyOn((display as any).clipboard, 'copy').and.returnValue(true);
    display.copySensitiveValueToClipboard('public', resource('null_resource.example'), 'public', 'after');
    expect(copy).toHaveBeenCalledWith('public');
  });

  it('switches between CDKTF and Terraform without changing the host metadata', () => {
    fixture.componentRef.setInput('plan', plan('null_resource.example')); fixture.detectChanges();
    const metadata = freeze({ resource: { null_resource: { example: { '//': { metadata: { path: 'demo/Example' } } } } } });
    const json = JSON.stringify(metadata);
    fixture.componentRef.setInput('cdktfMetadata', metadata); fixture.detectChanges();
    expect(renderer().showConstructView).toBeTrue(); expect(JSON.stringify(metadata)).toBe(json);
    fixture.componentRef.setInput('cdktfMetadata', null); fixture.detectChanges();
    expect(renderer().showConstructView).toBeFalse();
  });
});
