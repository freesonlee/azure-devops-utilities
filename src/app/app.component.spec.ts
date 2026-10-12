import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AppComponent } from './app.component';
import { AppModule } from './app.module';

describe('Standalone website startup', () => {
  beforeEach(async () => {
    localStorage.removeItem('servers');
    localStorage.removeItem('lastServer');
    await TestBed.configureTestingModule({
      imports: [AppModule, HttpClientTestingModule, NoopAnimationsModule]
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('starts without an active Azure DevOps connection', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.server).toBeUndefined();
    expect(fixture.componentInstance.variableGroups).toEqual([]);
  });

  it('renders the variable editor and connection setup prompt', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.page-heading h1')?.textContent).toContain('Variable Group Editor');
    expect(element.textContent).toContain('Connect your Azure DevOps project');
  });

  it('keeps save and reload disabled before a project is configured', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const save = Array.from(element.querySelectorAll('button')).find(button => button.textContent?.includes('Save changes'));
    expect(save?.disabled).toBeTrue();
    expect(element.querySelector<HTMLButtonElement>('[aria-label="Reload"]')?.disabled).toBeTrue();
  });
});
