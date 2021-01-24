import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ListCommentsComponent } from './list-comments.component';
import { AddEditComponent } from './add-edit.component';

const routes: Routes = [
    { path: '', component: ListCommentsComponent },
    { path: 'add', component: AddEditComponent },
    { path: 'edit/:id', component: AddEditComponent }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class CommentsRoutingModule { }