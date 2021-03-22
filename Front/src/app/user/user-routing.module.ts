import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { BookPageComponent } from './book-page/book-page.component';
import { HomeComponent } from './home/home.component';
import { UserLayoutComponent } from './shared/components/user-layout/user-layout.component';

const routes: Routes = [
  { path: '', component: UserLayoutComponent, children:[
    {path: '', redirectTo: 'home'},
    {path: 'home', component: HomeComponent},
    {path: 'book/:id', component: BookPageComponent}
  ] },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UserRoutingModule { }
