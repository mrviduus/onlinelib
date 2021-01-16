import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { ArticlesRoutingModule } from './articles-routing.module';
import { ListCategoryComponent } from './list-articles.component';
import { AddEditComponent } from './add-edit.component';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

@NgModule({
    imports: [
        CommonModule,
        ReactiveFormsModule,
        ArticlesRoutingModule,
        NgbModule
    ],
    declarations: [
        ListCategoryComponent,
        AddEditComponent
    ]
})
export class ArticlesModule { }