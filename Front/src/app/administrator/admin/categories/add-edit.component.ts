﻿import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';

import { CategoryService, AlertService, AttachmentsService } from '@app/_services';
import { MustMatch } from '@app/_helpers';
import { CategoryDto } from '@app/_models/admin/categoryDto';
import { Base64ImgFile } from '@app/_models/base64ImgFile';
import { environment } from '@environments/environment';

@Component({ templateUrl: 'add-edit.component.html' })
export class AddEditComponent implements OnInit {
    baseUrl =  `${environment.apiUrl}/`;
    form: FormGroup;
    id: string;
    isAddMode: boolean;
    loading = false;
    submitted = false;

    img: any;
    categories: any[];

    imageFolderName : string = "Categories";

    constructor(
        private formBuilder: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private categoryService: CategoryService,
        private alertService: AlertService,
        private attachmentsService: AttachmentsService
    ) {}

    ngOnInit() {
        this.categoryService.getAll()
        .pipe(first())
        .subscribe(categories => this.categories = categories);


        this.id = this.route.snapshot.params['id'];
        this.isAddMode = !this.id;

        this.form = this.formBuilder.group({
            name: ['', Validators.required],
            description: ['', Validators.required],
            parentId: [],
            icon: ['']
        });

        if (!this.isAddMode) {
            this.categoryService.getById(this.id)
                .pipe(first())
                .subscribe((x) => {
                    this.form.patchValue(x);
                    this.img = x.icon;
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

        this.loading = true;
        if (this.isAddMode) {
            this.createCategory();
        } else {
            this.updateCategory();
        }
    }

    private createCategory() {
        //console.log(this.form.get('icon').value);
        this.categoryService.create(this.form.value)
            .pipe(first())
            .subscribe({
                next: () => {
                    this.alertService.success('Category created successfully', { keepAfterRouteChange: true });
                    this.router.navigate(['../'], { relativeTo: this.route });
                },
                error: error => {
                    this.alertService.error(error);
                    this.loading = false;
                }
            });
    }

    private updateCategory() {
        let category :  CategoryDto;
        category = this.form.value;
        category.id = this.id;
        
        this.categoryService.update(category)
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
              this.form.get('icon').setValue(Object.values(value).toString());
              this.img = Object.values(value).toString();
          });       
        }
        }
    }
}