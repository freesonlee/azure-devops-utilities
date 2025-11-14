import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TerraformPlanDisplayComponent } from './terraform-plan-display.component';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ResourceChange } from '../../interfaces/terraform-plan.interface';

describe('TerraformPlanDisplayComponent - Force Replacement', () => {
    let component: TerraformPlanDisplayComponent;
    let fixture: ComponentFixture<TerraformPlanDisplayComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [
                TerraformPlanDisplayComponent,
                NoopAnimationsModule,
                HttpClientTestingModule
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(TerraformPlanDisplayComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    describe('getFlattenedReplacePaths', () => {
        it('should return empty set when replace_paths is undefined', () => {
            const resource: ResourceChange = {
                address: 'azurerm_storage_account.example',
                mode: 'managed',
                type: 'azurerm_storage_account',
                name: 'example',
                provider_name: 'azurerm',
                change: {
                    actions: ['update'],
                    before: {},
                    after: {}
                }
            };

            const result = (component as any).getFlattenedReplacePaths(resource);
            expect(result.size).toBe(0);
        });

        it('should return empty set when replace_paths is empty array', () => {
            const resource: ResourceChange = {
                address: 'azurerm_storage_account.example',
                mode: 'managed',
                type: 'azurerm_storage_account',
                name: 'example',
                provider_name: 'azurerm',
                change: {
                    actions: ['delete', 'create'],
                    before: {},
                    after: {},
                    replace_paths: []
                }
            };

            const result = (component as any).getFlattenedReplacePaths(resource);
            expect(result.size).toBe(0);
        });

        it('should flatten single-level path array', () => {
            const resource: ResourceChange = {
                address: 'azurerm_storage_account.example',
                mode: 'managed',
                type: 'azurerm_storage_account',
                name: 'example',
                provider_name: 'azurerm',
                change: {
                    actions: ['delete', 'create'],
                    before: {},
                    after: {},
                    replace_paths: [['principal_id']]
                }
            };

            const result = (component as any).getFlattenedReplacePaths(resource);
            expect(result.size).toBe(1);
            expect(result.has('principal_id')).toBe(true);
        });

        it('should flatten multi-level path arrays', () => {
            const resource: ResourceChange = {
                address: 'azurerm_storage_account.example',
                mode: 'managed',
                type: 'azurerm_storage_account',
                name: 'example',
                provider_name: 'azurerm',
                change: {
                    actions: ['delete', 'create'],
                    before: {},
                    after: {},
                    replace_paths: [
                        ['principal_id'],
                        ['network_rules', '0', 'default_action'],
                        ['tags', 'Environment']
                    ]
                }
            };

            const result = (component as any).getFlattenedReplacePaths(resource);
            expect(result.size).toBe(3);
            expect(result.has('principal_id')).toBe(true);
            expect(result.has('network_rules.0.default_action')).toBe(true);
            expect(result.has('tags.Environment')).toBe(true);
        });
    });

    describe('isPropertyForceReplacement', () => {
        it('should return false when resource has no replace_paths', () => {
            const resource: ResourceChange = {
                address: 'azurerm_storage_account.example',
                mode: 'managed',
                type: 'azurerm_storage_account',
                name: 'example',
                provider_name: 'azurerm',
                change: {
                    actions: ['update'],
                    before: { name: 'old' },
                    after: { name: 'new' }
                }
            };

            const result = component.isPropertyForceReplacement(resource, 'name');
            expect(result).toBe(false);
        });

        it('should return true for property that matches replace_paths', () => {
            const resource: ResourceChange = {
                address: 'azurerm_storage_account.example',
                mode: 'managed',
                type: 'azurerm_storage_account',
                name: 'example',
                provider_name: 'azurerm',
                change: {
                    actions: ['delete', 'create'],
                    before: { principal_id: 'old-id' },
                    after: { principal_id: 'new-id' },
                    replace_paths: [['principal_id']]
                }
            };

            const result = component.isPropertyForceReplacement(resource, 'principal_id');
            expect(result).toBe(true);
        });

        it('should return false for property that does not match replace_paths', () => {
            const resource: ResourceChange = {
                address: 'azurerm_storage_account.example',
                mode: 'managed',
                type: 'azurerm_storage_account',
                name: 'example',
                provider_name: 'azurerm',
                change: {
                    actions: ['delete', 'create'],
                    before: { principal_id: 'old-id', name: 'old' },
                    after: { principal_id: 'new-id', name: 'new' },
                    replace_paths: [['principal_id']]
                }
            };

            const result = component.isPropertyForceReplacement(resource, 'name');
            expect(result).toBe(false);
        });

        it('should handle nested property paths', () => {
            const resource: ResourceChange = {
                address: 'azurerm_storage_account.example',
                mode: 'managed',
                type: 'azurerm_storage_account',
                name: 'example',
                provider_name: 'azurerm',
                change: {
                    actions: ['delete', 'create'],
                    before: {},
                    after: {},
                    replace_paths: [['network_rules', '0', 'default_action']]
                }
            };

            const result = component.isPropertyForceReplacement(resource, 'network_rules.0.default_action');
            expect(result).toBe(true);
        });

        it('should handle array notation variations', () => {
            const resource: ResourceChange = {
                address: 'azurerm_storage_account.example',
                mode: 'managed',
                type: 'azurerm_storage_account',
                name: 'example',
                provider_name: 'azurerm',
                change: {
                    actions: ['delete', 'create'],
                    before: {},
                    after: {},
                    replace_paths: [['network_rules', '0', 'default_action']]
                }
            };

            // Should match both dot notation and bracket notation
            expect(component.isPropertyForceReplacement(resource, 'network_rules.0.default_action')).toBe(true);
            expect(component.isPropertyForceReplacement(resource, 'network_rules[0].default_action')).toBe(true);
        });

        it('should return true when any path in replace_paths matches', () => {
            const resource: ResourceChange = {
                address: 'azurerm_storage_account.example',
                mode: 'managed',
                type: 'azurerm_storage_account',
                name: 'example',
                provider_name: 'azurerm',
                change: {
                    actions: ['delete', 'create'],
                    before: {},
                    after: {},
                    replace_paths: [
                        ['principal_id'],
                        ['location'],
                        ['account_tier']
                    ]
                }
            };

            expect(component.isPropertyForceReplacement(resource, 'principal_id')).toBe(true);
            expect(component.isPropertyForceReplacement(resource, 'location')).toBe(true);
            expect(component.isPropertyForceReplacement(resource, 'account_tier')).toBe(true);
            expect(component.isPropertyForceReplacement(resource, 'other_property')).toBe(false);
        });
    });
});
