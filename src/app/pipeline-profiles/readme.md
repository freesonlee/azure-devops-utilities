## Pipeline Profile Shortcuts

A pipeline profile that you can save pipeline start up variables, parameters, resources into it. Then you can just run from the profile without selecting pipeline variables, parameters, resources every time.

### Recent updates

- Support `object` type parameter value in Pipeline profile
- Fix value not saved on paramters that has over 5 values, which rendered as a dropdownlist.

### Set parameters

![Parameters](https://github.com/freesonlee/azure-devops-utilities/blob/vs-extension/images/parameters.png?raw=true)

### Add variables

![Variables](https://github.com/freesonlee/azure-devops-utilities/blob/vs-extension/images/pipeline-variables.png?raw=true)

### Select Stages

![Stages](https://github.com/freesonlee/azure-devops-utilities/blob/vs-extension/images/stages.png?raw=true)

### Select Resources

![Resources](https://github.com/freesonlee/azure-devops-utilities/blob/vs-extension/images/pipeline-resources.png?raw=true)

Use these below format to have pipeline run using build that you want:

- `<self>` - Latest build from the same branch of the pipeline branch, instead of defined in yaml. Useful when you are making changes to both pipeline yml definition and code on a temporary branch and try deploy to an environment.
- `xxxbranch` - Latest build from the specific `xxxbranch` branch.
- `41233` - A specific build id if you know it. The tool takes it as build id if it's all digit number.
- `"20231021.5"` - The Build number if you know it. The took takes it as build number if it's quoted. Doesn't matter if it's single or double quote symbol.
- `xxxbranch#tag1,tag2` - Latest build from the specific branch with tags on. When putting multiple tags, it requires build that has BOTH tags on.
