import { Component, OnInit } from '@angular/core';
import { CategoryService } from '@app/_services';
import { first } from 'rxjs/operators';

@Component({
  selector: 'app-list-category',
  templateUrl: './list-category.component.html',
  styleUrls: ['./list-category.component.less']
})
export class ListCategoryComponent implements OnInit {
  categories: any[];
  constructor(private categoryService : CategoryService) { }

  ngOnInit(): void {
    this.categoryService.getAll()
        .pipe(first())
        .subscribe(categories => this.categories = categories);
        //this.categories = this.categories.find(x => x.id === x.parentId).select(x => x.name);
  }

  deleteCategory(id: string) {
    const category = this.categories.find(x => x.id === id);
    category.isDeleting = true;
    this.categoryService.delete(id)
        .pipe(first())
        .subscribe(() => {
            this.categories = this.categories.filter(x => x.id !== id) 
        });
  }

}
