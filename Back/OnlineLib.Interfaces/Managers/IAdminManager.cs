using OnlineLib.Domain.DTO.Book;
using OnlineLib.Models.Dto;
using System;
using System.Collections.Generic;
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

        Task DeleteComment(Guid id);

        #endregion Comments

        #region Tags Operations

        Task<IEnumerable<string>> GetPublicTags();

        #endregion Tags Operations

        #region Author Operation

        Task CreateOrUpdateAuthor(AuthorDTO author);

        Task DeleteAuthor(Guid id);

        Task<AuthorDTO> GetAuthor(Guid id);

        Task<IEnumerable<AuthorDTO>> GetAuthors();

        #endregion Author Operation

        #region Book Operation

        Task CreateOrUpdateBook(BookDTO dto);

        Task DeleteBook(Guid id);

        Task<BookDTO> GetBook(Guid id);

        Task<IEnumerable<BookDTO>> GetBooks();
        #endregion Book Operation
    }
}
