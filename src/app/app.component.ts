import { HttpClient } from '@angular/common/http';
import { Component, ViewChild } from '@angular/core';
import { Observable, concatAll, delay, first, firstValueFrom, iif, map, of } from 'rxjs';
import { ListResponse, Server, Variable, VariableData, VariableGroup } from './Models';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatTable } from '@angular/material/table';
import { SettingsComponent } from './settings.component';
import { CommentComponent, DialogData } from './comment.component';
import { PipelineComponent } from './pipeline.component';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { generateQuery } from './workItemQuery';

type Mode = 'variables' | 'pipelines';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),

    ]),
  ],
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
  expandedVariable?: Variable;
  descColHiding = true;

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
      desc: '',
      variables: {}
    }));
    this.variables = [{
      name: "",
      value: "",
      mlType: "|",
      description: "",
      desc: "",
      isSecret: false,
      hasChanged: false,
      isBad: true,
      markForDeletion: false,
      mlSource: ''
    }];
  }

  async cloneGroup() {
    this.variableGroups.push((this.variableGroup = {
      id: 0,
      name: this.variableGroup?.name + " Clone",
      description: '',
      desc: "",
      variablesForView: this.variableGroup!.variablesForView,
      hasBad: false,
      hasChange: true,
      variables: {}
    }));
    this.hasChange = true;
  }

  getVariableGroupHistoryUrl(grp: VariableGroup) {
    return `${this.server?.host}/_git/${this.server?.repository}?path=${encodeURIComponent(this.server!.filePath)}${encodeURIComponent(grp.name)}.json&version=GB${this.server?.branch}&_a=history`;
  }

  async loadVariable(grp: VariableGroup) {
    this.variableGroup = grp;

    this.variables = grp.variablesForView ?? (grp.variablesForView = Object.keys(grp.variables).map(k => {
      const vars = grp.variables[k];
      if (vars.original == undefined) {
        vars.original = {
          isSecret: vars.isSecret ?? false,
          name: k,
          value: vars.value,
          mlValue: vars.mlSource,
          mlType: vars.mlType,
          description: vars.description,
          desc: vars.desc
        }
      }
      vars.name = k;
      vars.description = vars.description ?? '';
      vars.mlSource = vars.mlSource ?? (vars.mlType == undefined ? vars.value : '');
      vars.mlType = vars.mlType ?? '|';
      vars.isSecret = vars.isSecret ?? false;
      return vars;
    }));

    await this.loadMore(grp);

  }

  private async loadMore(variableGroup: VariableGroup) {
    let path = this.server!.filePath;
    if (path[path.length - 1] != '/') {
      path += '/';
    }

    try {
      const h = this.getRequestOptions();
      (h.headers as any).Accept = '*/*'

      const snapshot: any = await firstValueFrom(this.httpClient.get(
        `${this.server!.host}/_apis/git/repositories/${this.server!.repository}/items?path=${path}${variableGroup.name}.json&versionDescriptor.version=${this.server!.branch}`,
        h));

      this.variables.forEach(v => {
        v.mlType = snapshot.variables[v.name]?.mlType ?? '|'
        v.original!.mlValue = v.mlSource = snapshot.variables[v.name]?.mlSource ?? '';
        v.description = v.original!.description = snapshot.variables[v.name]?.description ?? '';
        v.desc = v.original!.desc = snapshot.variables[v.name]?.desc ?? '';
      })

    } catch (e) {

    }
  }

  isEqual(valueA: string | undefined, valueB: string | undefined, defaultValue: string = '') {
    return (valueA ?? defaultValue) == (valueB ?? defaultValue);
  }


  checkChange(variable: Variable) {
    variable.hasChanged = (
      (variable.isSecret != variable.original?.isSecret) ||
      !this.isEqual(variable.value, variable.original?.value) ||
      !this.isEqual(variable.description, variable.original?.description) ||
      !this.isEqual(variable.desc, variable.original?.desc) ||
      !this.isEqual(variable.mlType, variable.original?.mlType, '|') ||
      !this.isEqual(variable.mlSource, variable.original?.mlValue)
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

    this.dialog.open(CommentComponent, {
      data: {
        comment: '',
        requestWorkItemList: (input: string) => {

          return firstValueFrom(this.httpClient.post(`${this.server!.host}/_apis/wit/wiql?api-version=6.0`, {
            query: generateQuery(input)}, this.getRequestOptions())
            .pipe(map((resp: any) => resp.workItems.map((wi: any) => ({
              id: wi.id
            }))),
              map((wi: any) => {
                if( wi.length == 0 ) {
                  return of({value:[]});
                }
                return this.httpClient.get(`${this.server!.host}/_apis/wit/workitems?ids=${wi.map((_: any) => _.id).join(',')}`, this.getRequestOptions());
              }),
              concatAll(),
              map((final: any) => {
                return final.value.map((r: any) => {
                  return {
                    id: r.id,
                    desc: r.fields['System.Title'],
                    rev: r.rev
                  }
                })
              })
            )
          )
        }
      }
    }).afterClosed().subscribe(result => {

      if (result === undefined)
        return;

      this.save(result);

    });

  }

  async save(data: DialogData) {

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
        comment: data.comment ?? "No comment provided",
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

    const commitResp: any = await firstValueFrom(this.httpClient.post(
      `${this.server!.host}/_apis/git/repositories/${this.server!.repository}/pushes?api-version=5.0`,
      commitPayload,
      this.getRequestOptions()))

    if (data.selectedWorkItemId) {

      const gitUrl = `vstfs:///Git/Commit/${commitResp.repository.project.id}%2F${commitResp.repository.id}%2F${commitResp.commmits[0].commitId}`

      const wiUpdateResp = await firstValueFrom(this.httpClient.patch(
        `${this.server!.host}/_apis/wit/workItems/${data.selectedWorkItemId}?api-version=5.0`,
        [{
          op: "test",
          path: "/rev",
          value: data.rev
        },

        {
          op: "add",
          path: "/relations/-",
          value: {
            rel: "ArtifactLink",
            url: gitUrl,
            attributes: {
              name: "Fixed in Commit"
            }
          }
        }],
        {
          headers: {
            ...this.getRequestOptions().headers,
            "Content-Type": "application/json-patch+json"
          }
        }
      ))
    }

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
      isBad: true,
      mlSource: '',
      mlType: '|',
      description: '',
      desc: ''
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
      variable.desc = variable.original.desc;
      variable.description = variable.original.description;
      variable.mlSource = variable.original.mlValue;
      variable.mlType = variable.original.mlType;
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

  onMultiLineValueChange(variable: Variable, $event: Event) {

    let newValue = ($event.target as HTMLTextAreaElement).value;
    variable.mlSource = newValue
    newValue = this.evaluateVariable(variable.mlType, newValue);

    variable.value = newValue;

    this.checkChange(variable);

  }
  evaluateVariable(multilineType: string, mlSource: string): any {

    if (multilineType == '>') {
      return mlSource.replace(/\n/g, ' ');
    }

    return mlSource;
  }

  updateDescription(variable: Variable, $event: Event) {
    variable.description = ($event.target as HTMLTextAreaElement).value
    this.checkChange(variable);
  }

  generateDescription(variable: Variable) {
    return `${variable.desc}
    
    ${variable.description}`;
  }
}
