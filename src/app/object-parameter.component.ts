import { NgFor, NgIf, AsyncPipe, KeyValuePipe } from "@angular/common";
import { Component, Input } from "@angular/core";
import { ReactiveFormsModule, FormsModule } from "@angular/forms";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatListModule } from "@angular/material/list";
import { MatSelectModule } from "@angular/material/select";
import { MatSidenavModule } from "@angular/material/sidenav";
import { MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTableModule } from "@angular/material/table";
import { ProfilePipeline } from "./Profile";

@Component({
    selector: 'object-parameter',
    templateUrl: './object-parameter.component.html',
    styleUrls: ['./object-parameter.component.css'],
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
export class ObjectParameterComponent {
    @Input()
    value!: {
        [name: string]: {
            default: any
            current: any
        }
    };

    @Input()
    pipelineDef!: ProfilePipeline;

    @Input()
    name!: string;

    @Input()
    values!: {
        [name: string]: any
    }

    isType(input: any, type: 'boolean' | 'string' | 'number') {
        return (typeof input) == type;
    }
}