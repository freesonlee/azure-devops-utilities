import { Component, EventEmitter, Inject, OnInit, Output } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { Observable, concatAll, concatMap, map, startWith } from 'rxjs';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatOption } from '@angular/material/core';

type WorkItem = {
    id: string
    desc: string
    rev: number
}

type RequestWorkItemListArgs = {
    input: string | null,
    response?: Observable<WorkItem[]>
}

export type DialogData = {
    comment: string,
    selectedWorkItemId?: string,
    requestWorkItemList: (input: string | null) => Observable<WorkItem[]>,
    rev: number
}

@Component({
    templateUrl: './comment.component.html',
    styleUrls: ['./comment.component.css'],
    standalone: true,
    imports: [
        MatFormFieldModule,
        MatInputModule,
        FormsModule,
        MatButtonModule,
        MatDialogModule,
        MatAutocompleteModule,
        MatIconModule,
        AsyncPipe,
        ReactiveFormsModule,
        NgFor,
        NgIf
    ]
})
export class CommentComponent implements OnInit {
    workItemsControl = new FormControl('');
    filteredWorkItems?: Observable<WorkItem[]>;

    constructor(public dialogRef: MatDialogRef<CommentComponent>,
        @Inject(MAT_DIALOG_DATA)
        public initValues: DialogData) {

    }
    ngOnInit() {

        this.filteredWorkItems = this.workItemsControl.valueChanges.pipe(
            startWith(''),
            concatMap( (search) => this.initValues.requestWorkItemList(search) )
        );
    }
    async workItemSelected(selectedOption: MatOption | null) {
        if (selectedOption) {
            const [workItemId, rev] = selectedOption.id.split('/');
            this.initValues.selectedWorkItemId = workItemId;
            this.initValues.rev = parseInt(rev);
        } else {
            this.initValues.selectedWorkItemId = undefined;
            this.initValues.rev = 0;
        }

    }

}
