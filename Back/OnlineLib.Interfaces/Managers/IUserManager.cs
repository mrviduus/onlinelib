using OnlineLib.Models.Dto;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace OnlineLib.Interfaces.Managers
{
    public interface IUserService
    {
        Task<LocalizedArticleDto> GetLocalizedArticle(Guid id, string cultureCode);

        Task<LocalizedArticleDto> GetLocalizedArticle(string pageName, string cultureCode);

        Task Like(int id, bool isLike = true);

        Task<IEnumerable<CategoryArticlesDto>> GetCategoryArticles(string cultureCode);

        //Task<PagedResult<LocalizedArticleDto>> GetArticles(string cultureCode, PagingQuery pagingQuery);

        Task<IEnumerable<ArticleSEODto>> GetArticleSEOs();
    }
}
