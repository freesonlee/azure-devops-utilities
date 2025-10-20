import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TerraformService } from './terraform.service';
import { ResourceChange, PropertyInfo, TerraformPlan } from './TerraformModels';

@Component({
  selector: 'app-terraform-resource',
  templateUrl: './terraform-resource.component.html',
  styleUrls: ['./terraform-resource.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule
  ]
})
export class TerraformResourceComponent {
  @Input() resourceChange?: ResourceChange;
  @Input() plan?: TerraformPlan;
  @Input() showBeforeValues: boolean = false;
  
  properties: PropertyInfo[] = [];
  displayedColumns: string[] = ['property', 'value', 'actions'];

  constructor(private terraformService: TerraformService) {}

  ngOnChanges() {
    this.loadProperties();
  }

  private loadProperties() {
    if (!this.resourceChange) {
      return;
    }

    this.properties = this.terraformService.getResourceProperties(
      this.resourceChange,
      !this.showBeforeValues
    );
  }

  toggleVisibility(property: PropertyInfo) {
    property.isVisible = !property.isVisible;
  }

  getDisplayValue(property: PropertyInfo): string {
    if (property.isSensitive && !property.isVisible) {
      return '****';
    }
    
    if (property.value === null) {
      return 'null';
    }
    
    if (property.value === undefined) {
      return 'undefined';
    }
    
    if (typeof property.value === 'object') {
      const jsonStr = JSON.stringify(property.value);
      // Truncate very large objects for better UX
      if (jsonStr.length > 200) {
        return jsonStr.substring(0, 197) + '...';
      }
      return jsonStr;
    }
    
    return String(property.value);
  }

  getIconName(property: PropertyInfo): string {
    return property.isVisible ? 'visibility_off' : 'visibility';
  }

  getTooltip(property: PropertyInfo): string {
    return property.isVisible ? 'Hide value' : 'Show value';
  }
}
