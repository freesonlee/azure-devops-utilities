# Terraform Plan Viewer

Open **Terraform Plans** on an Azure DevOps pipeline run that uses **Publish Terraform plan** to view JSON plans published in its artifacts. Each file ending in `.plan.json` gets its own file tab, including files in nested folders and duplicate filenames from different artifacts.

Create a binary plan using your installed Terraform CLI, then use the included publishing task to convert it to JSON and publish both files together:

```yaml
# Terraform is already installed and the infra directory is initialized.
- script: terraform plan -input=false -out=production.tfplan
  workingDirectory: '$(System.DefaultWorkingDirectory)/infra'
- task: PublishTerraformPlan@1
  inputs:
    workingDirectory: '$(System.DefaultWorkingDirectory)/infra'
    planFile: 'production.tfplan'
    jsonFileName: 'production.plan.json'
    artifactName: 'terraform-production'
    # terraformCliPath: '/opt/terraform/terraform' # Optional; defaults to PATH.
```

The task publishes a hosted build artifact containing the original binary filename and the requested JSON filename. Run it using the same Terraform version and initialized directory that created the binary plan. It does not create or apply a new plan. No separate publish step or PAT is needed. JSON filenames must end in `.plan.json` for discovery. Generated JSON and binary plans can contain secrets; the task does not log their contents, and artifact access follows pipeline permissions.

The run tab targets this task through `supportsTasks`. Runs using other publishing steps need to adopt `PublishTerraformPlan@1`; historical runs without it will not have the tab. A failed or skipped task may still show the tab's empty state. Refresh after artifacts become available. Once the tab is visible, it scans all hosted artifacts in the run.

The extension reads only the selected run and uses Azure DevOps **Build (read)** permissions (`vso.build`). It uses your Azure DevOps session and does not ask for a PAT. Your account must already have access to the run and its artifacts.

The existing viewer displays resource changes, outputs, variables, drift, and marked-sensitive values. Values marked sensitive start masked; reveal is explicit. Terraform execution controls are disabled. JSON and credentials are held in memory and are not written to browser storage or logged.

Initial browser limits are 64 MiB per downloaded archive, 128 MiB across a scan, 10 MiB per expanded plan, 20,000 archive entries, and 200 matching files. Incomplete scans and unreadable artifacts are reported without hiding other available plans. Publish plans in dedicated artifacts when a run includes large application packages. Network file-share artifacts are unsupported.

Supported target: Azure DevOps Services. Azure DevOps Server has not been validated.

Source and issues: [azure-devops-utilities](https://github.com/freesonlee/azure-devops-utilities).
