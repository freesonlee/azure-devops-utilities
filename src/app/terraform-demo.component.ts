import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { TerraformResourceComponent } from './terraform-resource.component';
import { ResourceChange, TerraformPlan } from './TerraformModels';

@Component({
  selector: 'app-terraform-demo',
  templateUrl: './terraform-demo.component.html',
  styleUrls: ['./terraform-demo.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    TerraformResourceComponent
  ]
})
export class TerraformDemoComponent {
  // Sample data demonstrating the sensitive property masking feature
  sampleResourceChange: ResourceChange = {
    address: 'azurerm_app_service.example',
    mode: 'managed',
    type: 'azurerm_app_service',
    name: 'example',
    change: {
      actions: ['create'],
      before: null,
      after: {
        name: 'my-app-service',
        custom_domain_verification_id: 'ABC123DEF456GHI789',
        location: 'eastus',
        resource_group_name: 'my-rg',
        triggers_replace: [
          'trigger-value-1',
          'trigger-value-2',
          'trigger-value-3',
          'trigger-value-4',
          'trigger-value-5'
        ]
      },
      after_sensitive: {
        custom_domain_verification_id: true,
        location: false,
        name: false,
        resource_group_name: false,
        triggers_replace: [
          true,
          true,
          true,
          false,
          false
        ]
      }
    }
  };

  samplePlan?: TerraformPlan;
}
