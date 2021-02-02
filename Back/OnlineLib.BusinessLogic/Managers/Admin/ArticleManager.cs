using AutoMapper;
using OnlineLib.Common;
using OnlineLib.Common.Extensions;
using OnlineLib.Interfaces.Common;
using OnlineLib.Interfaces.Managers.Admin;
using OnlineLib.Models.Dto;
using OnlineLib.Models.Entities;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace OnlineLib.BusinessLogic.Managers.Admin
{
    public class ArticleManager : IArticleManager
    {
        private readonly IUnitOfWork Uow;
        private readonly IMapper mapper;

        public ArticleManager(
            IUnitOfWork Uow,
            IMapper mapper)
        {
            this.Uow = Uow;
            this.mapper = mapper;
        }

        public async Task CreateOrUpdate(ArticleDTO dto)
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

        public async Task Delete(Guid id)
        {
            ThrowIf.Null(id, nameof(id));
            this.Uow.ArticleRepository.Delete(id);
            this.Uow.Save();
        }

        public async Task<IEnumerable<ArticleDTO>> GetAll()
        {
            var articles = this.Uow.ArticleRepository.Get();
            return this.mapper.Map<IEnumerable<ArticleDTO>>(articles);
        }

        public async Task<ArticleDTO> GetById(Guid id)
        {
            var entity = this.Uow.ArticleRepository.GetByID(id);

            ThrowIf.Null(entity, nameof(entity));

            var dto = this.mapper.Map<ArticleDTO>(entity);

            var articleTagIds = this.Uow.ArticleTagRepository.Get(entity => entity.SourceId == id).Select(x => x.TargetId).ToList();
            var tags = this.Uow.TagRepository.Get().Where(x => articleTagIds.Contains(x.Id)).Select(x => x.Name);
            if (tags.Any())
            {
                dto.Tags = string.Join(",", tags);
            }

            return dto;
        }
    }
}
