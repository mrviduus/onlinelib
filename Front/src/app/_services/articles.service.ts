import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, finalize } from 'rxjs/operators';
import { environment } from '@environments/environment';
import { ArticleDto } from '@app/_models/admin/articleDto';

const baseUrl = `${environment.apiUrl}/admin/Article`;

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
  return this.http.get<ArticleDto[]>(`${baseUrl}/GetAll`);
}

getById(id: string) {
  return this.http.get<ArticleDto>(`${baseUrl}/GetById?id=${id}`);
}

create(params) {
  return this.http.post(`${baseUrl}/Create`, params);
}

update(params) {
  return this.http.post(`${baseUrl}/Update`, params);
}

delete(id: string){
  return this.http.delete(`${baseUrl}/Delete?id=${id}`);
}
}
