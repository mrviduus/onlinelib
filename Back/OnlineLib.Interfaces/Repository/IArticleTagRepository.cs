using System;
using OnlineLib.Interfaces.Common;
using OnlineLib.Models.Entities;

namespace OnlineLib.Interfaces.Repository
{
    public interface IArticleTagRepository : IGenericRepository<ArticleTag, Guid>
    {
    }
}
