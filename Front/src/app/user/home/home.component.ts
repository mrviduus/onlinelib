import { Component, OnInit } from '@angular/core';
import { HomeService } from '@app/_services/public';
import { first } from 'rxjs/operators';
import { environment } from '@environments/environment';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.less']
})
export class HomeComponent implements OnInit {
  baseUrl =  `${environment.apiUrl}/`;
  books: any[]; 
  constructor(private homeService: HomeService ) { }


  ngOnInit(): void {
    this.homeService.getAllBooks()
        .pipe(first())
        .subscribe((value) => {
          this.books = value;
        });        
  }

}
