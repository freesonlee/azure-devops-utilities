import { HttpClient } from '@angular/common/http';
import { Component, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Variable, VariableData, VariableGroup, HistoryLocationSettings } from '../Models';
import { MatDialog } from '@angular/material/dialog';
import { MatTable } from '@angular/material/table';
import { CommentComponent } from './comment.component';
import * as SDK from 'azure-devops-extension-sdk';
import { CommonServiceIds, IExtensionDataManager, IExtensionDataService, IProjectInfo, IProjectPageService, IVssRestClientOptions, getClient } from 'azure-devops-extension-api';
import { TaskAgentRestClient } from 'azure-devops-extension-api/TaskAgent';
import { GitRestClient } from 'azure-devops-extension-api/Git';

type Mode = 'variables' | 'pipelines';

@Component({
  selector: 'variable-group-history',
  templateUrl: './variable-group-history.component.html',
  styleUrls: ['./variable-group-history.component.css']
})
export class VariableGroupHistoryComponent {
  title = 'azure-devops-variable-group-editor';

  variableGroups: VariableGroup[] = [];
  variableGroup?: VariableGroup;
  variables: Variable[] = [];
  hasChange = false;
  mode: Mode = 'variables';
  @ViewChild('pipelineComp')
  dataManager!: IExtensionDataManager;

  @ViewChild(MatTable) table!: MatTable<Variable>;
  project: IProjectInfo | undefined;
  taskAgentClient!: TaskAgentRestClient;
  gitClient!: GitRestClient;
  settings!: HistoryLocationSettings;
  collectionPath!: string;

  constructor(private httpClient: HttpClient, private dialog: MatDialog) {
    //this.loadContribution();    
    this.loadMock();
  }

  loadMock() {
    this.settings = {
      repository: "Playground",
      branch: "variable-history",
      path: "/"
    }

    const vssClientOption: IVssRestClientOptions = {
      rootPath: 'https://dev.azure.com/m3ac-Lif/',
      authTokenProvider: {
        getAuthorizationHeader: (forceRefresh?: boolean) => Promise.resolve(this.getRequestOptions().headers.Authorization)
      }
    };

    this.gitClient = new GitRestClient(vssClientOption);
    this.taskAgentClient = new TaskAgentRestClient(vssClientOption);
    this.project = { id: "c12c13fe-f28e-479d-9668-43b189184073", name: "Playground" };
    this.collectionPath = <string>vssClientOption.rootPath;
  }

  async loadContribution() {
    const accessToken = await SDK.getAccessToken();
    const adsService: IExtensionDataService = await SDK.getService(CommonServiceIds.ExtensionDataService);
    this.dataManager = await adsService.getExtensionDataManager(SDK.getExtensionContext().id, accessToken);
    this.settings = await this.dataManager.getValue('var-history-location', { scopeType: 'User' });

    const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
    this.project = await projectService.getProject();

    this.taskAgentClient = await getClient(TaskAgentRestClient);
    this.gitClient = await getClient(GitRestClient);
    this.collectionPath = "/" + SDK.getWebContext().team.name + "/";

    SDK.notifyLoadSucceeded();
  }

  async reload() {

    const variableGroups = await this.taskAgentClient.getVariableGroups(this.project!.id);

    this.variableGroups = variableGroups.map(g => ({
      description: g.description,
      id: g.id,
      name: g.name,
      hasBad: false,
      hasChange: false,
      variablesForView: Object.keys(g.variables).map(name => ({
        name: name,
        value: g.variables[name].value,
        isSecret: g.variables[name].isSecret,
        hasChanged: false,
        markForDeletion: false,
        isBad: false,
        original: {
          name: name,
          value: g.variables[name].value,
          isSecret: g.variables[name].isSecret
        }
      }))
    }));

    this.hasChange = false;
    if (this.variableGroup?.id) {
      const selectedGroup = this.variableGroups.find(g => g.id == this.variableGroup?.id);
      if (selectedGroup) {
        this.loadVariable(selectedGroup);
      }
    }
  }

  loadVariable(grp: VariableGroup) {
    this.variableGroup = grp;
    this.variables = grp.variablesForView;
  }
  checkChange(variable: Variable) {
    variable.hasChanged = (
      (variable.isSecret != variable.original?.isSecret) ||
      (variable.value != variable.original?.value)
    );

    this.checkChangeGroup(this.variableGroup!);
  }

