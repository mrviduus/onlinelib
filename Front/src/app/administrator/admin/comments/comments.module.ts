import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CommentsRoutingModule } from './comments-routing.module';
import { ListCommentsComponent } from './list-comments.component';
import { AddEditComponent } from './add-edit.component';
import { QuillModule } from 'ngx-quill';
import { FormsModule } from '@angular/forms';
import { SearchCommentsPipe } from '@app/_pipes/searchComments.pipe';
import { NgxPaginationModule } from 'ngx-pagination';

@NgModule({
    imports: [
        CommonModule,
        ReactiveFormsModule,
        CommentsRoutingModule,
        QuillModule,
        FormsModule,
        NgxPaginationModule
    ],
    declarations: [
        ListCommentsComponent,
        AddEditComponent,
        SearchCommentsPipe
    ]
})
export class CommentsModule { }