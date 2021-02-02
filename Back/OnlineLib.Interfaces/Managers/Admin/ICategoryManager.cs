using OnlineLib.Models.Dto;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Interfaces.Managers.Admin
{
    public interface ICategoryManager : IAdminManagerRepository<CategoryDTO, Guid>
    {
    }
}
