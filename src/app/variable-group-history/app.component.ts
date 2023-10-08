import { Component } from '@angular/core';
import { Location } from '@angular/common';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html'
}) export class AppComponent {

    page: string;

    constructor(private location: Location) {
        this.page = location.path().split('?')[1];
    }
}