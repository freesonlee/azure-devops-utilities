import { Component, Inject } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { IProjectInfo, IVssRestClientOptions } from 'azure-devops-extension-api';
import { Observable, concat, firstValueFrom, from, map, of, startWith, switchMap } from 'rxjs';
import { GraphRestClient } from 'azure-devops-extension-api/Graph';
import { HttpClient } from '@angular/common/http';


@Component({
    selector: 'app-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.css']
})
export class SettingsComponent {

    repoControl = new FormControl('');
    groupControl = new FormControl('');
    filteredRepo = new Observable<string[]>();
    filteredGroups?: Observable<string[]>;
    project: IProjectInfo | undefined;
    collectionPath!: string;
    vssps!: string;
    allGroups: { displayName: String, descriptor: string }[] = [];

    constructor(private httpClient: HttpClient) {

    }

    async ngOnInit() {

        this.loadMock();

        this.filteredGroups = concat(this.loadAllGroups(), this.groupControl.valueChanges).pipe(
            startWith(''),
            switchMap(value => value != '' ? this.loadAllGroups() : of(value))
            map(value => this.allGroups.filter(g => g.toLowerCase().includes(value!.toLowerCase())))
        );
    }

    loadAllGroups(): Observable<string> {
        this.httpClient.get<{ value: string }>(`${this.vssps}_apis/graph/descriptors/${this.project?.id}`).pipe(
            switchMap(d => this.httpClient.get<{ value: { displayName: String, descriptor: string }[] }>(`${this.vssps}_apis/graph/groups?scopeDescriptor=${d.value}`)),
        ).subscribe(groups => {

        })
    }

    getRequestOptions() {
        return {
            headers: {
                Authorization: `Basic ${btoa(`user:z6o4btg5w7mnu6imfbnuap7a3ccpipqbiptzxlbibznb5qq2h66q`)}`
            }
        };
    }

    loadMock() {

        const vssClientOption: IVssRestClientOptions = {
            rootPath: 'https://dev.azure.com/m3ac-Lif/',
            authTokenProvider: {
                getAuthorizationHeader: (forceRefresh?: boolean) => Promise.resolve(this.getRequestOptions().headers.Authorization)
            }
        };

        this.project = { id: "c12c13fe-f28e-479d-9668-43b189184073", name: "Playground" };
        this.collectionPath = <string>vssClientOption.rootPath;
        this.vssps = 'https://vssps.dev.azure.com/m3ac-Lif/';
    }

}
