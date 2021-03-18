import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UserRoutingModule } from './user-routing.module';
import { HomeComponent } from './home/home.component';
import { UserLayoutComponent } from './shared/components/user-layout/user-layout.component'
import { from } from 'rxjs';


@NgModule({
  declarations: [
    UserLayoutComponent,
    HomeComponent
  ],
  imports: [
    CommonModule,
    UserRoutingModule,
  ]
})
export class UserModule { }
