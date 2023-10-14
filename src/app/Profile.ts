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
            l.configurations.stagesToSkip = p.configurations.stagesToSkip ?? {};
            l.configurations.resources = p.configurations.resources ?? {};
            l.pipelineId = p.pipelineId;
            l.configurations.enableDiag = p.configurations.enableDiag;

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
            enableDiag: false,
            //parameterSelections: {},
            variables: [],
            stagesToSkip: {},
            resources: {
                pipelines: {},
                repositories: {}
            },
            toJSON: function () {
                return {
                    ...this,
                    variables: this.variables.filter(v => v.value != v.factoryValue).map(v => ({ ...v, nameExists: undefined, allowOverride: undefined }))
                };
            }
        };
    }
    pipelineId?: string;

    isNew?: boolean
    name?: string;
    resolvedPipelineResources: { [pipeline: string]: { buildNumber: string, id: number, triggerMessage: string } } = {};
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
        stagesToSkip: {
            [stage: string]: boolean
        }
        resources: {
            pipelines: {
                [pipeline: string]: {
                    branch: string
                    pipeline: string
                    source: string
                    tags: string[]
                    selectedBranch: string
                    artifact: string
                }
            }
            repositories: {
                [repository: string]: {
                    ref: string
                    repository: string
                    name: string
                    type: string
                    selectedRef: string
                    artifact?: string
                }
            }
        }
        enableDiag: boolean
        toJSON: () => any
    }

    _pipelineDef?: Pipeline;

    get pipelineDef() {
        return this._pipelineDef;
    }
    set pipelineDef(pipeline: Pipeline | undefined) {
        this._pipelineDef = pipeline;
        this.pipelineId = pipeline?.id;
    }

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
            pipelineDef: undefined,
            _pipelineDef: undefined
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

    getRepositoryResources() {
        const payload: { [repo: string]: { refName: string } } =
            Object.values(this.configurations.resources.repositories).reduce((pv, cv) => {
                if (!cv.selectedRef) {
                    return pv;
                }
                if (cv.selectedRef == '<self>') {
                    return { ...pv, [cv.repository]: { refName: 'refs/heads/' + this.configurations.branch } };
                }

                return { ...pv, [cv.repository]: { refName: 'refs/heads/' + cv.selectedRef } };
            }, {});

        return payload;
    }

    async resolveBuildNumber(pipelineResource: typeof this.configurations.resources.pipelines[string], sendGetRequest: (url: string) => Promise<unknown>) {

        const selectedBranch = pipelineResource.selectedBranch ?? '';
        const match = selectedBranch.matchAll(/^((?<branch>([<]self[>])|(?:[^0-9#'"][^#\n]+))([#](?<tags>[^\n]+))?)$|^(?<buildId>\d+)$|^(['"](?<buildNumber>[^'"]+)['"])$/g).next();
        delete this.resolvedPipelineResources[pipelineResource.pipeline];

        if (selectedBranch !== '' && match.done) {
            throw (`bad branch ${selectedBranch}`);
        }

        const buildDef: any = await sendGetRequest(`/_apis/build/definitions?name=${pipelineResource.source}`);
        const pipelineId = buildDef.value[0].id;

        let requestUrl;

        let buildNumber = match.done ? undefined : match.value.groups!['buildNumber'];
        let buildId = match.done ? undefined : match.value.groups!['buildId'];

        if (buildNumber) {
            requestUrl = `/_apis/build/builds?definitions=${pipelineId}&$top=1&buildNumber=${buildNumber}`;
        } else if (buildId) {
            requestUrl = `/_apis/build/builds?buildIds=${buildId}`;
        } else {
            let branch = selectedBranch == '' ? pipelineResource.branch : match.value.groups!['branch'];
            if (branch == '<self>') {
                branch = this.configurations.branch;
            }
            let tags = match.value?.groups['tags'];

            requestUrl = `/_apis/build/builds?definitions=${pipelineId}&$top=1&branchName=refs/heads/${branch}`;

            if (tags) {
                requestUrl = requestUrl + `&tagFilters=${tags}`
            }
        }

        const resp: any = await sendGetRequest(requestUrl);

        if (resp.count == 0) {
            throw 'build not found'
        }

        if (resp.value[0].definition.id != pipelineId) {
            throw `Build is not from ${pipelineResource.source}`;
        }

        this.resolvedPipelineResources[pipelineResource.pipeline] = {
            buildNumber: resp.value[0].buildNumber,
            id: resp.value[0].id,
            triggerMessage: resp.value[0].triggerInfo == undefined ? '' : resp.value[0].triggerInfo['ci.message']
        };
    }

    private async getPipelineResources(sendGetRequest: (url: string) => Promise<unknown>) {

        const getBuilds = Object.values(this.configurations.resources.pipelines).map(async p => this.resolveBuildNumber(p, sendGetRequest));
        await Promise.all(getBuilds);

        const payload = Object.keys(this.configurations.resources.pipelines).reduce((pv, cv) => {
            if (this.configurations.resources.pipelines[cv].selectedBranch) {
                pv[cv] = this.resolvedPipelineResources[cv];
            }
            return pv;
        }, <any>{});

        return payload;
    }

    async getQueuePayload(payloadRequest: {
        previewRun: boolean,
        defaultResources: boolean
    }, sendGetRequest: (url: string) => Promise<unknown>) {
        const pipelineResource = payloadRequest.defaultResources ? {} : await this.getPipelineResources(sendGetRequest);

        return {
            previewRun: payloadRequest.previewRun,
            resources: {
                repositories: {
                    self: {
                        refName: `refs/heads/${this.configurations.branch}`
                    },
                    ...(payloadRequest.defaultResources ? {} : this.getRepositoryResources())
                },
                pipelines: pipelineResource
            },
            stagesToSkip: payloadRequest.previewRun ? [] : Object.keys(this.configurations.stagesToSkip).filter(stg => this.configurations.stagesToSkip[stg]),
            templateParameters: this.configurations.parameterValues,
            variables: {
                ...this.configurations.variables.reduce((pv, cv) => ({ ...pv, [cv.name]: { value: cv.value, isSecret: false } }), {}),
                ...(this.configurations.enableDiag ? {
                    'system.debug': {
                        value: true,
                        isSecret: false
                    },
                    'agent.diagnostic': {
                        value: true,
                        isSecret: false
                    }
                } : {})
            }
        }
    }

    mergePipelineResources(resources: any) {
        if (resources?.repositories) {
            resources.repositories.forEach((repo: any) => {

                this.configurations.resources.repositories[repo.repository] = {
                    ...repo,
                    ...this.configurations.resources.repositories[repo.repository]
                };
            });

            Object.keys(this.configurations.resources.repositories).forEach(sr => {
                if (!resources.repositories.find((pr: any) => pr.repository == sr)) {
                    delete this.configurations.resources.repositories[sr];
                }
            });
        }
        //.configurations.resources.repositories = def.resources.repositories.reduce((pv: any, cv: any) => ({ ...pv, [cv.name]: cv }), {});

        if (resources?.pipelines) {
            resources.pipelines.forEach((pl: any) => {

                this.configurations.resources.pipelines[pl.pipeline] = {
                    ...pl,
                    ...this.configurations.resources.pipelines[pl.pipeline]
                };
            });

            Object.keys(this.configurations.resources.pipelines).forEach(sl => {
                if (!resources.pipelines.find((pl: any) => pl.pipeline == sl)) {
                    delete this.configurations.resources.pipelines[sl];
                }
            });
        }

    }

    sanitizeStages(stages: string[]) {
        Object.keys(this.configurations.stagesToSkip).forEach(k => {
            if (!stages.find(s => s == k)) {
                delete this.configurations.stagesToSkip[k];
            }
        })
    }
}


