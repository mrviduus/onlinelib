import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { QuillModule } from 'ngx-quill';
import { AuthorRoutingModule } from './author-routing.module';
import { ListAuthorComponent } from './list-author.component';
import { AddEditComponent } from './add-edit.component';
import { NgbModule} from '@ng-bootstrap/ng-bootstrap';

@NgModule({
    imports: [
        CommonModule,
        ReactiveFormsModule,
        AuthorRoutingModule,
        QuillModule,
        NgbModule
    ],
    declarations: [
        ListAuthorComponent,
        AddEditComponent
    ]
})
export class AuthorModule { }