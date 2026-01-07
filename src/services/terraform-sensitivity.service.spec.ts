import { TestBed } from '@angular/core/testing';
import { TerraformSensitivityService } from './terraform-sensitivity.service';
import { ResourceChange } from '../interfaces/terraform-plan.interface';

describe('TerraformSensitivityService', () => {
    let service: TerraformSensitivityService;

    beforeEach(() => {
        TestBed.configureTestingModule({});
        service = TestBed.inject(TerraformSensitivityService);
    });

    it('should create', () => {
        expect(service).toBeTruthy();
    });

    describe('isPropertyUnknown', () => {
        it('should return true for top-level property marked as unknown', () => {
            const afterUnknown = {
                id: true,
                name: false
            };

            expect(service.isPropertyUnknown(afterUnknown, 'id')).toBe(true);
            expect(service.isPropertyUnknown(afterUnknown, 'name')).toBe(false);
        });

        it('should return true for nested property marked as unknown', () => {
            const afterUnknown = {
                network_rules: [
                    {
                        default_action: true,
                        ip_rules: false
                    }
                ]
            };

            expect(service.isPropertyUnknown(afterUnknown, 'network_rules[0].default_action')).toBe(true);
            expect(service.isPropertyUnknown(afterUnknown, 'network_rules[0].ip_rules')).toBe(false);
        });

        it('should return false for property not in after_unknown', () => {
            const afterUnknown = {
                id: true
            };

            expect(service.isPropertyUnknown(afterUnknown, 'nonexistent')).toBe(false);
        });

        it('should return false when after_unknown is null or undefined', () => {
            expect(service.isPropertyUnknown(null, 'id')).toBe(false);
            expect(service.isPropertyUnknown(undefined, 'id')).toBe(false);
        });

        it('should return false when propertyPath is empty', () => {
            const afterUnknown = {
                id: true
            };

            expect(service.isPropertyUnknown(afterUnknown, '')).toBe(false);
        });

        it('should handle array properties marked as unknown', () => {
            const afterUnknown = {
                tags: [true, false, true]
            };

            expect(service.isPropertyUnknown(afterUnknown, 'tags[0]')).toBe(true);
            expect(service.isPropertyUnknown(afterUnknown, 'tags[1]')).toBe(false);
            expect(service.isPropertyUnknown(afterUnknown, 'tags[2]')).toBe(true);
        });
    });

    describe('isResourcePropertyUnknown', () => {
        it('should return true when property is marked as unknown in resource', () => {
            const resource: ResourceChange = {
                address: 'test_resource.example',
                mode: 'managed',
                type: 'test_resource',
                name: 'example',
                provider_name: 'test',
                change: {
                    actions: ['create'],
                    before: null,
                    after: {
                        id: null,
                        name: 'test'
                    },
                    after_unknown: {
                        id: true,
                        name: false
                    }
                }
            };

            expect(service.isResourcePropertyUnknown(resource, 'id')).toBe(true);
            expect(service.isResourcePropertyUnknown(resource, 'name')).toBe(false);
        });

        it('should return false when resource has no after_unknown', () => {
            const resource: ResourceChange = {
                address: 'test_resource.example',
                mode: 'managed',
                type: 'test_resource',
                name: 'example',
                provider_name: 'test',
                change: {
                    actions: ['update'],
                    before: { name: 'old' },
                    after: { name: 'new' }
                }
            };

            expect(service.isResourcePropertyUnknown(resource, 'name')).toBe(false);
        });
    });
});