import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, finalize } from 'rxjs/operators';
import { environment } from '@environments/environment';
import { ArticleDto } from '@app/_models/admin/articleDto';

const baseUrl = `${environment.apiUrl}/admin`;

@Injectable({
  providedIn: 'root'
})
export class ArticlesService {
  private articleSubject: BehaviorSubject<ArticleDto>;
  public article: Observable<ArticleDto>;

  constructor(
      private router: Router,
      private http: HttpClient
  ) {
      this.articleSubject = new BehaviorSubject<ArticleDto>(null);
      this.article = this.articleSubject.asObservable();
  }

  public get categoryValue(): ArticleDto {
    return this.articleSubject.value;
}

getAll() {
  return this.http.get<ArticleDto[]>(`${baseUrl}/GetArticles`);
}

getById(id: string) {
  return this.http.get<ArticleDto>(`${baseUrl}/GetArticle?id=${id}`);
}

create(params) {
  return this.http.post(`${baseUrl}/CreateArticle`, params);
}

update(params) {
  return this.http.post(`${baseUrl}/UpdateArticle`, params);
}

delete(id: string){
  return this.http.delete(`${baseUrl}/DeleteArticle?id=${id}`);
}
}
