import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { NgbModule, NgbDateParserFormatter } from '@ng-bootstrap/ng-bootstrap'

// used to create fake backend
//import { fakeBackendProvider } from './_helpers';

import { AppRoutingModule } from './app-routing.module';
import { JwtInterceptor, ErrorInterceptor, appInitializer } from './_helpers';
import { AccountService, AuthorService, BooksService, CategoryService, CommentsService, AttachmentsService } from './_services';
import { ArticlesService } from './_services';
import { AppComponent } from './app.component';
import { AlertComponent } from './_components';
import { QuillModule } from 'ngx-quill';
import { FormsModule } from '@angular/forms';
import { NgxPaginationModule } from 'ngx-pagination';


@NgModule({
    imports: [
        BrowserModule,
        ReactiveFormsModule,
        HttpClientModule,
        AppRoutingModule,
        QuillModule.forRoot(),
        FormsModule,
        NgxPaginationModule,
        NgbModule
    ],
    declarations: [
        AppComponent,
        AlertComponent,
         ],
    providers: [
        { provide: APP_INITIALIZER, useFactory: appInitializer, multi: true, deps: [AccountService] },
        { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
        CategoryService,
        ArticlesService,
        CommentsService,
        AuthorService,
        BooksService,
        AttachmentsService
        // provider used to create fake backend
        //fakeBackendProvider
    ],
    bootstrap: [AppComponent],
    exports:[QuillModule]
})
export class AppModule { }