  checkChangeGroup(group: VariableGroup) {
    group.hasChange = this.variables.findIndex(v => v.hasChanged || v.markForDeletion) >= 0;
    this.hasChange = this.variableGroups.findIndex(g => g.hasChange) >= 0;
    group.hasBad = false;
    const uniqueNames = new Map<string, Variable>();
    this.variables.forEach(v => {

      if (!v.name) {
        v.isBad = true;
      } else {
        v.isBad = false;
      }

      if (uniqueNames.has(v.name)) {
        v.isBad = true;
        group.hasBad = true;
        uniqueNames.get(v.name)!.isBad = true;
      } else {
        uniqueNames.set(v.name, v);
      }

      if (v.isBad) {
        group.hasBad = true;
      }
    })
  }

  async openSaveDialog() {

    console.log(this.generateUpdatePayload());

    this.dialog.open(CommentComponent, {
      data: ''
    }).afterClosed().subscribe(result => {

      this.save(result);

    });

  }

  getRequestOptions() {
    return {
      headers: {
        Authorization: `Basic ${btoa(`user:z6o4btg5w7mnu6imfbnuap7a3ccpipqbiptzxlbibznb5qq2h66q`)}`
      }
    };
  }

  async save(comment: string) {

    const payloads = this.generateUpdatePayload();

    const currentLastCommit: any = await firstValueFrom(this.httpClient.get(
      `${this.collectionPath}/_apis/git/repositories/${this.settings!.repository}/items?versionDescriptor.version=${this.settings!.branch}`,
      this.getRequestOptions()));

    let path = this.settings!.path;
    if (path[path.length - 1] != '/') {
      path += '/';
    }

    const fileItems: any = await firstValueFrom(this.httpClient.get(
      `${this.collectionPath}/_apis/git/repositories/${this.settings!.repository}/trees/${currentLastCommit.value[0].objectId}?recursive=true`,
      this.getRequestOptions()));

    const commitPayload = {
      commits: [{
        comment: comment ?? "No comment provided",
        changes: payloads.map(p => ({
          changeType: fileItems.treeEntries.findIndex((f: any) => `/${f.relativePath}` == `${path}${p.name}.json`) >= 0 ? 2 : 1,
          item: {
            path: path + p.name + '.json'
          },
          newContent: {
            content: JSON.stringify(p, undefined, 2),
            contentType: 0
          }
        })),
      }],
      refUpdates: [{
        name: `refs/heads/${this.settings!.branch}`,
        oldObjectId: currentLastCommit.value[0].commitId
      }]
    }

    await firstValueFrom(this.httpClient.post(
      `https://dev.azure.com/freesonlee/_apis/git/repositories/${this.settings!.repository}/pushes?api-version=5.0`,
      commitPayload,
      this.getRequestOptions()))

    const requests = payloads.map(payload => {

      return firstValueFrom(this.httpClient.put(
        `https://dev.azure.com/freesonlee/_apis/distributedtask/variablegroups/${payload.id}?api-version=5.0-preview.1`,
        payload,
        this.getRequestOptions()));
    });

    await Promise.all(requests);
    await this.reload();
  }

  generateUpdatePayload() {
    return this.variableGroups.filter(group => group.hasChange).map(group => {
      return {
        name: group.name,
        id: group.id,
        variables: this.prepareVariables(group)
      };
    });
  }

  prepareVariables(group: VariableGroup): {
    [name: string]: VariableData
  } {
    const vars: {
      [name: string]: VariableData
    } = {};

    group.variablesForView.filter(v => !v.markForDeletion).forEach(v => {
      vars[v.name] = new VariableData(v);
    });

    return vars;
  }

  newVariable() {
    const newVar = {
      hasChanged: true,
      isSecret: false,
      markForDeletion: false,
      name: '',
      value: '',
      isBad: true
    };
    this.variables.push(newVar);
    this.variableGroup!.hasBad = true;

    this.table.renderRows();
  }

  async deleteGroup() {

  }

  deleteVariable(variable: Variable) {
    if (variable.original) {
      variable.markForDeletion = true;
      this.checkChangeGroup(this.variableGroup!);
      return;
    }


    this.variableGroup!.variablesForView = this.variables = this.variables.filter(v => v != variable);
    this.checkChangeGroup(this.variableGroup!);
    this.table.renderRows();
  }

  undoVariable(variable: Variable) {
    variable.markForDeletion = false;
    if (variable.original) {
      variable.value = variable.original.value;
      variable.isSecret = variable.original.isSecret;
      variable.name = variable.original.name;
    } else {
      this.variableGroup!.variablesForView = this.variables = this.variables.filter(v => v != variable);
    }

    this.checkChange(variable);
  }
}
