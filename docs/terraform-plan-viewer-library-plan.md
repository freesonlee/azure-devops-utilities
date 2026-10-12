# Terraform Plan Viewer Angular Library Plan

## Objective

Extract the Terraform plan renderer into a reusable npm package that an Angular application can embed by supplying parsed plan JSON. Preserve the current viewer's default appearance and make the existing application its first consumer.

Proposed package name: `@freesonlee/terraform-plan-viewer-angular`. Registry availability was checked; scope ownership and publishing access still need verification.

"Any Angular frontend" means applications within an explicitly documented and tested Angular/Material version range, with examples for both standalone components and NgModule applications.

## Current checkpoint

- Date: 2026-10-10 (local time).
- Repository: `freesonlee/azure-devops-utilities`; starting commit: `76010d5` on `main`.
- Library extraction, application integration, and local preview validation are complete.
- Package: `@freesonlee/terraform-plan-viewer-angular`, version `0.1.0-next.0`, MIT.
- Preview compatibility target: Angular/Material/CDK 17.1.x; validated on 17.1.1, TypeScript 5.3.3, RxJS 7.8.
- Production tarball: `dist/packages/freesonlee-terraform-plan-viewer-angular-0.1.0-next.0.tgz` (regenerate with `npm run pack:viewer`).
- Production application build and all 46 library unit tests passed. Variable Groups and Pipeline Profiles browser regressions passed.
- Separate tarball consumer passed standalone/NgModule builds, SSR initial rendering, and browser checks. Local 1,000-resource development rendering took approximately 1.3 seconds.
- Final application screenshots: `/tmp/terraform-viewer-final`; independent consumer results: `/tmp/terraform-viewer-consumer-bTlnOs`. These temporary artifacts can be regenerated from committed scripts/fixtures.
- The app is running at `http://localhost:4200/planviewer`. Library development watch mode is also running.
- npm publishing is not configured: `npm whoami` returned ENEEDAUTH. No release has been published.
- Next task: confirm the npm scope/account, configure publication, and review the preview before publishing. Broader Angular compatibility and SSR hydration remain separate work.

The earlier Terraform sharing work is stashed and excluded from this extraction. Do not automatically restore, commit, or incorporate that stash. Decide on sharing integration separately.

## Scope of the first release

Include:

- Rendering supplied Terraform plan JSON.
- Resource summaries, filters, grouping, selection, and before/after comparisons.
- Drift, unknown values, moved/imported resources, outputs, and variables.
- Masking of values marked sensitive in Terraform metadata.
- Optional CDKTF metadata and construct view.
- Typed inputs, outputs, options, and plan models.
- Responsive embedding in a host container.
- The current Terraform viewer's visual appearance as the default.

Keep in the host application:

- File selection, file watching, URL fetching, and pasted-URL handling.
- Azure DevOps settings, authentication, routes, and application navigation.
- CLI integration and messages from an opener window.
- Backend operations such as apply, import, removal, or targeted refresh.
- Share-link creation and loading, unless added as a separately reviewed feature later.

The library's renderer must not fetch plans, contact Azure DevOps, or execute Terraform operations. Optional action controls communicate requests through outputs so the host owns their execution.

## Existing code to extract

| Source | Role and treatment |
| --- | --- |
| `src/app/terraform-plan-viewer/terraform-plan-display.component.*` | Main renderer; starting point for the library. Already standalone and accepts `plan`. |
| `src/app/terraform-plan-viewer/resource-list.component.*` | Internal resource list. |
| `src/app/terraform-plan-viewer/construct-view.component.ts` | Internal CDKTF construct view. |
| `src/services/terraform-plan.service.ts` | Plan processing and viewer state; retain per-viewer isolation. |
| `src/services/terraform-sensitivity.service.ts` | Sensitivity and unknown-value handling. |
| `src/interfaces/terraform-plan.interface.ts` | Public data types, with schema coverage reviewed during extraction. |
| `src/app/terraform-plan-viewer/terraform-plan-viewer.*` | Keep as the application's upload/CLI wrapper around the library. |
| `src/app/terraform-plan-viewer/terraform-plan-file-upload.component.*` | Keep in the application for the initial release. |
| `src/services/terraform-state.service.ts` | Existing stub service; do not publish it as functioning backend support. |

