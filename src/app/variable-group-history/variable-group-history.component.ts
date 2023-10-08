import { HttpClient } from '@angular/common/http';
import { Component, ViewChild } from '@angular/core';
import { firstValueFrom, from } from 'rxjs';
import { Variable, VariableData, VariableGroup, HistoryLocationSettings } from './Models';
import { MatDialog } from '@angular/material/dialog';
import { MatTable } from '@angular/material/table';
import { CommentComponent } from './comment.component';
import * as SDK from 'azure-devops-extension-sdk';
import { CommonServiceIds, IExtensionDataManager, IExtensionDataService, ILocationService, IProjectInfo, IProjectPageService, IVssRestClientOptions, getClient } from 'azure-devops-extension-api';
import { TaskAgentRestClient } from 'azure-devops-extension-api/TaskAgent';


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
  settings!: HistoryLocationSettings;
  collectionPath!: string;
  projectPath!: string;
  accessToken!: string;
  loading = true;

  constructor(private httpClient: HttpClient, private dialog: MatDialog) {
    this.loadContribution();
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
    await this.reload();
  }

  async reload() {

    const variableGroups = await this.taskAgentClient.getVariableGroups(this.project!.id);

    this.loading = false;
    const variableGroupSettings = variableGroups.find(g => g.name === 'VariableGroupHistorySettings');
    if (variableGroupSettings) {
      this.settings = {
        branch: variableGroupSettings.variables['Branch'].value,
        path: variableGroupSettings.variables['Path'].value,
        repository: variableGroupSettings.variables['Repository'].value
      }
    }

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

  async newGroup() {
    if (this.variableGroups.length === 0) {
      await this.reload();

    }
    this.variableGroups.push((this.variableGroup = {
      id: 0,
      name: 'New variable group',
      description: '',
      variablesForView: [],
      hasBad: false,
      hasChange: true
    }));
    this.variables = [{
      name: "",
      value: "",
      isSecret: false,
      hasChanged: false,
      isBad: true,
      markForDeletion: false
    }];
  }

  async cloneGroup() {
    this.variableGroups.push((this.variableGroup = {
      id: 0,
      name: this.variableGroup?.name + " Clone",
      description: '',
      variablesForView: this.variableGroup!.variablesForView,
      hasBad: false,
      hasChange: true,
    }));
    this.hasChange = true;
  }

  async loadVariable(grp: VariableGroup) {
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

  private getRequestOptions() {
    return {
      headers: {
        Authorization: "Bearer " + this.accessToken
      }
    };
  }

  async save(comment: string) {

    const payloads = this.generateUpdatePayload();

    const currentLastCommit: any = await firstValueFrom(this.httpClient.get(
      `${this.projectPath}/_apis/git/repositories/${this.settings!.repository}/items?versionDescriptor.version=${this.settings!.branch}`,
      this.getRequestOptions()));

    let path = this.settings!.path;
    if (path[path.length - 1] != '/') {
      path += '/';
    }

    const fileItems: any = await firstValueFrom(this.httpClient.get(
      `${this.projectPath}/_apis/git/repositories/${this.settings!.repository}/trees/${currentLastCommit.value[0].objectId}?recursive=true`,
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
      `${this.projectPath}/_apis/git/repositories/${this.settings!.repository}/pushes?api-version=5.0`,
      commitPayload,
      this.getRequestOptions()))

    const requests = payloads.map(payload => {

      if (payload.id === 0) {
        return firstValueFrom(this.httpClient.post(
          `${this.projectPath}/_apis/distributedtask/variablegroups/?api-version=5.0-preview.1`,
          payload,
          this.getRequestOptions()));
      } else {
        return firstValueFrom(this.httpClient.put(
          `${this.projectPath}/_apis/distributedtask/variablegroups/${payload.id}?api-version=5.0-preview.1`,
          payload,
          this.getRequestOptions()));
      }
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
