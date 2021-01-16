using OnlineLib.Interfaces.Repository;
using System;
using System.Collections.Generic;
using System.Text;

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

        void Save();
    }
}
