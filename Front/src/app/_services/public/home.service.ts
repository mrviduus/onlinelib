import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@environments/environment';
import { text } from '@fortawesome/fontawesome-svg-core';
import { BookDTO } from '@app/_models/admin/bookDto';
import { BehaviorSubject, Observable } from 'rxjs';

const baseUrl = `${environment.apiUrl}/api/Home`;

@Injectable({
  providedIn: 'root'
})
export class HomeService {
  private bookSubject: BehaviorSubject<BookDTO>;
  public book: Observable<BookDTO>;

  constructor(private http: HttpClient) 
  {
    this.bookSubject = new BehaviorSubject<BookDTO>(null);
    this.book = this.bookSubject.asObservable();

   }

  getAllBooks(){
    return this.http.get<BookDTO[]>(`${baseUrl}/GetAllBooks`);
  }

  getById(id: string) {
    return this.http.get<BookDTO>(`${baseUrl}/GetBookById?id=${id}`);
  }

}
