import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { Observable, firstValueFrom, from, map, startWith } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatTable, MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { AsyncPipe, NgFor, NgIf, KeyValuePipe } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatExpansionModule, MatExpansionPanel } from '@angular/material/expansion';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Profile, ProfilePipeline, Parameter, Pipeline } from './Profile';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { Clipboard } from '@angular/cdk/clipboard';
import * as SDK from 'azure-devops-extension-sdk';
import { IProjectPageService, CommonServiceIds, getClient, ILocationService, IProjectInfo, IExtensionDataService, IExtensionDataManager } from 'azure-devops-extension-api';
import { TaskAgentRestClient } from 'azure-devops-extension-api/TaskAgent';
import { ListResponse, Variable, PipelineVariable } from '../variable-group-history/Models';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { state, style, trigger } from '@angular/animations';

class GitHubBranchLoadError extends Error { }

@Component({
  selector: 'pipeline-list',
  templateUrl: './pipeline.component.html',
  styleUrls: ['./pipeline.component.css'],
  standalone: true,
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),

    ]),
  ],
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatListModule,
    MatSidenavModule,
    MatExpansionModule,
    MatAutocompleteModule,
    MatInputModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    MatCheckboxModule,
    MatSelectModule,
    MatTableModule,
    NgFor,
    NgIf,
    AsyncPipe,
    KeyValuePipe,
    MatSnackBarModule,
    MatProgressBarModule,
    MatTooltipModule,
    ClipboardModule,
    BrowserAnimationsModule
  ]
})
export class PipelineComponent {

  title = 'azure-devops-variable-group-editor';
  pipelines?: Pipeline[];
  profiles: Profile[] = [];
  profile?: Profile;
  branchControl = new FormControl('');
  pipelineControl = new FormControl('');
  filteredBranches?: Observable<string[]>;
  filteredPipelines?: Observable<Pipeline[]>;
  selectedPipeline?: ProfilePipeline;
  stages: { stage: string, displayName: string }[] = [];
  isStagePanelOpen = false;
  isVariablePanelOpen = false;
  loadingStages = false;
  resolvedFailure: { [key: string]: string } = {};
  stringParaControl: { [key: string]: FormControl } = {};
  expandedVariable?: PipelineVariable;
  profileSearch = '';
  profilePipelineSearch = '';
  isLoading = false;
  isLoadingConfig = false;
  isRunning = false;
  loadError = '';
  configurationError = '';

  project: IProjectInfo | undefined;
  taskAgentClient!: TaskAgentRestClient;
  collectionPath!: string;
  projectPath!: string;
  accessToken!: string;
  dataManager!: IExtensionDataManager;
  parameters?: Parameter[];
  @ViewChild(MatTable) table!: MatTable<Variable>;
  @ViewChild(MatExpansionPanel) branchSelect!: MatExpansionPanel;
  @ViewChild(MatExpansionPanel) stagePanel?: MatExpansionPanel;
  @ViewChild(MatExpansionPanel) variablesPanel?: MatExpansionPanel;

  get visibleProfiles() {
    const search = this.profileSearch.trim().toLowerCase();
    return search ? this.profiles.filter(profile => profile.name.toLowerCase().includes(search)) : this.profiles;
  }

  get visibleProfilePipelines() {
    const pipelines = this.profile?.pipelines ?? [];
    const search = this.profilePipelineSearch.trim().toLowerCase();
    return search ? pipelines.filter(pipeline => pipeline.name?.toLowerCase().includes(search)) : pipelines;
  }

  constructor(private httpClient: HttpClient, private dialog: MatDialog, private _snackBar: MatSnackBar, private cd: ChangeDetectorRef,
    private clipboard: Clipboard) {

  }

  async ngOnInit() {
    await this.loadContribution();
    this.filteredPipelines = this.pipelineControl.valueChanges.pipe(
      startWith(''),
      map(value => (this.pipelines ?? []).filter(p => p.fullName!.toLowerCase().includes((value ?? '').toLowerCase()))),

    );
    await this.reload();
  }

