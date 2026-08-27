import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TerraformPlanViewerComponent } from './terraform-plan-viewer';

describe('TerraformPlanViewerComponent', () => {
    let component: TerraformPlanViewerComponent;
    let fixture: ComponentFixture<TerraformPlanViewerComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TerraformPlanViewerComponent, HttpClientTestingModule, NoopAnimationsModule]
        }).compileComponents();

        fixture = TestBed.createComponent(TerraformPlanViewerComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should accept a plan payload sent from the opener via postMessage', () => {
        const plan = {
            format_version: '1.0',
            terraform_version: '1.9.0',
            variables: {},
            planned_values: {
                outputs: {},
                root_module: { resources: [] }
            },
            resource_changes: [],
            output_changes: {}
        };

        const event = {
            source: window.opener,
            data: {
                type: 'terraform-plan',
                plan,
                fileName: 'from-opener.json'
            }
        } as MessageEvent;

        (component as any).handleMessageEvent(event);

        expect(component.currentPlan).toEqual(plan);
        expect(component.planFileName).toBe('from-opener.json');
    });
});
