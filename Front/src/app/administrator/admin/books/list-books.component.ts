import { Component, OnInit } from '@angular/core';
import { BooksService } from '@app/_services';
import { first } from 'rxjs/operators';
import { environment } from '@environments/environment';


@Component({
  selector: 'app-list-books',
  templateUrl: './list-books.component.html',
  styleUrls: ['./list-books.component.less']
})
export class ListBooksComponent implements OnInit {
  baseUrl =  `${environment.apiUrl}/`;
  books: any[];
  searchBooks = '';
  //pagination
  p: number =1;
  totalLength: number;
  perPage = 5;



  constructor(private booksService : BooksService) { }

  ngOnInit(): void {
    this.booksService.getAll()
        .pipe(first())
        .subscribe((value) => {
          this.books = value;
          this.totalLength = value.length; 
        });        
  }

  deleteCategory(id: string) {
    const books = this.books.find(x => x.id === id);
    books.isDeleting = true;
    this.booksService.delete(id)
        .pipe(first())
        .subscribe(() => {
            this.books = this.books.filter(x => x.id !== id) 
        });
  }

}
