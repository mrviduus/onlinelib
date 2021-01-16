using OnlineLib.Interfaces.Common;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;

namespace OnlineLib.Interfaces.Repository
{
    public interface ICategoryRepository : IGenericRepository<Category, Guid>
    {
        public void DeleteCategories(List<Guid> categoriesToBeDeleted);
    }
}
