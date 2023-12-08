## Variable Group History

An alternative UI to update values in Azure DevOps variable groups, which saves variable value history into a Azure DevOps Git repository.
![Hub](https://github.com/freesonlee/azure-devops-utilities/blob/vs-extension/images/variablehistory.ui.png?raw=true)This is not replacement to Variable Group managment page, you still need that to manage description, security of variable groups.
The tool saves variable groups value snapshots as json file into a repository. Each variable group will have one json file and you can compare the change history.
It also let you put short description and long description to variable. They are persisted in the JSON file as well.
You can also put multi lines value for variable.

> Note: The tool doesn't save value of secret variables.

After install, you should see
![Hub](https://github.com/freesonlee/azure-devops-utilities/blob/vs-extension/images/variablehistory.hub.png?raw=true)

To use the tool without install as extension in Azure DevOps, visit [Online](https://go.azuredevopshelpers.dev/). You will need to have PAT ready for configuration.

## Setup

### Grant access.

In Azure DevOps Extension management page, Review and allow permission to the extension. The permission required for this extensions are:

1. Variable Groups (read, create and manage)
1. Code (read and write to history repository)

### History repository setup

The respository and branch must be created manually first. Create a repository in same project and a branch. Then create a variable group `VariableGroupHistorySettings` with these 3variables:

1. `Repository` with value of repository name
1. `Path` with value of path.
1. `Branch` with value of the branch name. Do not start with `refs/heads/xxx`

### Report issue

Please report issue [here](https://github.com/freesonlee/azure-devops-utilities/issues/new)