Inspect actual dependencies before moving files. Only migrate code needed by the renderer; avoid exporting every internal component or service.

## Proposed consumer API

Public component: `TerraformPlanViewerComponent`.

Selector: `tf-plan-viewer`.

| API | Proposed contract |
| --- | --- |
| `plan` | `TerraformPlan \| null`; parsed JSON supplied by the host. `null` clears the viewer. |
| `cdktfMetadata` | Optional CDKTF metadata with a documented type. |
| `defaultFilter` | Typed initial resource filter; retain the existing automatic-filter behavior. |
| `options` | `TerraformViewerOptions` for embedding layout, optional controls, and sensitive-value reveal behavior. Finalize a small initial surface in Phase 1. |
| `resourceSelected` | Selection event with a typed resource payload. |
| `viewChanged` | Typed view-change notification. |
| Optional action outputs | Typed target/import/remove requests; emitted only when corresponding controls are enabled. |

Export the component, public options/event types, and necessary plan interfaces from `public-api.ts`. Treat other implementation details as internal.

Proposed use after installation:

```ts
import { Component, Input } from '@angular/core';
import {
  TerraformPlan,
  TerraformPlanViewerComponent
} from '@freesonlee/terraform-plan-viewer-angular';

@Component({
  selector: 'app-plan-page',
  standalone: true,
  imports: [TerraformPlanViewerComponent],
  template: '<tf-plan-viewer [plan]="plan" />'
})
export class PlanPageComponent {
  @Input() plan: TerraformPlan | null = null;
}
```

This API is implemented in the local preview package. Consumers replace the plan input with a new object when loading another plan. In-place mutation support is not promised.

## Implementation phases

### Phase 1 — Finalize the contract and capture the baseline

- [x] Confirm the initial Angular/Material compatibility target. Initial preview targets Angular/Material/CDK 17.1.x; installed/tested version is 17.1.1.
- [ ] Verify the proposed npm name and scope ownership.
- [x] Finalize input, output, options, and empty/error-state behavior.
- [x] Specify the default embedding layout and optional page-oriented floating-panel behavior.
- [x] Capture baseline screenshots for Terraform, CDKTF, resources, outputs, variables, sensitive values, and narrow containers.
- [x] Create synthetic plan fixtures; do not use private infrastructure data.
- [x] Record decisions in the decision log below.

Completion checkpoint: a documented API and visual baseline that can guide extraction without changing the viewer's default appearance.

### Phase 2 — Scaffold an Angular library in this repository

- [x] Create `projects/terraform-plan-viewer/` with Angular CLI library tooling and ng-packagr 17.1.2.
- [x] Configure the production build for Angular Package Format and partial compilation.
- [x] Create the package's own `package.json`, `ng-package.json`, TypeScript configs, and `public-api.ts`.
- [x] Set library-specific build/test scripts. Existing start/build tasks retain their behavior and now build the library first.
- [x] Keep the existing GitHub Pages workflow intact.
- [x] Verify that a minimal library builds before moving the renderer.

Target structure:

```text
projects/terraform-plan-viewer/
  package.json
  ng-package.json
  README.md
  src/
    public-api.ts
    lib/
      viewer/
      resource-list/
      construct-view/
      models/
      services/
```

Completion checkpoint: a buildable library skeleton alongside the existing application.

### Phase 3 — Extract the renderer and remove app coupling

- [x] Move the renderer, internal child components, plan models, and required services into the library.
- [x] Expose the agreed public component and API.
- [x] Keep state scoped to each viewer instance. The existing display component already provides its own `TerraformPlanService`; preserve this isolation.
- [x] Stop mutating host-supplied plan objects when enriching module or construct information; derive internal view models instead.
- [x] Reset selections, expanded details, caches, and sensitive-value visibility when the plan changes or is cleared.
- [x] Remove unused `HttpClient` injection from the renderer so displaying supplied data does not require HTTP setup.
- [x] Replace the global `.compact-upload-bar` query with an explicit, container-aware layout contract.
- [x] Support host-container dimensions and scrolling instead of assuming a full browser viewport or a fixed 800px left panel.
- [x] Guard browser-only measurement, clipboard, and animation-frame operations; dispose of subscriptions, observers, and pending callbacks.
- [x] Verify SSR-safe import and initial rendering, or document a precise browser-only limitation before release.
- [x] Keep backend action outputs optional and default the viewer to read-only mode.

