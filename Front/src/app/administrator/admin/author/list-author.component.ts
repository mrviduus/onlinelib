import { Component, OnInit } from '@angular/core';
import { AuthorService } from '@app/_services';
import { first } from 'rxjs/operators';
import { environment } from '@environments/environment';

@Component({
  selector: 'app-list-author',
  templateUrl: './list-author.component.html',
  styleUrls: ['./list-author.component.less']
})
export class ListAuthorComponent implements OnInit {
  baseUrl =  `${environment.apiUrl}/`;
  authors: any[];
  
  constructor(private authorService : AuthorService) { }

  ngOnInit(): void {
    this.authorService.getAll()
        .pipe(first())
        .subscribe(authors => this.authors = authors);
  }

  deleteAuthor(id: string) {
    const author = this.authors.find(x => x.id === id);
    author.isDeleting = true;
    this.authorService.delete(id)
        .pipe(first())
        .subscribe(() => {
            this.authors = this.authors.filter(x => x.id !== id) 
        });
  }

}
