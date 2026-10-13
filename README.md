# A tool to manage Azure DevOps Variable Groups and Pipeline
Please visit [Online](https://go.azuredevopshelpers.dev/)

For private Marketplace extensions served from HTTPS localhost, see [Extension development](docs/development.md).

## Applications and builds

The website, three Azure DevOps Marketplace extensions, and reusable Terraform viewer library are maintained on `main`. Each application has its own Angular entry point and output directory.

| Application | Angular project | Build command | Output |
| --- | --- | --- | --- |
| Website | `azure-devops-variable-group-editor` | `npm run build` | `dist/azure-devops-variable-group-editor` |
| Variable Group History extension | `azure-devops-variable-group-history-extension` | `npm run build-h` | `dist/azure-devops-variable-group-history-extension` |
| Pipeline Profiles extension | `azure-devops-pipeline-profiles` | `npm run build-p` | `dist/azure-devops-pipeline-profiles` |
| Terraform plan run extension | `azure-devops-terraform-plan-viewer-extension` | `npm run build-t` | `dist/azure-devops-terraform-plan-viewer-extension` |
| Terraform viewer library | `terraform-plan-viewer` | `npm run build:viewer` | `dist/terraform-plan-viewer` |

`npm start` serves the website. `npm run build:all` builds all applications and the library. GitHub Pages deploys the standalone website. Production Marketplace extensions bundle their HTML, JavaScript, CSS, and fonts inside each VSIX and use Azure DevOps extension asset hosting; they do not load application assets from the website or Google Fonts. Run `npm run build:extensions` before `npm run pack-history`, `npm run pack-pipeline`, and `npm run pack-terraform`. Packaging verifies the archive against the build. The main CI checks the viewer and website, then tests the packaged extensions through SDK host fixtures with external asset requests blocked. Marketplace publication remains an explicit Entra command. See [public release steps](docs/public-release.md).

Extensions get authentication and project context from the Azure DevOps SDK and keep profiles in extension storage. The website uses its own connection settings and browser storage. Publishing authentication is configured separately from application authentication.

For the installed private localhost extensions, run `npm run start-history-dev` (HTTPS port 4300) and `npm run start-pipeline-dev` (HTTPS port 4301), and `npm run start-terraform-dev` (HTTPS port 4302, pipeline run tab). Ordinary code and styling changes require a browser refresh; manifest changes require republishing. See [extension development and Entra publishing](docs/development.md).

## Setup
Add your ADS host in settings. You need your PAT pre-created in ADS. All ADS host settings is saved in browser local storage. PAT is not sent to server. BTW, there is no server for this tool. It's pure TS/JS hosted on Azure CDN.

## Variable groups history
The tool lists all variable groups and you can add/update/remove variables in a group. You can't create or delete any variable group now, which is not the purpose of the tool.

The update history will be commited to the repository that you put in the settings. The tool does NOT send request to create the repository. Make sure the repository is already created and your PAT has access to commit and push changes.

The history doesn't have secret variable value saved. 

## Local UI checks

Start the application with `npm start`, then run `npm run ui:check` in another terminal.
Install the browser once with `npx playwright install chromium`.
The Playwright checks use an isolated browser session and mocked Azure DevOps data,
cover editing and responsive layouts, and save screenshots in
`/tmp/azure-devops-variable-editor-ui` (or the system temporary directory on other platforms).
Set `UI_BASE_URL` to inspect another local port or `UI_SCREENSHOT_DIR` to choose the screenshot directory.

Run `npm run ui:check:profiles` for Pipeline Profiles checks and screenshots. After `npm run build:all`, run `npm run ui:check:website` to serve and verify the production website build automatically, and `npm run ui:check:extensions` to verify both extension builds inside an isolated SDK host fixture.
These checks mock Azure DevOps, including pipeline previews and queued runs;
they never run real pipelines. Screenshots default to `/tmp/azure-devops-pipeline-profiles-ui`.

## Pipeline
You can create profile and add one or more pipeline to it. You can then define parameter values and variables for each pipeline in the profile. 

## Terraform Plan Viewer
The tool includes a Terraform Plan Viewer that allows you to visualize and analyze Terraform plan JSON files.

### Features
- Upload and visualize Terraform plan JSON files
- View resource changes (create, update, delete, replace)
- Compare before and after values for each property
- Detect and display resource drift
- **Sensitive Value Protection**: Automatically masks sensitive property values with `****`

### Sensitive Value Handling
The viewer automatically detects and masks sensitive properties based on the `before_sensitive` and `after_sensitive` metadata in the Terraform plan:
- Sensitive values are masked with `****` by default
- Click the eye icon next to any masked value to reveal it temporarily
- Click again to re-mask the value
- Supports simple properties, nested objects, and array elements with different sensitivity levels

Example of sensitive property detection:
```json
{
  "change": {
    "after": {
      "custom_domain_verification_id": "verification-id-12345",
      "triggers_replace": ["value1", "value2", "public-value"]
    },
    "after_sensitive": {
      "custom_domain_verification_id": true,
      "triggers_replace": [true, true, false]
    }
  }
}
```
In this example:
- `custom_domain_verification_id` will be fully masked
- `triggers_replace[0]` and `triggers_replace[1]` will be masked
- `triggers_replace[2]` will be shown in plain text

## Reusable Angular viewer package

The Terraform renderer lives in [`projects/terraform-plan-viewer`](projects/terraform-plan-viewer/README.md). The application consumes its compiled public API. The MIT preview targets Angular/Material/CDK 17.1.x.

Run `npm run pack:viewer` to build and create an installable tarball under `dist/packages`. Run `npm run verify:viewer-package` to install that tarball in a temporary standalone/NgModule consumer and check browser and server rendering. The verifier needs the Playwright Chromium browser installed.

Website unit tests: `npm run test:website`. Library tests: `npm run test:viewer` (set `CHROME_BIN` to a Chromium executable). During development, run `npm run watch:viewer` alongside `npm start`; startup builds the library once. Run `npm run capture:viewer` against the local app to capture synthetic Terraform/CDKTF examples.

The resumable implementation and release checklist is in [`docs/terraform-plan-viewer-library-plan.md`](docs/terraform-plan-viewer-library-plan.md). The manual **Viewer package validation and publishing** workflow tests, builds, verifies, and publishes the preview package to GitHub Packages with the `next` tag. Select the branch to publish in the Actions tab. Increment the library version before publishing another release.

## TODO
* Allow user to run all pipelines defined in a profile.

## Possible issue
* When queue a new build, and when a `allowOverride=false` variable has newly been added to pipeline definition, and the pipeline profile has the same variable defined, the new build run request might fail by ADS Rest API.

## Disclaimer
This is a tool that being made in a few days, using Angular. I don't have much experience in Angular and neither much time to improve the code and UX. Any PR is welcomed.

## Terraform plans in Azure DevOps runs

The new run extension finds files ending in `.plan.json` inside every hosted pipeline artifact and shows one file tab per plan. It reuses the viewer library and requests only `vso.build`. See [usage and artifact limits](src/app/terraform-plan-viewer-extension/readme.md) and [private development/testing](docs/development.md).