Completion checkpoint: a host component can render a supplied plan without the application's uploader, router, credentials, CLI, or backend services.

### Phase 4 — Make styling and dependencies safe for consumers

- [x] Preserve default colors, component layout, status indicators, and sensitive-value presentation.
- [x] Scope styles to the viewer and eliminate unscoped overrides such as global `::ng-deep` chip rules.
- [x] Define a small documented set of CSS variables for borders and sizing (`--tfv-border`, `--tfv-left-panel-width`).
- [x] Document Material theme and animation setup for each supported Angular/Material version.
- [x] Bundle namespaced SVG icons so rendering does not require an externally loaded Material Icons font.
- [x] List required Angular, Material, and CDK packages as peer dependencies rather than bundling duplicate framework copies.
- [x] Decide RxJS peer constraints and list runtime utilities appropriately. `diff` and `tslib` are dependencies; the renderer does not use `js-yaml`.
- [x] Ensure importing the package does not change unrelated host styles, routes, or providers.
- [x] Add theme/style asset exports only when needed; begin with one main package entry point.

Completion checkpoint: the viewer retains its default appearance and can coexist with the host application's theme and other components.

### Phase 5 — Use the built package from the existing application

- [x] Build the library and point application imports at the built package, not its source files.
- [x] Replace the application's internal display import with the public library component.
- [x] Keep upload, file watching, CLI messaging, URL handling, and application navigation in the wrapper.
- [x] Forward supplied plan and CDKTF data into the library and handle relevant outputs in the wrapper.
- [x] Remove duplicate renderer implementation after the wrapper is working.
- [x] Re-run baseline visual checks and the application build.
- [x] Verify Variable Groups and Pipeline Profiles still work.

Completion checkpoint: the existing application consumes the library and continues working as before. Future viewer changes have one implementation.

### Phase 6 — Validate the packaged artifact and compatibility

- [x] Add meaningful tests for resource summaries, filters, before/after differences, unknown values, sensitivity metadata, drift, moved/imported/deleted resources, and nested modules.
- [x] Test CDKTF construct grouping and transitions between Terraform and CDKTF inputs.
- [x] Test initial `null`, invalid data, plan replacement, and clearing a previously loaded plan.
- [x] Verify sensitive values stay masked in the rendered DOM and copy behavior until explicitly revealed; avoid logging plan contents.
- [x] Document that masking relies on supplied sensitivity metadata and that host-facing events may contain original data.
- [x] Render two viewers simultaneously and confirm independent selections, filters, and instance state; verify masking and reveal policy separately.
- [x] Test constrained containers, host scrolling, keyboard Enter selection, and mobile layouts. Full accessibility auditing remains future work.
- [x] Measure a 1,000-resource synthetic plan: about 1.3 seconds in the local development consumer. Larger plans and virtualization are not validated.
- [x] Produce the production package and inspect `npm pack --dry-run` contents.
- [x] Install the actual `.tgz` from `npm pack` into a separate consumer application outside this workspace.
- [x] Verify standalone and NgModule examples using package imports only.
- [x] Build and test standalone/NgModule consumers on Angular/Material/CDK 17.1.1. Patch range is constrained to 17.1.x; no wider minor range is claimed.
- [x] Verify SSR initial rendering without browser globals; hydration is not claimed.
- [x] Do not widen peer dependency ranges beyond versions that have been tested.

Completion checkpoint: the actual npm artifact works in independent consumer applications, with a published compatibility table and known limitations.

### Phase 7 — Document and release

