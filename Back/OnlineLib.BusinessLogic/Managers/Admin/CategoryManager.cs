using AutoMapper;
using OnlineLib.Common;
using OnlineLib.Domain.Models;
using OnlineLib.Interfaces.Common;
using OnlineLib.Interfaces.Managers.Admin;
using OnlineLib.Models.Dto;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace OnlineLib.BusinessLogic.Managers.Admin
{
    public class CategoryManager : ICategoryManager
    {
        private readonly IUnitOfWork Uow;
        private readonly IMapper mapper;

        public CategoryManager(
            IUnitOfWork Uow,
            IMapper mapper)
        {
            this.Uow = Uow;
            this.mapper = mapper;
        }

        public async Task CreateOrUpdate(CategoryDTO dto)
        {
            var entity = this.mapper.Map<Category>(dto);

            ThrowIf.Null(entity, nameof(entity));

            this.Uow.CategoryRepository.InsertOrUpdate(entity);
            this.Uow.Save();
        }

        public async Task Delete(Guid id)
        {
            ThrowIf.Null(id, nameof(id));
            this.Uow.CategoryRepository.Delete(id);
            this.Uow.Save();
        }

        public async Task<IEnumerable<CategoryDTO>> GetAll()
        {
            var categories = this.Uow.CategoryRepository.Get();
            return this.mapper.Map<IEnumerable<CategoryDTO>>(categories);
        }

        public async Task<PaginatedList<CategoryDTO>> PaginatedCategory(int pageIndex, int pageSize)
        {
            var categories = await this.Uow.CategoryRepository.ToPaginatedListAsync(pageIndex, pageSize);

            return new PaginatedList<CategoryDTO>
            {
                PageIndex = categories.PageIndex,
                PageSize = categories.PageSize,
                TotalPages = categories.TotalPages,
                Items = this.mapper.Map<IEnumerable<CategoryDTO>>(categories.Items)
            };
        }

        public async Task<CategoryDTO> GetById(Guid id)
        {
            var entity = id != null ? this.Uow.CategoryRepository.GetByID(id) : throw new ArgumentNullException();
            return this.mapper.Map<CategoryDTO>(entity);
        }
    }
}
