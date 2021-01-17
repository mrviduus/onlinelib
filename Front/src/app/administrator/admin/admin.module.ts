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
import { FormsModule } from '@angular/forms';




@NgModule({
    imports: [
        CommonModule,
        ReactiveFormsModule,
        AdminRoutingModule,
        CategoryModule,
        ArticlesModule,
        FormsModule,
        
    ],
    declarations: [
        SubNavComponent,
        LayoutComponent,
        OverviewComponent,      
    ],
})
export class AdminModule { }