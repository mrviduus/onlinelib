import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ListAuthorComponent } from './list-author.component';
import { AddEditComponent } from './add-edit.component';

const routes: Routes = [
    { path: '', component: ListAuthorComponent },
    { path: 'add', component: AddEditComponent },
    { path: 'edit/:id', component: AddEditComponent }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class AuthorRoutingModule { }