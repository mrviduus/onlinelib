import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { ArticlesRoutingModule } from './articles-routing.module';
import { ListCategoryComponent } from './list-articles.component';
import { AddEditComponent } from './add-edit.component';
import { QuillModule } from 'ngx-quill';
import { FormsModule } from '@angular/forms';
import { SearchArticlesPipe } from '@app/_pipes/searchArticles.pipe';
import { NgxPaginationModule } from 'ngx-pagination';

@NgModule({
    imports: [
        CommonModule,
        ReactiveFormsModule,
        ArticlesRoutingModule,
        QuillModule,
        FormsModule,
        NgxPaginationModule
    ],
    declarations: [
        ListCategoryComponent,
        AddEditComponent,
        SearchArticlesPipe
    ]
})
export class ArticlesModule { }