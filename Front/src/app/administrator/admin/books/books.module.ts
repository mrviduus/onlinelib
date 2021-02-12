import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { BooksRoutingModule } from './books-routing.module';
import { ListBooksComponent } from './list-books.component';
import { AddEditComponent } from './add-edit.component';
import { QuillModule } from 'ngx-quill';
import { FormsModule } from '@angular/forms';
import { SearchBooksPipe } from '@app/_pipes/searchBooks.pipe';
import { NgxPaginationModule } from 'ngx-pagination';

@NgModule({
    imports: [
        CommonModule,
        ReactiveFormsModule,
        BooksRoutingModule,
        QuillModule,
        FormsModule,
        NgxPaginationModule
    ],
    declarations: [
        ListBooksComponent,
        AddEditComponent,
        SearchBooksPipe
    ]
})
export class BooksModule { }