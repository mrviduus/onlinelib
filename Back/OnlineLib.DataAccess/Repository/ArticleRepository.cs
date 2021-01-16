using OnlineLib.DataAccess.Common;
using OnlineLib.Interfaces.Repository;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.DataAccess.Repository
{
    /// <summary>
    /// Article commands
    /// </summary>
    internal class ArticleRepository : GenericRepository<Article, Guid>, IArticleRepository
    {
        public ArticleRepository(ApplicationDatabaseContext context)
            : base(context)
        {
        }
    }
}