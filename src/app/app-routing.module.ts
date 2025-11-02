import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Simple routes that will be handled by the app component
const routes: Routes = [
    { path: '', redirectTo: '/variables', pathMatch: 'full' },
    { path: 'variables', children: [] }, // Will be handled by app component
    { path: 'profiles', children: [] },   // Will be handled by app component
    { path: 'planviewer', children: [] }, // Will be handled by app component
    { path: '**', redirectTo: '/variables' } // Wildcard route for 404 page
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule]
})
export class AppRoutingModule { }