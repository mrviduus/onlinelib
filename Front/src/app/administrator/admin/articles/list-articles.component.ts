import { Component, OnInit } from '@angular/core';
import { ArticlesService } from '@app/_services';
import { first } from 'rxjs/operators';
import { environment } from '@environments/environment';


@Component({
  selector: 'app-list-articles',
  templateUrl: './list-articles.component.html',
  styleUrls: ['./list-articles.component.less']
})
export class ListArticlesComponent implements OnInit {
  baseUrl =  `${environment.apiUrl}/`;
  articles: any[];
  searchArticles = '';
  //pagination
  p: number =1;
  totalLength: number;
  perPage = 5;



  constructor(private articlesService : ArticlesService) { }

  ngOnInit(): void {
    this.articlesService.getAll()
        .pipe(first())
        .subscribe((value) => {
          this.articles = value;
          this.totalLength = value.length; 
        });        
  }

  deleteCategory(id: string) {
    const article = this.articles.find(x => x.id === id);
    article.isDeleting = true;
    this.articlesService.delete(id)
        .pipe(first())
        .subscribe(() => {
            this.articles = this.articles.filter(x => x.id !== id) 
        });
  }

}
