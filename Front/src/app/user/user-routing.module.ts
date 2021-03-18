import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { UserLayoutComponent } from './shared/components/user-layout/user-layout.component';

const routes: Routes = [
  { path: '', component: UserLayoutComponent, children:[
    {path: '', component: HomeComponent}
  ] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UserRoutingModule { }
