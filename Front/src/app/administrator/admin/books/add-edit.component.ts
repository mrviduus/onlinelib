import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import {BooksService, AuthorService, AlertService, CategoryService } from '@app/_services';
import { MustMatch } from '@app/_helpers';
import { ArticleDto } from '@app/_models/admin/articleDto';
import { DatePipe } from '@angular/common';


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
    authors: any[];
    categories: any[];

    newDate = Date.now();
    saveDate: any;

    constructor(
        private formBuilder: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private authorService: AuthorService,
        private bookService: BooksService,
        private categoryService: CategoryService,
        private alertService: AlertService,
        private datePipe: DatePipe

    ) {}

    ngOnInit() {
        this.authorService.getAll()
        .pipe(first())
        .subscribe(author => this.authors = author);

        this.categoryService.getAll()
        .pipe(first())
        .subscribe(categories => this.categories = categories);


        this.id = this.route.snapshot.params['id'];
        this.isAddMode = !this.id;

        this.form = this.formBuilder.group({
            authorId:['', Validators.required],
            categoryId:['', Validators.required],
            title: ['', Validators.required],
            summary:['', Validators.required],
            content:['', Validators.required],
            year: [Date],
            publisher: ['', Validators.required],
            pages: [0],
            ibsn: [''],
            isPublished: [null],
            views: [0],
            contentLanguage: ['', Validators.required],
            likes: [0],
            cover: [''],
            pageName: ['', Validators.required],
            tags: ['', Validators.required]

        });

        if (!this.isAddMode) {
            this.bookService.getById(this.id)
                .pipe(first())
                .subscribe(x => this.form.patchValue(x));

                setTimeout(()=>{                           //<<<---using ()=> syntax
                    this.img =  (this.form.get('cover').value);                    
               }, 300);
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
        //corect date
        this.saveDate = this.datePipe.transform(this.newDate, 'yyyy-MM-ddTHH:mm:ss');
        this.form.get('year').setValue(this.saveDate);

        this.loading = true;
        if (this.isAddMode) {
            this.createBook();
        } else {         
            this.updateBook();
        }
    }

    private createBook() {
        this.bookService.create(this.form.value)
            .pipe(first())
            .subscribe({
                next: () => {
                    this.alertService.success('Article created successfully', { keepAfterRouteChange: true });
                    this.router.navigate(['../'], { relativeTo: this.route });
                },
                error: error => {
                    this.alertService.error(error);
                    this.loading = false;
                }
            });
    }

    private updateBook() {
        let article :  ArticleDto;
        article = this.form.value;
        article.id = this.id;
        
        this.bookService.update(article)
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