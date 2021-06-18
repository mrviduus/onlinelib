import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '@environments/environment';
import { AuthorDTO } from '@app/_models/admin/authorDTO';

const baseUrl = `${environment.apiUrl}/api/Author`;

@Injectable({
  providedIn: 'root'
})
export class AuthorService {
  private authorSubject: BehaviorSubject<AuthorDTO>;
  public author: Observable<AuthorDTO>;

  constructor(
      private router: Router,
      private http: HttpClient
  ) {
      this.authorSubject = new BehaviorSubject<AuthorDTO>(null);
      this.author = this.authorSubject.asObservable();
  }

  public get authorValue(): AuthorDTO {
    return this.authorSubject.value;
  }

  getAll() {
    return this.http.get<AuthorDTO[]>(`${baseUrl}/GetAll`);
  }

  getById(id: string) {
    return this.http.get<AuthorDTO>(`${baseUrl}/GetById?id=${id}`);
  }
}
