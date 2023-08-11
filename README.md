# A tool to manage Azure DevOps Variable Groups and Pipeline
Please visit [Online](https://go.azuredevopshelpers.dev/)

## Setup
Add your ADS host in settings. You need your PAT pre-created in ADS. All ADS host settings is saved in browser local storage. PAT is not sent to server. BTW, there is no server for this tool. It's pure TS/JS hosted on Azure CDN.

## Variable groups history
The tool lists all variable groups and you can add/update/remove variables in a group. You can't create or delete any variable group now, which is not the purpose of the tool.

The update history will be commited to the repository that you put in the settings. The tool does NOT send request to create the repository. Make sure the repository is already created and your PAT has access to commit and push changes.

The history doesn't have secret variable value saved. 

## Pipeline
You can create profile and add one or more pipeline to it. You can then define parameter values and variables for each pipeline in the profile. 

## TODO
* Allow user to run all pipelines defined in a profile.

## Possible issue
* When queue a new build, and when a `allowOverride=false` variable has newly been added to pipeline definition, and the pipeline profile has the same variable defined, the new build run request might fail by ADS Rest API.