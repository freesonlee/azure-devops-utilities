## Variable Group History 

An alternative UI to update values in Azure DevOps variable groups, which saves variable value history into a Azure DevOps Git repository. This is not replacement to Variable Group managment page, you still need that to manage description, security of variable groups.
The tool saves variable groups value snapshots as json file into a repository. Each variable group will have one json file and you can compare the change history.

> Note: The tool doesn't save value of secret variables.

After install, you should see 
![Hub](https://github.com/freesonlee/azure-devops-utilities/blob/vs-extension/images/variablehistory.hub.png?raw=true)

## Setup
### History repository setup
The respository and branch must be created manually first. Create a repository in same project and a branch. Then create a variable group `VariableGroupHistorySettings` with these 3variables:
1. `Repository` with value of repository name
1. `Path` with value of path.
1. `Branch` with value of the branch name. Do not start with `refs/heads/xxx`