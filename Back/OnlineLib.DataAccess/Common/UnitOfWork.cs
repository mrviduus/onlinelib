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

        public void Save()
        {
            this.Context.SaveChanges();
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
