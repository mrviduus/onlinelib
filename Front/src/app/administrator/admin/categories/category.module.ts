import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { QuillModule } from 'ngx-quill';
import { CategoryRoutingModule } from './category-routing.module';
import { ListCategoryComponent } from './list-category.component';
import { AddEditComponent } from './add-edit.component';

@NgModule({
    imports: [
        QuillModule,
        CommonModule,
        ReactiveFormsModule,
        CategoryRoutingModule
    ],
    declarations: [
        ListCategoryComponent,
        AddEditComponent
    ]
})
export class CategoryModule { }