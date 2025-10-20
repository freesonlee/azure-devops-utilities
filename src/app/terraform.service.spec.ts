import { TestBed } from '@angular/core/testing';
import { TerraformService } from './terraform.service';
import { ResourceChange, SensitiveMap } from './TerraformModels';

describe('TerraformService', () => {
  let service: TerraformService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TerraformService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('isSensitive', () => {
    it('should return true for a simple sensitive property', () => {
      const sensitiveMap: SensitiveMap = {
        custom_domain_verification_id: true
      };
      
      expect(service.isSensitive('custom_domain_verification_id', sensitiveMap)).toBe(true);
    });

    it('should return false for a non-sensitive property', () => {
      const sensitiveMap: SensitiveMap = {
        custom_domain_verification_id: true,
        public_property: false
      };
      
      expect(service.isSensitive('public_property', sensitiveMap)).toBe(false);
    });

    it('should return false for a property not in the map', () => {
      const sensitiveMap: SensitiveMap = {
        custom_domain_verification_id: true
      };
      
      expect(service.isSensitive('other_property', sensitiveMap)).toBe(false);
    });

    it('should return false when sensitive map is undefined', () => {
      expect(service.isSensitive('any_property', undefined)).toBe(false);
    });

    it('should handle array properties correctly', () => {
      const sensitiveMap: SensitiveMap = {
        triggers_replace: [true, true, true, false, false]
      };
      
      expect(service.isSensitive('triggers_replace[0]', sensitiveMap)).toBe(true);
      expect(service.isSensitive('triggers_replace[1]', sensitiveMap)).toBe(true);
      expect(service.isSensitive('triggers_replace[2]', sensitiveMap)).toBe(true);
      expect(service.isSensitive('triggers_replace[3]', sensitiveMap)).toBe(false);
      expect(service.isSensitive('triggers_replace[4]', sensitiveMap)).toBe(false);
    });

    it('should handle nested properties', () => {
      const sensitiveMap: SensitiveMap = {
        config: {
          password: true,
          username: false
        }
      };
      
      expect(service.isSensitive('config.password', sensitiveMap)).toBe(true);
      expect(service.isSensitive('config.username', sensitiveMap)).toBe(false);
    });

    it('should handle nested arrays', () => {
      const sensitiveMap: SensitiveMap = {
        items: [
          { secret: true, name: false },
          { secret: false, name: false }
        ]
      };
      
      expect(service.isSensitive('items[0].secret', sensitiveMap)).toBe(true);
      expect(service.isSensitive('items[0].name', sensitiveMap)).toBe(false);
      expect(service.isSensitive('items[1].secret', sensitiveMap)).toBe(false);
    });
  });

  describe('flattenObject', () => {
    it('should flatten a simple object', () => {
      const obj = {
        name: 'test',
        value: 'data'
      };
      
      const result = service.flattenObject(obj);
      
      expect(result.length).toBe(2);
      expect(result.find(p => p.path === 'name')?.value).toBe('test');
      expect(result.find(p => p.path === 'value')?.value).toBe('data');
    });

    it('should flatten nested objects', () => {
      const obj = {
        config: {
          host: 'localhost',
          port: 8080
        }
      };
      
      const result = service.flattenObject(obj);
      
      expect(result.length).toBe(2);
      expect(result.find(p => p.path === 'config.host')?.value).toBe('localhost');
      expect(result.find(p => p.path === 'config.port')?.value).toBe(8080);
    });

    it('should flatten arrays', () => {
      const obj = {
        items: ['a', 'b', 'c']
      };
      
      const result = service.flattenObject(obj);
      
      expect(result.length).toBe(3);
      expect(result.find(p => p.path === 'items[0]')?.value).toBe('a');
      expect(result.find(p => p.path === 'items[1]')?.value).toBe('b');
      expect(result.find(p => p.path === 'items[2]')?.value).toBe('c');
    });

    it('should mark sensitive properties correctly', () => {
      const obj = {
        password: 'secret123',
        username: 'admin'
      };
      
      const sensitiveMap: SensitiveMap = {
        password: true,
        username: false
      };
      
      const result = service.flattenObject(obj, '', sensitiveMap);
      
      const password = result.find(p => p.path === 'password');
      const username = result.find(p => p.path === 'username');
      
      expect(password?.isSensitive).toBe(true);
      expect(username?.isSensitive).toBe(false);
    });

    it('should mark array items as sensitive correctly', () => {
      const obj = {
        triggers_replace: ['trigger1', 'trigger2', 'trigger3', 'trigger4']
      };
      
      const sensitiveMap: SensitiveMap = {
        triggers_replace: [true, true, true, false]
      };
      
      const result = service.flattenObject(obj, '', sensitiveMap);
      
      expect(result.find(p => p.path === 'triggers_replace[0]')?.isSensitive).toBe(true);
      expect(result.find(p => p.path === 'triggers_replace[1]')?.isSensitive).toBe(true);
      expect(result.find(p => p.path === 'triggers_replace[2]')?.isSensitive).toBe(true);
      expect(result.find(p => p.path === 'triggers_replace[3]')?.isSensitive).toBe(false);
    });
  });

  describe('getResourceProperties', () => {
    it('should get after properties by default', () => {
      const resourceChange: ResourceChange = {
        address: 'test.resource',
        mode: 'managed',
        type: 'test_type',
        name: 'resource',
        change: {
          actions: ['update'],
          before: { value: 'old' },
          after: { value: 'new' },
          before_sensitive: { value: false },
          after_sensitive: { value: true }
        }
      };
      
      const result = service.getResourceProperties(resourceChange, true);
      
      expect(result.length).toBe(1);
      expect(result[0].value).toBe('new');
      expect(result[0].isSensitive).toBe(true);
    });

    it('should get before properties when requested', () => {
      const resourceChange: ResourceChange = {
        address: 'test.resource',
        mode: 'managed',
        type: 'test_type',
        name: 'resource',
        change: {
          actions: ['update'],
          before: { value: 'old' },
          after: { value: 'new' },
          before_sensitive: { value: true },
          after_sensitive: { value: false }
        }
      };
      
      const result = service.getResourceProperties(resourceChange, false);
      
      expect(result.length).toBe(1);
      expect(result[0].value).toBe('old');
      expect(result[0].isSensitive).toBe(true);
    });
  });
});
