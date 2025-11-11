import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FileIndicatorComponent } from './file-indicator.component';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('FileIndicatorComponent', () => {
    let component: FileIndicatorComponent;
    let fixture: ComponentFixture<FileIndicatorComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [FileIndicatorComponent, NoopAnimationsModule]
        })
            .compileComponents();

        fixture = TestBed.createComponent(FileIndicatorComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should not display indicator when no file is loaded and cdktf is not loaded', () => {
        component.planFileName = null;
        component.cdktfLoaded = false;
        fixture.detectChanges();

        const indicator = fixture.nativeElement.querySelector('.file-indicators');
        expect(indicator).toBeFalsy();
    });

    it('should display plan file name with uploaded text when plan is loaded', () => {
        component.planFileName = 'test-plan.json';
        fixture.detectChanges();

        const indicators = fixture.nativeElement.querySelector('.file-indicators');
        expect(indicators).toBeTruthy();
        expect(indicators.textContent).toContain('test-plan.json');
        expect(indicators.textContent).toContain('uploaded');
    });

    it('should display CDKTF status when CDKTF is loaded', () => {
        component.cdktfLoaded = true;
        fixture.detectChanges();

        const indicators = fixture.nativeElement.querySelector('.file-indicators');
        expect(indicators).toBeTruthy();
        expect(indicators.textContent).toContain('CDKTF Constructs loaded');
    });

    it('should display both plan file name and CDKTF status when both are loaded', () => {
        component.planFileName = 'test-plan.json';
        component.cdktfLoaded = true;
        fixture.detectChanges();

        const indicators = fixture.nativeElement.querySelector('.file-indicators');
        expect(indicators).toBeTruthy();
        expect(indicators.textContent).toContain('test-plan.json');
        expect(indicators.textContent).toContain('uploaded');
        expect(indicators.textContent).toContain('CDKTF Constructs loaded');
    });

    it('should shorten long file names', () => {
        const longFileName = 'very-long-terraform-plan-filename-that-should-be-shortened.json';
        const shortName = component.getShortFileName(longFileName);
        expect(shortName.length).toBeLessThan(longFileName.length);
        expect(shortName).toContain('...');
        expect(shortName).toContain('.json');
    });

    it('should have correct tooltip for file name', () => {
        component.planFileName = 'test-plan.json';
        fixture.detectChanges();

        const fileName = fixture.nativeElement.querySelector('.file-name');
        expect(fileName).toBeTruthy();
        expect(fileName.getAttribute('ng-reflect-message')).toBe('test-plan.json');
    });

    it('should show check circle icon for uploaded plan', () => {
        component.planFileName = 'test-plan.json';
        fixture.detectChanges();

        const icon = fixture.nativeElement.querySelector('.file-icon');
        expect(icon).toBeTruthy();
        expect(icon.textContent).toBe('check_circle');
    });
});