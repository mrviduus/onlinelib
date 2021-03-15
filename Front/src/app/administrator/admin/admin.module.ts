import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AdminRoutingModule } from './admin-routing.module';
import { SubNavComponent } from './subnav.component';
import { LayoutComponent } from './layout.component';
import { OverviewComponent } from './overview.component';
import { CategoryModule } from './categories/category.module'
import { ArticlesModule } from './articles/articles.module';
import { CommentsModule } from './comments/comments.module';
import { AuthorModule } from './author/author.module';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { RouterModule } from '@angular/router';



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
    exports: [RouterModule]
})
export class AdminModule { }