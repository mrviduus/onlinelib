using OnlineLib.DataAccess.Common;
using OnlineLib.Interfaces.Repository;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.DataAccess.Repository
{
    internal class ArticleSEORepository : GenericRepository<ArticleSEO, Guid>, IArticleSEORepository
    {
        public ArticleSEORepository(ApplicationDatabaseContext context)
            : base(context)
        {
        }
    }
}