  async loadContribution() {
    await SDK.notifyLoadSucceeded();
    await SDK.ready();
    const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
    this.project = await projectService.getProject();
    this.taskAgentClient = await getClient(TaskAgentRestClient);
    const locSvc = await SDK.getService<ILocationService>(CommonServiceIds.LocationService);
    this.collectionPath = await locSvc.getServiceLocation();
    this.projectPath = this.collectionPath + this.project?.name;

    this.accessToken = await SDK.getAccessToken();

    const adsService: IExtensionDataService = await SDK.getService(CommonServiceIds.ExtensionDataService);
    this.dataManager = await adsService.getExtensionDataManager(SDK.getExtensionContext().id, this.accessToken);
  }

  async reload() {
    if (this.isLoading) return;
    this.profile = undefined;
    this.selectedPipeline = undefined;
    this.stages = [];
    this.parameters = [];
    this.profiles = [];
    this.pipelines = [];
    this.loadError = '';
    this.configurationError = '';
    this.profileSearch = '';
    this.profilePipelineSearch = '';
    if (!this.projectPath) return;
    this.isLoading = true;
    try {
      const profiles = await this.dataManager.getValue<Profile[]>('pipeline-profiles', { scopeType: 'User' });
      if (profiles) {
        this.profiles = profiles.map((p: Profile) => Profile.load(p));
      }

      const response = await firstValueFrom(this.httpClient.get(`${this.projectPath}/_apis/pipelines`, this.getRequestOptions())) as ListResponse<Pipeline>;
      response.value.forEach(p => p.fullName = p.folder == '\\' ? p.name : (p.folder.substring(1) + '\\' + p.name));
      this.pipelines = response.value.sort((v1, v2) => (v1.fullName! < v2.fullName!) ? -1 : 1);
    } catch {
      this.loadError = 'Could not load pipelines. Check your Azure DevOps project permissions, then try again.';
    } finally {
      this.isLoading = false;
    }
  }
  branchBlur() {
    this.branchSelect?.close();
    if (this.branchControl.value && this.selectedPipeline!.configurations.branch != this.branchControl.value) {
      this.selectedPipeline!.configurations.branch = this.branchControl.value;
      this.stages = [];
      this.parameters = [];
      this.loadParameterAndResources();
    }
  }
  branchSelected(event: MatAutocompleteSelectedEvent) {
    //this.profile!.branch = event.option.value;
    this.branchSelect.close();
    this.stages = [];
    this.parameters = [];
    this.selectedPipeline!.configurations.branch = event.option.value;
    this.loadParameterAndResources();
  }

