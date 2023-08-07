export type VariableGroup = VariableGroupData & {
    hasChange: boolean
    variablesForView: Variable[]
    hasBad: boolean
    variables: {
        [name: string]: Variable
    }
}

export type VariableGroupData = {
    id: number
    name: string
    description: string
    variables: {
        [name: string]: VariableData
    }
}

export class VariableData {
    constructor(variable: Variable) {
        this.value = variable.value;
        this.name = variable.name;
        this.isSecret = variable.isSecret;
    }
    public value: string
    public name: string
    public isSecret: boolean
}

export type Variable = VariableData & {
    original?: {
        name: string
        value: string
        isSecret: boolean
    }
    hasChanged: boolean
    markForDeletion: boolean
    isBad: boolean
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