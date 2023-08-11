import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
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

import { HttpClientModule } from '@angular/common/http';
import { PipelineComponent } from './pipeline.component';
@NgModule({
  declarations: [
    AppComponent
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
    PipelineComponent
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
