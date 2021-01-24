import {Pipe, PipeTransform} from '@angular/core';
import { CommentDto } from '../_models/admin/commentDTO'

@Pipe({
    name: 'searchComments'
})
export class SearchCommentsPipe implements PipeTransform{
transform(comments: CommentDto[], search = ''): CommentDto[]{
    if(!search.trim()){
        return comments;
    }

    return comments.filter(comment => {
        return comment.content.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    })
}
}