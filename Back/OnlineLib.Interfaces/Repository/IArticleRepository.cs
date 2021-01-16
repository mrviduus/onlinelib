using OnlineLib.Interfaces.Common;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Interfaces.Repository
{
    public interface IArticleRepository : IGenericRepository<Article, Guid>
    {
    }
}
