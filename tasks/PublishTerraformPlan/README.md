# Publish Terraform plan

`PublishTerraformPlan@1` publishes a saved Terraform plan as a hosted build artifact. Provide `planFile` to generate JSON with `terraform show -json` and publish both files, or leave `planFile` empty and provide `jsonFile` to publish existing plan JSON. It is included in the Terraform Plan Viewer extension. The task uses the Azure Pipelines agent's [artifact upload logging command](https://learn.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops#upload-upload-an-artifact), so it needs no PAT or separate publish step.

For binary conversion, Terraform must already be installed, and the working directory must be initialized with the providers used to create the plan. Use the same Terraform version that created the binary. Publishing existing JSON requires no Terraform installation or initialized directory. The task does not run `terraform plan` or `terraform apply`.

```yaml
# Run after installing Terraform and initializing the infra directory.
- script: terraform plan -input=false -out=production.tfplan
  workingDirectory: '$(System.DefaultWorkingDirectory)/infra'

- task: PublishTerraformPlan@1
  displayName: Publish production Terraform plan
  inputs:
    workingDirectory: '$(System.DefaultWorkingDirectory)/infra'
    planFile: 'production.tfplan'
    jsonFileName: 'production.plan.json'
    artifactName: 'terraform-production'
    # terraformCliPath: '/opt/terraform/terraform' # Optional; otherwise use PATH.
```

The `terraform-production` artifact contains `production.tfplan` and `production.plan.json`. The source binary is preserved. The task stages a copy and generates its matching JSON in an isolated directory, publishing only those two files after conversion and validation succeed.

To publish existing JSON, omit `planFile` and supply `jsonFile` instead:

```yaml
- task: PublishTerraformPlan@1
  inputs:
    jsonFile: '$(Build.ArtifactStagingDirectory)/production.json'
    jsonFileName: 'production.plan.json'
    artifactName: 'terraform-production'
```

This publishes only `production.plan.json`, preserving the source file and its contents. Supply exactly one of `planFile` or `jsonFile`. Existing JSON is validated as a Terraform plan before publication; invalid JSON and Terraform state JSON are rejected.

| Input | Default | Behavior |
| --- | --- | --- |
| `planFile` | Empty | Optional binary plan path, relative to `workingDirectory` or absolute. Its filename is preserved in the artifact. Leave empty when supplying `jsonFile`. |
| `jsonFile` | Empty | Optional existing plan JSON path, relative to `workingDirectory` or absolute. Leave empty when supplying `planFile`. |
| `jsonFileName` | `terraform.plan.json` | Generated or existing JSON filename inside the artifact. Must end in `.plan.json`; directory paths are not accepted. |
| `artifactName` | `terraform-plans` | Hosted build artifact name. Use a unique name for each task invocation in a run. |
| `workingDirectory` | `$(System.DefaultWorkingDirectory)` | Base for relative paths. Binary conversion requires an initialized Terraform directory with the appropriate provider plugins. |
| `terraformCliPath` | Empty | Optional executable path, relative to `workingDirectory` or absolute. Empty uses `terraform` from `PATH`. Ignored when publishing existing JSON. |

For binary conversion, the Terraform installer and publishing task must run in the same job for the installer's PATH changes to apply. The plan and CLI inputs deliberately use string fields: Azure Pipelines roots `filePath` inputs against the checkout directory, including empty optional values. The task resolves these paths itself against `workingDirectory`. Launch errors include the operating-system error code and attempted executable path; providing a directory instead of an executable gives a specific error.

The generated JSON includes unredacted sensitive values, as documented by [Terraform](https://developer.hashicorp.com/terraform/cli/commands/show). The binary can also contain secrets. Artifact access follows pipeline permissions. The task writes JSON stdout directly to disk and does not print its contents. Conversion failures publish nothing and include Terraform's stderr in the task error, so version mismatches and missing-provider diagnostics are visible. Failure stderr is limited to 64 KiB and marked when truncated.

Supported jobs are Azure Pipelines YAML and classic build jobs on agents with the Node 20 task runner. Classic release jobs cannot publish build artifacts. The task has no runtime npm dependencies. Linux and Windows task tests run in CI; Azure DevOps Server is not validated.

The **Terraform Plans** run tab uses the manifest's `supportsTasks` property to target runs using this publishing task. Visibility is task based, so a failed or skipped task may still leave a tab without plans. Runs that only published `.plan.json` using another task need to adopt `PublishTerraformPlan@1` to use this tab. The viewer continues to scan all accessible artifacts in a matching run, including plans published by other steps.

The private extension includes `PublishTerraformPlanDev@1` with a separate task GUID. Its localhost run tab targets that dev GUID, so installing the dev extension does not overwrite the production task.

Run `npm run test:terraform-task` for isolated conversion and agent-command tests. `npm run build:terraform-task` builds both task variants. `npm run build-t` includes the task build, and both Terraform packaging/publishing scripts rebuild the task automatically before creating the VSIX.
