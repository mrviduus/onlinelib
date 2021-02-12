import {Pipe, PipeTransform} from '@angular/core';
import { BookDTO } from '../_models/admin/bookDto'

@Pipe({
    name: 'searchBooks'
})
export class SearchBooksPipe implements PipeTransform{
transform(books: BookDTO[], search = ''): BookDTO[]{
    if(!search.trim()){
        return books;
    }

    return books.filter(books => {
        return books.pageName.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    })
}
}