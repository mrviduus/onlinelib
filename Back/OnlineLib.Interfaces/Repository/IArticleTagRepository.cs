using OnlineLib.Interfaces.Common;
using OnlineLib.Models.Entities;
using System;

namespace OnlineLib.Interfaces.Repository
{
    public interface IArticleTagRepository : IGenericRepository<ArticleTag, Guid>
    {
    }
}
