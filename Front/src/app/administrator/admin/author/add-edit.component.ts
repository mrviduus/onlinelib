import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';

import { AuthorService, AlertService } from '@app/_services';
import { MustMatch } from '@app/_helpers';
import { AuthorDTO } from '@app/_models/admin/authorDto';
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

    constructor(
        private formBuilder: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private authorService: AuthorService,
        private alertService: AlertService,
        private datePipe: DatePipe
    ) {}

    ngOnInit() {
        this.authorService.getAll()
        .pipe(first())
        .subscribe(authors => this.authors = authors);


        this.id = this.route.snapshot.params['id'];
        this.isAddMode = !this.id;

        this.form = this.formBuilder.group({
            firstName: ['', Validators.required],
            lastName: ['', Validators.required],
            biography: ['', Validators.required],
            birthDate: [''],
            icon: ['']
        });

        if (!this.isAddMode) {
            this.authorService.getById(this.id)
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

        //corect date
        let saveDate = this.datePipe.transform(Date.now(), 'yyyy-MM-ddTHH:mm:ss');
        this.form.get('birthDate').setValue(saveDate);
        

        this.loading = true;
        if (this.isAddMode) {
            this.createAuthor();
        } else {
            this.updateAuthor();
        }
    }

    private createAuthor() {
        this.authorService.create(this.form.value)
            .pipe(first())
            .subscribe({
                next: () => {
                    this.alertService.success('Author created successfully', { keepAfterRouteChange: true });
                    this.router.navigate(['../'], { relativeTo: this.route });
                },
                error: error => {
                    this.alertService.error(error);
                    this.loading = false;
                }
            });
    }

    private updateAuthor() {
        let author :  AuthorDTO;
        author = this.form.value;
        author.id = this.id;
        
        this.authorService.update(author)
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
          this.form.get('icon').setValue(JSON.stringify(json));
          
        }
        }
    }
}