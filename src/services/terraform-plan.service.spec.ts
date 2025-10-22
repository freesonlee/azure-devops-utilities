import { TestBed } from '@angular/core/testing';
import { TerraformPlanService } from './terraform-plan.service';
import { ResourceChange } from '../interfaces/terraform-plan.interface';
import { TerraformSensitivityService } from './terraform-sensitivity.service';

describe('TerraformPlanService - Sensitive Property Detection', () => {
  let service: TerraformSensitivityService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TerraformSensitivityService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('isPropertySensitive', () => {
    it('should detect simple sensitive property', () => {
      const sensitiveMetadata = {
        custom_domain_verification_id: true
      };

      expect(service.isPropertySensitive(sensitiveMetadata, 'custom_domain_verification_id')).toBe(true);
      expect(service.isPropertySensitive(sensitiveMetadata, 'other_property')).toBe(false);
    });

    it('should detect sensitive array elements', () => {
      const sensitiveMetadata = {
        triggers_replace: [true, true, true, false, false]
      };

      expect(service.isPropertySensitive(sensitiveMetadata, 'triggers_replace[0]')).toBe(true);
      expect(service.isPropertySensitive(sensitiveMetadata, 'triggers_replace[1]')).toBe(true);
      expect(service.isPropertySensitive(sensitiveMetadata, 'triggers_replace[2]')).toBe(true);
      expect(service.isPropertySensitive(sensitiveMetadata, 'triggers_replace[3]')).toBe(false);
      expect(service.isPropertySensitive(sensitiveMetadata, 'triggers_replace[4]')).toBe(false);

      // When checking the array property itself (without index), it should be sensitive if any element is sensitive
      expect(service.isPropertySensitive(sensitiveMetadata, 'triggers_replace')).toBe(true);
    });

    it('should return false for array property when no elements are sensitive', () => {
      const sensitiveMetadata = {
        triggers_replace: [false, false, false]
      };

      expect(service.isPropertySensitive(sensitiveMetadata, 'triggers_replace')).toBe(false);
      expect(service.isPropertySensitive(sensitiveMetadata, 'triggers_replace[0]')).toBe(false);
    });

    it('should detect nested sensitive properties', () => {
      const sensitiveMetadata = {
        network_rules: {
          ip_rules: true,
          virtual_network_subnet_ids: false
        }
      };

      expect(service.isPropertySensitive(sensitiveMetadata, 'network_rules.ip_rules')).toBe(true);
      expect(service.isPropertySensitive(sensitiveMetadata, 'network_rules.virtual_network_subnet_ids')).toBe(false);
    });

    it('should detect sensitive properties in nested arrays', () => {
      const sensitiveMetadata = {
        network_rules: [
          {
            default_action: false,
            ip_rules: true
          },
          {
            default_action: true,
            ip_rules: false
          }
        ]
      };

      expect(service.isPropertySensitive(sensitiveMetadata, 'network_rules[0].default_action')).toBe(false);
      expect(service.isPropertySensitive(sensitiveMetadata, 'network_rules[0].ip_rules')).toBe(true);
      expect(service.isPropertySensitive(sensitiveMetadata, 'network_rules[1].default_action')).toBe(true);
      expect(service.isPropertySensitive(sensitiveMetadata, 'network_rules[1].ip_rules')).toBe(false);
    });

    it('should handle null or undefined metadata', () => {
      expect(service.isPropertySensitive(null, 'any_property')).toBe(false);
      expect(service.isPropertySensitive(undefined, 'any_property')).toBe(false);
    });

    it('should handle empty property path', () => {
      const sensitiveMetadata = { test: true };
      expect(service.isPropertySensitive(sensitiveMetadata, '')).toBe(false);
    });
  });

  describe('isResourcePropertySensitive', () => {
    it('should check both before and after sensitivity', () => {
      const resource: ResourceChange = {
        address: 'azurerm_storage_account.example',
        mode: 'managed',
        type: 'azurerm_storage_account',
        name: 'example',
        provider_name: 'azurerm',
        change: {
          actions: ['update'],
          before: {
            name: 'oldvalue',
            key: 'secret1'
          },
          after: {
            name: 'newvalue',
            key: 'secret2'
          },
          before_sensitive: {
            name: false,
            key: true
          },
          after_sensitive: {
            name: true,
            key: true
          }
        }
      };

      const nameResult = service.isResourcePropertySensitive(resource, 'name');
      expect(nameResult.beforeSensitive).toBe(false);
      expect(nameResult.afterSensitive).toBe(true);

      const keyResult = service.isResourcePropertySensitive(resource, 'key');
      expect(keyResult.beforeSensitive).toBe(true);
      expect(keyResult.afterSensitive).toBe(true);
    });
  });
});
