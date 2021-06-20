import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthorDTO } from '@app/_models/admin/authorDTO';
import { BookDTO } from '@app/_models/admin/bookDto';
import { HomeService, AuthorService } from '@app/_services/public';
import { first } from 'rxjs/operators';
import { environment } from '@environments/environment';

@Component({
  selector: 'app-book-page',
  templateUrl: './book-page.component.html',
  styleUrls: ['./book-page.component.less']
})
export class BookPageComponent implements OnInit {
  //for img
  baseUrl =  `${environment.apiUrl}/`;
  id: string;
  book: BookDTO;
  author: AuthorDTO;

  constructor(
    private route: ActivatedRoute,
    private homeService: HomeService,
    private authorService: AuthorService
    ) { }

  ngOnInit(): void {
    this.id = this.route.snapshot.params['id'];
    this.homeService.getById(this.id)
    .pipe(first())
    .subscribe((x) => {
      this.book = x;
      this.getAuthorById(x.authorId);
    });
  }

  getAuthorById(id: string) {
    this.authorService.getById(id)
    .pipe(first())
    .subscribe((x) => {
      this.author = x;
    });
  }

}
