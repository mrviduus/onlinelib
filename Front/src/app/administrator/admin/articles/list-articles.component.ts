import { Component, OnInit } from '@angular/core';
import { ArticlesService } from '@app/_services';
import { first } from 'rxjs/operators';


@Component({
  selector: 'app-list-category',
  templateUrl: './list-articles.component.html',
  styleUrls: ['./list-articles.component.less']
})
export class ListCategoryComponent implements OnInit {
  articles: any[];
  searchArticles = '';
  constructor(private articlesService : ArticlesService) { }

  ngOnInit(): void {
    this.articlesService.getAll()
        .pipe(first())
        .subscribe(categories => this.articles = categories);
        //this.categories = this.categories.find(x => x.id === x.parentId).select(x => x.name);
  }

  deleteCategory(id: string) {
    const category = this.articles.find(x => x.id === id);
    category.isDeleting = true;
    this.articlesService.delete(id)
        .pipe(first())
        .subscribe(() => {
            this.articles = this.articles.filter(x => x.id !== id) 
        });
  }

}
