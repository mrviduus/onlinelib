import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { from } from 'rxjs';
import { HomeComponent } from './home.component';
import { BookPageComponent } from '../book-page/book-page.component';




const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'book/:id', component: BookPageComponent }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class HomeRoutingModule { }