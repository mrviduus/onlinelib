using OnlineLib.DataAccess.Common;
using OnlineLib.Interfaces.Repository;
using OnlineLib.Models.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.DataAccess.Repository
{
    internal class ArticleTagRepository : GenericRepository<ArticleTag, Guid>, IArticleTagRepository
    {
        public ArticleTagRepository(ApplicationDatabaseContext context)
            : base(context)
        {
        }
    }
}
