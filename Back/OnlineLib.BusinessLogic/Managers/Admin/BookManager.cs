using AutoMapper;
using OnlineLib.Common;
using OnlineLib.Common.Extensions;
using OnlineLib.Domain.DTO.Book;
using OnlineLib.Domain.Entities.Book;
using OnlineLib.Interfaces.Common;
using OnlineLib.Interfaces.Managers.Admin;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace OnlineLib.BusinessLogic.Managers.Admin
{
    public class BookManager : IBookManager
    {
        private readonly IUnitOfWork Uow;
        private readonly IMapper mapper;

        public BookManager(
            IUnitOfWork Uow,
            IMapper mapper)
        {
            this.Uow = Uow;
            this.mapper = mapper;
        }

        public async Task CreateOrUpdate(BookDTO dto)
        {
            var entity = this.mapper.Map<Book>(dto);

            ThrowIf.Null(entity, nameof(entity));

            this.Uow.BookRepository.InsertOrUpdate(entity);

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

            var associatedTags = this.Uow.BookTagRepository.Get(entity => entity.SourceId == dto.Id)
                .Select(x => x.TargetId).ToList();
            var tagsToBeDeleted = associatedTags.Where(x => tagEntities.Any(tag => tag.Id == x) == false);
            var tagsNeedToBeAdded = tagEntities.Where(x => associatedTags.Contains(x.Id) == false);
            var bookSEO = this.Uow.BookSEORepository.Get(x => x.BookId == entity.Id).FirstOrDefault();

            if (tagsToBeDeleted.Any())
            {
                foreach (var tagId in tagsToBeDeleted)
                {
                    var bookTag = this.Uow.BookTagRepository.Get(x => x.TargetId == tagId).SingleOrDefault();
                    this.Uow.BookTagRepository.Delete(bookTag);
                }
            }

            if (tagsNeedToBeAdded.Any())
            {
                foreach (var tagId in tagsNeedToBeAdded)
                {
                    var association = new BookTag { Id = Guid.NewGuid() };
                    association.SourceId = entity.Id;
                    association.TargetId = tagId.Id;
                    this.Uow.BookTagRepository.Insert(association);
                }
            }

            if (dto.IsPublished)
            {
                if (bookSEO == null)
                {
                    this.Uow.BookSEORepository.Insert(new BookSEO
                    {
                        BookId = entity.Id,
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
                    bookSEO.Description = dto.Summary;
                    bookSEO.Image = dto.Cover;
                    bookSEO.Keywords = dto.Tags;
                    bookSEO.Locale = dto.ContentLanguage;
                    bookSEO.PageName = dto.PageName;
                    bookSEO.Title = dto.Title;

                    this.Uow.BookSEORepository.Update(bookSEO);
                }
            }
            else
            {
                if (bookSEO != null)
                {
                    this.Uow.BookSEORepository.Delete(bookSEO.Id);
                }
            }

            this.Uow.Save();
        }

        public async Task Delete(Guid id)
        {
            ThrowIf.Null(id, nameof(id));
            this.Uow.BookRepository.Delete(id);
            this.Uow.Save();
        }

        public async Task<IEnumerable<BookDTO>> GetAll()
        {
            var books = this.Uow.BookRepository.Get();
            return this.mapper.Map<IEnumerable<BookDTO>>(books);
        }

        public async Task<BookDTO> GetById(Guid id)
        {
            var entity = id != null ? this.Uow.BookRepository.GetByID(id) : throw new ArgumentNullException();
            List<Guid> bookTagsId = this.Uow.BookTagRepository.Get().Select(x => x.TargetId).ToList();
            var dto = this.mapper.Map<BookDTO>(entity);
            if (bookTagsId.IsNotNullOrEmpty())
            {
                var tags = this.Uow.TagRepository.TagsWithIds(bookTagsId);
                dto.Tags = string.Join(",", tags);
            }

            return dto;
        }

    }
}
