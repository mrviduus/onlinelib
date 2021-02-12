import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SubNavComponent } from './subnav.component';
import { LayoutComponent } from './layout.component';
import { OverviewComponent } from './overview.component';
import { ArticlesModule } from './articles/articles.module';

const accountsModule = () => import('./accounts/accounts.module').then(x => x.AccountsModule);
const categoryModule = () => import('./categories/category.module').then(x => x.CategoryModule);
const articlesModule = () => import('./articles/articles.module').then(x => x.ArticlesModule);
const commentsModule = () => import('./comments/comments.module').then(x => x.CommentsModule);
const authorModule = () => import('./author/author.module').then(x => x.AuthorModule);
const booksModule = () => import('./books/books.module').then(x => x.BooksModule);

const routes: Routes = [
    { path: '', component: SubNavComponent, outlet: 'subnav' },
    {
        path: '', component: LayoutComponent,
        children: [
            { path: '', component: OverviewComponent },
            { path: 'accounts', loadChildren: accountsModule },
            { path: 'categories', loadChildren: categoryModule },
            { path: 'articles', loadChildren: articlesModule },
            { path: 'comments', loadChildren: commentsModule},
            { path: 'authors', loadChildren: authorModule},
            { path: 'books', loadChildren: booksModule}
        ]
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class AdminRoutingModule { }