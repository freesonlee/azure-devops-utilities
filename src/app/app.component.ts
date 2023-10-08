import { HttpClient } from '@angular/common/http';
import { Component, ViewChild } from '@angular/core';
import { Observable, delay, first, firstValueFrom } from 'rxjs';
import { ListResponse, Server, Variable, VariableData, VariableGroup } from './Models';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatTable } from '@angular/material/table';
import { SettingsComponent } from './settings.component';
import { CommentComponent } from './comment.component';
import { PipelineComponent } from './pipeline.component';

type Mode = 'variables' | 'pipelines';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'azure-devops-variable-group-editor';

  variableGroups: VariableGroup[] = [];
  variableGroup?: VariableGroup;
  variables: Variable[] = [];
  hasChange = false;
  servers: Server[] = [];
  server?: Server;
  mode: Mode = 'variables';
  @ViewChild('pipelineComp')
  pipelineComp!: PipelineComponent;

  @ViewChild(MatTable) table!: MatTable<Variable>;

  constructor(private httpClient: HttpClient, private dialog: MatDialog) {
    this.loadServers();
  }

  getRequestOptions() {
    return {
      headers: {
        Authorization: `Basic ${btoa(`user:${this.server!.pat}`)}`
      }
    };
  }

  loadServers() {
    const serversStr = localStorage.getItem('servers');
    const lastServerUsed = localStorage.getItem("lastServer");

    if (serversStr) {
      try {
        this.servers = JSON.parse(serversStr);
      } catch (e) {
        console.warn(e);
      }
    } else {
      this.servers = [{
        branch: 'branch to store variable history',
        filePath: 'path to store variable history files',
        host: 'Azure DevOps server including organization and project',
        pat: 'PAT that has source code read/write and variable group management permission for Variable history, and Build Read & execute for pipeline profiles',
        repository: 'repository to store variable history. Must already exist.'
      }]
    }
    this.server = this.servers.find(s => s.host == lastServerUsed);
  }

  async reload() {

    localStorage.setItem('lastServer', this.server!.host);

    if (this.mode == 'pipelines') {
      await new Promise(r => setTimeout(r, 10));
      await this.pipelineComp.reload();
      return;
    }

    const response = await firstValueFrom(this.httpClient.get(`${this.server!.host}/_apis/distributedtask/variablegroups`, this.getRequestOptions())) as ListResponse<VariableGroup>;

    this.variableGroups = response.value.sort((g1, g2) => g1.name.toUpperCase() > g2.name.toUpperCase() ? 1 : -1);
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
      hasChange: true,
      variables: {}
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
      variables: {}
    }));
    this.hasChange = true;
  }

  async loadVariable(grp: VariableGroup) {
    this.variableGroup = grp;

    this.variables = grp.variablesForView ?? (grp.variablesForView = Object.keys(grp.variables).map(k => {
      const vars = grp.variables[k];
      if (vars.original == undefined) {
        vars.original = {
          isSecret: vars.isSecret ?? false,
          name: k,
          value: vars.value
        }
      }
      vars.name = k;
      vars.isSecret = vars.isSecret ?? false;
      return vars;
    }));

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

    if (this.mode == 'pipelines') {
      this.pipelineComp.openSaveDialog();
      return;
    }

    console.log(this.generateUpdatePayload());

    this.dialog.open(CommentComponent, {
      data: ''
    }).afterClosed().subscribe(result => {

      this.save(result);

    });

  }

  async save(comment: string) {

    const payloads = this.generateUpdatePayload();

    const currentLastCommit: any = await firstValueFrom(this.httpClient.get(
      `${this.server!.host}/_apis/git/repositories/${this.server!.repository}/items?versionDescriptor.version=${this.server!.branch}`,
      this.getRequestOptions()));

    let path = this.server!.filePath;
    if (path[path.length - 1] != '/') {
      path += '/';
    }

    const fileItems: any = await firstValueFrom(this.httpClient.get(
      `${this.server!.host}/_apis/git/repositories/${this.server!.repository}/trees/${currentLastCommit.value[0].objectId}?recursive=true`,
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
        name: `refs/heads/${this.server!.branch}`,
        oldObjectId: currentLastCommit.value[0].commitId
      }]
    }

    await firstValueFrom(this.httpClient.post(
      `${this.server!.host}/_apis/git/repositories/${this.server!.repository}/pushes?api-version=5.0`,
      commitPayload,
      this.getRequestOptions()))

    const requests = payloads.map(payload => {

      return firstValueFrom(this.httpClient.put(
        `${this.server!.host}/_apis/distributedtask/variablegroups/${payload.id}?api-version=5.0-preview.1`,
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

  openSettings() {
    const diagRef = this.dialog.open(SettingsComponent, {
      data: JSON.stringify(this.servers, null, 2)
    });

    diagRef.afterClosed().subscribe(result => {
      if (!result) {
        return;
      }
      localStorage.setItem('servers', result);
      this.loadServers();
    });

  }
}