- [x] Choose a license and add the license file; no repository license was found during the initial review.
- [x] Write installation instructions, complete consumer examples, API documentation, theme setup, and compatibility guidance.
- [x] Document JSON expectations, browser requirements, sensitive-data behavior, and optional action events.
- [x] Add a changelog, repository metadata, package exports, and appropriate package file inclusion rules.
- [x] Add a separate manual preview packaging/validation workflow (`.github/workflows/viewer-package.yml`), with downloadable artifacts and no website deployment.
- [ ] Add the publishing step after npm scope/access and trusted-publisher configuration are confirmed.
- [ ] Configure npm scope ownership and publishing authentication; prefer trusted publishing for subsequent GitHub Actions releases.
- [ ] Verify current Node/npm requirements for publishing independently of the Angular build job's requirements.
- [ ] Publish a reviewed preview release such as `0.1.0-next.0` under the `next` tag once the package account is configured and publication is requested.
- [ ] Confirm installation from npm in a clean consumer app.
- [ ] Publish a stable release after API and compatibility validation.

Completion checkpoint: a documented, installable npm package with a repeatable release process. Package publishing must not be coupled to pushes that deploy the existing website.

## Validation and acceptance criteria

The extraction is complete when:

1. A separate Angular application can install the packed artifact and render a provided `TerraformPlan` through the documented API.
2. No application-specific source paths, Azure DevOps credentials, uploader, CLI, or backend service are required for rendering.
3. The existing application consumes the library and retains the Terraform viewer's default appearance and behavior.
4. Host plan data is not mutated, and multiple viewers maintain independent state.
5. Scoped styling does not restyle unrelated host components.
6. Sensitive-value, resource-count, JSON replacement, CDKTF, and layout cases have meaningful coverage.
7. Only tested Angular/Material versions are declared supported.
8. The public package includes its license, documentation, types, compiled implementation, and required assets, without private fixtures or application credentials.

## Decisions still to finalize

| Decision | Current position |
| --- | --- |
| Repository layout | Library in this repository; existing application is the first consumer. |
| npm name | Registry returned 404 for the proposed name on 2026-10-10; scope ownership remains unverified. |
| Initial compatibility range | Angular/Material/CDK 17.1.x preview; tested version 17.1.1. Wider support remains unclaimed. |
| Public API details | Implemented component, typed options/outputs, null-clearing, and accessible invalid-plan error output. Public outputs are asynchronous to avoid host render-pass mutations. |
| Layout | Container embedding by default; preserve page-oriented floating details through explicit configuration. |
| Styling | Existing Terraform appearance retained; host-safe styles and configurable tokens. |
| Upload and sharing | Host-owned initially; stashed sharing work remains separate. |
| License | MIT, explicitly selected by the user. Third-party icon and theme notices are included. |
| Publishing access | `npm whoami` returned ENEEDAUTH on 2026-10-10; scope ownership remains unverified. No publication attempted. |

## Resume procedure

1. Read this file, the progress log, and any applicable repository instructions.
2. Run `git status --short` and inspect current changes; do not reset, discard, or restore stashes automatically.
3. Identify the latest completed checkpoint and the next unchecked task.
4. Verify the relevant build and tests only when changes or unresolved concerns justify doing so.
5. Continue from that checkpoint, preserving recorded API and compatibility decisions.
6. Update this file at each checkpoint and before stopping. Record changed files, commands/results, open issues, and the next concrete action.

Recommended progress entry format:

```text
Date / checkpoint:
Completed tasks:
Files changed:
Validation commands and results:
Decisions made:
Open issues:
Next task:
```

## Progress log

### 2026-10-10 — Plan recorded

- Reviewed the current standalone renderer, inputs/outputs, service scope, browser assumptions, styles, and package dependencies.
- Identified input mutation, global DOM lookup, viewport assumptions, icon-font setup, and host-style isolation as extraction work.
- Saved this plan before library implementation.
- Workspace changes for this checkpoint: this Markdown file only.
- Next task: Phase 1 contract/compatibility decisions and baseline fixtures/screenshots, followed by Phase 2 scaffolding.

### 2026-10-10 — Extraction and first validation checkpoint

