import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DashBoardComponent } from './administrator/admin/dashboard';
import { HomeComponent } from './user/home/home.component';
import { AuthGuard } from './_helpers';
import { Role } from './_models';

const accountModule = () => import('./administrator/account/account.module').then(x => x.AccountModule);
const adminModule = () => import('./administrator/admin/admin.module').then(x => x.AdminModule);
const profileModule = () => import('./administrator/admin/profile/profile.module').then(x => x.ProfileModule);

const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'admin', component: DashBoardComponent, canActivate: [AuthGuard] },
    { path: 'account', loadChildren: accountModule },
    { path: 'profile', loadChildren: profileModule, canActivate: [AuthGuard] },
    { path: 'controls', loadChildren: adminModule, canActivate: [AuthGuard], data: { roles: [Role.Admin] } },

    // otherwise redirect to home
    { path: '**', redirectTo: '' }
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule]
})
export class AppRoutingModule { }
