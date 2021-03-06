import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, finalize } from 'rxjs/operators';
import { environment } from '@environments/environment';
import { CategoryDto } from '@app/_models/admin/categoryDto';

const baseUrl = `${environment.apiUrl}/admin/category`;

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
    return this.http.get<CategoryDto[]>(`${baseUrl}/GetAll`);
  }

  getById(id: string) {
    return this.http.get<CategoryDto>(`${baseUrl}/GetById?id=${id}`);
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
