import { TestBed } from '@angular/core/testing';
import { VariableGroupHistoryComponent } from './variable-group-history.component';

describe('AppComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({
    declarations: [VariableGroupHistoryComponent]
  }));

  it('should create the app', () => {
    const fixture = TestBed.createComponent(VariableGroupHistoryComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have as title 'azure-devops-variable-group-editor'`, () => {
    const fixture = TestBed.createComponent(VariableGroupHistoryComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('azure-devops-variable-group-editor');
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(VariableGroupHistoryComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.content span')?.textContent).toContain('azure-devops-variable-group-editor app is running!');
  });
});
