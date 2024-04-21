import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';

import { AppComponent } from './app.component';
import { MatInputModule } from '@angular/material/input'
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import { HttpClientModule } from '@angular/common/http';

import * as SDK from 'azure-devops-extension-sdk';
import { VariableGroupHistoryComponent } from './variable-group-history.component';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
@NgModule({
  declarations: [
    AppComponent,
    VariableGroupHistoryComponent
  ],
  imports: [
    BrowserModule,
    MatInputModule,
    BrowserAnimationsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSidenavModule,
    MatListModule,
    FormsModule,
    HttpClientModule,
    NgFor,
    MatTableModule,
    MatCheckboxModule,
    MatDialogModule,
    MatSelectModule,
    MatIconModule,
    MatTooltipModule,
    ReactiveFormsModule,
    MatAutocompleteModule

  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {
  constructor() {
    SDK.init({
      loaded: false
    });
  }
}