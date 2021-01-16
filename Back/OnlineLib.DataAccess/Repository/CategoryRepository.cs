using OnlineLib.DataAccess.Common;
using OnlineLib.Interfaces.Repository;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.DataAccess.Repository
{
    internal class CategoryRepository : GenericRepository<Category, Guid>, ICategoryRepository
    {
        public CategoryRepository(ApplicationDatabaseContext context)
            : base(context)
        {
        }

        public void DeleteCategories(List<Guid> categoriesToBeDeleted)
        {
            //List<Category> categoriesToDelete = this.context.Category.Where(x => categoriesToBeDeleted.Contains(x.Id)).ToList();
            var categories = this.context.Category.ToList();
            List<Category> result = categories.Where(x => categoriesToBeDeleted.Contains(x.Id)).ToList();
            this.context.RemoveRange(result);
        }
    }
}
