import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HomeService } from '@app/_services';
import { first } from 'rxjs/operators';

@Component({
  selector: 'app-book-page',
  templateUrl: './book-page.component.html',
  styleUrls: ['./book-page.component.less']
})
export class BookPageComponent implements OnInit {
  
  id: string;
  img: any;
  tittle: string;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private homeService: HomeService
    ) { }

  ngOnInit(): void {
    this.id = this.route.snapshot.params['id'];
    this.homeService.getById(this.id)
    .pipe(first())
    .subscribe((x) => {
        this.img = x.cover;
        this.tittle = x.title;
        //this.modelDataPicker =  this.ngbDateParserFormatter.parse(x.year.toString());
    });
  }

}