- Scaffolded the library, installed ng-packagr 17.1.2, and extracted renderer components, models, services, and existing meaningful tests.
- Added immutable JSON preparation, per-viewer state, explicit layout options, container queries, SVG icons, input errors, and protected secret-copy behavior.
- Migrated the application upload wrapper to the built library and removed the duplicate renderer implementation.
- Added package documentation, MIT license, third-party notices, synthetic fixtures, package-content checks, and a temporary external-consumer verification script.
- `npm run build`: passed with the existing bundle/style budget warnings.
- Library unit tests: 37 passed before the latest async-output/model refinements; rerun after those changes.
- Screenshots of the integrated application captured successfully. Resource totals now count moved/deleted entries correctly.
- First actual tarball was packed and installed into `/tmp/terraform-viewer-consumer-p6fk0O`; standalone production build passed.
- SSR consumer build needed `@angular/router` for Angular's server build infrastructure; the verification app now includes it. The viewer itself still does not require router or HTTP providers.
- Remaining: latest tarball validation, SSR runtime, browser lifecycle/layout checks, NgModule consumer, final tests, release-workflow preparation, and npm publishing ownership/authentication.
- The development app was restarted through the updated `npm start` task and remains on port 4200.
- Stashed sharing work has not been restored. Its future integration must account for the renderer/model relocation.

### 2026-10-10 — Local preview validated

- Completed Phases 3–6 and local release preparation. Public API, examples, theme setup, compatibility, MIT license, third-party notices, and changelog are documented in `projects/terraform-plan-viewer/`.
- Added input validation for nested collection shapes and resource drift, protected masked-value copy, disabled reveal controls when forbidden, and added keyboard resource selection.
- Narrowed Angular peer dependencies to `~17.1.0`; initial validation is specifically on 17.1.1. Bundled SVG icons require no font download or HTTP setup. Optional Material CSS is an explicit global import.
- `npm run pack:viewer`: passed. Production partial-compilation tarball contains 35 files, approximately 359 KB compressed / 2.1 MB unpacked, with no specs, fixtures, credentials, or node_modules.
- `CHROME_BIN=<Chromium executable> npm run test:viewer`: 46/46 passed, covering summaries, nested modules, replacements/imports/deletes/moves, filters, drift, unknown values, sensitivity, immutable host data, reset/error states, CDKTF transitions, read-only defaults, and independent instances.
- `npm run build`: passed. Existing warning budgets remain: about 1.49 MB initial app bundle and 24.77 KB upload-wrapper styles; error budgets are not exceeded.
- `npm run verify:viewer-package`: passed in `/tmp/terraform-viewer-consumer-bTlnOs`, using the actual tarball without workspace source aliases or symlinks. Verified standalone/NgModule production builds, SSR initial HTML, two viewers, frozen JSON, keyboard selection, masked DOM, disabled reveal, clear/replace/errors, CDKTF, mobile overflow, no browser errors, and no external requests. SSR hydration is untested.
- 1,000 synthetic resources rendered in 1,265 ms in the local development consumer. No virtualization or guarantee for larger plans is provided.
- `npm run ui:check` and `npm run ui:check:profiles`: passed, including flat Variable Groups and Azure Repos/GitHub branches.
- `UI_SCREENSHOT_DIR=/tmp/terraform-viewer-final npm run capture:viewer`: passed across resources, details, outputs, variables, CDKTF, and phone layout.
- `npm start`: rebuilt the library and served the refreshed app successfully on port 4200. `npm run watch:viewer` also compiled successfully; its development configuration preserves package output files. Stop/restart the app around clean production library builds/packaging.
- Visual inspection confirmed the Terraform styling and embedded layouts. The final tarball additionally includes the host font fallback and refreshed README; these presentation/documentation refinements do not alter the independently tested runtime API.
- Added `.github/workflows/viewer-package.yml` for manual preview validation/artifacts. The workflow has not run on GitHub yet. Existing Pages workflow is unchanged.
- npm identity check returned ENEEDAUTH; publishing account/scope, publishing authentication, current publishing runtime requirements, and registry installation remain pending.
- Stashed Terraform sharing work is excluded. Restoring it later may conflict with relocated renderer/model/service files; integrate it deliberately.
- Next task: confirm package scope/account and prepare the requested preview publication. No commit, push, or npm publication has been performed for this extraction.

## Reference documentation

- [Creating Angular libraries](https://angular.dev/tools/libraries/creating-libraries)
- [Angular Package Format and partial compilation](https://angular.dev/tools/libraries/angular-package-format)
- [Angular version compatibility](https://angular.dev/reference/versions)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)

These references were reviewed when preparing the plan. Re-check version-sensitive build and publishing requirements when implementing those phases.
