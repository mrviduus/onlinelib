import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BookDTO } from '@app/_models/admin/bookDto';
import { HomeService} from '@app/_services/public';
import { first } from 'rxjs/operators';

@Component({
  selector: 'app-reader',
  templateUrl: './reader.component.html',
  styleUrls: ['./reader.component.less']
})
export class ReaderComponent implements OnInit {
  id: string;
  book: BookDTO;
  
  constructor(
    private route: ActivatedRoute,
    private homeService: HomeService,
  ) { }

  ngOnInit(): void {
    this.id = this.route.snapshot.params['id'];
    this.homeService.getById(this.id)
    .pipe(first())
    .subscribe((x) => {
      this.book = x;
    });
  }

}
