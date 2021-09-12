using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using OnlineLib.Domain.Models;
using OnlineLib.Models.Dto;

namespace OnlineLib.Interfaces.Managers.Admin
{
    public interface ICategoryManager : IAdminManagerRepository<CategoryDTO, Guid>
    {
        Task<PaginatedList<CategoryDTO>> PaginatedCategory(int pageIndex, int pageSize);
    }
}
