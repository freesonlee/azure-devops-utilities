import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
    templateUrl: './comment.component.html',
    styleUrls: ['./comment.component.css'],
    standalone: true,
    imports: [
        MatFormFieldModule,
        MatInputModule,
        FormsModule,
        MatButtonModule,
        MatDialogModule
    ]
})
export class CommentComponent {
    constructor(public dialogRef: MatDialogRef<CommentComponent>,
        @Inject(MAT_DIALOG_DATA)
        public comment: string) {

    }
}
