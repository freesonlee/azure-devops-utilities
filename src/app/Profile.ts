import { HttpClient } from "@angular/common/http";
import { Parameter, Pipeline, PipelineVariable } from "./Models";
import { firstValueFrom } from "rxjs";

export class Profile {
    public pipelines: ProfilePipeline[];
    constructor(public name: string) {
        this.pipelines = [];
    }
    static load(profileLike: Profile) {
        const profile = new Profile(profileLike.name);
        profile.pipelines = profileLike.pipelines.map(p => {
            const l = new ProfilePipeline();
            l.name = p.name;
            l.configurations.branch = p.configurations.branch;
            l.configurations.parameterValues = p.configurations.parameterValues;
            l.configurations.variables = p.configurations.variables ?? [];

            return l;
        });

        return profile;
    }
}
export class ProfilePipeline {

    constructor() {
        this.configurations = {
            branch: '',
            parameterValues: {},
            //parameterSelections: {},
            variables: [],
            toJSON: function () {
                return {
                    ...this,
                    variables: this.variables.filter(v => v.value != v.factoryValue).map(v => ({ ...v, nameExists: undefined, allowOverride: undefined }))
                };
            }
        };
    }

    get pipelineId() {
        return this.pipelineDef?.id;
    }

    isNew?: boolean
    name?: string
    configurations: {
        branch: string
        parameterValues: {
            [key: string]: string | boolean
        }
        //parameterSelections: {
        //    [parameter: string]: {
        //        [option: string]: boolean
        //    }
        //}
        variables: (PipelineVariable & {
            nameExists?: boolean
            factoryValue?: string
        })[]
        toJSON: () => any
    }
    pipelineDef?: Pipeline;


    setPipeline(pipeline: Pipeline) {
        this.pipelineDef = pipeline;
        if (pipeline.variables) {
            this.loadVariables(pipeline.variables);
        }
    }

    //setParameterSelection(parameters: Parameter[] | undefined) {
    //    if (!parameters) return;
    //
    //    parameters.filter(p => p.type == 'string' && p.values).forEach(p => {
    //        p.values!.forEach(v => {
    //            if (!this.configurations.parameterSelections[p.name]) {
    //                this.configurations.parameterSelections[p.name] = {};
    //            }
    //            this.configurations.parameterSelections[p.name][v] = this.configurations.parameterValues[p.name] == v || p.default == v;
    //        })
    //    });
    //}


    toJSON() {
        return {
            ...this,
            isNew: undefined,
            pipelineId: this.pipelineDef?.id,
            pipelineDef: undefined
        };
    }
    checkVariableName(variable: PipelineVariable) {
        return this.configurations.variables.filter(v => v.name.toLowerCase() == variable.name.toLowerCase()).length == 2;
    }

    deleteVariable(variable: PipelineVariable) {
        this.configurations.variables = this.configurations.variables.filter(v => v != variable);
    }

    resetVariable(variable: PipelineVariable) {

    }

    loadVariables(variables: PipelineVariable[]) {

        const savedVariables = this.configurations.variables;

        this.configurations.variables = variables!.map(v => ({ ...v, factoryValue: v.value }));
        savedVariables.forEach(sv => {
            const pipelineVar = this.configurations.variables.find(pv => pv.name == sv.name);
            if (!pipelineVar) {
                // added var
                this.configurations.variables.push(sv);
            } else {
                // var already defined in pipeline
                if (pipelineVar.allowOverride) {
                    pipelineVar.value = sv.value;
                } else {
                    this.configurations.variables.push(sv);
                    sv.nameExists = true;
                }
            }
        });
    }

    addNewVariable() {
        this.configurations.variables.push({
            allowOverride: true,
            name: '',
            value: ''
        })
    }

    getQueuePayload() {
        return {
            resources: {
                self: {
                    refName: `refs/heads/${this.configurations.branch}`
                }
            },
            templateParameters: this.configurations.parameterValues,
            variables: this.configurations.variables.reduce((pv, cv) => ({ ...pv, [cv.name]: { value: cv.value, isSecret: false } }), {})
        }
    }
}


