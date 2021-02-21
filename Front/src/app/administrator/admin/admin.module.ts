import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { AdminRoutingModule } from './admin-routing.module';
import { SubNavComponent } from './subnav.component';
import { LayoutComponent } from './layout.component';
import { OverviewComponent } from './overview.component';
import { CategoryModule } from './categories/category.module'
import { from } from 'rxjs';
import { ArticlesModule } from './articles/articles.module';
import { CommentsModule } from './comments/comments.module';
import { AuthorModule } from './author/author.module';
import { BooksModule } from './books/books.module';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'




@NgModule({
    imports: [
        CommonModule,
        ReactiveFormsModule,
        AdminRoutingModule,
        CategoryModule,
        ArticlesModule,
        CommentsModule,
        FormsModule,
        AuthorModule,
        NgbModule
                
    ],
    declarations: [
        SubNavComponent,
        LayoutComponent,
        OverviewComponent,      
    ],
})
export class AdminModule { }