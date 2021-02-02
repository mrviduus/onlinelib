using AutoMapper;
using OnlineLib.Common;
using OnlineLib.Common.Extensions;
using OnlineLib.Interfaces.Common;
using OnlineLib.Interfaces.Managers.Admin;
using OnlineLib.Models.Dto;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;

namespace OnlineLib.BusinessLogic.Managers.Admin
{
    public class CommentManager : ICommentManager
    {
        private readonly IUnitOfWork Uow;
        private readonly IMapper mapper;

        public CommentManager(
            IUnitOfWork Uow,
            IMapper mapper)
        {
            this.Uow = Uow;
            this.mapper = mapper;
        }

        public async Task CreateOrUpdate(CommentDTO dto)
        {
            var entity = this.mapper.Map<Comment>(dto);

            ThrowIf.Null(entity, nameof(entity));

            this.Uow.CommentsRepository.InsertOrUpdate(entity);
            this.Uow.Save();
        }

        public async Task Delete(Guid id)
        {
            ThrowIf.Null(id, nameof(id));
            this.Uow.CommentsRepository.Delete(id);
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

        public async Task<IEnumerable<CommentDTO>> GetAll()
        {
            var comments = this.Uow.CommentsRepository.Get();

            return this.mapper.Map<IEnumerable<CommentDTO>>(comments);
        }

        public async Task<CommentDTO> GetById(Guid id)
        {
            var entity = id != null ? this.Uow.CommentsRepository.GetByID(id) : throw new ArgumentNullException();

            return this.mapper.Map<CommentDTO>(entity);
        }
    }
}
