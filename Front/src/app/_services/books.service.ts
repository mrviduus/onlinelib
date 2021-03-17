import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '@environments/environment';
import { BookDTO } from '@app/_models/admin/bookDTO';

const baseUrl = `${environment.apiUrl}/admin/Book`;

@Injectable({
  providedIn: 'root'
})
export class BooksService {
  private bookSubject: BehaviorSubject<BookDTO>;
  public book: Observable<BookDTO>;

  constructor(
    private router: Router,
    private http: HttpClient
  ) 
  {
    this.bookSubject = new BehaviorSubject<BookDTO>(null);
    this.book = this.bookSubject.asObservable();
  }

  public get bookValue(): BookDTO {
    return this.bookSubject.value;
  }

  getAll() {
    return this.http.get<BookDTO[]>(`${baseUrl}/GetAll`);
  }

  getById(id: string) {
    return this.http.get<BookDTO>(`${baseUrl}/GetById?id=${id}`);
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

  attachTxtFile(base64String){
    //let httpParams = new HttpParams();
    //let body = httpParams.set('base64String', base64String);
    //console.log(body);

    return this.http.post<string>(`${environment.apiUrl}/api/Attachments/AttachTxtFile`, base64String);
  }
}
