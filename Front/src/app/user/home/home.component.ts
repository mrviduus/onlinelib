import { Component, OnInit } from '@angular/core';
import { HomeService } from '@app/_services';
import { first } from 'rxjs/operators';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.less']
})
export class HomeComponent implements OnInit {
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
