## Pipeline Profile Shortcuts 

A pipeline profile that you can save pipeline start up variables, parameters, resources into it. Then you can just run from the profile.

Use these below format to have pipeline run using build that you want:
* `<self>` - Latest build from the same branch of the pipeline branch, instead of defined in yaml. Useful when you are making changes to both pipeline yml definition and code on a temporary branch and try deploy to an environment.
* `xxxbranch` - Latest build from the specific `xxxbranch` branch.
* `41233` - A specific build id if you know it. The tool takes it as build id if it's all digit number.
* `"20231021.5"` - The Build number if you know it. The took takes it as build number if it's quoted. Doesn't matter if it's single or double quote symbol.
* `xxxbranch#tag1,tag2` - Latest build from the specific branch with tags on. When having multiple tags, it requres build that has BOTH tags on.