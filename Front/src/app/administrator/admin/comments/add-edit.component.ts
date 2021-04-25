import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';


import { ArticlesService, AlertService, CategoryService, CommentsService, AccountService } from '@app/_services';
import { DatePipe } from '@angular/common';
import { CommentDto } from '@app/_models/admin/commentDTO';


@Component({ 
    templateUrl: 'add-edit.component.html',
    providers: [DatePipe]
 })
export class AddEditComponent implements OnInit {

    form: FormGroup;
    id: string;
    isAddMode: boolean;
    loading = false;
    submitted = false;

    img: any;
    comments: any[];
    articles: any[];
    accounts: any[];

    newDate = Date.now();
    saveDate: any;

    constructor(
        private formBuilder: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private commentsService: CommentsService,
        private articlesService: ArticlesService,
        private accountService: AccountService,
        private alertService: AlertService,
        private datePipe: DatePipe

    ) {}

    ngOnInit() {
        this.commentsService.getAll()
        .pipe(first())
        .subscribe(comments => this.comments = comments);

        this.articlesService.getAll()
        .pipe(first())
        .subscribe(articles => this.articles = articles);

        this.accountService.getAll()
        .pipe(first())
        .subscribe(acounts => this.accounts = acounts);

        this.id = this.route.snapshot.params['id'];
        this.isAddMode = !this.id;

        this.form = this.formBuilder.group({
            articleId:['', Validators.required],
            content: ['', Validators.required],
            replyTo: [null],
            author: ['', Validators.required],
        });

        if (!this.isAddMode) {
            this.commentsService.getById(this.id)
                .pipe(first())
                //.subscribe(x => this.form.patchValue(x));
                .subscribe(value  =>{
                    this.form.patchValue(value);
                    let cover = (this.form.get('cover').value);
                    this.img = cover;

                } );
        }
    }

    // convenience getter for easy access to form fields
    get f() { return this.form.controls; }
    

    onSubmit() {
        this.submitted = true;

        // reset alerts on submit
        this.alertService.clear();

        // stop here if form is invalid
        if (this.form.invalid) {
            return;
        }

        this.loading = true;
        if (this.isAddMode) {
            this.createCommet();
        } else {
            
            this.updateComment();
        }
    }

    private createCommet() {
        this.commentsService.create(this.form.value)
            .pipe(first())
            .subscribe({
                next: () => {
                    this.alertService.success('Comment created successfully', { keepAfterRouteChange: true });
                    this.router.navigate(['../'], { relativeTo: this.route });
                },
                error: error => {
                    this.alertService.error(error);
                    this.loading = false;
                }
            });
    }

    private updateComment() {
        let comment :  CommentDto;
        comment = this.form.value;
        comment.id = this.id;
        
        this.commentsService.update(comment)
            .pipe(first())
            .subscribe({
                next: () => {
                    this.alertService.success('Update successful', { keepAfterRouteChange: true });
                    this.router.navigate(['../../'], { relativeTo: this.route });
                },
                error: error => {
                    this.alertService.error(error);
                    this.loading = false;
                }
            });
    }

    onSelectFile(event) { // called each time file input changes
        if (event.target.files && event.target.files[0]) {
          const fileName = event.target.files[0].name;

          var reader = new FileReader();

          reader.readAsDataURL(event.target.files[0]); // read file as data url          
          reader.onload = (event) => { // called once readAsDataURL is completed
          this.img = event.target.result;
          let fileBase64 = event.target.result.toString();
          let json = {
              "fileName": fileName,
              "fileBase64": fileBase64
          };
          this.form.get('cover').setValue(JSON.stringify(json));
          
        }
        }
    }
}