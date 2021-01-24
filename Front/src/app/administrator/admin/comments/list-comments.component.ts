import { Component, OnInit } from '@angular/core';
import { CommentDto } from '@app/_models/admin/commentDTO';
import { CommentsService } from '@app/_services';
import { first } from 'rxjs/operators';


@Component({
  selector: 'app-list-comments',
  templateUrl: './list-comments.component.html',
  styleUrls: ['./list-comments.component.less']
})
export class ListCommentsComponent implements OnInit {
  comments: any[];
  searchComments = '';
  //pagination
  p: number =1;
  totalLength: number;
  perPage = 5;



  constructor(private commentsService : CommentsService) { }

  ngOnInit(): void {
    this.commentsService.getAll()
        .pipe(first())
        .subscribe((value) => {
          this.comments = value;
          this.totalLength = value.length; 
        });        
  }

  deletComment(id: string) {
    const comment = this.comments.find(x => x.id === id);
    comment.isDeleting = true;
    this.commentsService.delete(id)
        .pipe(first())
        .subscribe(() => {
            this.comments = this.comments.filter(x => x.id !== id) 
        });
  }

}
