# Publish Terraform plan

`PublishTerraformPlan@1` takes a saved Terraform binary plan, runs `terraform show -json`, and publishes the binary and JSON together as a hosted build artifact. It is included in the Terraform Plan Viewer extension. The task uses the Azure Pipelines agent's [artifact upload logging command](https://learn.microsoft.com/en-us/azure/devops/pipelines/scripts/logging-commands?view=azure-devops#upload-upload-an-artifact), so it needs no PAT or separate publish step.

Terraform must already be installed, and the working directory must be initialized with the providers used to create the plan. Use the same Terraform version that created the binary. The task converts an existing plan; it does not run `terraform plan` or `terraform apply`.

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

| Input | Default | Behavior |
| --- | --- | --- |
| `planFile` | `terraform.tfplan` | Binary plan path, relative to `workingDirectory` or absolute. Its filename is preserved in the artifact. |
| `jsonFileName` | `terraform.plan.json` | JSON output filename inside the artifact. Must end in `.plan.json`; directory paths are not accepted. |
| `artifactName` | `terraform-plans` | Hosted build artifact name. Use a unique name for each task invocation in a run. |
| `workingDirectory` | `$(System.DefaultWorkingDirectory)` | Initialized Terraform directory with the appropriate provider plugins. |
| `terraformCliPath` | Empty | Optional executable path, relative to `workingDirectory` or absolute. Empty uses `terraform` from `PATH`. |

The generated JSON includes unredacted sensitive values, as documented by [Terraform](https://developer.hashicorp.com/terraform/cli/commands/show). The binary can also contain secrets. Artifact access follows pipeline permissions. The task writes Terraform output directly to disk and does not print plan contents or raw Terraform diagnostics in logs. Conversion failures publish nothing.

Supported jobs are Azure Pipelines YAML and classic build jobs on agents with the Node 20 task runner. Classic release jobs cannot publish build artifacts. The task has no runtime npm dependencies. Linux and Windows task tests run in CI; Azure DevOps Server is not validated.

The **Terraform Plans** run tab uses the manifest's `supportsTasks` property to target runs using this publishing task. Visibility is task based, so a failed or skipped task may still leave a tab without plans. Runs that only published `.plan.json` using another task need to adopt `PublishTerraformPlan@1` to use this tab. The viewer continues to scan all accessible artifacts in a matching run, including plans published by other steps.

The private extension includes `PublishTerraformPlanDev@1` with a separate task GUID. Its localhost run tab targets that dev GUID, so installing the dev extension does not overwrite the production task.

Run `npm run test:terraform-task` for isolated conversion and agent-command tests. `npm run build:terraform-task` builds both task variants. `npm run build-t` includes the task build, and both Terraform packaging/publishing scripts rebuild the task automatically before creating the VSIX.
