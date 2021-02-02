using AutoMapper;
using OnlineLib.Common;
using OnlineLib.Domain.DTO.Book;
using OnlineLib.Domain.Entities.Book;
using OnlineLib.Interfaces.Common;
using OnlineLib.Interfaces.Managers.Admin;
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;

namespace OnlineLib.BusinessLogic.Managers.Admin
{
    public class AuthorManager : IAuthorManager
    {
        private readonly IUnitOfWork Uow;
        private readonly IMapper mapper;

        public AuthorManager(
            IUnitOfWork Uow,
            IMapper mapper)
        {
            this.Uow = Uow;
            this.mapper = mapper;
        }

        public async Task CreateOrUpdate(AuthorDTO DTO)
        {
            var entity = this.mapper.Map<Author>(DTO);

            ThrowIf.Null(entity, nameof(entity));

            this.Uow.AuthorRepository.InsertOrUpdate(entity);
            this.Uow.Save();
        }

        public async Task Delete(Guid id)
        {
            ThrowIf.Null(id, nameof(id));

            this.Uow.AuthorRepository.Delete(id);
            this.Uow.Save();
        }

        public async Task<IEnumerable<AuthorDTO>> GetAll()
        {
            var authors = this.Uow.AuthorRepository.Get();
            return this.mapper.Map<IEnumerable<AuthorDTO>>(authors);
        }

        public async Task<AuthorDTO> GetById(Guid id)
        {
            var entity = id != null ? this.Uow.AuthorRepository.GetByID(id) : throw new ArgumentNullException();
            return this.mapper.Map<AuthorDTO>(entity);
        }
    }
}
