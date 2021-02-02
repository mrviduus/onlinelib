using OnlineLib.Models.Dto;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Interfaces.Managers.Admin
{
    public interface IArticleManager : IAdminManagerRepository<ArticleDTO, Guid>
    {
    }
}
