# Terraform plan viewer extension for Azure DevOps

Status: implemented on `feature/terraform-run-viewer`. The production and HTTPS localhost builds passed browser transport and rendering checks against live run 6359 using an Entra token. Private extension `FreesonLi.ads-terraform-plan-viewer-dev` version `0.0.1` is published, shared, and installed in FreesonLee, with only `vso.build`. The user confirmed that `test.plan.json` renders in the native Terraform Plans (Dev) tab for run 6359, validating the installed extension and its scoped SDK token. Older hosted Build Artifacts have fixture coverage; recent runs of the same test pipeline contain only Pipeline Artifacts.

## Expected behavior

Add **Terraform Plans** to an Azure DevOps pipeline run page. Within that extension, show one file tab for every file whose basename ends with `.plan.json`, across all artifacts attached to the selected run, including nested folders. The user confirmed that discovery applies to files inside every artifact, rather than filtering artifact names.

For example, these files produce three file tabs:

- `infrastructure / production/network.plan.json`
- `infrastructure / production/application.plan.json`
- `preview / network.plan.json`

Tabs display filenames, with the artifact name and relative path available to distinguish duplicate names. Use a stable identity composed of project, run, artifact, and full relative file path; do not deduplicate by basename. Sort discoveries by artifact and path. Match the literal `.plan.json` suffix initially.

The run-level tab is a static Marketplace contribution. The individual file tabs are generated dynamically within the extension's own UI.

## Host integration and permissions

Create a third extension application in the shared workspace on `main`, consuming the existing `@freesonlee/terraform-plan-viewer-angular` library through its compiled workspace public API.

