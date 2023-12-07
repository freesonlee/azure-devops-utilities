import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, Input, ViewChild } from '@angular/core';
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
import { load as yamlLoad } from 'js-yaml';
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
import { ListResponse, Variable } from '../variable-group-history/Models';

@Component({
  selector: 'pipeline-list',
  templateUrl: './pipeline.component.html',
  styleUrls: ['./pipeline.component.css'],
  standalone: true,
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
    ClipboardModule
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
  project: IProjectInfo | undefined;
  taskAgentClient!: TaskAgentRestClient;
  stringParaControl: { [key: string]: FormControl } = {};

  @ViewChild(MatTable) table!: MatTable<Variable>;
  @ViewChild(MatExpansionPanel) branchSelect!: MatExpansionPanel;
  @ViewChild(MatExpansionPanel) stagePanel?: MatExpansionPanel;
  @ViewChild(MatExpansionPanel) variablesPanel?: MatExpansionPanel;

  parameters?: Parameter[];
  collectionPath!: string;
  projectPath!: string;
  accessToken!: string;
  dataManager!: IExtensionDataManager;
  constructor(private httpClient: HttpClient, private dialog: MatDialog, private _snackBar: MatSnackBar, private cd: ChangeDetectorRef,
    private clipboard: Clipboard) {

  }

  async ngOnInit() {
    await this.loadContribution();
    await this.reload();

    this.filteredPipelines = this.pipelineControl.valueChanges.pipe(
      startWith(''),
      map(value => this.pipelines!.filter(p => p.fullName!.toLowerCase().includes(value!.toLowerCase()))),

    );
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

    try {
      const profilesLike = await this.dataManager.getValue<Profile[]>('pipeline-profiles', { scopeType: 'User' });
      if (profilesLike) {
        this.profiles = profilesLike.map((p: Profile) => Profile.load(p));
      }
    } catch {
      this._snackBar.open("Fail to open saved pipeline profiles", "Close");
    }


    const response = await firstValueFrom(this.httpClient.get(`${this.projectPath}/_apis/pipelines`, this.getRequestOptions())) as ListResponse<Pipeline>;
    response.value.forEach(p => p.fullName = p.folder == '\\' ? p.name : (p.folder.substring(1) + '\\' + p.name));
    this.pipelines = response.value.sort((v1, v2) => (v1.fullName! < v2.fullName!) ? -1 : 1);
    if (this.selectedPipeline) {
      this.selectedPipeline = undefined;
    }
    if (this.profile) {
      this.profile = undefined;
    }
    this.stages = [];
  }

  branchSelected(event: MatAutocompleteSelectedEvent) {
    //this.profile!.branch = event.option.value;
    this.branchSelect.close();
    this.parameters = [];
    this.selectedPipeline!.configurations.branch = event.option.value;
    this.loadParameterAndResources(true);
  }

  async loadBranches() {
    const pipelineDef = this.selectedPipeline!.pipelineDef ?? (this.selectedPipeline!.pipelineDef = this.pipelines!.find(p => p.id == this.selectedPipeline!.pipelineId! || p.fullName == this.selectedPipeline!.name));
    if (!pipelineDef) {
      throw 'pipeline not found';
    }
    if (!pipelineDef.defaultBranch) {
      const response: any = await firstValueFrom(this.httpClient.get(`${this.projectPath}/_apis/build/definitions/${pipelineDef.id}`, this.getRequestOptions()));
      pipelineDef.defaultBranch = response.repository.defaultBranch.replace('refs/heads/', '');
      pipelineDef.repositoryId = response.repository.id;
      pipelineDef.repositoryProject = new URL(response.repository.url).pathname.split('/')[1];
      pipelineDef.defaultBranch = response.repository.defaultBranch.replace('refs/heads/', '');
      pipelineDef.projectId = response.project.id;
      pipelineDef.yamlFilename = response.process.yamlFilename;
      if (response.variables) {
        pipelineDef.variables = Object.keys(response.variables).map(vn => ({ name: vn, ...response.variables[vn] })) as Pipeline['variables'];
      } else {
        pipelineDef.variables = [];
      }

      if (response.repository.type !== 'TfsGit') {
        this._snackBar.open(`Pipeline repository on ${response.repository.type} is not supported yet.`, 'OK');
        this.filteredBranches = from([]);
        return pipelineDef;
      }

      const refsResponse: any = await firstValueFrom(this.httpClient.get(`${this.projectPath}/../${pipelineDef.repositoryProject}/_apis/git/repositories/${response.repository.id}/refs?filter=heads`, this.getRequestOptions()));
      pipelineDef.branches = refsResponse.value.map((b: any) => b.name.replace('refs/heads/', ''));

    }

    this.filteredBranches = this.branchControl.valueChanges.pipe(
      startWith(''),
      map(value => this.pipelines!.find(p => p.id == this.selectedPipeline!.pipelineId!)?.branches?.filter(b => b.toLowerCase().includes(value!.toLowerCase())) ?? [])
    );

    return pipelineDef;
  }

  async pipelineSelected(pipelineName: string) {
    this.selectedPipeline!.name = pipelineName;
    this.selectedPipeline!.setPipeline(this.pipelines!.find(p => p.fullName == pipelineName)!);
    const pipelineDef = await this.loadBranches();
    this.selectedPipeline!.configurations.branch = pipelineDef.defaultBranch!;
    this.stages = [];
    await this.loadParameterAndResources(true);
    //this.selectedPipeline!.setParameterSelection(this.parameters);
  }

  async loadParameterAndResources(defaultResources: boolean) {
    const pipelineDef = this.selectedPipeline!.pipelineDef ?? (this.selectedPipeline!.pipelineDef = this.pipelines!.find(p => p.id == this.selectedPipeline!.pipelineId! || p.fullName == this.selectedPipeline!.name));
    try {
      const plan = await this.loadStages(defaultResources);
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
      if (p.type == 'string') {
        this.stringParaControl[p.name] = new FormControl(this.selectedPipeline!.configurations.parameterValues[p.name] ?? p.default, [Validators.required]);
      }

      if (this.selectedPipeline!.configurations.parameterValues[p.name] == undefined) {
        this.selectedPipeline!.configurations.parameterValues[p.name] = p.default;
      }
    });
    this.cd.detectChanges();
  }

  async openSaveDialog() {


  }

  async loadProfile(profile: Profile) {
    this.profile = profile;
    this.selectedPipeline = undefined;
  }

  newProfile() {
    const name = prompt('Enter new profile name');
    if (!name) {
      return;
    }
    this.profiles.push(this.profile = new Profile(name));
  }

  newProfilePipeline() {
    this.profile!.pipelines.push(this.selectedPipeline = new ProfilePipeline());
    this.selectedPipeline.isNew = true;
    this.parameters = [];
  }

  canSave() {
    if (!this.selectedPipeline) {
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
    this.selectedPipeline = pipeline;
    this.stages = [];
    this.parameters = [];
    this.isStagePanelOpen = this.isVariablePanelOpen = false;
    const pipelineDef = await this.loadBranches();
    await this.loadParameterAndResources(true);

    pipeline.loadVariables(pipelineDef.variables!);
    //this.selectedPipeline.setParameterSelection(this.parameters);
  }

  deletePipeline() {

    this._snackBar.open(`Are you sure to delete build ${this.selectedPipeline?.name} from profile ${this.profile?.name}?`, 'DELETE', {
      duration: 5000,
    }).onAction().subscribe(() => {
      this.profile!.pipelines = this.profile!.pipelines.filter(p => p != this.selectedPipeline);
      this.selectedPipeline = undefined;
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
    payload.previewRun = true;
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
    this.stages = plan.stages.map((g: any) => ({ stage: g.stage, displayName: g.displayName }));
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
}
