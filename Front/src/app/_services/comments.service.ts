import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, finalize } from 'rxjs/operators';
import { environment } from '@environments/environment';
import { CommentDto } from '@app/_models/admin/commentDTO';

const baseUrl = `${environment.apiUrl}/admin/Comment`;

@Injectable({
  providedIn: 'root'
})
export class CommentsService {
  private commentSubject: BehaviorSubject<CommentDto>;
  public comment: Observable<CommentDto>;


  constructor(
    private router: Router,
    private http: HttpClient
  ) {
    this.commentSubject = new BehaviorSubject<CommentDto>(null);
    this.comment = this.commentSubject.asObservable();
   }

  getAll() {
    return this.http.get<CommentDto[]>(`${baseUrl}/GetAll`);
  }

  getById(id: string) {
    return this.http.get<CommentDto>(`${baseUrl}/GetById?id=${id}`);
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
