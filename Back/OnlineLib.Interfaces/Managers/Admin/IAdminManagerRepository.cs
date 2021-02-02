using OnlineLib.Domain.DTO.Book;
using OnlineLib.Models.Dto;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace OnlineLib.Interfaces.Managers.Admin
{
    public interface IAdminManagerRepository<TEntity, TKey>
        where TEntity : class
    {
        Task<IEnumerable<TEntity>> GetAll();

        Task<TEntity>GetById(TKey id);

        Task CreateOrUpdate(TEntity entity);

        Task Delete(TKey id);
    }
}
