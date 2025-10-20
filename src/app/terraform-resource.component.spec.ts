import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TerraformResourceComponent } from './terraform-resource.component';
import { TerraformService } from './terraform.service';
import { ResourceChange } from './TerraformModels';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('TerraformResourceComponent', () => {
  let component: TerraformResourceComponent;
  let fixture: ComponentFixture<TerraformResourceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TerraformResourceComponent, NoopAnimationsModule],
      providers: [TerraformService]
    }).compileComponents();

    fixture = TestBed.createComponent(TerraformResourceComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display masked value for sensitive properties', () => {
    const resourceChange: ResourceChange = {
      address: 'test.resource',
      mode: 'managed',
      type: 'test_type',
      name: 'resource',
      change: {
        actions: ['create'],
        before: null,
        after: { password: 'secret123' },
        after_sensitive: { password: true }
      }
    };

    component.resourceChange = resourceChange;
    component.ngOnChanges();

    const property = component.properties.find(p => p.path === 'password');
    expect(property).toBeDefined();
    expect(property!.isSensitive).toBe(true);
    expect(component.getDisplayValue(property!)).toBe('****');
  });

  it('should show actual value when visibility is toggled', () => {
    const resourceChange: ResourceChange = {
      address: 'test.resource',
      mode: 'managed',
      type: 'test_type',
      name: 'resource',
      change: {
        actions: ['create'],
        before: null,
        after: { password: 'secret123' },
        after_sensitive: { password: true }
      }
    };

    component.resourceChange = resourceChange;
    component.ngOnChanges();

    const property = component.properties.find(p => p.path === 'password');
    expect(property).toBeDefined();
    
    // Initially masked
    expect(component.getDisplayValue(property!)).toBe('****');
    
    // Toggle visibility
    component.toggleVisibility(property!);
    expect(component.getDisplayValue(property!)).toBe('secret123');
    
    // Toggle back
    component.toggleVisibility(property!);
    expect(component.getDisplayValue(property!)).toBe('****');
  });

  it('should show correct icon based on visibility state', () => {
    const property = {
      path: 'test',
      value: 'secret',
      isSensitive: true,
      isVisible: false
    };

    expect(component.getIconName(property)).toBe('visibility');
    
    property.isVisible = true;
    expect(component.getIconName(property)).toBe('visibility_off');
  });

  it('should handle non-sensitive properties correctly', () => {
    const resourceChange: ResourceChange = {
      address: 'test.resource',
      mode: 'managed',
      type: 'test_type',
      name: 'resource',
      change: {
        actions: ['create'],
        before: null,
        after: { name: 'test-resource' },
        after_sensitive: { name: false }
      }
    };

    component.resourceChange = resourceChange;
    component.ngOnChanges();

    const property = component.properties.find(p => p.path === 'name');
    expect(property).toBeDefined();
    expect(property!.isSensitive).toBe(false);
    expect(component.getDisplayValue(property!)).toBe('test-resource');
  });

  it('should handle array properties with mixed sensitivity', () => {
    const resourceChange: ResourceChange = {
      address: 'test.resource',
      mode: 'managed',
      type: 'test_type',
      name: 'resource',
      change: {
        actions: ['create'],
        before: null,
        after: { 
          triggers_replace: ['value1', 'value2', 'value3', 'value4']
        },
        after_sensitive: { 
          triggers_replace: [true, true, false, false]
        }
      }
    };

    component.resourceChange = resourceChange;
    component.ngOnChanges();

    const prop0 = component.properties.find(p => p.path === 'triggers_replace[0]');
    const prop1 = component.properties.find(p => p.path === 'triggers_replace[1]');
    const prop2 = component.properties.find(p => p.path === 'triggers_replace[2]');
    const prop3 = component.properties.find(p => p.path === 'triggers_replace[3]');

    expect(prop0?.isSensitive).toBe(true);
    expect(prop1?.isSensitive).toBe(true);
    expect(prop2?.isSensitive).toBe(false);
    expect(prop3?.isSensitive).toBe(false);

    expect(component.getDisplayValue(prop0!)).toBe('****');
    expect(component.getDisplayValue(prop1!)).toBe('****');
    expect(component.getDisplayValue(prop2!)).toBe('value3');
    expect(component.getDisplayValue(prop3!)).toBe('value4');
  });
});
