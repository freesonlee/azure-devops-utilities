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

## TODO
* Allow user to run all pipelines defined in a profile.

## Possible issue
* When queue a new build, and when a `allowOverride=false` variable has newly been added to pipeline definition, and the pipeline profile has the same variable defined, the new build run request might fail by ADS Rest API.

## Disclaimer
This is a tool that being made in a few days, using Angular. I don't have much experience in Angular and neither much time to improve the code and UX. Any PR is welcomed.