import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';

import { CategoryService, AlertService } from '@app/_services';
import { MustMatch } from '@app/_helpers';
import { CategoryDto } from '@app/_models/admin/categoryDto';

@Component({ templateUrl: 'add-edit.component.html' })
export class AddEditComponent implements OnInit {
    form: FormGroup;
    id: string;
    isAddMode: boolean;
    loading = false;
    submitted = false;

    img: any;
    categories: any[];

    constructor(
        private formBuilder: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private categoryService: CategoryService,
        private alertService: AlertService
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
                .subscribe(x => this.form.patchValue(x));

                setTimeout(()=>{                           //<<<---using ()=> syntax
                    let icon = (this.form.get('icon').value);
                    this.img = icon;
               }, 100);
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
          }
          //console.log(JSON.stringify(json));
          this.form.get('icon').setValue(JSON.stringify(json));
          
        }
        }
    }
}