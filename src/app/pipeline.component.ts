import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, Input, ViewChild } from '@angular/core';
import { Observable, first, firstValueFrom, map, pipe, startWith } from 'rxjs';
import { ListResponse, Parameter, Pipeline, Server, Variable, VariableData, VariableGroup } from './Models';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatTable, MatTableModule } from '@angular/material/table';
import { SettingsComponent } from './settings.component';
import { CommentComponent } from './comment.component';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { AsyncPipe, NgFor, NgIf, KeyValuePipe } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatExpansionModule, MatExpansionPanel } from '@angular/material/expansion';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { load as yamlLoad } from 'js-yaml';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarRef, MatSnackBarModule } from '@angular/material/snack-bar';
import { Profile, ProfilePipeline } from './Profile';
import { KeyValue } from '@angular/common';

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
    MatSnackBarModule
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
  stages: any[] = [];

  @Input() server!: Server;

  @ViewChild(MatTable) table!: MatTable<Variable>;
  @ViewChild(MatExpansionPanel) branchSelect!: MatExpansionPanel;
  parameters?: Parameter[];
  constructor(private httpClient: HttpClient, private dialog: MatDialog, private _snackBar: MatSnackBar, private cd: ChangeDetectorRef) {

  }

  async ngOnInit() {
    await this.reload();

    this.filteredPipelines = this.pipelineControl.valueChanges.pipe(
      startWith(''),
      map(value => this.pipelines!.filter(p => p.fullName!.toLowerCase().includes(value!.toLowerCase()))),

    );
  }

  async reload() {
    const profiles = localStorage.getItem(`profiles-${this.server.host}`);
    if (profiles) {
      this.profiles = JSON.parse(profiles).map((p: Profile) => Profile.load(p));
    }

    const response = await firstValueFrom(this.httpClient.get(`${this.server.host}/_apis/pipelines`, this.getRequestOptions())) as ListResponse<Pipeline>;
    response.value.forEach(p => p.fullName = p.folder == '\\' ? p.name : (p.folder.substring(1) + '\\' + p.name));
    this.pipelines = response.value.sort((v1, v2) => (v1.fullName! < v2.fullName!) ? -1 : 1);
    if (this.selectedPipeline) {
      this.selectedPipeline = undefined;
    }
    if (this.profile) {
      this.profile = undefined;
    }
  }

  branchSelected(event: MatAutocompleteSelectedEvent) {
    //this.profile!.branch = event.option.value;
    this.branchSelect.close();
    this.loadParameterAndResources();
    this.selectedPipeline!.configurations.branch = event.option.value;
  }

  async loadBranches() {
    const pipelineDef = this.selectedPipeline!.pipelineDef ?? (this.selectedPipeline!.pipelineDef = this.pipelines!.find(p => p.id == this.selectedPipeline!.pipelineId! || p.fullName == this.selectedPipeline!.name));
    if (!pipelineDef) {
      throw 'pipeline not found';
    }
    if (!pipelineDef.defaultBranch) {
      const response: any = await firstValueFrom(this.httpClient.get(`${this.server.host}/_apis/build/definitions/${pipelineDef.id}`, this.getRequestOptions()));
      pipelineDef.defaultBranch = response.repository.defaultBranch.replace('refs/heads/', '');
      pipelineDef.repositoryId = response.repository.id;
      pipelineDef.repositoryProject = new URL(response.repository.url).pathname.split('/')[2];
      pipelineDef.defaultBranch = response.repository.defaultBranch.replace('refs/heads/', '');
      pipelineDef.projectId = response.project.id;
      pipelineDef.yamlFilename = response.process.yamlFilename;
      if (response.variables) {
        pipelineDef.variables = Object.keys(response.variables).map(vn => ({ name: vn, ...response.variables[vn] })) as Pipeline['variables'];
      } else {
        pipelineDef.variables = [];
      }

      const refsResponse: any = await firstValueFrom(this.httpClient.get(`${this.server.host}/../${pipelineDef.repositoryProject}/_apis/git/repositories/${response.repository.id}/refs?filter=heads`, this.getRequestOptions()));
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
    await this.loadParameterAndResources();
    //this.selectedPipeline!.setParameterSelection(this.parameters);
  }

  async loadParameterAndResources() {
    const pipelineDef = this.selectedPipeline!.pipelineDef ?? (this.selectedPipeline!.pipelineDef = this.pipelines!.find(p => p.id == this.selectedPipeline!.pipelineId! || p.fullName == this.selectedPipeline!.name));
    try {
      const response: any = await firstValueFrom(this.httpClient.get(`${this.server.host}/../${pipelineDef?.repositoryProject}/_apis/git/repositories/${pipelineDef?.repositoryId}/Items?path=/${pipelineDef?.yamlFilename}&versionDescriptor.version=${this.selectedPipeline?.configurations.branch}&includeContent=true`,
        this.getRequestOptions()));
      const def = yamlLoad(response.content) as any;
      this.parameters = def.parameters;
      this.selectedPipeline!.mergePipelineResources(def.resources);
    } catch (e) {
      this._snackBar.open(`Fail to load template ${pipelineDef?.yamlFilename} from branch ${this.selectedPipeline?.configurations.branch}`, undefined, {
        duration: 5000
      });
    }

    this.parameters?.forEach(p => {
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

  save() {
    this.profiles.forEach(f => f.pipelines.forEach(p => delete p.isNew));

    localStorage.setItem(`profiles-${this.server.host}`, JSON.stringify(this.profiles));
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

  async runPipeline(pipeline: ProfilePipeline | undefined, showSnackbar?: boolean): Promise<[string, string]> {

    if (!pipeline) {
      return ['', 'no pipeline provided'];
    }

    const payload = await pipeline.getQueuePayload(false, this.sendGetRequest.bind(this));


    try {
      const response: any = await firstValueFrom(this.httpClient.post(`${this.server.host}/_apis/pipelines/${pipeline.pipelineId}/runs?api-version=5.1-preview.1`, payload, this.getRequestOptions()));

      if (showSnackbar) {
        const snackbarRef = this._snackBar.open(`New build run ${response.name} queued`, 'Open', {
          duration: 3500
        });
        snackbarRef.onAction().subscribe(() => {
          window.open(`${this.server.host}/_build/results?buildId=${response.id}&view=results`);
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
    const pipelineDef = await this.loadBranches();
    await this.loadParameterAndResources();

    pipeline.loadVariables(pipelineDef.variables!);
    //this.selectedPipeline.setParameterSelection(this.parameters);
  }

  deletePipeline() {
    this.profile!.pipelines = this.profile!.pipelines.filter(p => p != this.selectedPipeline);
    this.selectedPipeline = undefined;
    this.save();
  }

  async loadStages() {
    if (!this.selectedPipeline) {
      return;
    }

    const payload = await this.selectedPipeline.getQueuePayload(true, this.sendGetRequest.bind(this));
    payload.previewRun = true;
    const response: any = await firstValueFrom(this.httpClient.post(`${this.server.host}/_apis/pipelines/${this.selectedPipeline.pipelineId}/runs?api-version=5.1-preview.1`, payload, this.getRequestOptions()))
      .catch((e) => {
        this._snackBar.open(e.error.message, undefined, { duration: 5000 });
        return null;
      });
    if (!response) {
      return;
    }
    const plan: any = yamlLoad(response.finalYaml);
    this.stages = plan.stages.map((g: any) => ({ stage: g.stage, displayName: g.displayName }));
  }

  private sendGetRequest(url: string): Promise<unknown> {
    try {
      return firstValueFrom(this.httpClient.get(this.server.host + url, this.getRequestOptions()));
    } catch (e: any) {
      this._snackBar.open(`Fail to get build id ${e.error.message}`, undefined, { duration: 5000 });
      return Promise.reject();
    }

  }

  private getRequestOptions() {
    return {
      headers: {
        Authorization: `Basic ${btoa(`user:${this.server.pat}`)}`
      }
    };
  }
}
