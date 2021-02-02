using OnlineLib.Interfaces.Repository;
using System;

namespace OnlineLib.Interfaces.Common
{
    public interface IUnitOfWork : IDisposable
    {
        IAccountRepository AccountRepository { get; }

        ICategoryRepository CategoryRepository { get; }

        IArticleRepository ArticleRepository { get; }

        ITagRepository TagRepository { get; }

        IArticleTagRepository ArticleTagRepository { get; }

        IArticleSEORepository ArticleSEORepository { get; }

        ICommentsRepository CommentsRepository { get; }

        IAuthorRepository AuthorRepository { get; }

        IBookRepository BookRepository { get; }

        IBookSEORepository BookSEORepository { get; }

        IBookTagRepository BookTagRepository { get; }

        void Save();
    }
}