  async loadBranches() {
    this.filteredBranches = undefined;
    const pipelineDef = this.selectedPipeline!.pipelineDef ?? (this.selectedPipeline!.pipelineDef = this.pipelines!.find(p => p.id == this.selectedPipeline!.pipelineId! || p.fullName == this.selectedPipeline!.name));
    if (!pipelineDef) {
      throw 'pipeline not found';
    }
    // Cache successful branch lists, not metadata: a failed request must remain retryable.
    if (pipelineDef.branches === undefined) {
      const response: any = await firstValueFrom(this.httpClient.get(`${this.projectPath}/_apis/build/definitions/${pipelineDef.id}`, this.getRequestOptions()));
      pipelineDef.defaultBranch = response.repository.defaultBranch.replace('refs/heads/', '');
      pipelineDef.repositoryId = response.repository.id;
      pipelineDef.repositoryProject = response.project.name;
      pipelineDef.projectId = response.project.id;
      pipelineDef.yamlFilename = response.process.yamlFilename;
      if (response.variables) {
        pipelineDef.variables = Object.keys(response.variables).map(vn => ({ name: vn, ...response.variables[vn] })) as Pipeline['variables'];
      } else {
        pipelineDef.variables = [];
      }

      if (response.repository.type === 'GitHub') {
        const connectionId = response.repository.properties?.connectedServiceId;
        if (!connectionId) {
          throw new GitHubBranchLoadError('This GitHub pipeline has no service connection ID. Check its repository settings in Azure DevOps, then retry.');
        }
        const query = new URLSearchParams({
          serviceEndpointId: connectionId,
          repository: response.repository.id,
          'api-version': '7.1'
        });
        const projectUrl = this.projectPath.replace(/\/+$/, '');
        let branchResponse: string[] | ListResponse<string>;
        try {
          branchResponse = await firstValueFrom(this.httpClient.get<string[] | ListResponse<string>>(
            `${projectUrl}/_apis/sourceProviders/GitHub/branches?${query}`, this.getRequestOptions()));
        } catch {
          throw new GitHubBranchLoadError('Could not list GitHub branches. Check your Azure DevOps project and GitHub service connection permissions, then retry.');
        }
        // Azure DevOps collection responses can be wrapped in a count/value envelope.
        const branches = Array.isArray(branchResponse) ? branchResponse : branchResponse?.value;
        if (!Array.isArray(branches) || !branches.every(branch => typeof branch === 'string')) {
          throw new GitHubBranchLoadError('Azure DevOps returned an unexpected GitHub branch list. Try reloading the pipelines.');
        }
        pipelineDef.branches = branches.map(branch => branch.replace(/^refs\/heads\//, ''));
      } else if (response.repository.type === 'TfsGit') {

        const refsResponse: any = await firstValueFrom(this.httpClient.get(`${this.projectPath}/_apis/git/repositories/${response.repository.id}/refs?filter=heads`, this.getRequestOptions()));
        pipelineDef.branches = refsResponse.value.map((b: any) => b.name.replace('refs/heads/', ''));
      } else {
        this._snackBar.open(`Pipeline repository on ${response.repository.type} does not support branch selection. Please type the branch name.`, 'OK');
        this.filteredBranches = from([]);
        return pipelineDef;
      }

    }

    this.filteredBranches = this.branchControl.valueChanges.pipe(
      startWith(''),
      map(value => (pipelineDef.branches ?? []).filter(branch => branch.toLowerCase().includes((value ?? '').toLowerCase())))
    );

    return pipelineDef;
  }

  async pipelineSelected(pipelineName: string) {
    if (this.isLoadingConfig) return;
    this.isLoadingConfig = true;
    this.configurationError = '';
    try {
      this.selectedPipeline!.name = pipelineName;
      this.selectedPipeline!.setPipeline(this.pipelines!.find(p => p.fullName == pipelineName)!);
      const pipelineDef = await this.loadBranches();
      this.selectedPipeline!.configurations.branch = pipelineDef.defaultBranch!;
      this.stages = [];
      await this.loadParameterAndResources();
    } catch (error) {
      this.configurationError = this.configurationErrorMessage(error);
    } finally {
      this.isLoadingConfig = false;
    }
  }

  async loadParameterAndResources() {
    const pipelineDef = this.selectedPipeline!.pipelineDef ?? (this.selectedPipeline!.pipelineDef = this.pipelines!.find(p => p.id == this.selectedPipeline!.pipelineId! || p.fullName == this.selectedPipeline!.name));
    try {
      let plan = await this.loadStages(false);

      if (!plan) {
        this._snackBar.open('Resources and parameters has been reset', undefined, {
          duration: 5000
        })
        this.selectedPipeline?.reset();
        plan = await this.loadStages(true);
      }

      if (!plan) {
        return;
      }

      this.parameters = plan.parameters;
      this.selectedPipeline!.mergePipelineResources(plan.resources);
    } catch (e) {
      this._snackBar.open(`Fail to load template ${pipelineDef?.yamlFilename} from branch ${this.selectedPipeline?.configurations.branch}`, undefined, {
        duration: 5000
      });
    }

    this.stringParaControl = {};
    this.parameters?.forEach(p => {
      if (p.type == 'string' || p.type == 'number') {
        this.stringParaControl[p.name] = new FormControl(this.selectedPipeline!.configurations.parameterValues[p.name] ?? p.default, [Validators.required]);
      }

      if (this.selectedPipeline!.configurations.parameterValues[p.name] == undefined) {
        this.selectedPipeline!.configurations.parameterValues[p.name] = p.default;
      }
    });
    this.resolvedFailure = {};
    this.cd.detectChanges();
  }

  async openSaveDialog() {


  }

  async loadProfile(profile: Profile) {
    this.profile = profile;
    this.selectedPipeline = undefined;
    this.profilePipelineSearch = '';
    this.configurationError = '';
    this.stages = [];
    this.parameters = [];
  }

  newProfile() {
    if (!this.projectPath) return;
    const name = prompt('Enter new profile name');
    if (!name) {
      return;
    }
    this.profiles.push(this.profile = new Profile(name));
    this.profileSearch = '';
    this.selectedPipeline = undefined;
  }

  newProfilePipeline() {
    if (!this.profile) return;
    this.profile!.pipelines.push(this.selectedPipeline = new ProfilePipeline());
    this.selectedPipeline.isNew = true;
    this.parameters = [];
    this.pipelineControl.setValue('');
    this.profilePipelineSearch = '';
    this.stages = [];
    this.expandedVariable = undefined;
    this.configurationError = '';
  }

  canSave() {
    if (!this.selectedPipeline?.pipelineId || !this.selectedPipeline.configurations.branch || this.isLoadingConfig || this.configurationError) {
      return false;
    }

    if (!this.parameters) {
      return true;
    }

    return this.selectedPipeline.configurations.branch &&
      !this.parameters!.find(p => {

        switch (p.type) {
          case 'boolean': return false;
          case 'string': return !p.values && !this.selectedPipeline?.configurations.parameterValues[p.name];
          case 'object': return false;
          case 'number': return false;
        }
      });
  }

  async save() {
    this.profiles.forEach(f => f.pipelines.forEach(p => delete p.isNew));

    await this.dataManager.setValue('pipeline-profiles', JSON.parse(JSON.stringify(this.profiles)), { scopeType: 'User' });


    this._snackBar.open('Saved', undefined, {
      duration: 2000
    });
  }

  async runProfile() {
    const requests = this.profile!.pipelines?.map(p => this.runPipeline(p, false));

    const results = await Promise.all(requests);
    const succeeded = results.map(r => r[0]).filter(r => r);
    const failed = results.map(r => r[1]).filter(r => r);
    let messages = succeeded.length > 0 ? `Successfully queued build ${succeeded.join(',')}. ` : '';
    messages += (failed.length > 0 ? `Failed for pipeline ${failed.join(',')}` : '');
    this._snackBar.open(messages, undefined, {
      duration: 5000
    });
  }

  async deleteProfile() {
    this._snackBar.open(`Are you sure to delete profile ${this.profile?.name} and all builds?`, 'DELETE', {
      duration: 5000,
    }).onAction().subscribe(() => {
      this.profiles = this.profiles.filter(p => p != this.profile);
      this.selectedPipeline = undefined;
      this.profile = undefined;
      this.save();
    })
  }

  async runPipeline(pipeline: ProfilePipeline | undefined, showSnackbar?: boolean): Promise<[string, string]> {

    if (!pipeline) {
      return ['', 'no pipeline provided'];
    }

    const payload = await pipeline.getQueuePayload({ defaultResources: false, previewRun: false }, this.sendGetRequest.bind(this));


    try {
      const response: any = await firstValueFrom(this.httpClient.post(`${this.projectPath}/_apis/pipelines/${pipeline.pipelineId}/runs?api-version=5.1-preview.1`, payload, this.getRequestOptions()));

      if (showSnackbar) {
        const snackbarRef = this._snackBar.open(`New build run ${response.name} queued`, 'Open', {
          duration: 3500
        });
        snackbarRef.onAction().subscribe(() => {
          window.open(`${this.projectPath}/_build/results?buildId=${response.id}&view=results`);
        });
      }

      return [response.name, ''];
    } catch (e: any) {

      if (showSnackbar) {
        this._snackBar.open(`New build run error: ${e.error.message}`, undefined, {
          duration: 5000
        });

      }

      return ['', pipeline.name!];
    }
  }

  async pipelineDefSelected(pipeline: ProfilePipeline) {
    if (this.isLoadingConfig) return;
    this.isLoadingConfig = true;
    this.configurationError = '';
    this.expandedVariable = undefined;
    try {
      this.selectedPipeline = pipeline;
      this.stages = [];
      this.parameters = [];
      this.isStagePanelOpen = this.isVariablePanelOpen = false;
      const pipelineDef = await this.loadBranches();
      await this.loadParameterAndResources();
      pipeline.loadVariables(pipelineDef.variables!);
    } catch (error) {
      this.configurationError = this.configurationErrorMessage(error);
    } finally {
      this.isLoadingConfig = false;
    }
  }

  addVariable() {
    this.selectedPipeline?.addNewVariable();
    this.isVariablePanelOpen = true;
    this.table?.renderRows();
  }

  private configurationErrorMessage(error: unknown) {
    return error instanceof GitHubBranchLoadError ? error.message :
      'Could not load this pipeline configuration. Check the selected pipeline and branch, then try again.';
  }

  parametersChanged() {
    this.isStagePanelOpen = false;
    this.stagePanel?.close();
    this.stages = [];
  }

  async runSelectedPipeline() {
    if (!this.canSave() || this.isRunning) return;
    this.isRunning = true;
    try {
      await this.runPipeline(this.selectedPipeline, true);
    } catch {
      this._snackBar.open('Could not queue this pipeline. Check its configuration and try again.', 'Close');
    } finally {
      this.isRunning = false;
    }
  }

  deletePipeline() {

    this._snackBar.open(`Are you sure to delete build ${this.selectedPipeline?.name} from profile ${this.profile?.name}?`, 'DELETE', {
      duration: 5000,
    }).onAction().subscribe(() => {
      this.profile!.pipelines = this.profile!.pipelines.filter(p => p != this.selectedPipeline);
      this.selectedPipeline = undefined;
      this.resolvedFailure = {};
      this.save();
    })
  }

  async loadStages(defaultResources: boolean) {
    if (!this.selectedPipeline) {
      return;
    }
    if (this.stages.length != 0) {
      return;
    }

    this.loadingStages = true;
    const payload = await this.selectedPipeline.getQueuePayload({
      previewRun: true,
      defaultResources: defaultResources
    }, this.sendGetRequest.bind(this));

    const response: any = await firstValueFrom(this.httpClient.post(`${this.projectPath}/_apis/pipelines/${this.selectedPipeline.pipelineId}/runs?api-version=5.1-preview.1`, payload, this.getRequestOptions()))
      .catch((e) => {
        const barRef = this._snackBar.open(e.error.message, 'Close');
        barRef.onAction().subscribe(() => {
          barRef.dismiss();
          this.isStagePanelOpen = false;
        });
        this.loadingStages = false;
        return null;
      });
    if (!response) {
      this.loadingStages = false;
      return;
    }
    this.loadingStages = false;
    const plan: any = yamlLoad(response.finalYaml);
    this.stages = (plan.stages ?? []).map((g: any) => ({ stage: g.stage, displayName: g.displayName }));
    (<any[]>plan.parameters)?.filter(p => p.type == 'object').forEach(p => p.default = yamlDump(p.default));
    this.selectedPipeline.sanitizeStages(this.stages.map(s => s.stage));

    return plan;
  }

  private sendGetRequest(url: string): Promise<unknown> {
    try {
      return firstValueFrom(this.httpClient.get(this.projectPath + url, this.getRequestOptions()));
    } catch (e: any) {
      this._snackBar.open(`Fail to get build id ${e.error.message}`, undefined, { duration: 5000 });
      return Promise.reject();
    }

  }

  private getRequestOptions() {
    return {
      headers: {
        Authorization: "Bearer " + this.accessToken
      }
    };
  }

  hasNoSkippedStage() {
    return this.stages.every(stg =>
      !this.selectedPipeline!.configurations.stagesToSkip[stg.stage]
    );
  }

  toggleAllStages($event: MatCheckboxChange) {
    if ($event.checked) {
      this.selectedPipeline!.configurations.stagesToSkip = {};
    } else {
      this.stages.forEach(stg => {
        this.selectedPipeline!.configurations.stagesToSkip[stg.stage] = true;
      }
      );
    }
  }

  async resolveBuildId(pipelineResource: string) {
    try {
      await this.selectedPipeline!.resolveBuildNumber(this.selectedPipeline?.configurations.resources.pipelines[pipelineResource]!, this.sendGetRequest.bind(this));
      delete this.resolvedFailure[pipelineResource];
    } catch (e) {
      this.resolvedFailure[pipelineResource] = e as string;
    }
  }

  copyBuildId(buildId: number) {
    this.clipboard.copy(buildId.toString());
  }

  onMultiLineValueChange(variable: Variable, $event: Event) {

    let newValue = ($event.target as HTMLTextAreaElement).value;
    variable.mlSource = newValue
    newValue = this.evaluateVariable(variable.mlType, newValue);

    variable.value = newValue;
  }
  evaluateVariable(multilineType: string, mlSource: string): any {

    if (multilineType == '>') {
      return mlSource.replace(/\n/g, ' ');
    }

    return mlSource;
  }

  updateObjectParaValue(paraName: string, $event: Event) {
    let newValue = ($event.target as HTMLTextAreaElement).value;
    this.selectedPipeline!.configurations.parameterValues[paraName] = newValue;
  }
}
