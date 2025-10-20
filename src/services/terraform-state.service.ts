import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

export interface TerraformImportRequest {
  address: string;
  id: string;
}

@Injectable({
  providedIn: 'root'
})
export class TerraformStateService {
  constructor() { }

  validatePlan(environmentName: string, stackName: string): Observable<any> {
    // Stub implementation - returns mock validation result
    return of({ valid: true, message: 'Plan validation not yet implemented' });
  }

  importResource(environmentName: string, stackName: string, request: TerraformImportRequest): Observable<any> {
    // Stub implementation
    return of({ success: false, message: 'Import not yet implemented' });
  }

  removeResource(environmentName: string, stackName: string, address: string): Observable<any> {
    // Stub implementation
    return of({ success: false, message: 'Remove not yet implemented' });
  }

  applyPlan(environmentName: string, stackName: string): Observable<any> {
    // Stub implementation
    return of({ success: false, message: 'Apply not yet implemented' });
  }
}
