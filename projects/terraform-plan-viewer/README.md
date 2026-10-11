# Terraform Plan Viewer for Angular

An embeddable, read-only viewer for supplied Terraform plan JSON and optional CDKTF metadata. It renders resource changes, drift, unknown and sensitive values, outputs, and variables. It does not fetch plans, authenticate to Azure DevOps, or execute Terraform.

This is an unpublished preview. The initial compatibility target is Angular/Material/CDK **17.1.x**, tested on 17.1.1 with RxJS 7.8 and TypeScript 5.3. Broader Angular support has not been validated.

## Installation

The manual **Viewer package validation and publishing** GitHub Actions workflow publishes validated previews to GitHub Packages under the `next` tag. After publication, add this scope mapping to your application's `.npmrc`:

~~~ini
@freesonlee:registry=https://npm.pkg.github.com
~~~

Authenticate with a GitHub personal access token (classic) with `read:packages` and access to the package, then install:

~~~sh
npm login --scope=@freesonlee --registry=https://npm.pkg.github.com --auth-type=legacy
npm install @freesonlee/terraform-plan-viewer-angular@next
~~~

Keep authentication tokens out of the repository. GitHub Packages requires authentication even for public npm packages.

From the repository, run `npm run pack:viewer`, then install the tarball in your Angular application:

~~~sh
npm install /path/to/freesonlee-terraform-plan-viewer-angular-0.1.0-next.0.tgz
~~~

Use matching Angular 17 peer dependencies. Configure animations with `provideAnimations()` or `provideNoopAnimations()`, or the corresponding animation module for an NgModule application.

Use your existing Angular Material theme. If you do not have one, you can opt in to the bundled indigo/pink theme from a global stylesheet:

~~~css
@import '@freesonlee/terraform-plan-viewer-angular/theme.css';
~~~

The optional CSS is a global Material theme. Importing the component alone does not install global CSS. SVG icons are bundled; no Material Icons font or HTTP providers are required.

## Standalone example

~~~ts
import { Component, Input } from '@angular/core';
import { TerraformPlan, TerraformPlanViewerComponent } from '@freesonlee/terraform-plan-viewer-angular';

@Component({
  selector: 'app-plan',
  standalone: true,
  imports: [TerraformPlanViewerComponent],
  template: '<tf-plan-viewer [plan]="plan" />'
})
export class PlanComponent {
  @Input() plan: TerraformPlan | null = null;
}
~~~

For NgModule applications, add the standalone `TerraformPlanViewerComponent` to the module's **imports**, not declarations.

## Public API

| API | Default / behavior |
| --- | --- |
| `plan: TerraformPlan \| null` | Parsed Terraform plan JSON; set a new object to replace the plan or null to clear. |
| `cdktfMetadata: CdktfMetadata \| null` | Optional cdk.tf.json metadata. |
| `defaultFilter: TerraformResourceFilter` | auto; other filters: total, changes, create, update, delete, replace, no-op. |
| `options: TerraformViewerOptions \| null` | Embedded, read-only rendering; explicit sensitive-value reveal enabled. |
| `resourceSelected` | Selected resource, or null when input changes/clears. |
| `viewChanged` | resources, outputs, variables, terraform, or construct. |
| `cdktfStatusChanged` | Whether CDKTF metadata is loaded. |
| `error` | Invalid-plan code and message; also renders an accessible error. |
| `targetResourceRequested` | Target address; host implements the action. |
| `importStateRequested` / `removeFromStateRequested` | Resource payload; host implements the action. |

Options:

~~~ts
const options = {
  layout: 'embedded',          // default; stays inside the host container
  viewportTopOffset: 0,        // page mode: sticky toolbar height in pixels
  enableActions: false,        // host handles actions through outputs
  allowSensitiveReveal: true   // values start masked; false disables reveal/copy of secrets
};
~~~

Page mode preserves the application's floating details panel. Supply an explicit sticky-toolbar offset; the library never queries host toolbar classes. Embedded mode responds to the container width.

CSS variables on the host: `--tfv-left-panel-width` (embedded layout, default 45%) and `--tfv-border` (default #e0e0e0).

## Data and privacy

Input must contain string format_version and terraform_version fields. Missing collection fields in valid empty plans are normalized. Malformed resource changes are rejected. This validates renderer inputs, not the entire Terraform JSON Schema.

The viewer owns a JSON copy and does not modify the host's plan. Multiple viewers have independent state. Outputs carry derived resource data, including underlying sensitive values; the host is responsible for handling these payloads.

Masking relies on supplied Terraform sensitivity metadata. Unmarked secrets cannot be inferred, and Terraform input variables do not always include sensitivity flags. Marked sensitive resource values cannot be copied while masked.

Supply plain JSON data; cyclic objects, functions, and class instances are unsupported. Modern browsers with SVG and CSS container queries are required. Consult the extraction plan and verification results for SSR and compatibility coverage.

## Development

~~~sh
npm run build:viewer
npm run test:viewer
npm run pack:viewer
npm run verify:viewer-package
~~~

Set CHROME_BIN to a Chromium executable for Karma. The package verification script installs the actual tarball into a temporary consumer application.

Start `npm start`, then run `npm run watch:viewer` in a second terminal when editing library sources. Development watch builds preserve the output directory so the application can keep resolving the package. Stop/restart the app around production library builds or packaging, which clean that directory. Application startup/build tasks build the library first and import its compiled output.

## License

MIT. SVG icons retain their Apache-2.0 license. See LICENSE, THIRD_PARTY_NOTICES.md, and MATERIAL_ICONS_LICENSE.
