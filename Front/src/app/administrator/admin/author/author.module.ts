import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { AuthorRoutingModule } from './author-routing.module';
import { ListAuthorComponent } from './list-author.component';
import { AddEditComponent } from './add-edit.component';

@NgModule({
    imports: [
        CommonModule,
        ReactiveFormsModule,
        AuthorRoutingModule
    ],
    declarations: [
        ListAuthorComponent,
        AddEditComponent
    ]
})
export class AuthorModule { }