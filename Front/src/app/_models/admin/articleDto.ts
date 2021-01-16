export class ArticleDto { 
    id?: string;
    title?: string;
    summary?: string;
    htmlContent?: string;
    markdownContent?: string;
    categoryId?: string;
    author?: string;
    tags?: string;
    isPublished?: boolean;
    creationTime?: Date;
    pageName?: string;
    cover?: string;
    contentLanguage?: string;
    views?: number;
    likes?: number;
    commentsCount?: number;
}