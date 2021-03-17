import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '@environments/environment';

const baseUrl = `${environment.apiUrl}/api/Attachments`;

@Injectable({
  providedIn: 'root'
})
export class AttachmentsService {

  constructor(private http: HttpClient) { }

  attachTxtFile(base64TxtFile){
    return this.http.post<string>(`${baseUrl}/AttachTxtFile`, base64TxtFile);
  }

  attachImgFile(base64ImgFile){
    return this.http.post<string>(`${baseUrl}/AttachImageFile`, base64ImgFile);
  }
}
