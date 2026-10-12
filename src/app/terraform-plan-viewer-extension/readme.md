# Terraform Plan Viewer

Open **Terraform Plans** on an Azure DevOps pipeline run to view JSON plans published in its artifacts. Each file ending in `.plan.json` gets its own tab, including files in nested folders and duplicate filenames from different artifacts.

Create the JSON in your pipeline:

```bash
terraform plan -out=tfplan
terraform show -json tfplan > production.plan.json
```

Publish the file or its containing directory with `PublishPipelineArtifact` or hosted `PublishBuildArtifacts`. Refresh the tab after artifacts become available.

The extension reads only the selected run and uses Azure DevOps **Build (read)** permissions (`vso.build`). It uses your Azure DevOps session and does not ask for a PAT. Your account must already have access to the run and its artifacts.

The existing viewer displays resource changes, outputs, variables, drift, and marked-sensitive values. Values marked sensitive start masked; reveal is explicit. Terraform execution controls are disabled. JSON and credentials are held in memory and are not written to browser storage or logged.

Initial browser limits are 64 MiB per downloaded archive, 128 MiB across a scan, 10 MiB per expanded plan, 20,000 archive entries, and 200 matching files. Incomplete scans and unreadable artifacts are reported without hiding other available plans. Publish plans in dedicated artifacts when a run includes large application packages. Network file-share artifacts are unsupported.

Supported target: Azure DevOps Services. Azure DevOps Server has not been validated.

Source and issues: [azure-devops-utilities](https://github.com/freesonlee/azure-devops-utilities).
