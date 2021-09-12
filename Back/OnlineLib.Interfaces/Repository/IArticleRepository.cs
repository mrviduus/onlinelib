using OnlineLib.Interfaces.Common;
using OnlineLib.Models.Models;
using System;

namespace OnlineLib.Interfaces.Repository
{
    public interface IArticleRepository : IGenericRepository<Article, Guid>
    {
    }
}
