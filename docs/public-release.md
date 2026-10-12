# Public Marketplace extension releases

The public extensions load their SDK applications from the shared HTTPS site. The standalone website remains at the site root.

| Extension | Marketplace ID | Public application URL |
| --- | --- | --- |
| Variable Group History | `FreesonLi.ads-var-history` | `https://go.azuredevopshelpers.dev/extensions/variable-group-history/` |
| Pipeline Profiles | `FreesonLi.ads-pipeline-profiles` | `https://go.azuredevopshelpers.dev/extensions/pipeline-profiles/` |
| Terraform Plan Viewer | `FreesonLi.ads-terraform-plan-viewer` | `https://go.azuredevopshelpers.dev/extensions/terraform-plan-viewer/` |

These application URLs require an Azure DevOps host iframe for full functionality. Install the Marketplace extensions, then use their Azure DevOps navigation entries. The Terraform extension adds **Terraform Plans** on pipeline run pages. The website root has its own standalone connection settings.

The public manifests set `public: true`, the corresponding HTTPS `baseUri`, and `files: []`. The VSIX packages contain metadata, icons, and Marketplace documentation; application bundles are deployed through GitHub Pages. Private dev manifests keep their separate IDs and localhost ports.

## Release sequence

1. Increase the version in any existing public manifest that is being updated. New extensions can start at their initial version. Versions are explicit; the publish script does not automatically modify them.
2. Build all applications with `npm run build:all`. Run the relevant behavior checks. Run `npm run pages:prepare` to assemble the website and extension applications under `dist/pages/`.
3. Commit and push to `main`. The Node.js CI workflow builds/tests the applications, packages three public and three private dev VSIX files, and deploys the combined Pages site after a successful main push. Pull requests validate builds without deploying.
4. Wait for Pages deployment, then run `npm run verify-public`. The verifier checks `extensions/release.json` against the current commit and public manifest versions, verifies all application assets, and checks the hosted main bundle's SHA-256 digest against the deployment metadata.
5. Sign in through Microsoft Entra with `az login --allow-no-subscriptions`, then run `npm run publish-public` to publish the exact declared release versions. Publishing first verifies that the matching hosted release is live. These public commands use Entra and do not read `ADS_MKT_PAT`.
6. Check Marketplace validation status. Publication uploads immediately; a new version becomes usable after Marketplace validation completes. Install or update the public extension in a test organization and verify the native UI.

Individual commands are `publish-history`, `publish-pipeline`, and `publish-terraform`. `pack-history`, `pack-pipeline`, and `pack-terraform` create public packages in `artifacts/public/` without publishing. `install-history-public`, `install-pipeline-public`, and `install-terraform-public` install into FreesonLee using Entra.

The CI `marketplace-extensions` artifact contains all six VSIX packages. The Pages artifact contains the website and all three compiled extension applications. `extensions/release.json` records the commit, versions, application URLs, and bundle digests for release verification; it contains no credentials or plan data.

The hosted application paths are stable. Source changes deployed on `main` update those applications, so changes to extension behavior need the same testing and release review as Marketplace manifest updates. The signed-in user's Azure DevOps permissions and the installed extension's scopes still govern API access.
