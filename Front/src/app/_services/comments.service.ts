import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, finalize } from 'rxjs/operators';
import { environment } from '@environments/environment';
import { CommentDto } from '@app/_models/admin/commentDTO';

const baseUrl = `${environment.apiUrl}/admin`;

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
    return this.http.get<CommentDto[]>(`${baseUrl}/GetComments`);
  }

  getById(id: string) {
    return this.http.get<CommentDto>(`${baseUrl}/GetComment?id=${id}`);
  }

  create(params) {
    return this.http.post(`${baseUrl}/CreateComment`, params);
  }

  update(params) {
    return this.http.post(`${baseUrl}/UpdateComment`, params);
  }

  delete(id: string){
    return this.http.delete(`${baseUrl}/DeleteComment?id=${id}`);
  }
}
