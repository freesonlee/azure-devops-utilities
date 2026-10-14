# Public Marketplace extension releases

The production extensions include their complete HTML, JavaScript, CSS, and font assets in each VSIX. Azure DevOps serves those packaged assets through its extension asset hosting. The applications do not require access to `go.azuredevopshelpers.dev` or Google Fonts. The standalone website remains independently hosted at the site root.

| Extension | Marketplace ID | Packaged entry point |
| --- | --- | --- |
| Variable Group History | `FreesonLi.ads-var-history` | `index.html` |
| Pipeline Profiles | `FreesonLi.ads-pipeline-profiles` | `index.html` |
| Terraform Plan Viewer | `FreesonLi.ads-terraform-plan-viewer` | `index.html` |

Install the Marketplace extensions, then use their Azure DevOps navigation entries. The Terraform extension adds **Terraform Plans** on pipeline run pages. The applications use the Azure DevOps SDK host and the signed-in user's permissions; the website root has its own standalone connection settings.

The public manifests set `public: true`, omit `baseUri`, and include their entire compiled application directory as addressable `files` at the package root. The Terraform extension also packages the agent-side `PublishTerraformPlan@1` task and targets that task's GUID through the run tab's `supportsTasks` property. Its dev counterpart has a separate name and GUID. Private dev manifests keep their separate IDs and HTTPS localhost ports. See [Microsoft's packaged content hosting documentation](https://learn.microsoft.com/en-us/azure/devops/extend/develop/static-content?view=azure-devops). Companies must allow Azure DevOps and its extension asset endpoints, including `https://publisher.gallerycdn.vsassets.io`, plus the Azure DevOps artifact download endpoints used by the Terraform viewer.

## Release sequence

1. Increase the version in each public manifest being updated, including changes to bundled application assets. Versions are explicit; the publish script does not automatically modify them.
2. Build all applications with `npm run build:all`, or just the extensions with `npm run build:extensions`. Run the relevant behavior checks, including `npm run test:terraform-task` for publishing-task changes. Task code changes require an independent version increase in `tasks/PublishTerraformPlan/task.json` as well as the extension version.
3. Run `npm run pack-history`, `npm run pack-pipeline`, and `npm run pack-terraform`. Each command creates a VSIX in `artifacts/public/` and verifies its identity, version, scopes, contributions, and addressable assets against the local build. HTML and CSS must reference local application assets.
4. Run `npm run verify-public` to verify all three existing packages, then `EXTENSION_ENV=public npm run ui:check:extensions` and `EXTENSION_ENV=public npm run ui:check:terraform-extension` to exercise the actual packaged applications. These fixtures block external asset requests and mock Azure DevOps APIs and artifact downloads.
5. Commit and push to `main`. CI builds/tests the applications and packages three public and three private dev VSIX files for review. It runs the host checks against the public packages. GitHub Pages deployment updates only the standalone website; production extension releases do not depend on it.
6. Sign in through Microsoft Entra with `az login --allow-no-subscriptions`, then run `npm run publish-public`. Publishing creates and verifies each package from the local build before uploading it. These public commands use Entra and do not read `ADS_MKT_PAT`.
7. Check Marketplace validation status. A new version becomes usable after validation completes. Install or update the public extension in a test organization and verify the native UI.

Individual commands are `publish-history`, `publish-pipeline`, and `publish-terraform`. `install-history-public`, `install-pipeline-public`, and `install-terraform-public` install into FreesonLee using Entra.

The CI `marketplace-extensions` artifact contains all six VSIX packages. The Pages artifact contains only the standalone website. Changes to extension behavior take effect when a new package version is published and installed. The signed-in user's Azure DevOps permissions and the installed extension's scopes govern API access.
