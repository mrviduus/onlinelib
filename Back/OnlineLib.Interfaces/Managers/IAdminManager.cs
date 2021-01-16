using OnlineLib.Models.Dto;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;

namespace OnlineLib.Interfaces.Managers
{
    public interface IAdminManager
    {
        #region Category Operations

        Task CreateOrUpdateCategory(CategoryDto category);

        Task DeleteCategories(List<Guid> categoriesToBeDeleted);

        Task DeleteCategory(Guid categoryToBeDeleted);

        Task<CategoryDto> GetCategory(Guid id);

        Task<IEnumerable<CategoryDto>> GetCategories();

        #endregion Category Operations

        #region Article Operations

        Task CreateOrUpdateArticle(ArticleDto dto);

        Task DeleteArticle(Guid id);

        Task<ArticleDto> GetArticle(Guid id);

        Task<IEnumerable<ArticleDto>> GetArticles();

        //Task<PagedResult<ArticleDto>> GetPagedArticles(PagingQuery pagingQuery);
        Task<ArticleDto> GetPagedArticles();

        Task<IEnumerable<CategoryDto>> GetArticleCategories();

        #endregion Article Operations

        #region Comments

        Task<CommentDto> GetComment(Guid id);

        Task<IEnumerable<CommentDto>> GetComments();

        Task CreateOrUpdateComment(CommentDto commentDto);

        Task DeleteComments(List<Guid> ids);

        #endregion Comments

        #region Tags Operations

        Task<IEnumerable<string>> GetPublicTags();

        #endregion Tags Operations
    }
}
