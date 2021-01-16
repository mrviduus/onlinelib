import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, finalize } from 'rxjs/operators';
import { environment } from '@environments/environment';
import { CategoryDto } from '@app/_models/admin/categoryDto';

const baseUrl = `${environment.apiUrl}/admin`;

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private categorySubject: BehaviorSubject<CategoryDto>;
  public category: Observable<CategoryDto>;

  constructor(
      private router: Router,
      private http: HttpClient
  ) {
      this.categorySubject = new BehaviorSubject<CategoryDto>(null);
      this.category = this.categorySubject.asObservable();
  }

  public get categoryValue(): CategoryDto {
      return this.categorySubject.value;
  }

  getAll() {
    return this.http.get<CategoryDto[]>(`${baseUrl}/GetCategories`);
  }

  getById(id: string) {
    return this.http.get<CategoryDto>(`${baseUrl}/GetCategory?id=${id}`);
  }

  create(params) {
    return this.http.post(`${baseUrl}/CreateCategory`, params);
  }

  update(params) {
    return this.http.post(`${baseUrl}/UpdateCategory`, params);
  }

  delete(id: string){
    return this.http.delete(`${baseUrl}/DeleteCategory?id=${id}`);
  }
}
