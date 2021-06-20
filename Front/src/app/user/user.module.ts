import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UserRoutingModule } from './user-routing.module';
import { HomeComponent } from './home/home.component';
import { UserLayoutComponent } from './shared/components/user-layout/user-layout.component'
import { from } from 'rxjs';
import { BookPageComponent } from './book-page/book-page.component';
import { HomeModule } from './home/home.module';
import { ReaderComponent } from './reader/reader/reader.component';


@NgModule({
  declarations: [
    UserLayoutComponent,
    HomeComponent,
    ReaderComponent,   
  ],
  imports: [
    CommonModule,
    UserRoutingModule,
    HomeModule,
  ]
})
export class UserModule { }
