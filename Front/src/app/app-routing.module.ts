import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { HomeComponent } from './administrator/admin/home';
import { AuthGuard } from './_helpers';
import { Role } from './_models';

const accountModule = () => import('./administrator/account/account.module').then(x => x.AccountModule);
const adminModule = () => import('./administrator/admin/admin.module').then(x => x.AdminModule);
const profileModule = () => import('./administrator/admin/profile/profile.module').then(x => x.ProfileModule);
const categoriesModule = () => import('./administrator/admin/categories/category.module').then(x => x.CategoryModule);

const routes: Routes = [
    { path: '', component: HomeComponent, canActivate: [AuthGuard] },
    { path: 'account', loadChildren: accountModule },
    { path: 'profile', loadChildren: profileModule, canActivate: [AuthGuard] },
    { path: 'admin', loadChildren: adminModule, canActivate: [AuthGuard], data: { roles: [Role.Admin] } },
    { path: 'categories',  loadChildren: categoriesModule, canActivate: [AuthGuard] },

    // otherwise redirect to home
    { path: '**', redirectTo: '' }
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule]
})
export class AppRoutingModule { }