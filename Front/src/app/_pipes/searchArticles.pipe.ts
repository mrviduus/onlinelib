import {Pipe, PipeTransform} from '@angular/core';
import { ArticleDto } from '../_models/admin/articleDto'

@Pipe({
    name: 'searchArticles'
})
export class SearchArticlesPipe implements PipeTransform{
transform(articles: ArticleDto[], search = ''): ArticleDto[]{
    if(!search.trim()){
        return articles;
    }

    return articles.filter(article => {
        return article.pageName.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    })
}
}