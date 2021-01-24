using AutoMapper;
using OnlineLib.Common;
using OnlineLib.Common.Extensions;
using OnlineLib.DataAccess;
using OnlineLib.Interfaces.Common;
using OnlineLib.Interfaces.Managers;
using OnlineLib.Models.Dto;
using OnlineLib.Models.Entities;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace OnlineLib.BusinessLogic.Managers
{
    public class AdminManager : IAdminManager
    {
        private readonly IUnitOfWork Uow;
        private readonly IMapper mapper;

        #region ctor
        public AdminManager(
            IUnitOfWork Uow,
            IMapper mapper)
        {
            this.Uow = Uow;
            this.mapper = mapper;
        }

        #endregion ctor

        #region Category Operations

        public async Task<IEnumerable<CategoryDto>> GetCategories()
        {
            var categories = this.Uow.CategoryRepository.Get();
            var result = this.mapper.Map<IEnumerable<CategoryDto>>(categories);

            return result;
        }

        public async Task<CategoryDto> GetCategory(Guid id)
        {
            var entity = id != null ? this.Uow.CategoryRepository.GetByID(id) : throw new ArgumentNullException();
            return this.mapper.Map<CategoryDto>(entity);
        }

        public async Task CreateOrUpdateCategory(CategoryDto dto)
        {
            var entity = this.mapper.Map<Category>(dto);

            ThrowIf.Null(entity, nameof(entity));

            this.Uow.CategoryRepository.InsertOrUpdate(entity);
            this.Uow.Save();
        }

        public async Task DeleteCategories(List<Guid> categoriesToBeDeleted)
        {
            if (categoriesToBeDeleted.IsNotNullOrEmpty())
            {
                this.Uow.CategoryRepository.DeleteCategories(categoriesToBeDeleted);
                this.Uow.Save();
            }
        }

        public async Task DeleteCategory(Guid categoryToBeDeleted)
        {
            ThrowIf.Null(categoryToBeDeleted, nameof(categoryToBeDeleted));
            this.Uow.CategoryRepository.Delete(categoryToBeDeleted);
            this.Uow.Save();
        }

        #endregion Category Operations

        #region Article Operations

        public async Task CreateOrUpdateArticle(ArticleDto dto)
        {
            var entity = this.mapper.Map<Article>(dto);

            ThrowIf.Null(entity, nameof(entity));

            this.Uow.ArticleRepository.InsertOrUpdate(entity);

            var tagEntities = new List<Tag>();
            if (dto.Tags.IsNotNullOrEmpty())
            {
                var tags = dto.Tags.Split(new char[] { ',' });
                foreach (var tag in tags)
                {
                    var tagEntity = this.Uow.TagRepository.Get(entity => entity.Name == tag && entity.TagType == TagType.Public).FirstOrDefault();
                    if (tagEntity == null)
                    {
                        tagEntity = new Tag() { Id = Guid.NewGuid(), TagType = TagType.Public, Name = tag };
                        this.Uow.TagRepository.Insert(tagEntity);
                        tagEntities.Add(tagEntity);
                    }
                }
            }

            var associatedTags = this.Uow.ArticleTagRepository.Get(entity => entity.SourceId == dto.Id)
                .Select(x => x.TargetId).ToList();
            var tagsToBeDeleted = associatedTags.Where(x => tagEntities.Any(tag => tag.Id == x) == false);
            var tagsNeedToBeAdded = tagEntities.Where(x => associatedTags.Contains(x.Id) == false);
            var articleSEO = this.Uow.ArticleSEORepository.Get(x => x.ArticleId == entity.Id).FirstOrDefault();

            if (tagsToBeDeleted.Any())
            {
                foreach (var tagId in tagsToBeDeleted)
                {
                    var articleTag = this.Uow.ArticleTagRepository.Get(x => x.TargetId == tagId).SingleOrDefault();
                    this.Uow.ArticleTagRepository.Delete(articleTag);
                }
            }

            if (tagsNeedToBeAdded.Any())
            {
                foreach (var tagId in tagsNeedToBeAdded)
                {
                    var association = new ArticleTag { Id = Guid.NewGuid() };
                    association.SourceId = entity.Id;
                    association.TargetId = tagId.Id;
                    this.Uow.ArticleTagRepository.Insert(association);
                }
            }

            if (dto.IsPublished)
            {
                if (articleSEO == null)
                {
                    this.Uow.ArticleSEORepository.Insert(new ArticleSEO
                    {
                        ArticleId = entity.Id,
                        Description = dto.Summary,
                        Image = dto.Cover,
                        Keywords = dto.Tags,
                        Locale = dto.ContentLanguage,
                        PageName = dto.PageName,
                        Title = dto.Title,
                    });
                }
                else
                {
                    articleSEO.Description = dto.Summary;
                    articleSEO.Image = dto.Cover;
                    articleSEO.Keywords = dto.Tags;
                    articleSEO.Locale = dto.ContentLanguage;
                    articleSEO.PageName = dto.PageName;
                    articleSEO.Title = dto.Title;

                    this.Uow.ArticleSEORepository.Update(articleSEO);
                }
            }
            else
            {
                if (articleSEO != null)
                {
                    this.Uow.ArticleSEORepository.Delete(articleSEO.Id);
                }
            }

            this.Uow.Save();
        }

        public async Task DeleteArticle(Guid id)
        {
            ThrowIf.Null(id, nameof(id));
            this.Uow.ArticleRepository.Delete(id);
            this.Uow.Save();
        }

        public async Task<ArticleDto> GetArticle(Guid id)
        {
            var entity = this.Uow.ArticleRepository.GetByID(id);

            ThrowIf.Null(entity, nameof(entity));

            var dto = this.mapper.Map<ArticleDto>(entity);

            var articleTagIds = this.Uow.ArticleTagRepository.Get(entity => entity.SourceId == id).Select(x => x.TargetId).ToList();
            var tags = this.Uow.TagRepository.Get().Where(x => articleTagIds.Contains(x.Id)).Select(x => x.Name);
            if (tags.Any())
            {
                dto.Tags = string.Join(",", tags);
            }

            return dto;
        }

        public async Task<IEnumerable<CategoryDto>> GetArticleCategories()
        {
            var ids = Enumerable.Select(this.Uow.ArticleRepository.Get(), x => x.CategoryId).Distinct().ToList();
            if (ids.IsNotNullOrEmpty())
            {
                return Array.Empty<CategoryDto>();
            }

            var entities = this.Uow.CategoryRepository.Get(x => ids.Contains(x.Id));
            return this.mapper.Map<IEnumerable<CategoryDto>>(entities);
        }

        public async Task<IEnumerable<ArticleDto>> GetArticles()
        {
            var articles = this.Uow.ArticleRepository.Get();
            return this.mapper.Map<IEnumerable<ArticleDto>>(articles);
        }

        public Task<ArticleDto> GetPagedArticles()
        {
            throw new NotImplementedException();
        }

        #endregion Article Operations

        #region Comment Operations
        public async Task CreateOrUpdateComment(CommentDto dto)
        {
            var entity = this.mapper.Map<Comment>(dto);

            ThrowIf.Null(entity, nameof(entity));

            this.Uow.CommentsRepository.InsertOrUpdate(entity);
            this.Uow.Save();
        }

        public async Task DeleteComments(List<Guid> ids)
        {
            if (ids.IsNotNullOrEmpty())
            {
                this.Uow.CommentsRepository.DeleteComments(ids);
                this.Uow.Save();
            }
        }

        public async Task DeleteComment(Guid id)
        {
            ThrowIf.Null(id, nameof(id));
            this.Uow.CommentsRepository.Delete(id);
            this.Uow.Save();
        }

        public async Task<CommentDto> GetComment(Guid id)
        {
            var entity = id != null ? this.Uow.CommentsRepository.GetByID(id) : throw new ArgumentNullException();

            return this.mapper.Map<CommentDto>(entity);
        }

        public async Task<IEnumerable<CommentDto>> GetComments()
        {
            var comments = this.Uow.CommentsRepository.Get();

            return this.mapper.Map<IEnumerable<CommentDto>>(comments);
        }
        #endregion Comment Operations

        #region Tags Operation
        public async Task<IEnumerable<string>> GetPublicTags()
        {
            return this.Uow.TagRepository.Get(x => x.TagType == TagType.Public).Select(x => x.Name);
        }

        #endregion Tags Operations
    }
}
