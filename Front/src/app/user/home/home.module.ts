import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HomeRoutingModule } from './home-routing.module';
import { from } from 'rxjs';
import { BookPageComponent } from '../book-page/book-page.component';



@NgModule({
  declarations: [
    BookPageComponent
  ],
  imports: [
    CommonModule,
    HomeRoutingModule
  ]
})
export class HomeModule { }
