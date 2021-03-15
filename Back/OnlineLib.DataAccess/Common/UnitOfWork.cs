using OnlineLib.DataAccess.Repository;
using OnlineLib.Interfaces.Common;
using OnlineLib.Interfaces.Repository;
using System;

namespace OnlineLib.DataAccess.Common
{
    internal class UnitOfWork : IUnitOfWork
    {
        private ApplicationDatabaseContext Context;

        public UnitOfWork(ApplicationDatabaseContext context)
        {
            this.Context = context;
        }

        public IAccountRepository AccountRepository => new AccountRepository(this.Context);

        public ICategoryRepository CategoryRepository => new CategoryRepository(this.Context);

        public IArticleRepository ArticleRepository => new ArticleRepository(this.Context);

        public ITagRepository TagRepository => new TagRepository(this.Context);

        public IArticleTagRepository ArticleTagRepository => new ArticleTagRepository(this.Context);

        public IArticleSEORepository ArticleSEORepository => new ArticleSEORepository(this.Context);

        public ICommentsRepository CommentsRepository => new CommentsRepository(this.Context);

        public IAuthorRepository AuthorRepository => new AuthorRepository(this.Context);

        public IBookRepository BookRepository => new BookRepository(this.Context);

        public IBookSEORepository BookSEORepository => new BookSEORepository(this.Context);

        public IBookTagRepository BookTagRepository => new BookTagRepository(this.Context);

        public void Save()
        {
            this.Context.SaveChangesAsync();
        }

        private bool disposed = false;

        protected virtual void Dispose(bool disposing)
        {
            if (!this.disposed)
            {
                if (disposing)
                {
                    this.Context.Dispose();
                }
            }
            this.disposed = true;
        }

        public void Dispose()
        {
            Dispose(true);
            GC.SuppressFinalize(this);
        }
    }
}