Use the contribution pattern implemented by [Microsoft's SARIF viewer](https://github.com/microsoft/sarif-azuredevops-extension/blob/main/vss-extension.prod.json):

```json
{
  "id": "fl.terraform-plans.run-tab",
  "type": "ms.vss-build-web.build-results-tab",
  "targets": ["ms.vss-build-web.build-results-view"],
  "properties": {
    "name": "Terraform Plans",
    "uri": "index.html"
  }
}
```

The proposed manifest scope is:

```json
"scopes": ["vso.build"]
```

Microsoft documents `vso.build` for [listing build artifacts](https://learn.microsoft.com/en-us/rest/api/azure/devops/build/artifacts/list?view=azure-devops-rest-7.1), [reading individual artifact files](https://learn.microsoft.com/en-us/rest/api/azure/devops/build/artifacts/get-file?view=azure-devops-rest-7.1), and [obtaining pipeline artifact downloads](https://learn.microsoft.com/en-us/rest/api/azure/devops/pipelines/artifacts/get?view=azure-devops-rest-7.1). These APIs support the intended read-only feature; no other scope is currently justified. Artifact download behavior will be checked with this scope during the first implementation milestone.

Initialize with the existing SDK and Webpack module replacement. Get project context through `IProjectPageService` and the selected run through `IBuildPageDataService.getBuildPageData()`. The installed API exposes this service as `ms.vss-build-web.build-page-data-service`. If necessary, read the build metadata to obtain the pipeline definition ID for a pipeline artifact request.

Use `SDK.getAccessToken()` for Azure DevOps requests. The app does not request a PAT, use the website's stored connection settings, or store access tokens. Extension scope does not grant the signed-in user additional access: Azure DevOps still enforces that user's run/artifact permissions.

## Artifact discovery and retrieval

1. Snapshot the current project and run context. Clear previous-run requests and cached data when the context changes.
2. List **all artifacts of this run** with the Build artifact API. Do not inspect unrelated runs, repositories, or package feeds.
3. Determine the resource type for each artifact. Cover both modern `PipelineArtifact` and older hosted Build Artifact `Container` storage.
4. Enumerate artifact contents recursively and select regular files ending in `.plan.json`. This means folders in the artifact; the first version does not recursively open arbitrary archives stored as artifact files.
5. Add a file tab for each matching path. Include invalid or unreadable matching files as tabs with their own error state rather than removing them silently.
6. Load and parse the selected file, validate it through the existing viewer library, and render it. Automatically select the first available plan after initial discovery.

The documented Build API lists artifacts but does not provide a universal recursive directory listing for every resource type. The compatibility baseline is downloading an artifact ZIP and reading its entries in the browser, as demonstrated by [Microsoft's SARIF artifact reader](https://github.com/microsoft/sarif-azuredevops-extension/blob/main/src/build.getArtifactsFileEntries.ts). A browser ZIP reader such as JSZip can inspect entry names and extract only matching files.

Where verified APIs expose file metadata and IDs, enumerate first and download only the selected plan. The individual-file API requires a real `fileId`; do not assume a relative path can be substituted. Modern pipeline artifacts also provide a documented `signedContent` download option. Prefer these optimized paths when verified, with the ZIP approach as the compatibility fallback.

The first milestone must validate actual browser downloads for both artifact types: SDK-token access, redirects, CORS, signed URL expiry, nested paths, and the availability of efficient listing. Mocked tests cannot establish these transport details. Use service-returned HTTPS download locations, avoid logging signed URLs or tokens, and do not forward a bearer token to arbitrary origins. Fetch signed URLs using their signed authorization when appropriate.

Scanning all artifacts may involve large unrelated outputs. Use bounded concurrency, visible scan progress, cancellation, and documented download/expanded-size limits. If an artifact cannot be fully scanned because of access, size, or unsupported storage, keep displaying accessible plans and clearly identify the incomplete scan. Do not report "No plans found" as though the scan succeeded. Final limits will be chosen from a representative test run, rather than treating unlimited ZIP downloads as acceptable.

A network-file-share artifact cannot be read directly by a browser extension. Show that storage type as unsupported. Initial platform scope is Azure DevOps Services; Azure DevOps Server compatibility is a separate validation item.

## Viewer and UI

Reuse `TerraformPlanViewerComponent`; the new application provides run context, artifacts, tabs, and fetch state. Keep Terraform parsing and rendering inside the existing library.

- Use embedded layout and `enableActions: false` so rendering stays within the run page and does not offer Terraform operations.
- Preserve the library's sensitive-value masking and explicit reveal behavior. Do not log plan contents or persist them in browser/extension storage.
- Mount only the active plan viewer to avoid rendering many large plans simultaneously. Keep a bounded in-memory cache of downloaded/parsed plans for tab switches.
- Show the run name/number, discovered plan count, scan progress, and **Refresh**.
- Refresh rescans artifacts, preserves the selected file when still present, and invalidates relevant cached content. Read the current run context again when refreshing.
- Keep per-file states for loading, JSON parsing/validation failure, failed download, expired/deleted artifact, and retry. One bad plan must not prevent other tabs from working.
- Use horizontally scrollable, keyboard-accessible file tabs with clear selected state and artifact/path tooltips or subtitles. Ensure the viewer works in the run-page iframe and narrow layouts.
- Show a useful empty state when discovery succeeds with zero matches. For a running pipeline, explain that plans may not yet have been published and provide Refresh.

The required input is Terraform **JSON output**, not its binary saved-plan format. A pipeline can produce a matching file with:

```bash
terraform plan -out=tfplan
terraform show -json tfplan > production.plan.json
```

Publish that file or its containing directory as an ordinary pipeline artifact. No new pipeline task is required for the extension itself.

## Repository and development setup

Proposed identities and locations:

| Item | Proposed value |
| --- | --- |
| Publisher | `FreesonLi` |
| Extension ID | `ads-terraform-plan-viewer` |
| Private localhost extension ID | `ads-terraform-plan-viewer-dev` |
| Run-page tab | `Terraform Plans` / `Terraform Plans (Dev)` |
| Angular project | `azure-devops-terraform-plan-viewer-extension` |
| Application source | `src/app/terraform-plan-viewer-extension/` |
| Build output | `dist/azure-devops-terraform-plan-viewer-extension/` |
| Production manifest | `terraform-plan-viewer.vss.json` |
| Private dev manifest | `terraform-plan-viewer.dev.vss.json` |
| Local dev URL | `https://localhost:4302/` |
| Initial test organization | `https://dev.azure.com/FreesonLee` |

Add an SDK host service, an artifact reader with isolated resource-type adapters, a plan-file model, and a run-tab component. Keep all host/artifact logic in this new application; the reusable library remains independent of Azure DevOps.

Add build/package/publish/install commands consistent with the two existing extensions, extend the dev wrapper's known manifest mapping, and reuse the localhost certificate setup. Ensure the viewer library is built before this extension when its build command is called alone. Use the compiled workspace library rather than installing it from GitHub Packages.

Publishing and installation use the existing Microsoft Entra workflow. First publish the private dev extension and share it with FreesonLee. Initial testing does not require making a public Marketplace listing. A production release is a separate step after validation.

Extend main CI to build the third extension, run its host/artifact checks, and package its production and private dev manifests. The review artifact will then contain six VSIX packages instead of four. Keep the website and reusable-library publishing workflows intact.

## Implementation milestones

1. **Host and transport proof:** minimal private run tab, correct run/project context, `vso.build` only, and verified browser access to one modern Pipeline Artifact and one hosted Build Artifact containing a nested plan file. Confirm iframe behavior when navigating between runs. Record the APIs and any limits observed.
2. **Discovery:** enumerate every artifact, match nested files, establish unique file identities, sorting, progress, cancellation, bounded downloads, and partial-failure reporting.
3. **Viewer UI:** integrate the compiled Terraform library, per-file tabs, selection, lazy content loading, refresh, caching, and per-file errors.
4. **Automated verification:** SDK host fixtures, artifact adapter tests, browser checks, clean library/extension builds, and VSIX metadata/asset checks.
5. **Private validation:** publish/install the dev extension using Entra into FreesonLee; test against a prepared run with both artifact types, multiple plans, and an inaccessible/invalid example. Confirm refresh while a run is still publishing artifacts.
6. **Release preparation:** document pipeline publishing examples and supported storage types, review read-only scope and package assets, then prepare the production extension for publication.

## Acceptance checks

- A new Terraform Plans tab appears on a pipeline run page and uses that run's artifacts.
- Every accessible matching file in every hosted artifact, including nested folders, receives its own file tab.
- Duplicate filenames from different folders/artifacts remain distinguishable.
- Valid Terraform plans render with the existing resource/output/variable views and marked-sensitive-value handling.
- Invalid JSON, binary plans, empty files, malformed Terraform JSON, denied downloads, and expired/deleted artifacts yield isolated, readable errors.
- Partial discovery failures are visible; available plans remain usable.
- Switching or refreshing the run does not show plans from a previous run or accept stale request results.
- Both artifact storage formats are verified in a real private Azure DevOps organization, not just fixtures.
- The only extension scope is `vso.build`, and normal use needs no PAT prompt or state-changing API calls.
- The new target builds and packages alongside the website, library, and two existing extensions, and its localhost setup uses port 4302.

## Implementation verification

- Combined production builds passed for the website, library, and all three extensions.
- All 18 artifact-reader tests and 12 website unit tests passed.
- Browser fixtures passed for classic and modern artifacts, nested paths and duplicate basenames, invalid/empty-shape JSON, SDK versus signed URL authentication, partial permission failures, refresh/cancellation, run changes, keyboard navigation, and widths 1440/1024/390/320.
- The existing two extension host checks passed.
- Production and localhost browser checks downloaded and displayed the real `fas/test.plan.json` from run 6359 without storing live plans or screenshots in the test runner.
- The user confirmed the actual installed run tab renders `test.plan.json` on run 6359 with the extension SDK token and its sole `vso.build` scope.
- VSIX inspection confirmed private visibility, only `vso.build`, the run-page contribution, intended application assets, and localhost port 4302. Marketplace validation and installation succeeded.
- Current artifact discovery uses bounded ZIP downloads for both hosted storage types; selective individual-file discovery remains a future optimization. The production identity has not been registered; its private VSIX is prepared for later release.
