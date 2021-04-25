import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import {BooksService, AuthorService, AlertService, CategoryService, AttachmentsService } from '@app/_services';
import { DatePipe } from '@angular/common';
import { NgbDateStruct, NgbDateParserFormatter } from '@ng-bootstrap/ng-bootstrap';
import { BookDTO } from '@app/_models/admin/bookDto';
import { Base64TxtFile } from '@app/_models/base64TxtFile';
import { Base64ImgFile } from '@app/_models/base64ImgFile';
import { environment } from '@environments/environment';


@Component({ 
    templateUrl: 'add-edit.component.html',
    providers: [DatePipe]
 })
export class AddEditComponent implements OnInit {
    baseUrl =  `${environment.apiUrl}/`;
    form: FormGroup;
    id: string;
    isAddMode: boolean;
    loading = false;
    submitted = false;

    img: any;
    authors: any[];
    categories: any[];
    saveDate: any;
    modelDataPicker : NgbDateStruct;

    imageFolderName : string = "Books";

    constructor(
        private formBuilder: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private authorService: AuthorService,
        private bookService: BooksService,
        private categoryService: CategoryService,
        private alertService: AlertService,
        private attachmentsService: AttachmentsService,
        private datePipe: DatePipe,
        private ngbDateParserFormatter: NgbDateParserFormatter

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
            year: [Date, Validators.required],
            publisher: ['', Validators.required],
            pages: [0, Validators.required],
            ibsn: ['', Validators.required],
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
                .subscribe((x) => {
                    this.form.patchValue(x);
                    this.img = x.cover;
                    this.modelDataPicker =  this.ngbDateParserFormatter.parse(x.year.toString());
                });
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
        this.saveDate = this.datePipe.transform(new Date(this.modelDataPicker.year, this.modelDataPicker.month -1, this.modelDataPicker.day), 'yyyy-MM-ddTHH:mm:ss');
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
        let article :  BookDTO;
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

    onSelectImgFile(event) { // called each time file input changes
        if (event.target.files && event.target.files[0]) {
          let fileName = event.target.files[0].name;

          var reader = new FileReader();

          reader.readAsDataURL(event.target.files[0]); // read file as data url          
          reader.onload = (event) => { // called once readAsDataURL is completed
          //this.img = event.target.result;
          let base64ImgFile = new Base64ImgFile();
          base64ImgFile.folderName = this.imageFolderName;
          base64ImgFile.fileName =  fileName;
          base64ImgFile.base64Code = event.target.result.toString();

          this.attachmentsService.attachImgFile(base64ImgFile)
          .pipe(first())
          .subscribe((value)=>{             
              this.form.get('cover').setValue(Object.values(value).toString());
              this.img = Object.values(value).toString();
          });       
        }
        }
    }

    onSelectBookFile(event) { // called each time file input changes
        if (event.target.files && event.target.files[0]) {
          var reader = new FileReader();

          reader.readAsDataURL(event.target.files[0]); // read file as data url          
          reader.onload = (event) => { // called once readAsDataURL is completed
            

          let base64TxtFile = new Base64TxtFile();
          base64TxtFile.base64Code = event.target.result.toString();

          this.attachmentsService.attachTxtFile(base64TxtFile)
          .pipe(first())
          .subscribe((value)=>{
              this.form.get('content').setValue(Object.values(value).toString());
          });          
        }
        }
    }


    
}