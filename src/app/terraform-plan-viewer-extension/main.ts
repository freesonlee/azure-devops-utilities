import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { RunTabComponent } from './run-tab.component';

bootstrapApplication(RunTabComponent, { providers: [provideAnimations()] }).catch(() => {
  document.body.textContent = 'Could not initialize Terraform Plans. Refresh the pipeline run and try again.';
});
