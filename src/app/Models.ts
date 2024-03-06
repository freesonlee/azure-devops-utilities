export type VariableGroup = VariableGroupData & {
    hasChange: boolean
    variablesForView: Variable[]
    hasBad: boolean
    variables: {
        [name: string]: Variable
    }
}

export type VariableGroupData = {
    id?: number
    name: string
    description: string
    desc: string
    variables: {
        [name: string]: VariableData
    }
}

export class VariableData {
    constructor(variable: Variable) {
        this.value = variable.value;
        this.name = variable.name;
        this.isSecret = variable.isSecret;
        this.mlSource = variable.mlSource;
        this.mlType = variable.mlType;
        this.desc = variable.desc;
        this.description = variable.description
    }
    public value: string
    public mlSource: string
    public name: string
    public isSecret: boolean
    public mlType: string
    public desc: string
    public description: string
}

export type Variable = VariableData & {
    original?: {
        name: string
        value: string
        mlValue: string
        isSecret: boolean
        mlType: string
        desc: string
        description: string
    }
    hasChanged: boolean
    markForDeletion: boolean
    isBad: boolean
    description: string
    desc: string
}

export type ListResponse<T> = {
    count: number
    value: T[]
}

export type Server = {
    host: string
    pat: string
    repository: string
    branch: string
    filePath: string
}
export type Pipeline = {
    yamlFilename?: string
    folder: string
    projectId?: string
    repositoryId?: string
    repositoryProject?: string
    id: string
    name: string
    defaultBranch?: string
    branches?: string[]
    fullName?: string
    variables?: PipelineVariable[]
}

export type PipelineVariable = {
    name: string
    value: string
    allowOverride: boolean
}


export type Parameter = {
    name: string
    displayName: string
    type: 'string' | 'boolean' | 'object'
    values?: string[]
    default: boolean | string
}