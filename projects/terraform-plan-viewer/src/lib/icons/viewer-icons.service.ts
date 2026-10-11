import { Injectable } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { MatIconRegistry } from '@angular/material/icon';
import { VIEWER_ICONS } from './icons';

@Injectable({ providedIn: 'root' })
export class ViewerIconsService {
  constructor(registry: MatIconRegistry, sanitizer: DomSanitizer) {
    for (const [name, svg] of Object.entries(VIEWER_ICONS)) {
      registry.addSvgIconLiteralInNamespace('tf-viewer', name, sanitizer.bypassSecurityTrustHtml(svg));
    }
  }
}
